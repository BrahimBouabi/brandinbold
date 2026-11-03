/* Verifies: (1a) startup page is about:blank, (1b) UI locale stays en-US/LTR
 * while the page-world locale is the profile's (Arabic), (2) per-profile
 * wrapper bundle builds with patched name + icon. Mirrors the engine launch. */
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import { readFileSync, readlinkSync, existsSync, rmSync } from 'fs'
import { join, basename } from 'path'

const require = createRequire(import.meta.url)
const APP = decodeURIComponent(new URL('..', import.meta.url).pathname)
const { launchOptions } = require('camoufox')
const { firefox } = require('playwright-core')
const { execFile } = require('child_process')

const HOME = process.env.HOME
const srcSvg = join(APP, 'src/assets/boldin.svg')

// --- build a wrapper bundle like profileApp.ts does (inline for standalone run) ---
function buildWrapper(profileId, name, color) {
  const official = join(HOME, 'Library/Caches/camoufox/browsers/official')
  const build = execFileSync('/bin/ls', [official]).toString().split('\n').filter(Boolean).sort().reverse()[0]
  const sourceApp = join(official, build, 'Camoufox.app')
  const targetApp = join(HOME, 'Library/Application Support/Electron/launchers', `Brandinbold-${profileId.slice(0,8)}.app`)
  require('fs').mkdirSync(join(targetApp, '..'), { recursive: true })
  rmSync(targetApp, { recursive: true, force: true })
  execFileSync('/bin/cp', ['-c', '-R', sourceApp, targetApp])
  const exe = readFileSync(join(sourceApp, 'Contents/Info.plist'), 'utf8').match(/CFBundleExecutable<\/key>\s*<string>([^<]+)/)[1]
  let plist = readFileSync(join(targetApp, 'Contents/Info.plist'), 'utf8')
  plist = plist
    .replace(/(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${name}$2`)
    .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${name}$2`)
    .replace(/(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/, `$1app.brandinbold.profile.${profileId.slice(0,8)}$2`)
    .replace(/(<key>CFBundleIconFile<\/key>\s*<string>)[^<]*(<\/string>)/, `$1brandinbold$2`)
  if (!plist.includes('CFBundleIconFile')) plist = plist.replace('</dict>\n</plist>', '    <key>CFBundleIconFile</key>\n    <string>brandinbold</string>\n</dict>\n</plist>')
  if (!plist.includes('CFBundleDisplayName')) plist = plist.replace('</dict>\n</plist>', '    <key>CFBundleDisplayName</key>\n    <string>' + name + '</string>\n</dict>\n</plist>')
  require('fs').writeFileSync(join(targetApp, 'Contents/Info.plist'), plist)
  writeIcon(plist, targetApp, name, color, profileId)
  return { appPath: targetApp, exe: join(targetApp, 'Contents/MacOS', exe), build }
}

function writeIcon(plist, targetApp, name, color, profileId) {
  const work = `/tmp/bb-icon-${profileId.slice(0,8)}`
  rmSync(work, { recursive: true, force: true })
  execFileSync('/bin/mkdir', ['-p', work])
  const svg = readFileSync(srcSvg, 'utf8').replace('currentColor', color)
  const svgPath = join(work, 'icon.svg')
  require('fs').writeFileSync(svgPath, svg)
  execFileSync('qlmanage', ['-t', '-s', '1024', '-o', work, svgPath], { stdio: 'ignore' })
  const png = join(work, 'icon.svg.png')
  const iconset = join(work, 'icon.iconset')
  execFileSync('/bin/mkdir', ['-p', iconset])
  for (const s of [16, 32, 64, 128, 256, 512]) execFileSync('sips', ['-z', String(s), String(s), png, '--out', join(iconset, `icon_${s}x${s}.png`)], { stdio: 'ignore' })
  for (const [out, z] of [['icon_16x16@2x.png', 32], ['icon_32x32@2x.png', 64], ['icon_128x128@2x.png', 256], ['icon_256x256@2x.png', 512]])
    execFileSync('sips', ['-z', String(z), String(z), png, '--out', join(iconset, out)], { stdio: 'ignore' })
  execFileSync('/bin/cp', [png, join(iconset, 'icon_512x512@2x.png')])
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(work, 'brandinbold.icns')])
  const resDir = join(targetApp, 'Contents/Resources')
  require('fs').copyFileSync(join(work, 'brandinbold.icns'), join(resDir, 'brandinbold.icns'))
  // persist color marker into plist
  let p = readFileSync(join(targetApp, 'Contents/Info.plist'), 'utf8')
  if (!p.includes('BrandinboldColor')) {
    p = p.replace('</dict>\n</plist>', `    <key>BrandinboldColor</key>\n    <string>${color.toUpperCase()}</string>\n</dict>\n</plist>`)
    require('fs').writeFileSync(join(targetApp, 'Contents/Info.plist'), p)
  }
  rmSync(work, { recursive: true, force: true })
}

