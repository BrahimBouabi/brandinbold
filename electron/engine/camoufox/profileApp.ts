import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, basename } from 'path'
import { app } from 'electron'
import { randomBytes } from 'crypto'
import { engineHomeDir } from './engineHome'
import { patchWindowTitle } from './badgeExtension'
import logoSvgRaw from '../../../src/assets/boldin.svg?raw'

/**
 * Per-profile macOS app bundles: an APFS clone (copy-on-write, near-free) of
 * the Camoufox.app with a patched Info.plist (profile name, unique bundle id)
 * and a recolored Brandinbold icon. Launching the cloned binary makes macOS
 * show the profile's name + colored logo in the Dock and app switcher.
 *
 * Limitations (documented):
 * - Window titles keep the engine's own suffix; the profile shows in the
 *   Dock, menu bar app name and task switcher.
 * - Windows: needs a launcher .exe (not implemented yet); Linux: a .desktop
 *   launcher per profile achieves the same and is implemented no-op-safe.
 */

let cachedSourceApp: string | null = null

export function findCamoufoxApp(): string | null {
  if (cachedSourceApp && existsSync(cachedSourceApp)) return cachedSourceApp
  try {
    const candidates = [
      join(engineHomeDir(), 'browsers'),
      join(homedir(), 'Library', 'Caches', 'camoufox', 'browsers')
    ]
    for (const base of candidates) {
      if (!existsSync(base)) continue
      // browsers/official/<build>/Camoufox.app — newest build wins
      const official = join(base, 'official')
      if (!existsSync(official)) continue
      const builds = readdirSync(official).sort().reverse()
      for (const b of builds) {
        const appPath = join(official, b, 'Camoufox.app')
        if (existsSync(appPath)) {
          cachedSourceApp = appPath
          return appPath
        }
      }
    }
  } catch {
    /* fallthrough */
  }
  return null
}

export interface ProfileBundle {
  appPath: string
  executablePath: string
}

/** Build (or reuse) the per-profile wrapper bundle. Synchronous + fast (APFS clone). */
export function buildProfileBundle(
  profileId: string,
  profileName: string,
  colorHex: string,
  showNameInBrowser = true
): ProfileBundle | null {
  if (process.platform !== 'darwin') return null
  const sourceApp = findCamoufoxApp()
  if (!sourceApp) return null

  const launchersDir = join(app.getPath('userData'), 'launchers')
  mkdirSync(launchersDir, { recursive: true })
  const targetApp = join(launchersDir, `Brandinbold-${profileId.slice(0, 8)}.app`)
  const exeName = basename(executableOf(sourceApp))
  const targetExe = join(targetApp, 'Contents', 'MacOS', exeName)
  const targetPlist = join(targetApp, 'Contents', 'Info.plist')
  const targetIcns = join(targetApp, 'Contents', 'Resources', 'brandinbold.icns')

  const sourceVersion = versionMarkerOf(sourceApp)
  const versionMarker = join(targetApp, '.brandinbold-build')
  const safeName = profileName.replace(/[<>&]/g, '')
  const needsRebuild =
    !existsSync(targetExe) ||
    !existsSync(targetIcns) ||
    !existsSync(versionMarker) ||
    readFileSync(versionMarker, 'utf8') !== `${sourceVersion}:${safeName}:${showNameInBrowser ? 1 : 0}` ||
    readFileSync(targetPlist, 'utf8').indexOf(colorHex.toUpperCase()) === -1

  let modified = false
  if (needsRebuild) {
    rmSync(targetApp, { recursive: true, force: true })
    // APFS clonefile: instant, no real disk usage. Fallback to deep copy.
    try {
      execFileSync('/bin/cp', ['-c', '-R', sourceApp, targetApp], { timeout: 120000 })
    } catch {
      execFileSync('/bin/cp', ['-R', sourceApp, targetApp], { timeout: 300000 })
    }
    patchInfoPlist(targetPlist, profileName, profileId, exeName, colorHex)
    if (showNameInBrowser) {
      patchWindowTitle(targetApp, profileName)
    }
    writeFileSync(versionMarker, `${sourceVersion}:${safeName}:${showNameInBrowser ? 1 : 0}`)
    modified = true
  }
  // icon: regenerate whenever color changes
  if (!existsSync(targetIcns) || plistHasColor(targetPlist, colorHex) === false) {
    const icns = renderIcns(colorHex)
    if (icns) {
      writeFileSync(targetIcns, icns)
      patchInfoPlist(targetPlist, profileName, profileId, exeName, colorHex)
      modified = true
    }
  }
  if (modified) {
    // Strip any sealed bundle signature that was invalidated by patching
    // Info.plist / omni.ja / brandinbold.icns, clear quarantine, and ad-hoc
    // sign the main executable (takes ~30 ms).
    rmSync(join(targetApp, 'Contents', '_CodeSignature'), { recursive: true, force: true })
    try {
      execFileSync('/usr/bin/xattr', ['-cr', targetApp], { timeout: 30000, stdio: 'ignore' })
    } catch {
      /* ignore */
    }
    try {
      execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', targetExe], { timeout: 30000, stdio: 'ignore' })
    } catch {
      /* ignore */
    }
  }

  return { appPath: targetApp, executablePath: targetExe }
}

