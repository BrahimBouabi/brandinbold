import { readdirSync, rmSync, statSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * TASK 9 Étape 1.2 — transient cache purge for profile folders.
 *
 * WHITELIST APPROACH: only the exact transient-cache directory names below are
 * ever removed, at the profile root. Everything else (cookies.sqlite,
 * places.sqlite, sessionstore*, webappsstore.sqlite, storage/, prefs.js,
 * extensions/, key4.db, logins.json, formhistory.sqlite, sessionstore-backups/)
 * is never touched, so sessions, logins, history and localStorage always
 * survive a purge.
 */

export const FIREFOX_TRANSIENT_DIRS = [
  'cache2', // network disk cache (the big one)
  'startupCache',
  'thumbnails',
  'shader-cache',
  'jumpListCache',
  'minidumps' // crash dumps
]

export const CHROMIUM_TRANSIENT_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'DawnCache',
  'Crash Reports',
  'component_crx_cache'
]

export function dirSizeBytes(p: string): number {
  let total = 0
  try {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name)
      try {
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) total += dirSizeBytes(full)
        else total += statSync(full).size
      } catch {
        /* vanished mid-walk */
      }
    }
  } catch {
    /* unreadable */
  }
  return total
}

export interface PurgeResult {
  freedBytes: number
  removed: string[]
}

/** Remove only the known transient-cache dirs of `profileDir`. */
export function purgeTransientCaches(
  profileDir: string,
  engine: 'firefox' | 'chromium'
): PurgeResult {
  const res: PurgeResult = { freedBytes: 0, removed: [] }
  if (!existsSync(profileDir)) return res
  const list = engine === 'chromium' ? CHROMIUM_TRANSIENT_DIRS : FIREFOX_TRANSIENT_DIRS
  for (const name of list) {
    const full = join(profileDir, name)
    if (!existsSync(full)) continue
    try {
      const size = dirSizeBytes(full)
      rmSync(full, { recursive: true, force: true })
      res.freedBytes += size
      res.removed.push(name)
    } catch {
      /* in use or vanished — skip */
    }
  }
  return res
}

export interface ProfileDiskInfo {
  totalBytes: number
  cacheBytes: number
}

/** Total size of a profile folder + how much of it is transient cache. */
export function getProfileDiskInfo(
  profileDir: string,
  engine: 'firefox' | 'chromium'
): ProfileDiskInfo {
  const list = engine === 'chromium' ? CHROMIUM_TRANSIENT_DIRS : FIREFOX_TRANSIENT_DIRS
  let cacheBytes = 0
  for (const name of list) {
    const full = join(profileDir, name)
    if (existsSync(full)) cacheBytes += dirSizeBytes(full)
  }
  return { totalBytes: dirSizeBytes(profileDir), cacheBytes }
}
