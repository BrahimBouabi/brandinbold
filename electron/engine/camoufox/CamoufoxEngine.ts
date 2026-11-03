import { execFile, execFileSync, spawn } from 'child_process'
import { app } from 'electron'
import { EventEmitter } from 'events'
import { existsSync, readFileSync, readlinkSync, rmSync } from 'fs'
import { join } from 'path'
import { Camoufox, launchOptions } from 'camoufox'
import { firefox, type BrowserContext } from 'playwright-core'
import type { BrowserEngine } from '../BrowserEngine'
import type { EngineLaunch, BrowserHandle, ExportedCookie } from '../handle'
import { buildProfileBundle } from './profileApp'
import { ensureBundledEngine } from './engineHome'
import { purgeTransientCaches } from '../../launcher/profileCache'
import { patchWindowTitle } from './badgeExtension'
import { buildBadgeExtension } from './badgeExtension'
import type { LaunchResult, Profile, TargetOS } from '@shared/types'

/**
 * Primary engine: natively patched Firefox (Camoufox). The fingerprint is
 * applied inside the browser in C++ — invisible to page JavaScript.
 *
 * Locale separation (important): the BROWSER UI is pinned to en-US/LTR via
 * firefox_user_prefs; the PAGE-WORLD identity locale (navigator.languages,
 * Accept-Language, Intl) comes from the profile via Playwright's context
 * `locale` option. The fingerprint can never change the UI direction.
 *
 * Fonts are always additive: OS system fonts (incl. Arabic/CJK fallbacks)
 * stay; a profile's custom font list only adds families on top.
 */

/** Resolve the camoufox CLI: dev node_modules/.bin, packaged asar.unpacked, or PATH. */
function camoufoxBin(): string {
  const candidates = [
    join(process.cwd(), 'node_modules', '.bin', 'camoufox'),
    join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules', '.bin', 'camoufox'),
    'camoufox'
  ]
  for (const c of candidates) {
    if (c === 'camoufox' || existsSync(c)) return c
  }
  return 'camoufox'
}

const CAMOUFOX_BIN = camoufoxBin()

const engineEvents = new EventEmitter()

const HOST_OS: 'windows' | 'macos' | 'linux' =
  process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
let hostFontsCache: string[] | null = null

/**
 * Real font families of the HOST machine, extracted from the launcher's own
 * host-OS config draw (the same list camoufox uses when the identity matches
 * the host). Used when the identity claims a FOREIGN OS so the browser UI
 * keeps fonts that actually exist on this machine — the identity's own font
 * set (e.g. Windows families on a Mac) does not exist here and garbles the
 * browser chrome. Cached once per app session.
 */
async function getHostFonts(): Promise<string[]> {
  if (!hostFontsCache) {
    try {
      const hostLo = (await launchOptions({ os: HOST_OS, headless: true })) as Record<string, any>
      let cfg = ''
      for (const [k, v] of Object.entries(hostLo.env ?? {})) {
        if (k.startsWith('CAMOU_CONFIG')) cfg += String(v)
      }
      const m = cfg.match(/"fonts":\[([^\]]*)\]/)
      const parsed = m ? JSON.parse('[' + m[1] + ']') : []
      hostFontsCache = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
    } catch {
      hostFontsCache = []
    }
  }
  return hostFontsCache
}

