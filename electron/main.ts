import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { setupEngineHome } from './engine/camoufox/engineHome'
import { readFile, writeFile, readdir, rm, cp, mkdir } from 'fs/promises'
import { execFile } from 'child_process'
import { engineHomeDir } from './engine/camoufox/engineHome'
import {
  initCloud,
  cloudEnabled,
  cloudAuthed,
  cloudUser,
  refreshCloudUser,
  cloudOfflineMode,
  doLogin,
  doRegister,
  doLogout,
  cloudPullAndMerge,
  cloudPushNow,
  scheduleCloudPush,
  cloudMaybeRestoreSession,
  cloudUploadSession,
  queueCloudDelete,
  unqueueCloudDelete,
  apiUrl as cloudApiUrl,
  webUrl as cloudWebUrl,
  apiUrlFromEnv,
  unsyncedProfileIds,
  cloudClient
} from './cloud/cloudMain'
import { getProfileDiskInfo, purgeTransientCaches } from './launcher/profileCache'
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { randomBytes } from 'crypto'
import Database from 'better-sqlite3'
import { ENABLE_PLAN_LIMITS } from '../shared/config'
import { ProfileStore } from './store/db'
import { ChromeCdpEngine } from './engine/ChromeCdpEngine'
import { CamoufoxEngine } from './engine/camoufox/CamoufoxEngine'
import type { BrowserEngine } from './engine/BrowserEngine'
import { ProcessRegistry } from './launcher/processRegistry'
import { Launcher } from './launcher/launcher'
import { AutomationApi } from './api/server'
import { regenerateFingerprint, syncDisplayFields } from './fingerprint/pinning'
import { checkProxy } from './proxy/checker'
import { toNetscapeFormat, parseNetscapeFormat } from './cookies/importExport'
import { buildIncognitonCsv, buildBrandinboldJson } from './csv/incognitonCsv'
import { previewImport, runImport } from './csv/importProfiles'
import type { AppSettings, EngineId, Profile } from '@shared/types'

app.setName('Brandinbold')
const store = new ProfileStore()
const registry = new ProcessRegistry()
const camoufoxEngine = new CamoufoxEngine()
const chromeEngine = new ChromeCdpEngine()
const launcher = new Launcher(camoufoxEngine, registry, store)
let api: AutomationApi | null = null
let mainWindow: BrowserWindow | null = null

function engineById(id: EngineId): BrowserEngine {
  return id === 'chrome-cdp' ? chromeEngine : camoufoxEngine
}

function applyEngineSetting(): void {
  const settings = store.getSettings()
  launcher.setEngine(engineById(settings.engine))
}

function settingsChanged(settings: AppSettings): void {
  applyEngineSetting()
  if (settings.automationEnabled && api && api.currentPort == null) {
    void api.start(settings.automationPort)
  } else if (!settings.automationEnabled && api) {
    void api.stop()
  } else if (api && api.currentPort != null && api.currentPort !== settings.automationPort) {
    void api.stop().then(() => api!.start(settings.automationPort))
  }
}

registry.onStatus((profileId, status, detail) => {
  push('status', profileId, status, detail)
})

chromeEngine.on('exit', (profileId: string) => {
  registry.onBrowserExit(profileId)
  push('status', profileId, 'ready')
})

;(camoufoxEngine as any).on?.('exit', (profileId: string) => {
  registry.onBrowserExit(profileId)
  flushPendingBookmarks(profileId)
  if (activeSync?.mainId === profileId) {
    activeSync.unsubscribe?.()
    activeSync = null
  }
  push('status', profileId, 'ready')
  // Step B: the user closed the browser window themselves → roam the session too
  void cloudUploadSession(profileId, join(app.getPath('userData'), 'profiles', profileId)).catch(() => {})
})

function push(type: string, profileId: string, status: string, detail?: string): void {
  mainWindow?.webContents.send('profile-event', { type, profileId, status, detail })
}

function db_exec_group_meta(id: string, color: string, description: string): void {
  ;(store as any).db
    ?.prepare('UPDATE groups SET color = ?, description = ?, updated_at = ? WHERE id = ?')
    .run(color, description, new Date().toISOString(), id)
}

function createWindow(): void {
  const previewArgs = process.argv.slice(2).filter((a) => a.startsWith('--preview'))
  const previewQuery = previewArgs.length ? '?' + previewArgs[0].slice('--preview='.length) : ''
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'Brandinbold',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL + previewQuery)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), previewQuery ? { search: previewQuery } : undefined)
  }
}

