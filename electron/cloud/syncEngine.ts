import { execFileSync } from 'child_process'
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import type { Group, Profile, ProxyEntry } from '@shared/types'
import type { CloudClient } from './cloudClient'

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
  errors: string[]
}

/** Pull remote state and merge into the local store (newer updatedAt wins). */
export async function pullAndMerge(
  client: CloudClient,
  store: {
    list(): { id: string; updatedAt: string }[]
    get(id: string): Profile | null
    save(p: Profile): Profile
    listGroups(): Group[]
    upsertGroup(g: Group): void
    listProxies(): ProxyEntry[]
    saveProxy(p: ProxyEntry): void
  }
): Promise<SyncSummary> {
  const summary: SyncSummary = { pulled: { profiles: 0, groups: 0, proxies: 0 }, pushed: { profiles: 0, groups: 0, proxies: 0 }, merged: 0, errors: [] }
  const remote = await client.pull()

  for (const doc of remote.profiles ?? []) {
    summary.pulled.profiles++
    const local = store.get(doc.id)
    if (!local) {
      try {
        store.save(doc as Profile)
        summary.merged++
      } catch (e: any) {
        summary.errors.push(`profile ${doc.id}: ${e.message}`)
      }
    } else {
      const localT = new Date(local.updatedAt).getTime()
      const remoteT = new Date(doc.updatedAt ?? 0).getTime()
      if (remoteT > localT) {
        try {
          store.save({ ...doc, id: local.id } as Profile)
          summary.merged++
        } catch (e: any) {
          summary.errors.push(`profile ${doc.id}: ${e.message}`)
        }
      }
    }
  }

  for (const g of remote.groups ?? []) {
    summary.pulled.groups++
    const existing = store.listGroups().find((x) => x.id === g.id)
    try {
      store.upsertGroup({ id: g.id, name: g.name, pinned: !!g.pinned, color: g.color ?? '#8952ef', description: g.description ?? '', createdAt: g.createdAt ?? new Date().toISOString() })
      summary.merged++
    } catch (e: any) {
      summary.errors.push(`group ${g.id}: ${e.message}`)
    }
  }

  for (const x of remote.proxies ?? []) {
    summary.pulled.proxies++
    if (!store.listProxies().find((p) => p.id === x.id)) {
      try {
        store.saveProxy(x as ProxyEntry)
        summary.merged++
      } catch (e: any) {
        summary.errors.push(`proxy ${x.id}: ${e.message}`)
      }
    }
  }
  return summary
}

/** Push the FULL local state (ownership-aware upserts server-side). */
export async function pushAll(
  client: CloudClient,
  profiles: Profile[],
  groups: Group[],
  proxies: ProxyEntry[]
): Promise<{ profiles: number; groups: number; proxies: number }> {
  return (await client.push({ profiles, groups, proxies })) as { profiles: number; groups: number; proxies: number }
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

/** Download the cloud archive if it is newer than the local sessionstore. */
export async function maybeRestoreSession(
  client: CloudClient,
  profileId: string,
  profileDir: string
): Promise<boolean> {
  try {
    if (!existsSync(profileDir)) return false
    const localSessions = join(profileDir, 'sessionstore-backups')
    const localMtime = existsSync(localSessions) ? statSync(localSessions).mtimeMs : 0
    const meta = await client.downloadSessionMeta(profileId)
    if (!meta) return false
    const cloudT = new Date(meta.updatedAt).getTime()
    if (cloudT <= localMtime) return false // local session is at least as new
    const data = await client.downloadSession(profileId)
    if (!data) return false
    return restoreSessionState(profileDir, data)
  } catch {
    return false
  }
}

/** Upload the packed session state of a stopped profile. */
export async function uploadSessionState(
  client: CloudClient,
  profileId: string,
  profileDir: string
): Promise<{ size: number } | null> {
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
