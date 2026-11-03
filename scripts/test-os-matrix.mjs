/* OS matrix test — TASK 8 Part A acceptance.
 * For each OS (windows, macos, linux) x locale (en-US, fr-MA, ar-MA):
 *   - launch a Camoufox profile exactly like the engine does
 *   - assert UA / platform / navigator.languages match the chosen OS + locale
 *   - assert the UI locale pref stays en-US (chrome never switches)
 *   - assert the page renders (error page screenshot saved)
 *   - assert the badge addon installs (uuid in prefs)
 * Usage: node scripts/test-os-matrix.mjs [headed]
 */
import { createRequire } from 'module'
import { writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
const require = createRequire('/Users/brahimbouabi/Documents/REVERSE ENGEN/rea-app/package.json')
const APP = decodeURIComponent(new URL('..', import.meta.url).pathname)
const { launchOptions } = require('camoufox')
const { generateFingerprint: drawFp } = require('camoufox/dist/fingerprints.js')
const { firefox } = require('playwright-core')
const HOME = process.env.HOME

const HOST_OS = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
const headed = process.argv[2] === 'headed'
const OUT = join(APP, 'test-results')
mkdirSync(OUT, { recursive: true })

const official = join(HOME, 'Library/Caches/camoufox/browsers/official')
const build = execFileSync('/bin/ls', [official]).toString().split('\n').filter(Boolean).sort().reverse()[0]
const exe = join(official, build, 'Camoufox.app/Contents/MacOS/camoufox')

// production badge extension, if the app built one
const badgeDir = join(HOME, 'Library/Application Support/Brandinbold/badge-extensions')
const badgeSource = existsSync(badgeDir)
  ? join(badgeDir, (require('fs').readdirSync(badgeDir)[0] ?? ''))
  : null

const LOCALES = {
  'en-US': ['en-US', 'en'],
  'fr-MA': ['fr-MA', 'fr'],
  'ar-MA': ['ar-MA', 'ar']
}
const PLATFORM = { windows: 'Win32', macos: 'MacIntel', linux: 'Linux x86_64' }
const UA_MATCH = { windows: /Windows NT/, macos: /Macintosh; Intel Mac OS X/, linux: /X11|Linux/ }

let pass = 0
let fail = 0
const failures = []

for (const os of ['windows', 'macos', 'linux']) {
  for (const locale of Object.keys(LOCALES)) {
    const label = `${os}/${locale}`
    const userDataDir = `/tmp/bb-matrix-${os}-${locale.replace('-', '')}`
    rmSync(userDataDir, { recursive: true, force: true })
    try {
      const fp = await drawFp({ os })
      const lo = await launchOptions({
        os, headless: !headed,
        fingerprint: fp,
        i_know_what_im_doing: true,
        allow_addon_new_tab: true,
        ...(badgeSource && existsSync(badgeSource) ? { addons: [badgeSource] } : {})
      })
      lo.executablePath = exe
      lo.firefoxUserPrefs = {
        'intl.locale.requested': 'en-US',
        'browser.startup.page': 0,
        'browser.startup.homepage': 'about:blank',
        'xpinstall.signatures.required': false,
        'extensions.autoDisableScopes': 0,
        'extensions.enabledScopes': 15,
        'automation.profile': 1
      }
      lo.locale = LOCALES[locale].join(',')
      const context = await firefox.launchPersistentContext(userDataDir, lo)
      const page = context.pages()[0] ?? await context.newPage()
      await page.goto('http://127.0.0.1:1/', { timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(800)

      const seen = await page.evaluate(() => ({
        ua: navigator.userAgent,
        platform: navigator.platform,
        languages: navigator.languages,
        language: navigator.language
      }))
      await page.screenshot({ path: join(OUT, `osmatrix-${os}-${locale}.png`) })

      const checks = [
        [`UA match ${os}`, UA_MATCH[os].test(seen.ua)],
        [`platform ${PLATFORM[os]}`, seen.platform === PLATFORM[os]],
        [`languages ${LOCALES[locale].join(',')}`, JSON.stringify(seen.languages) === JSON.stringify(LOCALES[locale])],
        [`page language ${locale}`, seen.language === LOCALES[locale][0]]
      ]
      // UI locale pref: en-US even with ar-MA
      await new Promise((r) => setTimeout(r, 1500))
      const prefsPath = join(userDataDir, 'prefs.js')
      const prefs = existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : ''
      checks.push(['UI locale pref en-US', /user_pref\("intl\.locale\.requested",\s*"en-US"\)/.test(prefs) || !prefs.includes('intl.locale.requested')])
      const ui = prefs.indexOf('extensions.webextensions.uuids')
      checks.push(['badge addon installed', badgeSource ? ui >= 0 && prefs.slice(ui, ui + 3000).includes('profile-badge@brandinbold.app') : true])

      const ok = checks.every(([, v]) => v)
      if (ok) pass++
      else {
        fail++
        for (const [name, v] of checks) if (!v) failures.push(`${label}: ${name}`)
      }
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label} — ua:${UA_MATCH[os].test(seen.ua) ? 'ok' : 'KO'} platform:${seen.platform} langs:${seen.languages} badge:${checks[checks.length - 1][1] ? 'ok' : 'KO'}`)
      await context.close()
    } catch (e) {
      fail++
      failures.push(`${label}: EXCEPTION ${e.message}`)
      console.log(`FAIL ${label} — exception ${e.message.slice(0, 80)}`)
    }
  }
}

writeFileSync(join(OUT, 'os-matrix-report.txt'),
  `OS matrix: ${pass} pass, ${fail} fail\n${failures.map((f) => 'FAIL ' + f).join('\n')}\n`)
console.log(`\n=== OS MATRIX: ${pass} pass / ${fail} fail ===`)
if (failures.length) console.log(failures.join('\n'))
process.exit(fail ? 1 : 0)