// ---------- profiles ----------
ipcMain.handle('profiles:list', () => store.list())
ipcMain.handle('profiles:listDeleted', () => store.listDeleted())
ipcMain.handle('profiles:create', (_e, name: string) => { const p = store.create(name || 'New profile'); scheduleCloudPush(); return p })
ipcMain.handle('profiles:save', (_e, profile: any) => { const saved = store.save(profile); scheduleCloudPush(); return saved })
ipcMain.handle('profiles:trash', (_e, id: string) => {
  if (registry.get(id)) throw new Error('Profile is running')
  const ok = store.trash(id)
  // Step B: trash = cloud tombstone (offline-queued); restore re-uploads with a newer stamp
  if (ok) queueCloudDelete('profiles', id)
  scheduleCloudPush()
  return ok
})
ipcMain.handle('profiles:restore', (_e, id: string) => {
  const ok = store.restore(id)
  if (ok) {
    unqueueCloudDelete('profiles', id)
    scheduleCloudPush()
  }
  return ok
})
ipcMain.handle('profiles:purge', async (_e, id: string) => {
  if (registry.get(id)) throw new Error('Profile is running')
  queueCloudDelete('profiles', id)
  const ok = store.purge(id)
  await rm(join(app.getPath('userData'), 'profiles', id), { recursive: true, force: true }).catch(() => {})
  scheduleCloudPush()
  return ok
})
ipcMain.handle('profiles:emptyTrash', async () => {
  const deleted = store.listDeleted()
  let count = 0
  for (const p of deleted) {
    if (registry.get(p.id)) continue
    queueCloudDelete('profiles', p.id)
    if (store.purge(p.id)) count++
    await rm(join(app.getPath('userData'), 'profiles', p.id), { recursive: true, force: true }).catch(() => {})
  }
  if (count > 0) scheduleCloudPush()
  return count
})
ipcMain.handle('profiles:generate', async (_e, profile: any) => {
  const pinned = await regenerateFingerprint(profile)
  return syncDisplayFields({ ...profile, fingerprint: pinned }, pinned)
})
ipcMain.handle(
  'profiles:bulkCreate',
  async (
    _e,
    opts: {
      count: number
      prefix?: string
      startIndex?: number
      os?: 'macos' | 'windows' | 'linux'
      groupId?: string | null
      proxyId?: string | null
      tags?: string[]
    }
  ) => {
    const count = Math.max(1, Math.min(50, Number(opts?.count) || 1))
    const prefix = (opts?.prefix || 'Profile').trim()
    const startIndex = Math.max(1, Number(opts?.startIndex) || 1)
    const os = opts?.os && ['macos', 'windows', 'linux'].includes(opts.os) ? opts.os : 'macos'
    const existing = store.list()
    const user = cloudUser()
    const max = cloudAuthed() && user ? (user.maxProfiles ?? 3) : (store.getSettings().maxProfiles ?? 3)
    const enforceQuota = ENABLE_PLAN_LIMITS && cloudAuthed()
    const remaining = enforceQuota ? Math.max(0, max - existing.length) : count

    const created: Profile[] = []
    let skippedQuota = 0
    const libProxy = opts?.proxyId ? store.getProxy(opts.proxyId) : null

    for (let i = 0; i < count; i++) {
      if (enforceQuota && created.length >= remaining) {
        skippedQuota++
        continue
      }
      const name = `${prefix} ${startIndex + i}`
      const base = store.create(name)
      const draft: Profile = {
        ...base,
        os,
        groupId: opts?.groupId ?? null,
        proxyId: opts?.proxyId ?? null,
        proxy: libProxy
          ? {
              type: libProxy.type,
              host: libProxy.host,
              port: libProxy.port,
              username: libProxy.username,
              password: libProxy.password
            }
          : base.proxy,
        tags: Array.isArray(opts?.tags) ? opts.tags : []
      }
      const pinned = await regenerateFingerprint(draft)
      const full = syncDisplayFields({ ...draft, fingerprint: pinned }, pinned)
      store.save(full)
      created.push(full)
    }
    if (created.length > 0) scheduleCloudPush()
    return { created, skippedQuota }
  }
)

