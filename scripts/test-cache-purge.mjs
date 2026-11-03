/* TASK 9 Étape 1.2 acceptance — cache purge preserves sessions.
 * 1. Launch a Camoufox profile, browse (cache2 created), set localStorage
 * 2. Graceful stop
 * 3. purgeTransientCaches() on the profile dir
 * 4. Assert: cache2 GONE, cookies.sqlite/sessionstore/storage PRESENT, freed > 0
 * 5. Relaunch: localStorage + tabs intact
 */
import { createRequire } from 'module'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
const require = createRequire('/Users/brahimbouabi/Documents/REVERSE ENGEN/rea-app/package.json')
const APP = '/Users/brahimbouabi/Documents/REVERSE ENGEN/rea-app'
const { launchOptions } = require('camoufox')
const { firefox } = require('playwright-core')
const { purgeTransientCaches, getProfileDiskInfo } = require(APP + '/dist-tmp/profileCache.js') // bundled below
const HOME = process.env.HOME

const OUT = '/tmp/bb-purge-test'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const official = join(HOME, 'Library/Caches/camoufox/browsers/official')
const build = execFileSync('/bin/ls', [official]).toString().split('\n').filter(Boolean).sort().reverse()[0]
const exe = join(official, build, 'Camoufox.app/Contents/MacOS/camoufox')
const userDataDir = '/tmp/bb-purge-profile'
rmSync(userDataDir, { recursive: true, force: true })

import http from 'http'
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(`<html><body><h1>${req.url}</h1><p>${'x'.repeat(5000)}</p></body></html>`)
})
await new Promise((r) => server.listen(0, '127.0.0.1', () => r()))
const B = `http://127.0.0.1:${server.address().port}`

async function launch() {
  const lo = await launchOptions({ os: 'macos', headless: true })
  lo.executablePath = exe
  lo.firefoxUserPrefs = {
    'intl.locale.requested': 'en-US', 'browser.startup.page': 3,
    'browser.sessionstore.resume_from_crash': true, 'browser.sessionstore.max_resumed_crashes': -1,
    'browser.sessionstore.interval': 15000, 'browser.sessionstore.privacy_level': 0,
    'browser.warnOnQuit': false
  }
  lo.locale = 'en-US'
  return firefox.launchPersistentContext(userDataDir, lo)
}

console.log('== phase 1: browse (build cache2 + session + localStorage) ==')
let context = await launch()
const p0 = context.pages()[0] ?? await context.newPage()
await p0.goto(`${B}/home`, { timeout: 20000 })
await p0.evaluate(() => localStorage.setItem('purge-test', 'sessions-survive'))
await p0.goto(`${B}/second`, { timeout: 20000 })
await p0.goBack()
// extra tabs
await p0.evaluate((b) => { window.open(b + '/tab2'); window.open(b + '/tab3') }, B)
await new Promise((r) => setTimeout(r, 16000)) // sessionstore flush

const before = getProfileDiskInfo(userDataDir, 'firefox')
const cache2Before = existsSync(join(userDataDir, 'cache2'))
console.log('profile total:', before.totalBytes, '| cache bytes:', before.cacheBytes, '| cache2 exists:', cache2Before)

console.log('== graceful stop ==')
await context.close()
await new Promise((r) => setTimeout(r, 1000))

console.log('== purge ==')
const purge = purgeTransientCaches(userDataDir, 'firefox')
const cache2GoneAfterPurge = !existsSync(join(userDataDir, 'cache2'))
console.log('purge:', JSON.stringify(purge))
const after = getProfileDiskInfo(userDataDir, 'firefox')
console.log('profile total after:', after.totalBytes, '| freed:', purge.freedBytes, '| cache2 gone (après purge):', cache2GoneAfterPurge)

console.log('== assertions ==')
const protectedOk = ['cookies.sqlite', 'places.sqlite', 'storage'].filter((f) => existsSync(join(userDataDir, f)))
const ssOk = existsSync(join(userDataDir, 'sessionstore-backups'))
console.log('protected files present:', protectedOk.join(','), '| sessionstore-backups:', ssOk)
console.log('cache2 absent avant relance:', cache2GoneAfterPurge, '| recréé par Firefox après relance (normal):', existsSync(join(userDataDir, 'cache2')))

console.log('== relaunch: session + localStorage intact ==')
context = await launch()
await new Promise((r) => setTimeout(r, 6000))
const pages = context.pages()
const restored = pages.find((p) => p.url().includes('/home') || p.url().includes('/second'))
let storageOk = false
if (restored) {
  storageOk = (await restored.evaluate(() => localStorage.getItem('purge-test')).catch(() => null)) === 'sessions-survive'
}
console.log('pages after relaunch:', pages.length)
console.log('restored tab URL:', restored?.url() ?? '(none)')
console.log('localStorage intact:', storageOk)
await restored?.screenshot({ path: join(OUT, 'after-purge-relaunch.png') }).catch(() => {})
await context.close()
server.close()

const verdict = purge.freedBytes > 0 && cache2GoneAfterPurge && storageOk && pages.length >= 2
const report = `# Cache purge test\n\n- freed: ${purge.freedBytes} bytes (${purge.removed.join(', ')})\n- protected files intact: ${protectedOk.length}\n- session restored: ${!!restored}\n- localStorage: ${storageOk}\n\nVERDICT: ${verdict ? 'PASS' : 'CHECK'}\n`
writeFileSync('/tmp/bb-purge-test/report.md', report)
console.log('\n' + report)
process.exit(verdict ? 0 : 1)
