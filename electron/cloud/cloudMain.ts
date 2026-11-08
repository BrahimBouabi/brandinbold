import { createCloudClient, type CloudClient, type CloudPushResponse, type CloudUser } from './cloudClient'
import { pullAndMerge, uploadSessionState, maybeRestoreSession, pushAll, type DeleteQueue, type SyncSummary } from './syncEngine'
import { DEFAULT_CLOUD_API_URL, resolveDashboardUrl } from '@shared/config'
import type { ProfileStore } from '../store/db'

/**
 * Cloud wiring (TASK 10 Étape 2.4 + Step 1): tokens live in the local settings KV,
 * client + sync engine are created lazily, mutations push with a debounce,
 * session archives roam via upload-on-stop / restore-on-launch.
 */

let client: CloudClient | null = null
let clientUrl = ''
let store: ProfileStore | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false
let onCloudEvent: ((status: string, detail?: string) => void) | null = null

/** Env override (packaged builds / CI) wins over Settings; trailing slashes stripped. */
export function apiUrl(): string {
  const env = process.env.BRANDINBOLD_CLOUD_API_URL ?? process.env.Brandinbold_CLOUD_API_URL
  const url = (env || store?.getSettings().cloudApiUrl || DEFAULT_CLOUD_API_URL).trim()
  return url.replace(/\/+$/, '')
}

export function webUrl(): string {
  return resolveDashboardUrl(apiUrl())
}

export function apiUrlFromEnv(): boolean {
  return !!(process.env.BRANDINBOLD_CLOUD_API_URL ?? process.env.Brandinbold_CLOUD_API_URL)
}

let isRunning: (id: string) => boolean = () => false

export function initCloud(
  storeRef: ProfileStore,
  isRunningFn?: (id: string) => boolean,
  onEventFn?: (status: string, detail?: string) => void
): void {
  store = storeRef
  if (isRunningFn) isRunning = isRunningFn
  if (onEventFn) onCloudEvent = onEventFn

  // One-time migration: upgrade untouched legacy localhost default to production Railway URL
  if (!store.getSetting('cloud_url_migrated_v1')) {
    const currentUrl = store.getSettings().cloudApiUrl
    if (!store.getSetting('cloud_token') && (!currentUrl || currentUrl === 'http://localhost:8787')) {
      store.saveSettings({ cloudApiUrl: DEFAULT_CLOUD_API_URL })
    }
    store.setSetting('cloud_url_migrated_v1', '1')
  }
}

// ---------- offline delete queue (Step B) ----------
const QUEUE_KEY = 'cloud_pending_deletes'
const UNSYNCED_KEY = 'cloud_unsynced_profile_ids'
type Kind = keyof DeleteQueue

function readQueue(): DeleteQueue {
  try {
    const q = JSON.parse(store?.getSetting(QUEUE_KEY) || '{}') as Partial<DeleteQueue>
    return { profiles: q.profiles ?? [], groups: q.groups ?? [], proxies: q.proxies ?? [] }
  } catch {
    return { profiles: [], groups: [], proxies: [] }
  }
}

function writeQueue(q: DeleteQueue): void {
  store?.setSetting(QUEUE_KEY, JSON.stringify(q))
}