// ---------- launch / stop ----------
ipcMain.handle(
  'launch',
  async (
    _e,
    id: string,
    opts?: { extraArgs?: string; openUrlAfter?: string; maximized?: boolean; privateWindow?: boolean }
  ) => {
    const profile = store.get(id)
    if (!profile) throw new Error('Profile not found')
    // TASK 10: pull the cloud session archive if it is newer than local
    await cloudMaybeRestoreSession(id, join(app.getPath('userData'), 'profiles', id))
    const result = await launcher.launch(profile, opts)
    // persist any display-field sync from pinning
    const fresh = store.get(id)
    if (fresh?.fingerprint) store.save(syncDisplayFields(fresh, fresh.fingerprint))
    return result
  }
)
ipcMain.handle('stop', async (_e, id: string) => {
  const ok = await launcher.stop(id)
  if (ok) {
    flushPendingBookmarks(id)
    if (activeSync?.mainId === id) {
      activeSync.unsubscribe?.()
      activeSync = null
    }
    const dir = join(app.getPath('userData'), 'profiles', id)
    void cloudUploadSession(id, dir).catch(() => {})
  }
  return ok
})
ipcMain.handle('running:list', () => registry.listRunning())
ipcMain.handle('status:get', (_e, id: string) => registry.status(id))

// ---------- synchronizer ----------
let activeSync: {
  mainId: string
  followerIds: string[]
  unsubscribe: (() => void) | null
} | null = null

