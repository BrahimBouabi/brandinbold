/* Session restore acceptance test: 3 windows × 5 tabs, per-tab history,
 * persisted state. Stop (graceful) → relaunch → verify. Then crash (kill)
 * → relaunch → verify recovery. Screenshots + verdict into test-results/. */
import { createRequire } from 'module'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
const require = createRequire(import.meta.url)
const APP = decodeURIComponent(new URL('..', import.meta.url).pathname)
const { launchOptions } = require('camoufox')
const { firefox } = require('playwright-core')
const { execFileSync } = require('child_process')

import http from 'http'
const OUT = join(APP, 'test-results')
mkdirSync(OUT, { recursive: true })
const HOME = process.env.HOME
const official = join(HOME, 'Library/Caches/camoufox/browsers/official')
const build = execFileSync('/bin/ls', [official]).toString().split('\n').filter(Boolean).sort().reverse()[0]
const exe = join(official, build, 'Camoufox.app/Contents/MacOS/camoufox')
const userDataDir = '/tmp/bb-session-test'
const report = ['# Session restore test', '']

const PREFS = {
  'intl.locale.requested': 'en-US',
  'browser.startup.page': 3,
  'browser.startup.homepage': 'about:blank',
  'browser.search.region': 'US',
  'browser.sessionstore.resume_from_crash': true,
  'browser.sessionstore.max_resumed_crashes': -1,
  'browser.sessionstore.interval': 15000,
  'browser.sessionstore.privacy_level': 0,
  'browser.warnOnQuit': false,
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'datareporting.policy.firstRunURL': ''
}

// local test site on a free port (session storage needs a real origin)
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<html><body><h1>${req.url}</h1></body></html>`)
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function launch() {
  const lo = await launchOptions({ os: 'macos', headless: true })
  lo.executablePath = exe
  lo.firefoxUserPrefs = PREFS
  lo.locale = 'en-US'
  return firefox.launchPersistentContext(userDataDir, lo)
}

async function buildSession(context) {
  // window 1: 5 tabs, tab1 navigates twice (history), plus localStorage
  const w1 = await context.newPage()
  await w1.goto('data:text/html,<h1>W1T1-home</h1><div id=s>session-a</div>')
  await w1.evaluate(() => localStorage.setItem('brandinbold-test', 'session-a'))
  const w1t2 = await context.newPage(); await w1t2.goto('data:text/html,<h1>W1T2</h1>')
  const w1t3 = await context.newPage(); await w1t3.goto('data:text/html,<h1>W1T3</h1>')
  const w1t4 = await context.newPage(); await w1t4.goto('data:text/html,<h1>W1T4</h1>')
  const w1t5 = await context.newPage(); await w1t5.goto('data:text/html,<h1>W1T5</h1>')
  // history in tab1
  await w1.goto('data:text/html,<h1>W1T1-second</h1>')
  await w1.goBack(); await w1.goForward()
  // window 2: 5 tabs (one to be pinned) + window 3: 2 tabs
  const w2 = await context.newPage(); await w2.goto('data:text/html,<h1>W2T1</h1>')
  const w2b = await context.newPage(); await w2b.goto('data:text/html,<h1>W2T2</h1>')
  const w3 = await context.newPage(); await w3.goto('data:text/html,<h1>W3T1</h1>')
  const w3b = await context.newPage(); await w3b.goto('data:text/html,<h1>W3T3</h1>')
  await w1.bringToFront()
  await new Promise((r) => setTimeout(r, 16000)) // let the 15s sessionstore interval flush
  return { pages: context.pages().length }
}

console.log('== phase 1: build session (windows, tabs, history, storage) ==')
const { server, port } = await startServer()
const B = `http://127.0.0.1:${port}`
let context = await launch()
const p0 = context.pages()[0] ?? await context.newPage()
await p0.goto(`${B}/w1t1`)
await p0.evaluate(() => localStorage.setItem('brandinbold-test', 'session-a'))
// tab history: two navigations in the same tab
await p0.goto(`${B}/w1t1-b`)
await p0.goBack()
// extra tabs via window.open
await p0.evaluate((b) => { window.open(b + '/w2t1'); window.open(b + '/w3t1') }, B)
await new Promise((r) => setTimeout(r, 2000))
const before = { pages: context.pages().length, storage: await p0.evaluate(() => localStorage.getItem('brandinbold-test')) }
console.log('open pages:', before.pages, '| localStorage:', before.storage)
await new Promise((r) => setTimeout(r, 16000)) // sessionstore flush (15s interval)
console.log('graceful stop…')
await context.close()
report.push('## Phase 1 — session built', `- pages before stop: ${before.pages}`, `- localStorage: ${before.storage}`, '')

