import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { Group, Profile, ProxyEntry } from '@shared/types'
import type { CloudClient, CloudPushResponse } from './cloudClient'

/**
 * TASK 10 Étape 2.4 — two-way sync engine.
 *
 * Pull: remote profiles/groups/proxies are merged into the local SQLite store
 * (newer updatedAt wins). Push: the FULL local state is upserted to the cloud
 * (ownership-aware on the server; small payloads, no delta complexity yet).
 *
 * Session archives: after a graceful stop the vital files (cookies.sqlite,
 * places.sqlite, sessionstore-backups/, key4.db, logins.json) are tar+gzip
 * packed and uploaded; before a launch a newer cloud archive is extracted
 * into the profile dir. NEVER: prefs.js, extensions/, cache dirs, storage/ —
 * those stay machine-local (prefs carry the UI locale + session prefs).
 */

const VITAL_FILES = [
  'cookies.sqlite',
  'cookies.sqlite-wal',
  'places.sqlite',
  'places.sqlite-wal',
  'key4.db',
  'logins.json',
  'formhistory.sqlite'
]
const VITAL_DIRS = ['sessionstore-backups']

export interface SyncSummary {
  pulled: { profiles: number; groups: number; proxies: number }
  pushed: { profiles: number; groups: number; proxies: number }
  merged: number
  /** Step B: local items removed because they were deleted on another device */
  removed: number
  errors: string[]
}

export type Tombstone = { id: string; deletedAt: string }
export type DeleteQueue = { profiles: Tombstone[]; groups: Tombstone[]; proxies: Tombstone[] }

export interface LocalStore {
  get(id: string): Profile | null
  save(p: Profile, opts?: { keepUpdatedAt?: boolean }): Profile
  isTrashed(id: string): boolean
  trash(id: string): boolean
  listGroups(): Group[]
  upsertGroup(g: Group): void
  deleteGroup(id: string): void
  listProxies(): ProxyEntry[]
  saveProxy(p: ProxyEntry, opts?: { keepUpdatedAt?: boolean }): ProxyEntry
  deleteProxy(id: string): void
  isRunning(id: string): boolean
  /** ids with a local deletion not yet acknowledged by the server */
  pendingDeletes(): DeleteQueue
}

const ms = (t: string | undefined | null): number => {
  const v = t ? new Date(t).getTime() : 0
  return Number.isNaN(v) ? 0 : v
}

/**
 * Pull remote state and merge into the local store — newer updatedAt wins for
 * profiles, groups AND proxies; remote tombstones remove local copies that
 * were not edited after the deletion. Remote timestamps are preserved locally
 * (keepUpdatedAt) so a merge never looks like a fresh local edit.
 */
export async function pullAndMerge(client: CloudClient, store: LocalStore): Promise<SyncSummary> {
  const summary: SyncSummary = { pulled: { profiles: 0, groups: 0, proxies: 0 }, pushed: { profiles: 0, groups: 0, proxies: 0 }, merged: 0, removed: 0, errors: [] }
  const remote = await client.pull()
  const pending = store.pendingDeletes()
  const pendingIds = new Set([...pending.profiles, ...pending.groups, ...pending.proxies].map((t) => t.id))

  for (const doc of (remote.profiles ?? []) as Profile[]) {
    summary.pulled.profiles++
    if (pendingIds.has(doc.id)) continue // deleted here, tombstone not pushed yet
    const local = store.get(doc.id)
    if (local && store.isTrashed(doc.id)) continue
    if (local && ms(doc.updatedAt) <= ms(local.updatedAt)) continue
    if (local && store.isRunning(doc.id)) continue // never rewrite a running profile
    try {
      store.save(local ? { ...doc, id: local.id } : doc, { keepUpdatedAt: true })
      summary.merged++
    } catch (e: any) {
      summary.errors.push(`profile ${doc.id}: ${e.message}`)
    }
  }

  const localGroups = new Map(store.listGroups().map((g) => [g.id, g]))
  for (const g of (remote.groups ?? []) as Group[]) {
    summary.pulled.groups++
    if (pendingIds.has(g.id)) continue
    const local = localGroups.get(g.id)
    if (local && ms(g.updatedAt) <= ms(local.updatedAt ?? local.createdAt)) continue
    try {
      store.upsertGroup({ id: g.id, name: g.name, pinned: !!g.pinned, color: g.color ?? '#8952ef', description: g.description ?? '', createdAt: g.createdAt ?? new Date().toISOString(), updatedAt: g.updatedAt })
      summary.merged++
    } catch (e: any) {
      summary.errors.push(`group ${g.id}: ${e.message}`)
    }
  }

  const localProxies = new Map(store.listProxies().map((x) => [x.id, x]))
  for (const x of (remote.proxies ?? []) as ProxyEntry[]) {
    summary.pulled.proxies++
    if (pendingIds.has(x.id)) continue
    const local = localProxies.get(x.id)
    if (local && ms(x.updatedAt) <= ms(local.updatedAt ?? local.createdAt)) continue
    try {
      store.saveProxy(x, { keepUpdatedAt: true })
      summary.merged++
    } catch (e: any) {
      summary.errors.push(`proxy ${x.id}: ${e.message}`)
    }
  }

  // ---- remote deletions ----
  const del = (remote.deleted ?? {}) as Partial<DeleteQueue>
  for (const t of del.profiles ?? []) {
    const local = store.get(t.id)
    if (!local || store.isTrashed(t.id) || store.isRunning(t.id)) continue
    if (ms(local.updatedAt) > ms(t.deletedAt)) continue // edited here after the delete → keep (push resurrects)
    if (store.trash(t.id)) summary.removed++ // soft: still restorable from Trash
  }
  for (const t of del.groups ?? []) {
    const local = localGroups.get(t.id)
    if (!local || ms(local.updatedAt ?? local.createdAt) > ms(t.deletedAt)) continue
    store.deleteGroup(t.id)
    summary.removed++
  }
  for (const t of del.proxies ?? []) {
    const local = localProxies.get(t.id)
    if (!local || ms(local.updatedAt ?? local.createdAt) > ms(t.deletedAt)) continue
    store.deleteProxy(t.id)
    summary.removed++
  }
  return summary
}