ipcMain.handle('sync:status', () =>
  activeSync
    ? { active: true, mainId: activeSync.mainId, followerIds: activeSync.followerIds }
    : { active: false, mainId: null, followerIds: [] }
)
ipcMain.handle(
  'sync:start',
  async (_e, payload: { mainId: string; followerIds: string[]; initialUrl?: string }) => {
    if (activeSync?.unsubscribe) {
      activeSync.unsubscribe()
      activeSync = null
    }
    const followerIds = (payload.followerIds ?? []).filter((fid) => fid && fid !== payload.mainId)
    if (!registry.get(payload.mainId)) {
      const mp = store.get(payload.mainId)
      if (!mp) throw new Error('Main profile not found')
      await launcher.launch(mp)
    }
    for (const fid of followerIds) {
      if (!registry.get(fid)) {
        const fp = store.get(fid)
        if (fp && !fp.disabled) await launcher.launch(fp).catch(() => {})
      }
    }
    const mainHandle = registry.getHandle(payload.mainId)
    const unsubscribe =
      mainHandle?.onNavigate?.((url) => {
        for (const fid of followerIds) {
          void registry.getHandle(fid)?.openUrl(url).catch(() => {})
        }
      }) ?? null
    activeSync = { mainId: payload.mainId, followerIds, unsubscribe }
    if (payload.initialUrl && /^https?:\/\//i.test(payload.initialUrl.trim())) {
      const targetUrl = payload.initialUrl.trim()
      await mainHandle?.openUrl(targetUrl).catch(() => {})
      for (const fid of followerIds) {
        await registry.getHandle(fid)?.openUrl(targetUrl).catch(() => {})
      }
    }
    return { active: true, mainId: payload.mainId, followerIds }
  }
)
ipcMain.handle('sync:navigate', async (_e, url: string) => {
  if (!activeSync) throw new Error('Synchronizer is not active')
  const clean = url.trim()
  if (!/^https?:\/\//i.test(clean)) throw new Error('Expected http:// or https:// URL')
  await registry.getHandle(activeSync.mainId)?.openUrl(clean).catch(() => {})
  for (const fid of activeSync.followerIds) {
    await registry.getHandle(fid)?.openUrl(clean).catch(() => {})
  }
  return true
})
ipcMain.handle('sync:stop', () => {
  activeSync?.unsubscribe?.()
  activeSync = null
  return { active: false, mainId: null, followerIds: [] }
})

// ---------- engine ----------
ipcMain.handle('engine:status', async () => {
  const settings = store.getSettings()
  return {
    engine: settings.engine,
    camoufox: await camoufoxEngine.installedVersion(),
    chrome: await chromeEngine.installedVersion()
  }
})
ipcMain.handle('engine:install', async () => {
  const lines: string[] = []
  const onProgress = (line: string) => {
    lines.push(line)
    push('engine-progress', '', line)
  }
  const settings = store.getSettings()
  await engineById(settings.engine).ensureInstalled(onProgress)
  return lines
})

// ---------- import ----------
ipcMain.handle('profiles:importPreview', async (_e, text: string, fixAutomatically = true) => {
  return previewImport(text, fixAutomatically)
})
ipcMain.handle('profiles:importRun', async (
  _e,
  payload: { text: string; fixAutomatically: boolean; duplicateMode: 'skip' | 'rename'; targetGroupId: string | null }
) => {
  const existing = store.list()
  const deleted = store.listDeleted()
  const user = cloudUser()
  const max = cloudAuthed() && user ? (user.maxProfiles ?? 3) : (store.getSettings().maxProfiles ?? 3)
  const enforceQuota = ENABLE_PLAN_LIMITS && cloudAuthed()
  const maxQuotaRemaining = enforceQuota ? Math.max(0, max - existing.length) : null

  const result = runImport(payload.text, {
    fixAutomatically: payload.fixAutomatically,
    duplicateMode: payload.duplicateMode,
    targetGroupId: payload.targetGroupId,
    existingNames: existing.map((p) => p.name),
    existingIds: existing.map((p) => p.id),
    maxQuotaRemaining
  })

  let saved = 0
  let groupsChanged = false
  for (const profile of result.profiles ?? []) {
    // If a trashed profile had the same ID (e.g. export -> delete -> import), purge the trashed row so the ID is reused cleanly
    if (deleted.some((d) => d.id === profile.id)) {
      store.purge(profile.id)
      unqueueCloudDelete('profiles', profile.id)
    }
    if (payload.targetGroupId) {
      profile.groupId = payload.targetGroupId
    } else if ((profile as any).groupName) {
      const gName = String((profile as any).groupName).trim()
      if (gName) {
        let grp = store.listGroups().find((g) => g.name.toLowerCase() === gName.toLowerCase())
        if (!grp) {
          grp = store.createGroup(gName)
          groupsChanged = true
        }
        profile.groupId = grp.id
      }
    }
    store.save(profile)
    saved++
  }
  if (saved > 0 || groupsChanged) scheduleCloudPush()
  return { ...result, saved }
})

// ---------- profile storage (TASK 9) ----------
ipcMain.handle('profiles:storageInfo', () => {
  const engine = store.getSettings().engine === 'chrome-cdp' ? 'chromium' : 'firefox'
  const perProfile = store.list().map((p) => {
    const dir = join(app.getPath('userData'), 'profiles', p.id)
    const info = getProfileDiskInfo(dir, engine as 'firefox' | 'chromium')
    return { id: p.id, name: p.name, running: !!registry.get(p.id), totalBytes: info.totalBytes, cacheBytes: info.cacheBytes }
  })
  return {
    engine,
    totalBytes: perProfile.reduce((a, b) => a + b.totalBytes, 0),
    cacheBytes: perProfile.reduce((a, b) => a + b.cacheBytes, 0),
    perProfile
  }
})
ipcMain.handle('profiles:purgeCache', async (_e, id?: string) => {
  const engine = store.getSettings().engine === 'chrome-cdp' ? 'chromium' : 'firefox'
  const targets = id ? [id] : store.list().map((p) => p.id)
  let freedBytes = 0
  const perProfile: { id: string; freedBytes: number }[] = []
  for (const pid of targets) {
    if (registry.get(pid)) continue // never purge a running profile
    const dir = join(app.getPath('userData'), 'profiles', pid)
    const res = purgeTransientCaches(dir, engine as 'firefox' | 'chromium')
    freedBytes += res.freedBytes
    perProfile.push({ id: pid, freedBytes: res.freedBytes })
  }
  return { freedBytes, perProfile }
})

// ---------- groups ----------
ipcMain.handle('groups:list', () => store.listGroups())
ipcMain.handle('groups:create', (_e, name: string, pinned = false, color?: string, description?: string) => { const g = store.createGroup(name, pinned, color, description); scheduleCloudPush(); return g })
ipcMain.handle('groups:rename', (_e, id: string, name: string) => { store.renameGroup(id, name); scheduleCloudPush() })
ipcMain.handle('groups:updateMeta', (_e, id: string, color: string, description: string) => {
  db_exec_group_meta(id, color, description)
  scheduleCloudPush()
})
ipcMain.handle('groups:pin', (_e, id: string, pinned: boolean) => { store.setGroupPinned(id, pinned); scheduleCloudPush() })
ipcMain.handle('groups:delete', (_e, id: string) => { store.deleteGroup(id); queueCloudDelete('groups', id); scheduleCloudPush() })

// ---------- proxies ----------
ipcMain.handle('proxies:list', () => store.listProxies())
ipcMain.handle('proxies:create', (_e, data: any) => { const x = store.createProxy(data); scheduleCloudPush(); return x })
ipcMain.handle('proxies:save', (_e, entry: any) => { const x = store.saveProxy(entry); scheduleCloudPush(); return x })
ipcMain.handle('proxies:delete', (_e, id: string) => { store.deleteProxy(id); queueCloudDelete('proxies', id); scheduleCloudPush() })
ipcMain.handle('proxies:test', async (_e, proxy: any) => checkProxy(proxy))

// ---------- settings ----------
ipcMain.handle('settings:get', () => store.getSettings())
ipcMain.handle('settings:save', (_e, patch: Partial<AppSettings>) => {
  const merged = store.saveSettings(patch)
  settingsChanged(merged)
  return merged
})

// ---------- cookies ----------
ipcMain.handle('cookies:export', async (_e, id: string, format: 'json' | 'netscape') => {
  const handle = registry.getHandle(id)
  if (!handle?.cookies) throw new Error('Profile browser is not running')
  const cookies = await handle.cookies.export()
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `cookies-${id.slice(0, 8)}.${format === 'json' ? 'json' : 'txt'}`
  })
  if (canceled || !filePath) return null
  const content = format === 'json' ? JSON.stringify(cookies, null, 2) : toNetscapeFormat(cookies)
  await writeFile(filePath, content, 'utf8')
  return filePath
})
ipcMain.handle('cookies:import', async (_e, id: string) => {
  const handle = registry.getHandle(id)
  if (!handle?.cookies) throw new Error('Profile browser is not running')
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Cookies', extensions: ['json', 'txt'] }]
  })
  if (canceled || !filePaths[0]) return null
  const text = await readFile(filePaths[0], 'utf8')
  const cookies = filePaths[0].endsWith('.json') ? JSON.parse(text) : parseNetscapeFormat(text)
  return handle.cookies.import(cookies)
})