function run(cmd: string, args: string[], timeoutMs = 300000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env } },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}${stderr ?? ''}`
        resolve({ code: err && (err as any).code == null ? -1 : (err ? (err as any).code : 0), out })
      }
    )
  })
}

export class CamoufoxEngine extends EventEmitter implements BrowserEngine {
  readonly id = 'camoufox' as const
  readonly name = 'Camoufox (patched Firefox)'

  constructor() {
    super()
    engineEvents.on('exit', (profileId: string) => this.emit('exit', profileId))
  }

  async installedVersion(): Promise<string | null> {
    const { code, out } = await run(CAMOUFOX_BIN, ['version'], 30000)
    if (code !== 0 && !out.trim()) return null
    const m = out.match(/Browser build:\s*(\S+)/) ?? out.match(/(\d+\.\d+[^\s)]*beta[^\s)]*|\d+\.\d+\.\d+)/)
    return m ? m[1] : out.trim().split('\n')[0] || null
  }

  async ensureInstalled(onProgress?: (line: string) => void): Promise<void> {
    onProgress?.('Checking Camoufox browser build…')
    // Offline Fat-DMG: clone the bundled engine into the engine home first
    ensureBundledEngine(join(app.getPath('userData'), 'engine'))
    const active = await run(CAMOUFOX_BIN, ['active'], 30000)
    if (active.code === 0 && /not fetched/i.test(active.out) === false && active.out.trim()) {
      onProgress?.(`Camoufox ${active.out.trim()} already installed`)
      return
    }
    onProgress?.('Downloading Camoufox browser (~200 MB, one-time)…')
    const fetchRes = await run(CAMOUFOX_BIN, ['fetch'], 900000)
    onProgress?.(fetchRes.out.trim().split('\n').slice(-3).join(' · ') || 'done')
    onProgress?.('Camoufox ready')
  }

  async launch(
    profile: Profile,
    userDataDir: string,
    ipInfo: { timezone?: string; lat?: number; lon?: number; ip?: string } | null
  ): Promise<EngineLaunch> {
    cleanStaleFirefoxLocks(userDataDir)
    // TASK 9: pre-launch transient-cache purge (crash leftovers etc.)
    purgeTransientCaches(userDataDir, 'firefox')
    if (profile.startup.clearSession) {
      rmSync(join(userDataDir, 'sessionstore-backups'), { recursive: true, force: true })
    }

    const useProxy = profile.proxy.type !== 'none' && !!profile.proxy.host && !!profile.proxy.port
    const scheme =
      profile.proxy.type === 'socks4' || profile.proxy.type === 'socks5'
        ? profile.proxy.type
        : profile.proxy.type === 'https'
          ? 'https'
          : 'http'

    // Per-profile launcher bundle: unique Dock name + colored Brandinbold icon.
    const bundle = buildProfileBundle(profile.id, profile.name, profile.color ?? '#8952ef')

    const restore = profile.startup.restoreSession !== false // default ON

    const options: Record<string, any> = {
      os: mapOs(profile.os),
      headless: false
    }

    if (useProxy) {
      const auth =
        profile.proxy.username && profile.proxy.password
          ? `${encodeURIComponent(profile.proxy.username)}:${encodeURIComponent(profile.proxy.password)}@`
          : ''
      options.proxy = {
        server: `${scheme}://${auth}${profile.proxy.host}:${profile.proxy.port}`
      }
    }

    // Geo consistency: with a proxy, geoip matches timezone, locale,
    // geolocation AND the WebRTC IP to the exit IP — natively, page-world only.
    const customTz = profile.timezone.mode === 'custom' && profile.timezone.name
    if (useProxy && !customTz) {
      options.geoip = true
    } else if (useProxy && customTz) {
      options.geoip = ipInfo?.ip ?? true
    } else if (!useProxy && ipInfo?.ip) {
      options.geoip = ipInfo.ip
    }
    if (customTz) {
      options.timezoneId = profile.timezone.name
    }
    // Geolocation policy: prompt/allow use the profile coordinates;
    // allow additionally grants the permission; block disables the API.
    if (profile.geolocation.mode === 'custom' || profile.geoPolicy !== 'block') {
      const lat = profile.geolocation.mode === 'custom' ? profile.geolocation.latitude : ipInfo?.lat
      const lon = profile.geolocation.mode === 'custom' ? profile.geolocation.longitude : ipInfo?.lon
      if (lat != null && lon != null) {
        options.geolocation = { latitude: lat, longitude: lon, accuracy: profile.geolocation.accuracy ?? 100 }
      }
    }
    if (profile.geoPolicy === 'allow') {
      options.permissions = [...(options.permissions ?? []), 'geolocation', 'notifications']
    }
    if (profile.webcam) {
      options.permissions = [...(options.permissions ?? []), 'camera']
    }

    // WebRTC modes (native webrtc:ipv4/localipv4 spoofing):
    // altered = default native spoofing (exit IP + fake local IP)
    // real    = let the real IPs through (no proxy recommended)
    // disabled / proxy-only = turn WebRTC off entirely (http proxies cannot
    // carry WebRTC, so "only proxy" degrades to off on this engine)
    if (profile.webrtc === 'disabled' || profile.webrtc === 'proxy-only') {
      options.block_webrtc = true
    } else if (profile.webrtc === 'real') {
      // skip geoip so the exit IP is not reported as the WebRTC IP
    }

    if (profile.screen.width && profile.screen.height) {
      options.screen = {
        min_width: profile.screen.width,
        max_width: profile.screen.width,
        min_height: profile.screen.height,
        max_height: profile.screen.height
      }
      options.window = [profile.screen.width, profile.screen.height]
    }

    // Fonts are ADDITIVE: OS system fonts (UI, Arabic, CJK fallbacks) always
    // stay; a custom list only adds families. Never custom_fonts_only.
    if (profile.fonts.mode === 'custom' && profile.fonts.list.length) {
      options.fonts = profile.fonts.list
    }

    if (profile.fingerprint?.fpgen) {
      options.fingerprint = profile.fingerprint.fpgen
      options.i_know_what_im_doing = true
    }

    // Custom Firefox add-ons (unpacked folders / xpi) — Chrome Web Store
    // extensions are a Chromium-only capability and are disabled in the UI.
    const customAddons = (profile.extensions ?? [])
      .filter((e) => e.type === 'custom' && e.path && existsSync(e.path))
      .map((e) => e.path)
    // Startup URLs (about:blank is the default; restore overrides)
    const startupUrls = profile.startupUrlsEnabled
      ? (profile.startupUrls ?? []).filter((u) => /^https?:\/\//.test(u.trim())).map((u) => u.trim())
      : []
    if (startupUrls.length && !restore) {
      options.args = startupUrls
    } else if (profile.startup.homepage && /^https?:\/\//.test(profile.startup.homepage) && !restore) {
      options.args = [profile.startup.homepage]
    }

    if (bundle && profile.showNameInBrowser !== false) {
      // window title suffix = profile name (best effort omni.ja brand patch)
      patchWindowTitle(bundle.appPath, profile.name)
    }

    const badgeDir = buildBadgeExtension({
      id: profile.id,
      name: profile.name,
      color: profile.color ?? '#8952ef',
      timezone: customTz ? profile.timezone.name : (ipInfo?.timezone ?? ''),
      coords:
        ipInfo?.lat != null && ipInfo?.lon != null
          ? `${ipInfo.lat.toFixed(4)}, ${ipInfo.lon.toFixed(4)}`
          : profile.geolocation.mode === 'custom'
            ? `${profile.geolocation.latitude}, ${profile.geolocation.longitude}`
            : '',
      ip: ipInfo?.ip ?? ''
    })
    const addons = [...customAddons, ...(badgeDir ? [badgeDir] : [])]
    if (addons.length) {
      options.addons = addons
    }


    // --- Cross-OS font safety (Part A fix) ---
    // When the identity claims a FOREIGN OS, its font set (e.g. Windows
    // families on a Mac) does not exist on this host and garbles the browser
    // UI. Keep the full identity (UA, platform, WebGL, hardware) but apply
    // the HOST's real font families so the UI always renders correctly.
    if (mapOs(profile.os) !== HOST_OS) {
      const hostFonts = await getHostFonts()
      if (hostFonts.length) {
        options.fonts = hostFonts
        options.custom_fonts_only = true
        options.i_know_what_im_doing = true
      }
    }

    // Compute the launch options once, then decide who spawns the binary.
    const lo = (await launchOptions(options as any)) as Record<string, any>

    // --- Browser UI stays en-US / LTR, always. Page-world locale is separate. ---
    const pageLangs = profile.navigator.languages?.length
      ? profile.navigator.languages.join(', ')
      : 'en-US, en'
    lo.firefoxUserPrefs = {
      ...(lo.firefoxUserPrefs ?? {}),
      // Required for the per-profile badge addon to install and execute
      // (transient unpacked addon through the config.addons channel)
      'xpinstall.signatures.required': false,
      'extensions.autoDisableScopes': 0,
      'extensions.enabledScopes': 15,
      'extensions.startupScanScopes': 15,
      'extensions.experiments.enabled': true,
      'automation.profile': 1,
      // UI locale + direction: never derived from the fingerprint
      'intl.locale.requested': 'en-US',
      // default startup page: about:blank (restore session prefs override below)
      'browser.startup.page': restore ? 3 : 0,
      'browser.startup.homepage': 'about:blank',
      // deterministic search region so the URL bar never falls back to 127.0.0.1
      'browser.search.region': 'US',
      'browser.search.searchEnginesURL': '',
      'browser.region.network.url': '',
      'distribution.searchplugins.defaultLocale': 'en-US',
      // session restore (full windows/tabs/history recovery)
      'browser.sessionstore.resume_from_crash': true,
      'browser.sessionstore.max_resumed_crashes': -1,
      'browser.sessionstore.interval': 15000,
      'browser.sessionstore.privacy_level': 0,
      'browser.warnOnQuit': false,
      'browser.shell.checkDefaultBrowser': false,
      'browser.startup.homepage_override.mstone': 'ignore',
      'datareporting.policy.firstRunURL': ''
    }
    // PAGE-WORLD locale: Playwright context option (navigator.language(s) and
    // Accept-Language for pages only — never the browser UI).
    lo.locale = profile.navigator.languages?.length ? profile.navigator.languages.join(',') : 'en-US'
    if (customTz) lo.timezoneId = profile.timezone.name

    // ---- native config overrides (raw CAMOU_CONFIG keys) ----
    const config: Record<string, any> = {}
    if (profile.mediaMask === false) {
      // mediaDevices:enabled=false is not a real mode; masking is native and
      // the counts below shape the spoofed device list.
    }
    if (profile.mediaMask !== false) {
      config['mediaDevices:webcams'] = profile.media?.videoInputs ?? 1
      config['mediaDevices:micros'] = profile.media?.audioInputs ?? 1
      config['mediaDevices:speakers'] = profile.media?.audioOutputs ?? 1
    }
    if (profile.hardwareConcurrencyOverride != null) {
      config['navigator.hardwareConcurrency'] = profile.hardwareConcurrencyOverride
    }
    if (profile.doNotTrack) {
      config['navigator.doNotTrack'] = '1'
    }
    if (profile.webrtc === 'real') {
      // leave the real local/public IPs untouched
      config['webrtc:ipv4'] = null
      config['webrtc:localipv4'] = null
    }
    // WebGL metadata "Off": report the host GPU (only meaningful when the
    // profile OS matches the host — the consistency engine warns otherwise).
    if (profile.fingerprint?.fpgen && (profile as any).webglMeta === 'off') {
      const hostOs = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
      if (mapOs(profile.os) === hostOs) {
        delete profile.fingerprint.fpgen.webgl
      }
    }
    if (Object.keys(config).length) {
      options.config = { ...(options.config ?? {}), ...config }
    }

    // ---- browser prefs for the remaining switches ----
    lo.firefoxUserPrefs = {
      ...(lo.firefoxUserPrefs ?? {}),
      ...(profile.dnsEnabled && profile.dnsServer
        ? {
            'network.trr.mode': 2,
            'network.trr.uri': profile.dnsServer,
            'network.trr.custom_uri': profile.dnsServer
          }
        : {}),
      ...(profile.doNotTrack ? { 'privacy.donottrackheader.enabled': true } : {}),
      ...(profile.geoPolicy === 'block' ? { 'geo.enabled': false } : {}),
      ...(profile.iphey
        ? {
            'privacy.resistFingerprinting': true,
            'privacy.trustworthy.ai': false
          }
        : {}),
      // UI language: follow navigator language ONLY when explicitly enabled
      // (default OFF — the UI always stays en-US/LTR otherwise).
      ...((profile.uiFollowNavigatorLanguage && profile.navigator.languages?.length)
        ? { 'intl.locale.requested': profile.navigator.languages[0] }
        : {})
    }
    if (profile.userAgentMode === 'specific' && profile.userAgentVersion) {
      options.ff_version = profile.userAgentVersion.replace(/[^0-9].*$/, '')
    }
    // "match" == the engine build's own version, which is what the launcher
    // already presents; "latest" is the default native behavior.
    if (profile.customArgsEnabled && profile.customArgs) {
      const blocked = ['--user-data-dir', '--remote-debugging-address', '--disable-web-security', '--profile', '--headless']
      const extra = profile.customArgs
        .split('\s+')
        .filter((a) => a && !blocked.some((b) => a.startsWith(b)))
      options.args = [...(options.args ?? []), ...extra]
    }

    let context: BrowserContext
    if (bundle) {
      // Spawn the per-profile wrapper bundle so macOS shows the profile's
      // own name + colored Brandinbold icon in the Dock.
      lo.executablePath = bundle.executablePath
      context = (await firefox.launchPersistentContext(userDataDir, lo as any)) as BrowserContext
    } else {
      // Linux/Windows or wrapper build failed: stock launch path.
      lo.persistent_context = true
      lo.user_data_dir = userDataDir
      context = (await Camoufox(lo as any)) as unknown as BrowserContext
    }

    const pid = await findFirefoxPid(userDataDir)
    // Session restore can bring back the old broken `127.0.0.1/?q=` tabs
    // from before the startup-page fix — close them on arrival.
    for (const p of context.pages()) {
      if (/^http:\/\/127\.0\.0\.1\/\?q=/.test(p.url())) {
        await p.close().catch(() => {})
      }
    }
    const handle = buildHandle(profile.id, context, userDataDir)
    if (profile.pendingCookies?.raw) {
      try {
        const { parsePendingCookies } = await import('../../cookies/parse')
        const list = parsePendingCookies(profile.pendingCookies)
        if (list && list.length) await handle.cookies?.import(list)
      } catch {
        /* invalid cookie data — ignore */
      }
    }
    const result: LaunchResult = {
      profileId: profile.id,
      engine: this.id,
      pid,
      debugPort: null,
      browserWsUrl: null,
      remoteKind: null
    }
    return { result, handle }
  }
}

