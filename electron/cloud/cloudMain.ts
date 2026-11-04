import { createCloudClient, type CloudClient, type CloudUser } from './cloudClient'
import { pullAndMerge, uploadSessionState, maybeRestoreSession, pushAll, type SyncSummary } from './syncEngine'
import type { ProfileStore } from '../store/db'

/**
 * Cloud wiring (TASK 10 Étape 2.4): tokens live in the local settings KV,
 * client + sync engine are created lazily, mutations push with a debounce,
 * session archives roam via upload-on-stop / restore-on-launch.
 */

let client: CloudClient | null = null
let store: ProfileStore | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false

function apiUrl(): string {
  return store?.getSettings().cloudApiUrl ?? 'http://localhost:8787'
}

export function initCloud(storeRef: ProfileStore): void {
  store = storeRef
}

function makeClient(): CloudClient {
  return createCloudClient({
    apiUrl: apiUrl(),
    getToken: () => store?.getSetting('cloud_token') ?? null,
    getRefreshToken: () => store?.getSetting('cloud_refresh_token') ?? null,
    setTokens: (access, refresh) => {
      if (!store) return
      if (access) store.setSetting('cloud_token', access)
      else store.setSetting('cloud_token', '')
      if (refresh) store.setSetting('cloud_refresh_token', refresh)
    }
  })
}

export function cloudClient(): CloudClient {
  if (!client) client = makeClient()
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

export function cloudOfflineMode(): boolean {
  return store?.getSettings().cloudOfflineMode === true
}

export function cloudEnabled(): boolean {
  return !cloudOfflineMode() && !!apiUrl()
}

export async function doLogin(email: string, password: string): Promise<CloudUser> {
  const res = await cloudClient().login(email, password)
  store?.setSetting('cloud_user', JSON.stringify(res.user))
  return res.user
}

export async function doRegister(email: string, name: string, password: string): Promise<CloudUser> {
  const res = await cloudClient().register(email, name, password)
  store?.setSetting('cloud_user', JSON.stringify(res.user))
  return res.user
}

export function doLogout(): void {
  cloudClient().logout()
  store?.setSetting('cloud_user', '')
}

/** Pull remote → merge local (newer updatedAt wins). Called on login/start. */
export async function cloudPullAndMerge(): Promise<SyncSummary | null> {
  if (!store || !cloudEnabled() || !cloudAuthed() || syncing) return null
  syncing = true
  try {
    return await pullAndMerge(cloudClient(), {
      list: () => store!.list(),
      get: (id) => store!.get(id),
      save: (p) => store!.save(p),
      listGroups: () => store!.listGroups(),
      upsertGroup: (g) => store!.upsertGroup(g),
      listProxies: () => store!.listProxies(),
      saveProxy: (x) => store!.saveProxy(x)
    })
  } finally {
    syncing = false
  }
}

/** Push the full local state (debounced, offline-safe). */
export function scheduleCloudPush(delayMs = 1500): void {
  if (!cloudEnabled() || !cloudAuthed()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void (async () => {
      if (!store || syncing) return
      syncing = true
      try {
        await pushAll(cloudClient(), store.list(), store.listGroups(), store.listProxies())
      } catch {
        /* offline — retried on next mutation or app start */
      } finally {
        syncing = false
      }
    })()
  }, delayMs)
}

/** Session archive: download before launch if the cloud copy is newer. */
export async function cloudMaybeRestoreSession(profileId: string, profileDir: string): Promise<boolean> {
  if (!cloudEnabled() || !cloudAuthed()) return false
  return maybeRestoreSession(cloudClient(), profileId, profileDir)
}

/** Session archive: upload after stop + purge (vital files only). */
export async function cloudUploadSession(profileId: string, profileDir: string): Promise<{ size: number } | null> {
  if (!cloudEnabled() || !cloudAuthed()) return null
  return uploadSessionState(cloudClient(), profileId, profileDir)
}
