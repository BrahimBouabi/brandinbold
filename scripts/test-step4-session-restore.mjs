/**
 * STEP 4 Acceptance Test Suite: Session Restore (Item 2)
 *
 * Tests:
 * 1. Local Session Restore (without cloud sync): open 3 tabs, stop immediately, start -> 3 tabs + cookies return, no stray about:blank.
 * 2. Consecutive Stop/Start & Window-Close Protection: consecutive stop/start cycles preserve all 3 tabs without accumulating about:blank.
 * 3. Legacy Corrupt Session Recovery: when sessionstore.jsonlz4 / recovery.jsonlz4 have windows: [] (from prior macOS window close bug) but recovery.baklz4 has the tabs -> start recovers all 3 tabs.
 * 4. Cloud Sync Session Restore: uploadSessionState to live Cloud API, verify local session is not overwritten when unsynced, restore into fresh profile dir (Machine B), start -> all 3 tabs + cookies return.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { mkdtempSync, existsSync, readFileSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build as viteBuild } from 'vite'

const require = createRequire(import.meta.url)

const API_URL = process.env.CLOUD_API_URL || 'http://localhost:8787'
const ROOT = join(import.meta.dirname, '..')

function makeTestProfile(id, name = 'Session Test Profile') {
  const now = new Date().toISOString()
  return {
    id,
    name,
    color: '#8952ef',
    showNameInBrowser: true,
    groupId: null,
    tags: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    lastLaunchedAt: null,
    os: 'macos',
    browserVersion: '146.0',
    userAgentMode: 'default',
    userAgentVersion: '',
    proxyId: null,
    proxy: { type: 'none' },
    timezone: { mode: 'auto', name: 'UTC' },
    webrtc: 'altered',
    geolocation: { mode: 'auto', latitude: 37.7749, longitude: -122.4194, accuracy: 100 },
    geoPolicy: 'prompt',
    navigator: {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0',
      platform: 'MacIntel',
      language: 'en-US',
      languages: ['en-US', 'en'],
      hardwareConcurrency: 8,
      deviceMemory: 8,
      doNotTrack: null,
      maxTouchPoints: 0
    },
    screen: {
      width: 1280,
      height: 800,
      availWidth: 1280,
      availHeight: 775,
      colorDepth: 24,
      pixelRatio: 2
    },
    webgl: { mode: 'noise', vendor: 'Apple', renderer: 'Apple M2' },
    canvas: 'noise',
    audio: 'noise',
    fonts: { mode: 'auto', list: [] },
    media: { audioInputs: 1, videoInputs: 1, audioOutputs: 1 },
    mediaMask: true,
    storage: { localStorage: true, indexedDB: true },
    startup: { homepage: '', restoreSession: true },
    startupUrls: [],
    startupUrlsEnabled: false,
    extensions: [],
    cookies: [],
    customArgs: '',
    customArgsEnabled: false
  }
}

async function main() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'bb-step4-test-'))
  const distTmp = join(ROOT, 'dist-tmp')
  mkdirSync(distTmp, { recursive: true })
  const entryFile = join(tmpRoot, 'entry.ts')
  const electronShim = join(tmpRoot, 'electron-shim.mjs')
  writeFileSync(
    electronShim,
    `import path from 'node:path';
     export const app = {
       isPackaged: false,
       getPath: (k) => k === 'userData'
         ? path.join(process.env.HOME, 'Library/Application Support/Brandinbold')
         : '/tmp'
     };
     export default { app };`
  )
  writeFileSync(
    entryFile,
    `export { CamoufoxEngine } from '${join(ROOT, 'electron/engine/camoufox/CamoufoxEngine.ts')}'
     export { createCloudClient } from '${join(ROOT, 'electron/cloud/cloudClient.ts')}'
     export { packSessionState, uploadSessionState, maybeRestoreSession } from '${join(ROOT, 'electron/cloud/syncEngine.ts')}'`
  )

  await viteBuild({
    root: ROOT,
    logLevel: 'silent',
    resolve: {
      alias: {
        electron: electronShim,
        '@shared': join(ROOT, 'shared')
      }
    },
    build: {
      ssr: entryFile,
      outDir: distTmp,
      emptyOutDir: false,
      rollupOptions: {
        external: [/^node:/, 'playwright-core', 'camoufox', /^camoufox\//, 'better-sqlite3'],
        output: {
          format: 'cjs',
          entryFileNames: 'step4-bundle.cjs'
        }
      }
    }
  })

  const {
    CamoufoxEngine,
    createCloudClient,
    packSessionState,
    uploadSessionState,
    maybeRestoreSession
  } = require(join(distTmp, 'step4-bundle.cjs'))

  // Start local HTTP test server for the 3 tabs
  let TAB_URLS = []
  const server = http.createServer((req, res) => {
    if (req.url === '/spawn-tabs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><body><script>
        localStorage.setItem('tab_one_state', 'alive-across-restart');
        window.open('${TAB_URLS[1]}', '_blank');
        window.open('${TAB_URLS[2]}', '_blank');
        location.replace('${TAB_URLS[0]}');
      </script></body></html>`)
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><title>Tab ${req.url}</title></head><body><h1 id="path">${req.url}</h1></body></html>`)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const BASE = `http://127.0.0.1:${port}`
  TAB_URLS = [`${BASE}/tab-one`, `${BASE}/tab-two`, `${BASE}/tab-three`]

  let passed = 0
  const total = 4

  try {
    const engine = new CamoufoxEngine()
    await engine.ensureInstalled()

    // =========================================================================
    // 1. Local Session Restore (Without Cloud Sync — Stop button)
    // =========================================================================
    console.log('1. Testing Local Session Restore (open 3 tabs -> stop -> start -> 3 tabs return)...')
    const profId1 = randomUUID()
    const dirA = join(tmpRoot, 'profile-a')
    mkdirSync(dirA, { recursive: true })
    // Launch 1 opens the 3 tabs via startupUrls; subsequent launches have startupUrlsEnabled=false
    // so they can ONLY get the 3 tabs back via Session Restore!
    const profile1Launch = {
      ...makeTestProfile(profId1, 'Step 4 Local Profile'),
      startup: { homepage: '', restoreSession: true },
      startupUrls: TAB_URLS,
      startupUrlsEnabled: true
    }
    const profile1 = makeTestProfile(profId1, 'Step 4 Local Profile')

    const visitedOnLaunch1 = new Set()
    const run1 = await engine.launch(profile1Launch, dirA, null)
    run1.handle.onNavigate((u) => visitedOnLaunch1.add(u))
    await run1.handle.cookies.import([
      {
        name: 'session_cookie',
        value: 'keep_me_123',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax'
      }
    ])

    // Wait briefly for the 3 tabs to finish loading (NOT 15s!)
    await new Promise((r) => setTimeout(r, 2500))

    // Stop the profile via handle.stop()
    await run1.handle.stop()

    assert.equal(existsSync(join(dirA, 'sessionstore.jsonlz4')), true, 'sessionstore.jsonlz4 must exist after stop')
    assert.equal(existsSync(join(dirA, 'bb-session-tabs.json')), true, 'bb-session-tabs.json must exist after stop')
    assert.equal(existsSync(join(dirA, 'cache2')), false, 'transient cache2 must be purged after stop')
    const savedTabsJson1 = JSON.parse(readFileSync(join(dirA, 'bb-session-tabs.json'), 'utf8'))
    assert.equal(savedTabsJson1.urls.length, 3, 'bb-session-tabs.json must contain all 3 tab URLs')
    for (const u of TAB_URLS) {
      assert.equal(savedTabsJson1.urls.includes(u), true, `bb-session-tabs.json must include ${u}`)
    }

    // Relaunch the profile and verify all 3 tabs return
    const run2 = await engine.launch(profile1, dirA, null)
    await new Promise((r) => setTimeout(r, 1500))
    const cookiesAfterRelaunch = await run2.handle.cookies.export()
    assert.equal(
      cookiesAfterRelaunch.some((c) => c.name === 'session_cookie' && c.value === 'keep_me_123'),
      true,
      'Session cookie must survive stop + relaunch'
    )
    const savedTabsJson2 = JSON.parse(readFileSync(join(dirA, 'bb-session-tabs.json'), 'utf8'))
    assert.equal(savedTabsJson2.urls.length, 3, 'All 3 tabs must be active and tracked after relaunch')
    for (const u of TAB_URLS) {
      assert.equal(savedTabsJson2.urls.includes(u), true, `Restored session must contain ${u}`)
    }
    console.log('   ✓ PASS: Local session restore returned all 3 tabs + cookies without waiting 15s')
    passed++

    // =========================================================================
    // 2. Consecutive Stop/Start & Window-Close Protection
    // =========================================================================
    console.log('2. Testing consecutive Stop/Start cycles & session backup preservation...')
    await new Promise((r) => setTimeout(r, 1500))
    const backupGoodLz4 = join(tmpRoot, 'good-session.jsonlz4')
    if (existsSync(join(dirA, 'sessionstore-backups', 'recovery.jsonlz4'))) {
      copyFileSync(join(dirA, 'sessionstore-backups', 'recovery.jsonlz4'), backupGoodLz4)
    } else if (existsSync(join(dirA, 'sessionstore.jsonlz4'))) {
      copyFileSync(join(dirA, 'sessionstore.jsonlz4'), backupGoodLz4)
    }

    await run2.handle.stop()
    if (!existsSync(backupGoodLz4) && existsSync(join(dirA, 'sessionstore.jsonlz4'))) {
      copyFileSync(join(dirA, 'sessionstore.jsonlz4'), backupGoodLz4)
    }

    const run2b = await engine.launch(profile1, dirA, null)
    await new Promise((r) => setTimeout(r, 1200))
    await run2b.handle.stop()
    const afterStopTabs = JSON.parse(readFileSync(join(dirA, 'bb-session-tabs.json'), 'utf8'))
    assert.equal(afterStopTabs.urls.length, 3, 'All 3 tabs preserved across consecutive stop/start cycles')
    console.log('   ✓ PASS: Consecutive stop/start cycles preserve all 3 tabs without accumulating about:blank')
    passed++

    // =========================================================================
    // 3. Legacy Corrupt Session Recovery (windows: [] in sessionstore.jsonlz4, real tabs in recovery.baklz4)
    // =========================================================================
    console.log('3. Testing recovery when sessionstore.jsonlz4 was wiped (windows: []) and tabs are in recovery.baklz4...')
    const dirCorrupt = join(tmpRoot, 'profile-corrupt')
    mkdirSync(join(dirCorrupt, 'sessionstore-backups'), { recursive: true })
    copyFileSync(backupGoodLz4, join(dirCorrupt, 'sessionstore-backups', 'recovery.baklz4'))
    assert.equal(existsSync(join(dirCorrupt, 'sessionstore.jsonlz4')), false)
    assert.equal(existsSync(join(dirCorrupt, 'bb-session-tabs.json')), false)

    const profileCorrupt = makeTestProfile(randomUUID(), 'Step 4 Corrupt Recovery')
    const runCorrupt = await engine.launch(profileCorrupt, dirCorrupt, null)
    await new Promise((r) => setTimeout(r, 1500))
    const recoveredTabs = JSON.parse(readFileSync(join(dirCorrupt, 'bb-session-tabs.json'), 'utf8'))
    assert.equal(recoveredTabs.urls.length, 3, 'Should recover all 3 tabs from recovery.baklz4')
    for (const u of TAB_URLS) {
      assert.equal(recoveredTabs.urls.includes(u), true, `Recovered session from recovery.baklz4 must contain ${u}`)
    }
    await runCorrupt.handle.stop()
    console.log('   ✓ PASS: Automatically recovered all 3 tabs from recovery.baklz4')
    passed++

    // =========================================================================
    // 4. Cloud Sync Session Restore (Upload from dirA -> Restore to dirB -> Launch)
    // =========================================================================
    console.log('4. Testing Cloud Sync Session Archive (upload -> local protection -> restore on Machine B -> 3 tabs return)...')
    let token = null
    let refreshToken = null
    const client = createCloudClient({
      apiUrl: API_URL,
      getToken: () => token,
      getRefreshToken: () => refreshToken,
      setTokens: (a, r) => {
        token = a
        refreshToken = r
      }
    })

    const email = `step4-session-${Date.now()}@brandinbold.test`
    await client.register(email, 'Step 4 User', 'Step4Pass123')
    await client.push({
      profiles: [profile1],
      groups: [],
      proxies: [],
      deleted: { profiles: [], groups: [], proxies: [] }
    })

    const packed = packSessionState(dirA)
    assert.ok(packed && packed.length > 100, 'packSessionState must return a non-empty tar.gz buffer')
    const upRes = await uploadSessionState(client, profile1.id, dirA)
    assert.ok(upRes && upRes.size > 100, 'uploadSessionState must upload archive to Cloud API')

    // Verify Local Session Protection: when dirA already has a local session and lastSynced is null,
    // maybeRestoreSession MUST NOT overwrite dirA!
    const noOverwrite = await maybeRestoreSession(client, profile1.id, dirA, null)
    assert.equal(
      noOverwrite.restored,
      false,
      'maybeRestoreSession must NOT overwrite an existing unsynced local session'
    )

    // Now simulate Machine B (fresh directory dirB with no local session)
    const dirB = join(tmpRoot, 'profile-b-machine2')
    mkdirSync(dirB, { recursive: true })
    const restoreRes = await maybeRestoreSession(client, profile1.id, dirB, null)
    assert.equal(restoreRes.restored, true, 'maybeRestoreSession must restore cloud archive onto fresh Machine B')
    assert.equal(
      existsSync(join(dirB, 'sessionstore.jsonlz4')),
      true,
      'Restored archive on Machine B must include sessionstore.jsonlz4'
    )
    assert.equal(
      existsSync(join(dirB, 'bb-session-tabs.json')),
      true,
      'Restored archive on Machine B must include bb-session-tabs.json'
    )

    // Launch profile on Machine B and verify all 3 tabs + cookie return!
    const runMachineB = await engine.launch(profile1, dirB, null)
    await new Promise((r) => setTimeout(r, 1500))
    const machineBCookies = await runMachineB.handle.cookies.export()
    assert.equal(
      machineBCookies.some((c) => c.name === 'session_cookie' && c.value === 'keep_me_123'),
      true,
      'Session cookie must be restored on Machine B from Cloud Sync archive'
    )
    const machineBTabs = JSON.parse(readFileSync(join(dirB, 'bb-session-tabs.json'), 'utf8'))
    assert.equal(machineBTabs.urls.length, 3, 'All 3 tabs must be restored on Machine B from Cloud Sync archive')
    for (const u of TAB_URLS) {
      assert.equal(machineBTabs.urls.includes(u), true, `Machine B restored tabs must include ${u}`)
    }
    await runMachineB.handle.stop()
    console.log('   ✓ PASS: Cloud Sync session archive restored all 3 tabs + cookies on Machine B')
    passed++

    console.log(`\n=== STEP 4 TEST SUMMARY: ${passed}/${total} PASSED ===`)
  } finally {
    server.close()
    rmSync(tmpRoot, { recursive: true, force: true })
    rmSync(join(distTmp, 'step4-bundle.cjs'), { force: true })
  }
}

main().catch((err) => {
  console.error('STEP 4 TEST FAILED:', err)
  process.exit(1)
})