const COLLECTOR_SITES = [
  'https://www.wikipedia.org/',
  'https://www.bbc.com/',
  'https://www.reddit.com/',
  'https://news.ycombinator.com/',
  'https://example.com/'
]

/** Cookie collector: launch (if needed), visit a few sites to accumulate cookies, keep the profile open. */
ipcMain.handle('cookies:collect', async (_e, id: string) => {
  if (!registry.get(id)) {
    const profile = store.get(id)
    if (!profile) throw new Error('Profile not found')
    await launcher.launch(profile)
    await new Promise((r) => setTimeout(r, 4000))
  }
  const handle = registry.getHandle(id)
  if (!handle) throw new Error('Profile browser is not running')
  for (const site of COLLECTOR_SITES) {
    await handle.openUrl(site).catch(() => {})
    await new Promise((r) => setTimeout(r, 8000))
  }
  return true
})

// ---------- extensions / backups / bookmarks / csv ----------
ipcMain.handle('extensions:pickFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  return canceled ? null : filePaths[0]
})
ipcMain.handle('profiles:export', async (
  _e,
  ids: string[],
  options: { format: 'incogniton' | 'brandinbold'; includeNotes: boolean; includeCredentials: boolean }
) => {
  const profiles = ids.map((id) => store.get(id)).filter((p): p is Profile => !!p)
  if (!profiles.length) throw new Error('No profiles to export')
  const defaultName =
    profiles.length === 1
      ? `${profiles[0].name.replace(/[^a-zA-Z0-9-_]+/g, '_')}`
      : `brandinbold-${profiles.length}-profiles`
  const ext = options.format === 'incogniton' ? 'csv' : 'json'
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `${defaultName}.${ext}`
  })
  if (canceled || !filePath) return null
  const content =
    options.format === 'incogniton'
      ? buildIncognitonCsv(profiles, store.listGroups(), options)
      : buildBrandinboldJson(profiles, store.listGroups())
  await writeFile(filePath, content, 'utf8')
  return filePath
})
ipcMain.handle('cookies:clear', async (_e, id: string) => {
  const handle = registry.getHandle(id)
  if (!handle?.cookies?.clear) throw new Error('Profile browser is not running')
  await handle.cookies.clear()
  return true
})
ipcMain.handle('bookmarks:add', async (_e, id: string, urls: string[]) => {
  if (registry.get(id)) throw new Error('Stop the browser first — bookmarks are written to places.sqlite directly')
  return addBookmarks(store.get(id), urls)
})
ipcMain.handle('bookmarks:clear', async (_e, id: string) => {
  if (registry.get(id)) throw new Error('Stop the browser first — bookmarks are written to places.sqlite directly')
  return clearBookmarks(store.get(id))
})
ipcMain.handle('backup:now', async (_e, id: string) => backupProfile(store.get(id)))
ipcMain.handle('backup:restore', async (_e, id: string) => {
  if (registry.get(id)) throw new Error('Stop the profile before restoring')
  return restoreLatestBackup(id)
})
ipcMain.handle('backup:export', async (_e, id: string) => {
  if (registry.get(id)) throw new Error('Stop the profile before exporting data')
  const p = store.get(id)
  if (!p) throw new Error('Profile not found')
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
  if (canceled || !filePaths[0]) return null
  const src = ensureProfileDir(p)
  const dest = join(filePaths[0], `brandinbold-profile-${id.slice(0, 8)}`)
  copyDir(src, dest)
  return dest
})
ipcMain.handle('backup:import', async (_e, id: string) => {
  if (registry.get(id)) throw new Error('Stop the profile before importing data')
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  if (canceled || !filePaths[0]) return null
  const dest = join(app.getPath('userData'), 'profiles', id)
  copyDir(filePaths[0], dest)
  restoreProfileMetadataIfPresent(id, dest)
  return true
})
ipcMain.handle('backup:openFolder', async (_e, id: string) => {
  const dir = join(app.getPath('userData'), 'backups', id.slice(0, 8))
  mkdirSync(dir, { recursive: true })
  execFile('open', [dir])
  return dir
})