function buildHandle(profileId: string, context: BrowserContext, userDataDir: string): BrowserHandle {
  let stopped = false
  context.on('close', () => {
    if (!stopped) engineEvents.emit('exit', profileId)
  })
  return {
    profileId,
    pid: null,
    debugPort: null,
    remote: null,
    cookies: {
      async export(): Promise<ExportedCookie[]> {
        const cookies = await context.cookies()
        return cookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires > 0 ? c.expires : undefined,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as ExportedCookie['sameSite']
        }))
      },
      async clear(): Promise<void> {
        await context.clearCookies()
      },
      async import(list: ExportedCookie[]): Promise<number> {
        await context.addCookies(
          list.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            expires: c.expires && c.expires > 0 ? c.expires : -1,
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
            sameSite: (c.sameSite ?? 'Lax') as 'Strict' | 'Lax' | 'None'
          }))
        )
        return list.length
      }
    },
    async openUrl(url: string): Promise<void> {
      const pages = context.pages()
      const page = pages[0] ?? (await context.newPage())
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
    },
    // Graceful stop: close the windows normally and give the session store
    // time to flush; only hard-kill if the graceful path stalls.
    async stop(): Promise<void> {
      stopped = true
      const graceful = Promise.race([
        context.close().then(() => true).catch(() => false),
        new Promise<boolean>((r) => setTimeout(() => r(false), 10000))
      ])
      const ok = await graceful
      if (!ok) {
        // hard fallback: SIGTERM every firefox process bound to this profile dir
        try {
          const pids = listProfilePids(userDataDir)
          for (const pid of pids) process.kill(pid, 'SIGTERM')
          await new Promise((r) => setTimeout(r, 5000))
          for (const pid of listProfilePids(userDataDir)) {
            try {
              process.kill(pid, 'SIGKILL')
            } catch {
              /* gone */
            }
          }
        } catch {
          /* nothing left to kill */
        }
      }
      cleanStaleFirefoxLocks(userDataDir)
      // TASK 9: transient-cache purge AFTER the session is safely on disk
      purgeTransientCaches(userDataDir, 'firefox')
    }
  }
}