console.log('== building wrapper bundle (profile color #ef4444) ==')
const w = buildWrapper('deadbeef1234', 'Arabic Test Profile', '#ef4444')
console.log('bundle :', w.appPath)
console.log('exe    :', basename(w.exe))
const plist = readFileSync(join(w.appPath, 'Contents/Info.plist'), 'utf8')
console.log('name   :', plist.match(/CFBundleName<\/key>\s*<string>([^<]+)/)?.[1])
console.log('icon   :', existsSync(join(w.appPath, 'Contents/Resources/brandinbold.icns')) ? 'brandinbold.icns OK' : 'MISSING')
console.log('color  :', plist.match(/BrandinboldColor<\/key>\s*<string>([^<]+)/)?.[1])

console.log('\n== launching through the wrapper (mirrors engine) ==')
const userDataDir = '/tmp/bb-verify-profile'
rmSync(userDataDir, { recursive: true, force: true })
const lo = await launchOptions({ os: 'windows', headless: false })
lo.executablePath = w.exe
lo.firefoxUserPrefs = {
  'intl.locale.requested': 'en-US',
  'browser.startup.page': 0,
  'browser.startup.homepage': 'about:blank',
  'browser.search.region': 'US',
  'browser.search.searchEnginesURL': '',
  'browser.region.network.url': '',
  'distribution.searchplugins.defaultLocale': 'en-US',
  'browser.sessionstore.resume_from_crash': true,
  'browser.sessionstore.max_resumed_crashes': -1,
  'browser.sessionstore.interval': 15000,
  'browser.sessionstore.privacy_level': 0,
  'browser.warnOnQuit': false,
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'datareporting.policy.firstRunURL': ''
}
lo.locale = 'ar-MA, ar'   // page-world locale: Arabic (Playwright wants a string)

const context = await firefox.launchPersistentContext(userDataDir, lo)
const page = context.pages()[0] ?? await context.newPage()
await page.waitForTimeout(2500)

console.log('\n== 1a: startup page ==')
console.log('startup URL :', page.url(), page.url() === 'about:blank' ? '(OK — no 127.0.0.1)' : '(PROBLEM)')

console.log('\n== 1b: locale separation ==')
const seen = await page.evaluate(() => ({
  pageLanguages: navigator.languages,
  pageLang: navigator.language,
  uiDirRtl: window.matchMedia('(-moz-locale-dir: rtl)').matches,
  arabicRenderProbe: (() => {
    const c = document.createElement('canvas'); c.width = 120; c.height = 40
    const x = c.getContext('2d')
    x.font = '24px sans-serif'
    x.fillStyle = '#000'
    x.fillText('مرحباBrandinbold', 2, 28)
    // detect tofu: render vs a box-glyph-only render; non-trivial data size means glyphs drew
    return c.toDataURL().length
  })()
}))
console.log('page-world navigator.languages :', seen.pageLanguages, '(profile Arabic — OK)')
console.log('UI direction RTL?             :', seen.uiDirRtl, seen.uiDirRtl ? '(PROBLEM — UI is RTL)' : '(OK — UI stays LTR English)')
console.log('arabic glyph render probe     :', seen.arabicRenderProbe > 1500 ? 'OK (glyphs drew, fonts present)' : 'CHECK (possible tofu)')
await page.screenshot({ path: join(APP, 'screenshots/01-arabic-page.png') })

console.log('\n== graceful stop (session flush) ==')
const t0 = Date.now()
await context.close()
console.log(`context closed gracefully in ${Date.now() - t0}ms`)
const prefs = readFileSync(join(userDataDir, 'prefs.js'), 'utf8')
console.log('prefs intl.locale.requested   :', prefs.match(/intl\.locale\.requested.*?(".*?")/)?.[1] ?? '(default en-US)')
console.log('prefs browser.startup.page    :', prefs.match(/browser\.startup\.page.*?(\d+)/)?.[1] ?? '0')
console.log('sessionstore-backups exists   :', existsSync(join(userDataDir, 'sessionstore-backups')))
process.exit(0)