export function unsyncedProfileIds(): string[] {
  try {
    const raw = store?.getSetting(UNSYNCED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function setUnsyncedProfileIds(ids: string[]): void {
  store?.setSetting(UNSYNCED_KEY, JSON.stringify(ids))
}

/** Record a local deletion; survives restarts until the server acknowledges it. */
export function queueCloudDelete(kind: Kind, id: string): void {
  if (!store || !cloudAuthed()) return
  const q = readQueue()
  q[kind] = q[kind].filter((t) => t.id !== id).concat({ id, deletedAt: new Date().toISOString() })
  writeQueue(q)
}

export function unqueueCloudDelete(kind: Kind, id: string): void {
  if (!store) return
  const q = readQueue()
  q[kind] = q[kind].filter((t) => t.id !== id)
  writeQueue(q)
}

/** Drop exactly the tombstones that were sent (new ones queued meanwhile stay). */
function ackQueue(sent: DeleteQueue): void {
  const q = readQueue()
  for (const k of ['profiles', 'groups', 'proxies'] as Kind[]) {
    const done = new Set(sent[k].map((t) => `${t.id}@${t.deletedAt}`))
    q[k] = q[k].filter((t) => !done.has(`${t.id}@${t.deletedAt}`))
  }
  writeQueue(q)
}

// ---------- session archive markers (server clock) ----------
const markerKey = (id: string): string => `cloud_session_synced:${id}`

function makeClient(): CloudClient {
  return createCloudClient({
    apiUrl: apiUrl(),
    getToken: () => store?.getSetting('cloud_token') ?? null,
    getRefreshToken: () => store?.getSetting('cloud_refresh_token') ?? null,
    setTokens: (access, refresh) => {
      if (!store) return
      store.setSetting('cloud_token', access ?? '')
      // null refresh = logout: the refresh token must be wiped too
      store.setSetting('cloud_refresh_token', refresh ?? '')
    }
  })
}

export function cloudClient(): CloudClient {
  // rebuild when the API URL changed in Settings (client captures the URL)
  if (!client || clientUrl !== apiUrl()) {
    client = makeClient()
    clientUrl = apiUrl()
  }
  return client
}

export function cloudAuthed(): boolean {
  return !!store?.getSetting('cloud_token')
}

export function cloudUser(): CloudUser | null {
  try {
    const raw = store?.getSetting('cloud_user')
    return raw ? (JSON.parse(raw) as CloudUser) : null
  } catch {
    return null
  }
}

export async function refreshCloudUser(): Promise<CloudUser | null> {
  if (!cloudEnabled() || !cloudAuthed()) return null
  try {
    const res = await cloudClient().me()
    if (res?.user) {
      store?.setSetting('cloud_user', JSON.stringify(res.user))
      return res.user
    }
  } catch {
    /* ignore network error */
  }
  return cloudUser()
}

export function cloudOfflineMode(): boolean {
  return store?.getSettings().cloudOfflineMode === true
}

export function cloudEnabled(): boolean {
  return !cloudOfflineMode() && !!apiUrl()
}

export async function doLogin(email: string, password: string, totpCode?: string): Promise<CloudUser> {
  const res = await cloudClient().login(email, password, totpCode)
  store?.saveSettings({ cloudOfflineMode: false })
  store?.setSetting('cloud_user', JSON.stringify(res.user))
  return res.user
}

export async function doRegister(email: string, name: string, password: string, username?: string): Promise<CloudUser> {
  const res = await cloudClient().register(email, name, password, username)
  store?.saveSettings({ cloudOfflineMode: false })
  store?.setSetting('cloud_user', JSON.stringify(res.user))
  return res.user
}

/** Full sign-out: both tokens, cached user, pending push and account-bound queue. */
export function doLogout(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  cloudClient().logout()
  store?.setSetting('cloud_user', '')
  setUnsyncedProfileIds([])
  writeQueue({ profiles: [], groups: [], proxies: [] })
  onCloudEvent?.('logged-out')
}

/** Pull remote → merge local (newer updatedAt wins). Called on login/start. */
export async function cloudPullAndMerge(): Promise<SyncSummary | null> {
  if (!store || !cloudEnabled() || !cloudAuthed() || syncing) return null
  syncing = true
  try {
    const s = store
    return await pullAndMerge(cloudClient(), {
      get: (id) => s.get(id),
      save: (p, o) => s.save(p, o),
      isTrashed: (id) => s.isTrashed(id),
      trash: (id) => s.trash(id),
      listGroups: () => s.listGroups(),
      upsertGroup: (g) => s.upsertGroup(g),
      deleteGroup: (id) => s.deleteGroup(id),
      listProxies: () => s.listProxies(),
      saveProxy: (x, o) => s.saveProxy(x, o),
      deleteProxy: (id) => s.deleteProxy(id),
      isRunning,
      pendingDeletes: readQueue
    })
  } finally {
    syncing = false
  }
}

/** Immediate push (awaitable on login / manual sync). */
export async function cloudPushNow(): Promise<CloudPushResponse | null> {
  if (!store || !cloudEnabled() || !cloudAuthed()) return null
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  while (syncing) {
    await new Promise((r) => setTimeout(r, 100))
  }
  syncing = true
  try {
    const sent = readQueue()
    const res = await pushAll(cloudClient(), store.list(), store.listGroups(), store.listProxies(), sent)
    ackQueue(sent)
    const rejectedIds = (res.rejectedProfiles ?? []).map((r) => r.id)
    setUnsyncedProfileIds(rejectedIds)
    if (rejectedIds.length > 0) {
      onCloudEvent?.(
        'quota-warning',
        `${rejectedIds.length} profile(s) kept local-only (plan limit: ${res.maxProfiles ?? 3} cloud profiles)`
      )
    } else {
      onCloudEvent?.('synced')
    }
    return res
  } catch {
    return null
  } finally {
    syncing = false
  }
}

/** Push the full local state (debounced, offline-safe). */
export function scheduleCloudPush(delayMs = 1500): void {
  if (!cloudEnabled() || !cloudAuthed()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void cloudPushNow()
  }, delayMs)
}

/** Session archive: download before launch if the cloud copy is newer. */
export async function cloudMaybeRestoreSession(profileId: string, profileDir: string): Promise<boolean> {
  if (!cloudEnabled() || !cloudAuthed() || !store) return false
  const r = await maybeRestoreSession(cloudClient(), profileId, profileDir, store.getSetting(markerKey(profileId)))
  if (r.restored && r.serverUpdatedAt) store.setSetting(markerKey(profileId), r.serverUpdatedAt)
  return r.restored
}

/** Session archive: upload after stop + purge (vital files only). */
export async function cloudUploadSession(profileId: string, profileDir: string): Promise<{ size: number } | null> {
  if (!cloudEnabled() || !cloudAuthed() || !store) return null
  // Stop button + browser 'exit' event both fire for one shutdown → one upload
  const last = recentUploads.get(profileId) ?? 0
  if (Date.now() - last < 10_000) return null
  recentUploads.set(profileId, Date.now())
  const r = await uploadSessionState(cloudClient(), profileId, profileDir)
  if (r?.updatedAt) store.setSetting(markerKey(profileId), r.updatedAt)
  return r
}
const recentUploads = new Map<string, number>()
