import { execFileSync } from 'child_process'
import { app } from 'electron'
import { EventEmitter } from 'events'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { launchOptions } from 'camoufox'
import { getActivePath } from 'camoufox/dist/multiversion.js'
import { ensureCamoufoxInstalled } from 'camoufox/dist/pkgman.js'
import { firefox, type BrowserContext } from 'playwright-core'
import type { BrowserEngine } from '../BrowserEngine'
import type { EngineLaunch, BrowserHandle, ExportedCookie } from '../handle'
import { buildProfileBundle, findCamoufoxApp } from './profileApp'
import { ensureBundledEngine, setupEngineHome } from './engineHome'
import { purgeTransientCaches } from '../../launcher/profileCache'
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

export class CamoufoxEngine extends EventEmitter implements BrowserEngine {
  readonly id = 'camoufox' as const
  readonly name = 'Camoufox (patched Firefox)'

  constructor() {
    super()
    engineEvents.on('exit', (profileId: string) => this.emit('exit', profileId))
  }

  async installedVersion(): Promise<string | null> {
    try {
      setupEngineHome()
      const active = getActivePath()
      if (active) {
        const verFile = join(active, 'version.json')
        if (existsSync(verFile)) {
          const data = JSON.parse(readFileSync(verFile, 'utf8')) as { version?: string; build?: string }
          if (data.version && data.build) return `${data.version}-${data.build}`
        }
        return basename(active)
      }
      const appPath = findCamoufoxApp()
      if (appPath) return basename(join(appPath, '..'))
      return null
    } catch {
      return null
    }
  }

  async ensureInstalled(onProgress?: (line: string) => void): Promise<void> {
    onProgress?.('Checking Camoufox browser build…')
    // Self-heal symlink + .0.5_FLAG + clone bundled engine if running from Fat DMG
    setupEngineHome()
    ensureBundledEngine(join(app.getPath('userData'), 'engine'))
    const active = getActivePath()
    if (active && existsSync(active)) {
      onProgress?.(`Camoufox ${basename(active)} already installed`)
      return
    }
    onProgress?.('Downloading Camoufox browser (~200 MB, one-time)…')
    const installedPath = await ensureCamoufoxInstalled()
    onProgress?.(`Camoufox ready (${basename(installedPath)})`)
  }

