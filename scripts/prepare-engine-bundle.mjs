/**
 * TASK 9 Étape 1.3 — prepares `build/engine-bundle/` for the offline
 * "Fat DMG": clones the CURRENT camoufox engine install (browser, fpgen
 * model, geoip, addons, config) from the safe engine home
 * (~/Library/Application Support/Brandinbold/engine) using APFS clonefile
 * (`cp -c`, instant, no real disk cost on the same volume).
 *
 * Run before `npm run package:offline`:
 *   node scripts/prepare-engine-bundle.mjs
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname)
const DEST = join(ROOT, 'build', 'engine-bundle')

// resolve the engine home through the symlink (or directly)
const candidates = [
  join(ROOT, 'build', 'engine-bundle'),
  join(homedir(), 'Library/Application Support/Brandinbold/engine'),
  join(homedir(), 'Library/Caches/camoufox') // legacy fallback (symlink or dir)
]
let src = null
for (const c of candidates) {
  if (c === DEST) continue
  try {
    if (existsSync(c) && statSync(c).isDirectory() && existsSync(join(c, 'browsers'))) {
      src = c
      break
    }
  } catch {
    /* next */
  }
}
if (!src) {
  console.error('No camoufox engine install found (looked for a "browsers" dir in: ' + candidates.join(', ') + ')')
  process.exit(1)
}

const PARTS = ['browsers', 'fpgen', 'geoip', 'addons', 'config.json', 'repo_cache.json', '.0.5_FLAG']
const flagPath = join(src, '.0.5_FLAG')
if (!existsSync(flagPath)) writeFileSync(flagPath, '')
rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })

function clone(from, to) {
  try {
    execFileSync('/bin/cp', ['-c', '-R', from, to], { timeout: 600000, stdio: 'ignore' })
  } catch {
    execFileSync('/bin/cp', ['-R', from, to], { timeout: 900000, stdio: 'ignore' })
  }
}

let total = 0
for (const part of PARTS) {
  const from = join(src, part)
  if (!existsSync(from)) continue
  const to = join(DEST, part)
  clone(from, to)
  if (part === 'geoip' && existsSync(to)) {
    for (const f of readdirSync(to)) {
      if (f.startsWith('.download-')) {
        rmSync(join(to, f), { recursive: true, force: true })
      }
    }
  }
  let size = 0
  try {
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = join(d, e.name)
        if (e.isDirectory()) walk(f)
        else size += statSync(f).size
      }
    }
    walk(to)
  } catch {
    /* ignore */
  }
  total += size
  console.log(`bundled ${part}: ${(size / 1024 / 1024).toFixed(0)} MB`)
}
console.log(`engine bundle ready: ${DEST} (${(total / 1024 / 1024 / 1024).toFixed(2)} GB raw, APFS-cloned)`)