/** Push the FULL local state + queued tombstones (newer-wins + ownership-aware server-side). */
export async function pushAll(
  client: CloudClient,
  profiles: Profile[],
  groups: Group[],
  proxies: ProxyEntry[],
  deleted: DeleteQueue
): Promise<CloudPushResponse> {
  return await client.push({ profiles, groups, proxies, deleted })
}

/** Pack the vital session files of a stopped profile into a gzip tar buffer. */
export function packSessionState(profileDir: string): Buffer | null {
  if (!existsSync(profileDir)) return null
  const tmp = join(profileDir, '..', `.bb-session-${Date.now()}.tgz`)
  const args = ['-czf', tmp, '-C', profileDir, ...VITAL_FILES.filter((f) => existsSync(join(profileDir, f))), ...VITAL_DIRS.filter((d) => existsSync(join(profileDir, d)))]
  if (args.length <= 3) return null // nothing vital to pack
  try {
    execFileSync('/usr/bin/tar', args, { timeout: 120000, stdio: 'ignore' })
    if (!existsSync(tmp)) return null
    const buf = readFileSync(tmp)
    return buf
  } catch {
    return null
  } finally {
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* ignore */
    }
  }
}

/** Extract a cloud session archive into the profile dir (vital files only). */
export function restoreSessionState(profileDir: string, archive: Buffer): boolean {
  try {
    const tmp = join(profileDir, '..', `.bb-restore-${Date.now()}.tgz`)
    writeFileSync(tmp, archive)
    execFileSync('/usr/bin/tar', ['-xzf', tmp, '-C', profileDir], { timeout: 120000, stdio: 'ignore' })
    rmSync(tmp, { force: true })
    return true
  } catch {
    return false
  }
}

/**
 * Download the cloud archive only if ANOTHER device uploaded since our last
 * sync. Compares SERVER timestamps only (`lastSynced` = server updatedAt of the
 * last archive this machine uploaded or restored) — immune to clock skew
 * between machines. Without a marker (first sync on this machine) a cloud
 * archive is restored only when the local profile has no session yet.
 */
export async function maybeRestoreSession(
  client: CloudClient,
  profileId: string,
  profileDir: string,
  lastSynced: string | null
): Promise<{ restored: boolean; serverUpdatedAt: string | null }> {
  const none = { restored: false, serverUpdatedAt: null }
  try {
    const meta = await client.downloadSessionMeta(profileId)
    if (!meta) return none
    const cloudT = ms(meta.updatedAt)
    if (lastSynced) {
      if (cloudT <= ms(lastSynced)) return { restored: false, serverUpdatedAt: meta.updatedAt }
    } else if (existsSync(join(profileDir, 'sessionstore-backups'))) {
      return none // local session exists and was never synced: never overwrite it blindly
    }
    const data = await client.downloadSession(profileId)
    if (!data) return none
    mkdirSync(profileDir, { recursive: true })
    return { restored: restoreSessionState(profileDir, data), serverUpdatedAt: meta.updatedAt }
  } catch {
    return none
  }
}

/** Upload the packed session state of a stopped profile. */
export async function uploadSessionState(
  client: CloudClient,
  profileId: string,
  profileDir: string
): Promise<{ size: number; updatedAt?: string } | null> {
  const buf = packSessionState(profileDir)
  if (!buf) return null
  return client.uploadSession(profileId, buf)
}

/** List the vital-file footprint (used for the storage UI). */
export function vitalFilesPresent(profileDir: string): string[] {
  return VITAL_FILES.filter((f) => existsSync(join(profileDir, f)))
}

// silence unused-import lints for helpers used by callers
void readdirSync