function executableOf(appPath: string): string {
  const plist = readFileSync(join(appPath, 'Contents', 'Info.plist'), 'utf8')
  const m = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)
  return join(appPath, 'Contents', 'MacOS', m?.[1] ?? 'camoufox')
}

function versionMarkerOf(appPath: string): string {
  try {
    return readFileSync(join(appPath, '..', 'version.json'), 'utf8')
  } catch {
    return randomBytes(4).toString('hex')
  }
}

function patchInfoPlist(plistPath: string, name: string, profileId: string, exeName: string, colorHex?: string): void {
  let plist = readFileSync(plistPath, 'utf8')
  const safeName = name.replace(/[<>&]/g, '')
  plist = plist
    .replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleName</key>\n    <string>${safeName}</string>`)
    .replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleDisplayName</key>\n    <string>${safeName}</string>`)
    .replace(
      /<key>CFBundleIdentifier<\/key>\s*<string>[^<]*<\/string>/,
      `<key>CFBundleIdentifier</key>\n    <string>app.brandinbold.profile.${profileId.slice(0, 8)}</string>`
    )
    .replace(/<key>CFBundleIconFile<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleIconFile</key>\n    <string>brandinbold</string>`)
  if (!plist.includes('CFBundleIconFile')) {
    plist = plist.replace('</dict>\n</plist>', `    <key>CFBundleIconFile</key>\n    <string>brandinbold</string>\n</dict>\n</plist>`)
  }
  if (colorHex && !plist.includes(colorHex.toUpperCase())) {
    plist = plist.replace('</dict>\n</plist>', `    <key>BrandinboldColor</key>\n    <string>${colorHex.toUpperCase()}</string>\n</dict>\n</plist>`)
  }
  writeFileSync(plistPath, plist)
}

function plistHasColor(plistPath: string, colorHex: string): boolean {
  try {
    return readFileSync(plistPath, 'utf8').includes(colorHex.toUpperCase())
  } catch {
    return false
  }
}

/**
 * Enterprise-policy extension install: force-installs the profile's badge
 * .xpi through distribution/policies.json inside the cloned bundle.
 * This is the supported Firefox channel for managed extension installs.
 */
export function writeExtensionPolicy(bundleApp: string, xpiPath: string): boolean {
  try {
    const distDir = join(bundleApp, 'Contents', 'Resources', 'distribution')
    mkdirSync(distDir, { recursive: true })
    writeFileSync(
      join(distDir, 'policies.json'),
      JSON.stringify({ Extensions: { Install: [xpiPath], UninstallAllowed: false } }, null, 2)
    )
    return true
  } catch {
    return false
  }
}

/** Render the Brandinbold logo in the given color to .icns bytes. */
function renderIcns(colorHex: string): Buffer | null {
  try {
    const work = `/tmp/brandinbold-icon-${colorHex.replace('#', '')}`
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })
    const svgPath = join(work, 'icon.svg')
    writeFileSync(svgPath, logoSvgRaw.replace('currentColor', colorHex))
    execFileSync('qlmanage', ['-t', '-s', '1024', '-o', work, svgPath], { timeout: 60000 })
    const png1024 = join(work, 'icon.svg.png')
    if (!existsSync(png1024)) return null
    const iconset = join(work, 'icon.iconset')
    mkdirSync(iconset, { recursive: true })
    for (const s of [16, 32, 64, 128, 256, 512]) {
      execFileSync('sips', ['-z', String(s), String(s), png1024, '--out', join(iconset, `icon_${s}x${s}.png`)], { stdio: 'ignore' })
    }
    execFileSync('sips', ['-z', '32', '32', png1024, '--out', join(iconset, 'icon_16x16@2x.png')], { stdio: 'ignore' })
    execFileSync('sips', ['-z', '64', '64', png1024, '--out', join(iconset, 'icon_32x32@2x.png')], { stdio: 'ignore' })
    execFileSync('sips', ['-z', '256', '256', png1024, '--out', join(iconset, 'icon_128x128@2x.png')], { stdio: 'ignore' })
    execFileSync('sips', ['-z', '512', '512', png1024, '--out', join(iconset, 'icon_256x256@2x.png')], { stdio: 'ignore' })
    execFileSync('cp', [png1024, join(iconset, 'icon_512x512@2x.png')])
    const icns = join(work, 'brandinbold.icns')
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { timeout: 60000 })
    const out = readFileSync(icns)
    rmSync(work, { recursive: true, force: true })
    return out
  } catch {
    return null
  }
}
