import { app } from 'electron'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync
} from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

/** Offline "Fat DMG" payload: <app>.app/Contents/Resources/engine-bundle/ */
export function bundledEngineDir(): string | null {
  const res = process.resourcesPath
  if (!res) return null
  const p = join(res, 'engine-bundle')
  return existsSync(join(p, 'browsers')) ? p : null
}

/**
 * TASK 9 Étape 1.1 — Engine storage hardening.
 *
 * The npm `camoufox` package hardcodes its install directory at module init:
 *   paths.js → INSTALL_DIR = userCacheDir("camoufox")
 *   → macOS: ~/Library/Caches/camoufox   (NO env override on macOS)
 *   → fpgen/model.js → modelDir() = INSTALL_DIR + "/fpgen"  (the 203 MB model)
 * Verified: no env var relocates it on macOS (XDG_CACHE_HOME is Linux-only),
 * and INSTALL_DIR/ADDONS_DIR are import-time constants — monkey-patching
 * utilsDeps cannot cover them. Verified 100%-working method: keep the
 * hardcoded path as a SYMLINK to the safe location, so cache cleaners can
 * only ever delete the link (self-healed at every startup), never the data.
 *
 * Safe location: ~/Library/Application Support/Brandinbold/engine/
 * (userData + /engine). Migration is an instant same-volume rename.
 */

export function engineHomeDir(): string {
  return join(app.getPath('userData'), 'engine')
}

/** Replicates camoufox paths.js userCacheDir("camoufox") per OS. */
function legacyCamoufoxDir(): string {
  switch (process.platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Caches', 'camoufox')
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA
      const base =
        localAppData && require('path').isAbsolute(localAppData)
          ? localAppData
          : join(homedir(), 'AppData', 'Local')
      return join(base, 'camoufox', 'camoufox', 'Cache')
    }
    default: {
      const xdg = (process.env.XDG_CACHE_HOME ?? '').trim()
      return join(xdg ? xdg : join(homedir(), '.cache'), 'camoufox')
    }
  }
}

export interface EngineHomeResult {
  migrated: boolean // legacy dir moved into engine dir
  repaired: boolean // symlink (re)created
  alreadyOk: boolean
  error?: string
}

function isRealDir(p: string): boolean {
  try {
    return statSync(p).isDirectory() && !lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

function moveDir(src: string, dest: string): void {
  try {
    renameSync(src, dest) // instant on same volume
  } catch {
    // cross-device fallback: deep copy, verify, then remove
    execFileSync('/bin/cp', ['-R', src + '/', dest + '/'], { timeout: 600000, stdio: 'ignore' })
    const srcCount = readdirSync(src).length
    const dstCount = readdirSync(dest).length
    if (dstCount < srcCount) throw new Error(`Migration verification failed (${srcCount} → ${dstCount})`)
    rmSync(src, { recursive: true, force: true })
  }
}

/**
 * Offline "Fat DMG" support: when the packaged app ships a bundled engine and
 * the engine home is missing parts, clone them from
 * <Resources>/engine-bundle/ (APFS clonefile — instant, zero network).
 */
export function ensureBundledEngine(engine: string): boolean {
  try {
    const bundled = bundledEngineDir()
    if (!bundled) return false
    let cloned = false
    for (const part of ['browsers', 'fpgen', 'geoip', 'addons', 'config.json', 'repo_cache.json']) {
      const from = join(bundled, part)
      const to = join(engine, part)
      if (existsSync(to)) continue
      try {
        execFileSync('/bin/cp', ['-c', '-R', from, to], { timeout: 600000, stdio: 'ignore' })
      } catch {
        execFileSync('/bin/cp', ['-R', from, to], { timeout: 900000, stdio: 'ignore' })
      }
      cloned = true
    }
    return cloned
  } catch {
    return false
  }
}

/** Idempotent, error-safe. Call once at app startup, before any camoufox use. */
export function setupEngineHome(): EngineHomeResult {
  const res: EngineHomeResult = { migrated: false, repaired: false, alreadyOk: false }
  try {
    const engine = engineHomeDir()
    const legacy = legacyCamoufoxDir()
    mkdirSync(engine, { recursive: true })
    ensureBundledEngine(engine)

    const legacyStat = existsSync(legacy) ? lstatSync(legacy) : null

    if (legacyStat?.isSymbolicLink()) {
      // Normal post-migration state. Verify the target; self-heal if stale.
      let target = ''
      try {
        target = readlinkSync(legacy)
      } catch {
        /* unreadable link — recreate */
      }
      const resolved = target.startsWith('.') ? join(legacy, '..', target) : target
      if (resolved === engine && existsSync(join(engine, 'browsers'))) {
        res.alreadyOk = true
        return res
      }
      rmSync(legacy, { force: true })
      symlinkSync(engine, legacy, 'dir')
      res.repaired = true
      return res
    }

    if (legacyStat === null) {
      // Cache cleaner deleted the symlink (or first run on this machine).
      symlinkSync(engine, legacy, 'dir')
      res.repaired = true
      return res
    }

    if (legacyStat.isDirectory()) {
      const enginePopulated = existsSync(engine) && readdirSync(engine).length > 0
      const legacyPopulated = readdirSync(legacy).length > 0

      if (!enginePopulated && legacyPopulated) {
        // First migration: move the whole 2.7 GB (instant same-volume rename).
        moveDir(legacy, engine)
      } else if (legacyPopulated && enginePopulated) {
        // Both exist (cleaner re-created a partial legacy dir): never delete
        // user data — archive the stray dir beside itself, then link over it.
        const stray = legacy + '.old-' + Date.now()
        renameSync(legacy, stray)
        res.repaired = true
      } else {
        // Legacy exists but empty → replace with the link.
        rmSync(legacy, { recursive: true, force: true })
      }
      symlinkSync(engine, legacy, 'dir')
      res.migrated = true
      return res
    }

    // Legacy exists but is a FILE (unexpected) — archive it and link.
    renameSync(legacy, legacy + '.old-' + Date.now())
    symlinkSync(engine, legacy, 'dir')
    res.repaired = true
    return res
  } catch (e: any) {
    res.error = e?.message ?? String(e)
    return res
  }
}