function listProfilePids(userDataDir: string): number[] {
  try {
    const out = execFileSync('pgrep', ['-f', userDataDir.replace(/\s/g, '\\ ')], { timeout: 10000 })
      .toString()
      .split('\n')
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n !== process.pid)
    return out
  } catch {
    return []
  }
}

async function findFirefoxPid(userDataDir: string): Promise<number | null> {
  for (let i = 0; i < 20; i++) {
    const pids = listProfilePids(userDataDir)
    if (pids.length) return pids[0]
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

/** Remove Firefox profile locks left by a dead process (crash/reboot). */
function cleanStaleFirefoxLocks(dir: string): void {
  const lockPath = join(dir, 'lock')
  try {
    const target = readlinkSync(lockPath) // e.g. "127.0.0.1:+1234"
    const m = target.match(/(\d+)$/)
    if (m) {
      const pid = parseInt(m[1], 10)
      let alive = false
      try {
        process.kill(pid, 0)
        alive = true
      } catch {
        /* dead */
      }
      if (!alive) {
        rmSync(lockPath, { force: true })
        rmSync(join(dir, '.parentlock'), { force: true })
      }
    }
  } catch {
    /* no lock */
  }
}

function mapOs(os: TargetOS): 'windows' | 'macos' | 'linux' {
  if (os === 'macos') return 'macos'
  if (os === 'linux') return 'linux'
  return 'windows'
}

export { engineEvents as camoufoxEvents }