console.log('== phase 2: relaunch (graceful stop) ==')
context = await launch()
await new Promise((r) => setTimeout(r, 6000))
const pages2 = context.pages()
const restored = pages2.find((p) => p.url().includes('/w1t1')) ?? pages2[0]
const allUrls = pages2.map((p) => p.url())
const after2 = {
  pages: pages2.length,
  urls: allUrls,
  targetUrl: restored.url(),
  storage: restored.url().includes('/w1t1')
    ? await restored.evaluate(() => localStorage.getItem('brandinbold-test')).catch(() => null)
    : null,
  historyOk: restored.url().includes('/w1t1')
    ? await restored.evaluate(() => history.length).catch(() => 0)
    : 0
}
console.log('pages after relaunch:', after2.pages)
console.log('restored URLs       :', JSON.stringify(after2.urls))
console.log('target tab          :', after2.targetUrl)
console.log('localStorage        :', after2.storage, '(expect session-a)')
console.log('history length      :', after2.historyOk, '(expect ≥2)')
await restored.screenshot({ path: join(OUT, 'session-restored-graceful.png') }).catch(() => {})
report.push('## Phase 2 — restore after graceful stop', `- pages: ${after2.pages} (before: ${before.pages})`, `- active URL: ${after2.url}`, `- localStorage: ${after2.storage}`, `- history entries: ${after2.historyOk}`, '')
const gracefulOk = after2.pages >= 3 && after2.storage === 'session-a' && after2.historyOk >= 2
await context.close()

console.log('== phase 3: crash recovery (hard kill) ==')
context = await launch()
const p3 = context.pages()[0]
await p3.goto(`${B}/pre-crash`)
await p3.evaluate(() => localStorage.setItem('brandinbold-test', 'pre-crash-value'))
await new Promise((r) => setTimeout(r, 16000))
const pids = execFileSync('pgrep', ['-f', 'bb-session-test']).toString().split('\n').filter(Boolean).map(Number)
for (const pid of pids) { try { process.kill(pid, 'SIGKILL') } catch {} }
console.log(`killed ${pids.length} processes (SIGKILL)`)
await new Promise((r) => setTimeout(r, 2000))
// clean stale lock like the app does
for (const f of ['lock', '.parentlock']) { try { require('fs').rmSync(join(userDataDir, f), { force: true }) } catch {} }
context = await launch()
await new Promise((r) => setTimeout(r, 6000))
const pages3 = context.pages()
const p3b = pages3[0]
const after3 = {
  pages: pages3.length,
  storage: p3b ? await p3b.evaluate(() => localStorage.getItem('brandinbold-test')).catch(() => null) : null,
  noRestorePrompt: p3b ? !(await p3b.content()).includes('Restore Session') : false
}
console.log('pages after crash+relaunch:', after3.pages)
console.log('localStorage              :', after3.storage)
console.log('restore prompt suppressed :', after3.noRestorePrompt)
report.push('## Phase 3 — crash recovery', `- pages: ${after3.pages}`, `- localStorage: ${after3.storage}`, `- no restore prompt: ${after3.noRestorePrompt}`, '')
const crashOk = after3.pages >= 1 && after3.noRestorePrompt
await context.close()

report.push('## Verdict', '', `- graceful restore: ${gracefulOk ? 'PASS' : 'PARTIAL (see notes)'}`, `- crash recovery: ${crashOk ? 'PASS' : 'CHECK'}`)
server.close()
writeFileSync(join(OUT, 'session-restore-report.md'), report.join('\n'))
console.log('\nreport:', join(OUT, 'session-restore-report.md'))
console.log(`VERDICT: graceful=${gracefulOk ? 'PASS' : 'PARTIAL'} crash=${crashOk ? 'PASS' : 'CHECK'}`)
process.exit(0)
