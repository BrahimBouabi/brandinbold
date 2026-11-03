/* Fingerprint acceptance test: opens a Rea profile's pinned fingerprint in
 * Camoufox and checks it against CreepJS, BrowserScan and Pixelscan.
 * Writes screenshots + a markdown report to test-results/.
 *
 * Usage: npm run test:fingerprint [-- <profileId>]
 * Without an id it uses the most recently updated profile from the app DB.
 */
import { createRequire } from 'module'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const require = createRequire(import.meta.url)
const { Camoufox } = require('camoufox')
const Database = require('better-sqlite3')

const APP = decodeURIComponent(new URL('..', import.meta.url).pathname)
const OUT = join(APP, 'test-results')
mkdirSync(OUT, { recursive: true })

// locate the app DB (packaged name "Rea" or dev "Electron")
const candidates = [
  join(homedir(), 'Library/Application Support/Rea/rea.db'),
  join(homedir(), 'Library/Application Support/Electron/rea.db')
]
const dbPath = candidates.find((p) => existsSync(p))
if (!dbPath) {
  console.error('No app database found. Launch Rea once first.')
  process.exit(1)
}
const profileId = process.argv[2]
let db = null
let profile = null
const loadProfile = (row) => (row ? JSON.parse(row.json) : null)
for (const p of candidates) {
  if (!existsSync(p)) continue
  const d = new Database(p, { readonly: false })
  const cols = d.prepare('PRAGMA table_info(profiles)').all().map((c) => c.name)
  if (!cols.includes('deleted_at')) d.exec('ALTER TABLE profiles ADD COLUMN deleted_at TEXT')
  const row = profileId
    ? d.prepare('SELECT json FROM profiles WHERE id = ?').get(profileId)
    : d
        .prepare(
          "SELECT json FROM profiles WHERE deleted_at IS NULL AND json_extract(json, '$.fingerprint.fpgen') IS NOT NULL ORDER BY updated_at DESC LIMIT 1"
        )
        .get()
  const parsed = loadProfile(row)
  if (parsed?.fingerprint?.fpgen) {
    db = d
    profile = parsed
    break
  }
  d.close()
}

if (!profile?.fingerprint?.fpgen) {
  console.error('No profile with a pinned fingerprint found. Launch a profile in Rea once first.')
  process.exit(1)
}

console.log(`Testing profile "${profile.name}" (${profile.id.slice(0, 8)})`)
console.log(`Pinned UA: ${profile.fingerprint.fpgen?.navigator?.userAgent ?? '(from fpgen)'}`)

const proxy = profile.proxyId
  ? null // resolved below from proxies table
  : profile.proxy
let proxyOptions
if (proxy && proxy.type !== 'none' && proxy.host) {
  const auth = proxy.username ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@` : ''
  proxyOptions = { server: `${proxy.type === 'socks5' ? 'socks5' : 'http'}://${auth}${proxy.host}:${proxy.port}` }
}

const TARGETS = [
  { name: 'creepjs', url: 'https://abrahamjuliot.github.io/creepjs/' },
  { name: 'browserscan', url: 'https://www.browserscan.net/' },
  { name: 'pixelscan', url: 'https://pixelscan.net/' }
]

const context = await Camoufox({
  headless: true,
  os: profile.os ?? 'windows',
  fingerprint: profile.fingerprint.fpgen,
  canvas_noise: true,
  ...(proxyOptions ? { proxy: proxyOptions, geoip: true } : {})
})

const report = [`# Fingerprint test — ${profile.name}`, '', `- Profile: \`${profile.id}\``, `- Engine: Camoufox (native)`, `- Proxy: ${proxyOptions ? proxyOptions.server : 'none (geoip from local IP)'}`, `- Pinned UA: ${profile.fingerprint.fpgen?.navigator?.userAgent ?? ''}`, '']

const page = await context.newPage()
for (const t of TARGETS) {
  console.log(`\n== ${t.name} ==`)
  try {
    await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(12000) // let detection scripts finish
    const shot = join(OUT, `${t.name}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    const text = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '')
    writeFileSync(join(OUT, `${t.name}.txt`), text)
    // pull the interesting lines out of the page text
    const interesting = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) =>
        /(trust|score|lie|bot|detect|unique|fingerprint|consistent|spoo|block|pass|warning|android|windows|mac|linux|firefox|chrome|headless)/i.test(l) &&
        l.length < 120
      )
      .slice(0, 25)
    report.push(`## ${t.name}`, '', `Screenshot: \`${t.name}.png\``, '```', ...interesting, '```', '')
    console.log(interesting.join('\n') || '(no matching lines — see screenshot)')
  } catch (e) {
    report.push(`## ${t.name}`, '', `FAILED: ${e.message}`, '')
    console.log('FAILED:', e.message)
  }
}

// live values the page world sees
await page.goto('data:text/html,<t></t>')
const live = await page.evaluate(() => ({
  ua: navigator.userAgent,
  platform: navigator.platform,
  cores: navigator.hardwareConcurrency,
  languages: navigator.languages,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  screen: `${screen.width}x${screen.height}`
}))
report.push('## Live values seen by pages', '', '```json', JSON.stringify(live, null, 2), '```')
console.log('\nlive values:', JSON.stringify(live, null, 2))

writeFileSync(join(OUT, 'report.md'), report.join('\n'))
console.log(`\nreport: ${join(OUT, 'report.md')}`)
await context.close()
process.exit(0)