  async launch(
    profile: Profile,
    userDataDir: string,
    ipInfo: { timezone?: string; lat?: number; lon?: number; ip?: string } | null
  ): Promise<EngineLaunch> {
    setupEngineHome()
    cleanStaleFirefoxLocks(userDataDir)
    // TASK 9: pre-launch transient-cache purge (crash leftovers etc.)
    purgeTransientCaches(userDataDir, 'firefox')
    const restore = profile.startup.restoreSession !== false && !profile.startup.clearSession // default ON
    if (profile.startup.clearSession || !restore) {
      rmSync(join(userDataDir, 'sessionstore-backups'), { recursive: true, force: true })
      rmSync(join(userDataDir, 'sessionstore.jsonlz4'), { force: true })
      rmSync(join(userDataDir, 'sessionCheckpoints.json'), { force: true })
      rmSync(join(userDataDir, 'bb-session-tabs.json'), { force: true })
    }
    const expectedRestoreUrls = restore ? prepareSessionForLaunch(userDataDir) : []

    const useProxy = profile.proxy.type !== 'none' && !!profile.proxy.host && !!profile.proxy.port
    const scheme =
      profile.proxy.type === 'socks4' || profile.proxy.type === 'socks5'
        ? profile.proxy.type
        : profile.proxy.type === 'https'
          ? 'https'
          : 'http'

    // Per-profile launcher bundle: unique Dock name + colored Brandinbold icon.
    const bundle = buildProfileBundle(
      profile.id,
      profile.name,
      profile.color ?? '#8952ef',
      profile.showNameInBrowser !== false
    )

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

    if ((profile as any).__maximized) {
      const mw = Math.max(profile.screen.width || 1920, 1920)
      const mh = Math.max(profile.screen.height || 1080, 1080)
      options.window = [mw, mh]
    } else if (profile.screen.width && profile.screen.height) {
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
    // Startup URLs (about:blank is the default; restore overrides unless no sessionstore exists yet)
    const startupUrls = profile.startupUrlsEnabled
      ? (profile.startupUrls ?? []).filter((u) => /^https?:\/\//.test(u.trim())).map((u) => u.trim())
      : []
    const hasNativeSessionStore = existsSync(join(userDataDir, 'sessionstore.jsonlz4'))
    if (restore && expectedRestoreUrls.length > 0 && !hasNativeSessionStore) {
      options.args = expectedRestoreUrls
    } else if (startupUrls.length && (!restore || (!hasNativeSessionStore && expectedRestoreUrls.length === 0))) {
      options.args = startupUrls
    } else if (
      profile.startup.homepage &&
      /^https?:\/\//.test(profile.startup.homepage) &&
      (!restore || (!hasNativeSessionStore && expectedRestoreUrls.length === 0))
    ) {
      options.args = [profile.startup.homepage]
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

    // ---- native config overrides (raw CAMOU_CONFIG keys) ----
    const config: Record<string, any> = {}
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
    if (profile.userAgentMode === 'specific' && profile.userAgentVersion) {
      options.ff_version = profile.userAgentVersion.replace(/[^0-9].*$/, '')
    }
    if (profile.customArgsEnabled && profile.customArgs) {
      const blocked = ['--user-data-dir', '--remote-debugging-address', '--disable-web-security', '--profile', '--headless']
      const extra = profile.customArgs
        .split(/\s+/)
        .filter((a) => a && !blocked.some((b) => a.startsWith(b)))
      options.args = [...(options.args ?? []), ...extra]
    }

    // Compute the launch options once, then decide who spawns the binary.
    const lo = (await launchOptions(options as any)) as Record<string, any>

    // --- Browser UI stays en-US / LTR, always. Page-world locale is separate. ---
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
      'browser.sessionstore.resume_from_crash': restore,
      'browser.sessionstore.max_resumed_crashes': -1,
      'browser.sessionstore.interval': 1000,
      'browser.sessionstore.privacy_level': 0,
      'browser.link.open_newwindow': 3,
      'browser.link.open_newwindow.restriction': 0,
      'browser.warnOnQuit': false,
      'browser.shell.checkDefaultBrowser': false,
      'browser.startup.homepage_override.mstone': 'ignore',
      'datareporting.policy.firstRunURL': '',
      ...((profile as any).__savePasswords === false ? { 'signon.rememberSignons': false } : {}),
      ...((profile as any).__saveHistory === false ? { 'places.history.enabled': false } : {}),
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
      ...(profile.uiFollowNavigatorLanguage && profile.navigator.languages?.length
        ? { 'intl.locale.requested': profile.navigator.languages[0] }
        : {})
    }
    // PAGE-WORLD locale: Playwright context option (navigator.language(s) and
    // Accept-Language for pages only — never the browser UI).
    lo.locale = profile.navigator.languages?.length ? profile.navigator.languages.join(',') : 'en-US'
    if (customTz) lo.timezoneId = profile.timezone.name

    if (bundle) {
      // Spawn the per-profile wrapper bundle so macOS shows the profile's
      // own name + colored Brandinbold icon in the Dock.
      lo.executablePath = bundle.executablePath
    }
    const context = (await firefox.launchPersistentContext(userDataDir, lo as any)) as BrowserContext

    const pid = await findFirefoxPid(userDataDir)
    const isPrivateLaunch = (options.args ?? []).includes('-private-window')
    if (restore && !isPrivateLaunch) {
      await reconcileRestoredTabs(context, expectedRestoreUrls)
    } else {
      // Session restore can bring back the old broken `127.0.0.1/?q=` tabs
      // from before the startup-page fix — close them on arrival.
      for (const p of context.pages()) {
        if (/^http:\/\/127\.0\.0\.1\/\?q=/.test(p.url())) {
          await p.close().catch(() => {})
        }
      }
    }
    const quitOnWindowClose = (profile as any).__quitOnWindowClose !== false
    const handle = buildHandle(profile.id, context, userDataDir, quitOnWindowClose)
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

function buildHandle(
  profileId: string,
  context: BrowserContext,
  userDataDir: string,
  quitOnWindowClose = true
): BrowserHandle {
  let stopped = false
  let lastKnownUrls: string[] = readSavedSessionTabs(userDataDir)
  const navListeners = new Set<(url: string) => void>()

  const captureLiveTabs = (): void => {
    if (stopped) return
    try {
      const pages = context.pages()
      const recUrls = snapshotGoodRecovery(userDataDir)
      if (pages.length === 0 && recUrls.length === 0) return // window closed — never overwrite lastKnownUrls with []
      const pageUrls = pages.map((p) => p.url()).filter(isRestorableUrl)
      const merged = [...pageUrls]
      for (const u of recUrls) {
        if (!merged.some((m) => normalizeUrlForCompare(m) === normalizeUrlForCompare(u))) {
          merged.push(u)
        }
      }
      if (merged.length > 0) {
        lastKnownUrls = merged
        writeSavedSessionTabs(userDataDir, merged)
      }
    } catch {
      /* ignore */
    }
  }

  const syncTimer = setInterval(captureLiveTabs, 1200)
  let closeDebounce: ReturnType<typeof setTimeout> | null = null

  const wirePage = (p: any) => {
    p.on?.('framenavigated', (frame: any) => {
      try {
        if (frame === p.mainFrame()) {
          const url = frame.url?.() ?? ''
          if (/^https?:\/\//i.test(url)) {
            for (const fn of navListeners) fn(url)
          }
          captureLiveTabs()
        }
      } catch {
        /* ignore */
      }
    })
    p.on?.('load', () => captureLiveTabs())
    p.on?.('close', () => {
      if (stopped) return
      if (closeDebounce) clearTimeout(closeDebounce)
      closeDebounce = setTimeout(() => {
        if (stopped) return
        try {
          const remaining = context.pages()
          if (remaining.length === 0) {
            // All browser windows were closed (e.g. red × button on macOS).
            // Shut down the headless/windowless process cleanly and preserve the session.
            if (quitOnWindowClose) {
              void handle.stop().then(() => {
                engineEvents.emit('exit', profileId)
              })
            }
          } else {
            captureLiveTabs()
          }
        } catch {
          /* ignore */
        }
      }, 350)
    })
  }
  for (const p of context.pages()) wirePage(p)
  captureLiveTabs()
  context.on('page', wirePage)
  context.on('close', () => {
    clearInterval(syncTimer)
    if (closeDebounce) clearTimeout(closeDebounce)
    navListeners.clear()
    if (!stopped) {
      stopped = true
      ensureSessionFilesAfterClose(userDataDir, lastKnownUrls)
      cleanStaleFirefoxLocks(userDataDir)
      purgeTransientCaches(userDataDir, 'firefox')
      engineEvents.emit('exit', profileId)
    }
  })

  const handle: BrowserHandle = {
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
      captureLiveTabs()
    },
    onNavigate(cb: (url: string) => void): () => void {
      navListeners.add(cb)
      return () => navListeners.delete(cb)
    },
    // Graceful stop: snapshot live tabs, close the windows normally and give the session store
    // time to flush; only hard-kill if the graceful path stalls.
    async stop(): Promise<void> {
      if (stopped) return
      captureLiveTabs()
      stopped = true
      clearInterval(syncTimer)
      if (closeDebounce) clearTimeout(closeDebounce)
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
      ensureSessionFilesAfterClose(userDataDir, lastKnownUrls)
      cleanStaleFirefoxLocks(userDataDir)
      // TASK 9: transient-cache purge AFTER the session is safely on disk
      purgeTransientCaches(userDataDir, 'firefox')
    }
  }
  return handle
}

const SESSION_TABS_FILE = 'bb-session-tabs.json'
const LAST_GOOD_SESSION_FILE = 'bb-last-good.jsonlz4'
const FINAL_CHECKPOINTS_JSON = JSON.stringify({
  'profile-after-change': true,
  'final-ui-startup': true,
  'sessionstore-windows-restored': true,
  'quit-application-granted': true,
  'quit-application': true,
  'sessionstore-final-state-write-complete': true,
  'profile-change-net-teardown': true,
  'profile-change-teardown': true,
  'profile-before-change': true
})

function isRestorableUrl(url: string | undefined | null): boolean {
  if (!url) return false
  const u = url.trim()
  if (!u || u === 'about:blank' || u === 'about:newtab' || u === 'about:home' || u === 'about:privatebrowsing') {
    return false
  }
  if (u.startsWith('chrome://browser/content/blanktab')) return false
  if (/^http:\/\/127\.0\.0\.1\/\?q=/.test(u)) return false
  return /^(https?:|about:|file:)/i.test(u)
}

function normalizeUrlForCompare(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function readMozLz4(filePath: string): any | null {
  try {
    if (!existsSync(filePath)) return null
    const buf = readFileSync(filePath)
    if (buf.length < 12 || buf.slice(0, 8).toString('utf8') !== 'mozLz40\0') return null
    const outSize = buf.readUInt32LE(8)
    const out = Buffer.alloc(outSize)
    let ip = 12
    let op = 0
    while (ip < buf.length) {
      const token = buf[ip++]
      let litLen = token >> 4
      if (litLen === 15) {
        let b: number
        do {
          b = buf[ip++]
          litLen += b
        } while (b === 255 && ip < buf.length)
      }
      buf.copy(out, op, ip, ip + litLen)
      op += litLen
      ip += litLen
      if (ip >= buf.length) break
      const offset = buf.readUInt16LE(ip)
      ip += 2
      let matchLen = (token & 0x0f) + 4
      if (matchLen === 19) {
        let b: number
        do {
          b = buf[ip++]
          matchLen += b
        } while (b === 255 && ip < buf.length)
      }
      for (let i = 0; i < matchLen; i++) {
        out[op] = out[op - offset]
        op++
      }
    }
    return JSON.parse(out.toString('utf8'))
  } catch {
    return null
  }
}

function extractMozLz4TabUrls(filePath: string): { openUrls: string[]; closedWinUrls: string[] } {
  const data = readMozLz4(filePath)
  if (!data) return { openUrls: [], closedWinUrls: [] }
  const extractFromWindows = (wins: any[]): string[] => {
    const urls: string[] = []
    for (const w of wins ?? []) {
      for (const t of w?.tabs ?? []) {
        const entries = t?.entries ?? []
        if (!entries.length) continue
        const idx =
          typeof t.index === 'number' && t.index >= 1 && t.index <= entries.length ? t.index - 1 : entries.length - 1
        const u = entries[idx]?.url ?? entries[entries.length - 1]?.url ?? ''
        if (isRestorableUrl(u)) urls.push(u)
      }
    }
    return urls
  }
  return {
    openUrls: extractFromWindows(data.windows ?? []),
    closedWinUrls: extractFromWindows(data._closedWindows ? [data._closedWindows[0]] : [])
  }
}

function readSavedSessionTabs(userDataDir: string): string[] {
  try {
    const p = join(userDataDir, SESSION_TABS_FILE)
    if (!existsSync(p)) return []
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    const urls = Array.isArray(parsed?.urls) ? parsed.urls : Array.isArray(parsed) ? parsed : []
    return urls.filter((u: any) => typeof u === 'string' && isRestorableUrl(u))
  } catch {
    return []
  }
}

function writeSavedSessionTabs(userDataDir: string, urls: string[]): void {
  const clean = urls.filter(isRestorableUrl)
  if (!clean.length) return
  try {
    mkdirSync(userDataDir, { recursive: true })
    writeFileSync(
      join(userDataDir, SESSION_TABS_FILE),
      JSON.stringify({ updatedAt: new Date().toISOString(), urls: clean }, null, 2),
      'utf8'
    )
  } catch {
    /* ignore */
  }
}

function snapshotGoodRecovery(userDataDir: string): string[] {
  try {
    const backupsDir = join(userDataDir, 'sessionstore-backups')
    const recPath = join(backupsDir, 'recovery.jsonlz4')
    if (!existsSync(recPath)) return []
    const { openUrls } = extractMozLz4TabUrls(recPath)
    if (openUrls.length > 0) {
      copyFileSync(recPath, join(backupsDir, LAST_GOOD_SESSION_FILE))
      return openUrls
    }
  } catch {
    /* ignore */
  }
  return []
}

function ensureSessionFilesAfterClose(userDataDir: string, lastKnownUrls: string[]): void {
  try {
    const rootSession = join(userDataDir, 'sessionstore.jsonlz4')
    const rootUrls = extractMozLz4TabUrls(rootSession).openUrls
    if (rootUrls.length > 0) {
      const merged = [...rootUrls]
      for (const u of lastKnownUrls) {
        if (!merged.some((m) => normalizeUrlForCompare(m) === normalizeUrlForCompare(u))) {
          merged.push(u)
        }
      }
      writeSavedSessionTabs(userDataDir, merged)
      return
    }

    if (lastKnownUrls.length > 0) {
      writeSavedSessionTabs(userDataDir, lastKnownUrls)
    }

    const backupsDir = join(userDataDir, 'sessionstore-backups')
    const candidates = [
      join(backupsDir, LAST_GOOD_SESSION_FILE),
      join(backupsDir, 'recovery.jsonlz4'),
      join(backupsDir, 'recovery.baklz4'),
      join(backupsDir, 'previous.jsonlz4')
    ]
    for (const cand of candidates) {
      const { openUrls } = extractMozLz4TabUrls(cand)
      if (openUrls.length > 0) {
        copyFileSync(cand, rootSession)
        writeFileSync(join(userDataDir, 'sessionCheckpoints.json'), FINAL_CHECKPOINTS_JSON, 'utf8')
        const merged = [...openUrls]
        for (const u of lastKnownUrls) {
          if (!merged.some((m) => normalizeUrlForCompare(m) === normalizeUrlForCompare(u))) {
            merged.push(u)
          }
        }
        writeSavedSessionTabs(userDataDir, merged)
        return
      }
    }
  } catch {
    /* ignore */
  }
}

function prepareSessionForLaunch(userDataDir: string): string[] {
  const rootSession = join(userDataDir, 'sessionstore.jsonlz4')
  let mainUrls = extractMozLz4TabUrls(rootSession).openUrls

  const backupsDir = join(userDataDir, 'sessionstore-backups')
  const candidates = [
    join(backupsDir, LAST_GOOD_SESSION_FILE),
    join(backupsDir, 'recovery.jsonlz4'),
    join(backupsDir, 'recovery.baklz4'),
    join(backupsDir, 'previous.jsonlz4')
  ]

  if (mainUrls.length === 0) {
    for (const cand of candidates) {
      const { openUrls } = extractMozLz4TabUrls(cand)
      if (openUrls.length > 0) {
        try {
          copyFileSync(cand, rootSession)
          writeFileSync(join(userDataDir, 'sessionCheckpoints.json'), FINAL_CHECKPOINTS_JSON, 'utf8')
          mainUrls = openUrls
        } catch {
          /* ignore */
        }
        break
      }
    }
  }

  let savedUrls = readSavedSessionTabs(userDataDir)
  if (savedUrls.length === 0 && mainUrls.length > 0) {
    savedUrls = mainUrls
    writeSavedSessionTabs(userDataDir, savedUrls)
  } else if (savedUrls.length === 0) {
    // Check _closedWindows in root or candidate files as a last-resort recovery
    for (const f of [rootSession, ...candidates]) {
      const { closedWinUrls } = extractMozLz4TabUrls(f)
      if (closedWinUrls.length > 0) {
        savedUrls = closedWinUrls
        writeSavedSessionTabs(userDataDir, savedUrls)
        break
      }
    }
  }

  if (mainUrls.length === 0 && existsSync(rootSession)) {
    // Remove empty sessionstore.jsonlz4 (windows: []) so it cannot suppress startup args or recovery
    try {
      rmSync(rootSession, { force: true })
    } catch {
      /* ignore */
    }
  }

  if ((mainUrls.length > 0 || savedUrls.length > 0) && !existsSync(join(userDataDir, 'prefs.js'))) {
    // Firefox checks for the existence of prefs.js before user.js: if prefs.js is missing (e.g. after
    // extracting a cloud session archive on a new machine), Firefox treats the folder as a brand-new
    // profile and skips SessionStore recovery unless a minimal prefs.js file is present.
    try {
      writeFileSync(
        join(userDataDir, 'prefs.js'),
        '// Mozilla User Preferences\nuser_pref("browser.startup.page", 3);\n',
        'utf8'
      )
    } catch {
      /* ignore */
    }
  }

  return savedUrls.length > 0 ? savedUrls : mainUrls
}

async function reconcileRestoredTabs(context: BrowserContext, expectedUrls: string[]): Promise<void> {
  if (expectedUrls.length > 0) {
    // Wait up to 2s for Firefox's native SessionStore to finish opening restored tabs
    for (let i = 0; i < 14; i++) {
      const currentUrls = context
        .pages()
        .map((p) => p.url())
        .filter(isRestorableUrl)
        .map(normalizeUrlForCompare)
      const allPresent = expectedUrls.every((u) => currentUrls.includes(normalizeUrlForCompare(u)))
      if (allPresent) break
      await new Promise((r) => setTimeout(r, 150))
    }

    // Open any expected URLs that Firefox SessionStore missed (e.g., opened < 1s before stop or after window close)
    const openNormalized = new Set(
      context
        .pages()
        .map((p) => p.url())
        .filter(isRestorableUrl)
        .map(normalizeUrlForCompare)
    )
    const missing = expectedUrls.filter((u) => !openNormalized.has(normalizeUrlForCompare(u)))
    for (const url of missing) {
      const blankPage = context.pages().find((p) => !isRestorableUrl(p.url()))
      const targetPage = blankPage ?? (await context.newPage().catch(() => null))
      if (targetPage) {
        await targetPage.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
        openNormalized.add(normalizeUrlForCompare(url))
      }
    }
  }

  // Close leftover about:blank / blanktab / 127.0.0.1/?q= tabs created by Playwright launchPersistentContext
  // whenever at least one real restored tab is present.
  const allPages = context.pages()
  const hasRestored = allPages.some((p) => isRestorableUrl(p.url()))
  if (hasRestored) {
    for (const p of allPages) {
      if (!isRestorableUrl(p.url())) {
        await p.close().catch(() => {})
      }
    }
  } else {
    for (const p of allPages) {
      if (/^http:\/\/127\.0\.0\.1\/\?q=/.test(p.url())) {
        await p.close().catch(() => {})
      }
    }
  }
}

function listProfilePids(userDataDir: string): number[] {
  try {
    const out = execFileSync('pgrep', ['-f', userDataDir], { timeout: 10000 })
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