// ---------- cloud (TASK 10 + Step 1) ----------
ipcMain.handle('cloud:status', () => ({
  enabled: cloudEnabled(),
  authed: cloudAuthed(),
  user: cloudUser(),
  offlineMode: cloudOfflineMode(),
  apiUrl: cloudApiUrl(),
  webUrl: cloudWebUrl(),
  apiUrlFromEnv: apiUrlFromEnv(),
  unsyncedProfileIds: unsyncedProfileIds()
}))
/** Probe /api/health of a candidate URL without saving it. */
ipcMain.handle('cloud:testUrl', async (_e, url: string) => {
  try {
    const u = new URL(url.trim())
    const res = await fetch(`${u.origin}${u.pathname.replace(/\/+$/, '')}/api/health`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const body = (await res.json()) as { app?: string; version?: string }
    return { ok: body.app === 'Brandinbold Cloud API', app: body.app, version: body.version, error: body.app ? undefined : 'Not a Brandinbold API' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})
/** Save the API URL; signs out when the server changes (tokens belong to the old server). */
ipcMain.handle('cloud:setApiUrl', (_e, url: string) => {
  const clean = url.trim().replace(/\/+$/, '')
  try {
    const u = new URL(clean)
    if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol')
  } catch {
    throw new Error('Invalid URL (expected http(s)://host)')
  }
  const changed = clean !== cloudApiUrl()
  store.saveSettings({ cloudApiUrl: clean })
  if (changed) doLogout()
  void cloudClient() // rebuilds against the new URL
  return { apiUrl: cloudApiUrl(), webUrl: cloudWebUrl(), signedOut: changed }
})
ipcMain.handle('cloud:login', async (_e, email: string, password: string, totpCode?: string) => {
  const user = await doLogin(email, password, totpCode)
  const summary = await cloudPullAndMerge()
  const pushRes = await cloudPushNow()
  push('cloud-event', '', 'synced')
  return { user, summary, pushRes, unsyncedProfileIds: unsyncedProfileIds() }
})
ipcMain.handle('cloud:register', async (_e, email: string, name: string, password: string, username?: string) => {
  const user = await doRegister(email, name, password, username)
  const summary = await cloudPullAndMerge()
  const pushRes = await cloudPushNow()
  push('cloud-event', '', 'synced')
  return { user, summary, pushRes, unsyncedProfileIds: unsyncedProfileIds() }
})
ipcMain.handle('cloud:logout', () => {
  doLogout()
  push('cloud-event', '', 'logged-out')
  return true
})
ipcMain.handle('cloud:offlineMode', (_e, v: boolean) => {
  store.saveSettings({ cloudOfflineMode: v })
  push('cloud-event', '', v ? 'offline' : 'online')
  return v
})
ipcMain.handle('cloud:syncNow', async () => {
  await refreshCloudUser()
  const pulled = await cloudPullAndMerge()
  const pushed = await cloudPushNow()
  push('cloud-event', '', 'synced')
  return { pulled, pushed, unsyncedProfileIds: unsyncedProfileIds() }
})
ipcMain.handle('profiles:pushNow', async () => {
  await cloudPushNow()
  return true
})

// ---------- system ----------
ipcMain.handle('system:info', () => ({
  apiPort: api?.currentPort ?? null,
  version: app.getVersion()
}))
ipcMain.handle('system:openExternal', async (_e, url: string) => {
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed')
  }
  await shell.openExternal(u.toString())
  return true
})

app.whenReady().then(() => {
  // TASK 9: migrate camoufox engine storage out of ~/Library/Caches (cache
  // cleaners delete it) into userData/engine, and keep a self-healing symlink.
  const engineHome = setupEngineHome()
  if (engineHome.error) console.error('engine home setup failed:', engineHome.error)
  else if (engineHome.migrated) console.log('engine storage migrated to', engineHomeDir())

  initCloud(
    store,
    (id) => !!registry.get(id),
    (status, detail) => push('cloud-event', '', status, detail)
  )
  // Step 2: 30-day auto-purge of expired Trash profiles
  const expiredIds = store.autoPurgeExpiredTrash(30)
  for (const eid of expiredIds) {
    queueCloudDelete('profiles', eid)
    void rm(join(app.getPath('userData'), 'profiles', eid), { recursive: true, force: true }).catch(() => {})
  }
  applyEngineSetting()
  createWindow()
  // dev-only screenshot hook: REA_SHOT=/path.png captures the renderer and quits
  if (process.env.REA_SHOT) {
    setTimeout(async () => {
      const img = await mainWindow!.webContents.capturePage()
      require('fs').writeFileSync(process.env.REA_SHOT!, img.toPNG())
      app.quit()
    }, 8000)
  }
  const settings = store.getSettings()
  api = new AutomationApi(store, registry, launcher, (port) =>
    push('api-port', '', String(port ?? ''))
  )
  if (settings.automationEnabled) {
    void api.start(settings.automationPort).catch((e) => console.error('API failed:', e))
  }
  if (cloudEnabled() && cloudAuthed()) {
    void (async () => {
      await refreshCloudUser()
      const s = await cloudPullAndMerge()
      if (s) console.log('cloud pull:', JSON.stringify(s.pulled))
      await cloudPushNow()
      push('cloud-event', '', 'synced')
    })()
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) throw new Error('Source folder not found')
  mkdirSync(dest, { recursive: true })
  execFileSync2('cp', ['-R', src + '/', dest + '/'])
}
function execFileSync2(cmd: string, args: string[]): void {
  require('child_process').execFileSync(cmd, args, { timeout: 600000, stdio: 'ignore' })
}

function ensureProfileDir(p: Profile): string {
  const dir = join(app.getPath('userData'), 'profiles', p.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'profile-metadata.json'), JSON.stringify(p, null, 2), 'utf8')
  return dir
}

function restoreProfileMetadataIfPresent(id: string, dir: string): void {
  const metaPath = join(dir, 'profile-metadata.json')
  if (!existsSync(metaPath)) return
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<Profile>
    const cur = store.get(id)
    if (cur && meta) {
      store.save({
        ...cur,
        notes: meta.notes ?? cur.notes,
        tags: Array.isArray(meta.tags) ? meta.tags : cur.tags,
        startupUrls: Array.isArray(meta.startupUrls) ? meta.startupUrls : cur.startupUrls,
        startupUrlsEnabled: meta.startupUrlsEnabled ?? cur.startupUrlsEnabled,
        customArgs: meta.customArgs ?? cur.customArgs,
        customArgsEnabled: meta.customArgsEnabled ?? cur.customArgsEnabled
      })
      scheduleCloudPush()
    }
  } catch {
    /* ignore */
  }
}

async function backupProfile(p: Profile | null): Promise<string | null> {
  if (!p) return null
  if (registry.get(p.id)) throw new Error('Stop the profile before backing up')
  const src = ensureProfileDir(p)
  const dest = join(app.getPath('userData'), 'backups', p.id.slice(0, 8), new Date().toISOString().replace(/[:.]/g, '-'))
  copyDir(src, dest)
  return dest
}

async function restoreLatestBackup(id: string): Promise<string | null> {
  const dir = join(app.getPath('userData'), 'backups', id.slice(0, 8))
  if (!existsSync(dir)) return null
  const entries = await readdir(dir)
  if (!entries.length) return null
  const latest = entries.sort().pop()!
  const targetDir = join(app.getPath('userData'), 'profiles', id)
  copyDir(join(dir, latest), targetDir)
  restoreProfileMetadataIfPresent(id, targetDir)
  return latest
}

function profilePlacesDb(p: { id: string } | null): string | null {
  if (!p) return null
  const db = join(app.getPath('userData'), 'profiles', p.id, 'places.sqlite')
  return existsSync(db) ? db : null
}

function writeBookmarksToPlacesDb(db: string, urls: string[]): number {
  const conn = new Database(db)
  try {
    let n = 0
    const parentRow = conn.prepare("SELECT id FROM moz_bookmarks WHERE guid = 'toolbar_____' OR id = 3 LIMIT 1").get() as any
    const parentId = parentRow?.id ?? 3
    for (const rawUrl of urls) {
      const url = rawUrl.trim()
      if (!/^https?:\/\//i.test(url)) continue
      const place = conn.prepare('SELECT id FROM moz_places WHERE url = ?').get(url) as any
      let placeId = place?.id
      if (!placeId) {
        let revHost = '.'
        try {
          revHost = new URL(url).hostname.split('').reverse().join('') + '.'
        } catch {
          /* ignore */
        }
        const guid = randomBytes(9).toString('base64url').slice(0, 12)
        const info = conn
          .prepare(
            'INSERT INTO moz_places (url, title, rev_host, hidden, typed, frecency, guid, foreign_count, url_hash) VALUES (?, ?, ?, 0, 1, 100, ?, 1, 0)'
          )
          .run(url, url, revHost, guid)
        placeId = Number(info.lastInsertRowid)
      } else {
        conn.prepare('UPDATE moz_places SET foreign_count = COALESCE(foreign_count, 0) + 1 WHERE id = ?').run(placeId)
      }
      const now = Date.now() * 1000
      const bmGuid = randomBytes(9).toString('base64url').slice(0, 12)
      conn
        .prepare(
          'INSERT INTO moz_bookmarks (type, fk, parent, position, title, dateAdded, lastModified, guid) VALUES (1, ?, ?, 0, ?, ?, ?, ?)'
        )
        .run(placeId, parentId, url, now, now, bmGuid)
      n++
    }
    return n
  } finally {
    conn.close()
  }
}

function addBookmarks(p: { id: string } | null, urls: string[]): number {
  if (!p) throw new Error('Profile not found')
  const validUrls = (urls ?? []).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))
  if (!validUrls.length) return 0
  const db = profilePlacesDb(p)
  if (db) {
    return writeBookmarksToPlacesDb(db, validUrls)
  }
  // Profile has not been launched yet: queue bookmarks in pending-bookmarks.json
  const dir = join(app.getPath('userData'), 'profiles', p.id)
  mkdirSync(dir, { recursive: true })
  const pendingPath = join(dir, 'pending-bookmarks.json')
  let existing: string[] = []
  if (existsSync(pendingPath)) {
    try {
      existing = JSON.parse(readFileSync(pendingPath, 'utf8'))
    } catch {
      existing = []
    }
  }
  const merged = [...new Set([...existing, ...validUrls])]
  writeFileSync(pendingPath, JSON.stringify(merged, null, 2), 'utf8')
  return validUrls.length
}

function flushPendingBookmarks(profileId: string): void {
  const dir = join(app.getPath('userData'), 'profiles', profileId)
  const pendingPath = join(dir, 'pending-bookmarks.json')
  const dbPath = join(dir, 'places.sqlite')
  if (!existsSync(pendingPath) || !existsSync(dbPath)) return
  try {
    const urls = JSON.parse(readFileSync(pendingPath, 'utf8')) as string[]
    if (Array.isArray(urls) && urls.length) {
      writeBookmarksToPlacesDb(dbPath, urls)
    }
    rmSync(pendingPath, { force: true })
  } catch {
    /* ignore */
  }
}

function clearBookmarks(p: { id: string } | null): boolean {
  if (!p) return false
  const dir = join(app.getPath('userData'), 'profiles', p.id)
  rmSync(join(dir, 'pending-bookmarks.json'), { force: true })
  const db = profilePlacesDb(p)
  if (!db) return true
  const conn = new Database(db)
  try {
    conn.prepare('DELETE FROM moz_bookmarks WHERE type = 1').run()
    return true
  } finally {
    conn.close()
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  for (const r of registry.listRunning()) {
    await registry.stop(r.profileId)
  }
  await api?.stop()
  store.close()
})

export type { Profile }
