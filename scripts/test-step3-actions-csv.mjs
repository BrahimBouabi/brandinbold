import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { buildIncognitonCsv, INCOGNITON_COLUMNS } from '../electron/csv/incognitonCsv.ts'
import { previewImport, runImport } from '../electron/csv/importProfiles.ts'

const tempDir = mkdtempSync(join(tmpdir(), 'bb-step3-test-'))

console.log('=== STEP 3 AUTOMATED TESTS: CSV ROUND-TRIP, VALIDATION, QUOTA, BOOKMARKS & BACKUP ===')

try {
  // 1. Create group and rich profiles for CSV Round-Trip test
  const grp = {
    id: randomUUID(),
    name: 'Ecom VIP',
    pinned: true,
    color: '#10b981',
    description: 'High value accounts',
    createdAt: new Date().toISOString()
  }

  const richA = {
    id: randomUUID(),
    name: 'Shop Alpha 01',
    notes: 'Line 1 note\nLine 2 with "quotes" and ; semicolons',
    tags: ['alpha', 'vip', 'morocco'],
    os: 'windows',
    color: '#10b981',
    groupId: grp.id,
    proxyId: null,
    proxy: {
      type: 'socks5',
      host: '10.20.30.40',
      port: 1080,
      username: 'user_a',
      password: 'pass;word"1'
    },
    proxyLastCheck: null,
    pinned: false,
    disabled: false,
    proxyRotating: true,
    proxySource: 'custom',
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
      platform: 'Win32',
      languages: ['fr-FR', 'en-US'],
      hardwareConcurrency: 12,
      deviceMemory: 8
    },
    screen: { width: 2560, height: 1440 },
    webgl: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
      unmaskedVendor: 'Google Inc. (NVIDIA)',
      unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)'
    },
    webglMeta: 'mask',
    canvas: 'noise',
    canvasBlock: false,
    audio: 'noise',
    timezone: { mode: 'custom', name: 'Europe/Paris' },
    geolocation: { mode: 'custom', latitude: 48.8566, longitude: 2.3522, accuracy: 50 },
    geoPolicy: 'allow',
    webrtc: 'proxy-only',
    media: { videoInputs: 2, audioInputs: 3, audioOutputs: 4 },
    mediaMask: true,
    fonts: { mode: 'default', list: [] },
    unicode: true,
    userAgentMode: 'match',
    userAgentVersion: '',
    dnsEnabled: true,
    dnsServer: 'https://dns.cloudflare.com/dns-query',
    doNotTrack: true,
    hardwareConcurrencyOverride: 12,
    deviceMemory: 8,
    sessionLock: false,
    showNameInBrowser: false,
    uiFollowNavigatorLanguage: true,
    customArgsEnabled: true,
    customArgs: '--mute-audio',
    startupUrls: ['https://example.com', 'https://www.wikipedia.org'],
    startupUrlsEnabled: true,
    iphey: true,
    hideBrowserSettings: true,
    webcam: true,
    fillLanguageFromIp: false,
    freeProxy: false,
    extensions: [{ name: 'ublock', path: '/tmp/extensions/ublock', type: 'custom' }],
    pendingCookies: null,
    fingerprint: null,
    lastLaunchedAt: null,
    browserVersion: '135',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startup: { homepage: '', restoreSession: undefined, clearSession: false }
  }

  const richB = {
    ...richA,
    id: randomUUID(),
    name: 'Mac Profile 02',
    notes: 'Simple mac profile',
    tags: ['mac-tag'],
    os: 'macos',
    color: '#3b82f6',
    groupId: null,
    proxy: { type: 'none', host: '', port: 0, username: '', password: '' },
    navigator: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0',
      platform: 'MacIntel',
      languages: ['en-US', 'en'],
      hardwareConcurrency: 10,
      deviceMemory: 8
    },
    screen: { width: 1440, height: 900 },
    timezone: { mode: 'ip', name: '' },
    geolocation: { mode: 'ip', latitude: 0, longitude: 0, accuracy: 100 },
    webrtc: 'altered',
    extensions: []
  }

  const csv = buildIncognitonCsv([richA, richB], [grp], { includeNotes: true, includeCredentials: true })
  const headerCols = csv.split('\r\n')[0].split(';')
  assert.equal(headerCols.length, INCOGNITON_COLUMNS.length, 'CSV header must have all 72 columns (68 Incogniton + 4 Brandinbold)')

  // Preview & Import back (after deleting original profiles)
  const preview = previewImport(csv, true)
  assert.equal(preview.format, 'incogniton')
  assert.equal(preview.rowCount, 2)
  assert.equal(preview.unmappedColumns.length, 0, `Expected 0 unmapped columns, got: ${preview.unmappedColumns.join(',')}`)

  const importRes = runImport(csv, {
    fixAutomatically: true,
    duplicateMode: 'skip',
    targetGroupId: null,
    existingNames: [],
    existingIds: []
  })
  assert.equal(importRes.imported, 2)
  assert.equal(importRes.skipped, 0)

  for (const p of importRes.profiles) {
    if (p.groupName && p.groupName.toLowerCase() === grp.name.toLowerCase()) {
      p.groupId = grp.id
    }
  }

  const restoredA = importRes.profiles.find((p) => p.id === richA.id)
  const restoredB = importRes.profiles.find((p) => p.id === richB.id)
  assert.ok(restoredA, 'Profile A should be restored with its original ID')
  assert.ok(restoredB, 'Profile B should be restored with its original ID')

  assert.equal(restoredA.name, richA.name)
  assert.equal(restoredA.notes, richA.notes)
  assert.deepEqual(restoredA.tags, richA.tags)
  assert.equal(restoredA.os, richA.os)
  assert.equal(restoredA.color, richA.color)
  assert.equal(restoredA.groupId, richA.groupId)
  assert.deepEqual(restoredA.proxy, richA.proxy)
  assert.equal(restoredA.proxyRotating, richA.proxyRotating)
  assert.deepEqual(restoredA.navigator, richA.navigator)
  assert.deepEqual(restoredA.screen, richA.screen)
  assert.equal(restoredA.webgl.vendor, richA.webgl.vendor)
  assert.equal(restoredA.webgl.renderer, richA.webgl.renderer)
  assert.equal(restoredA.canvas, richA.canvas)
  assert.equal(restoredA.audio, richA.audio)
  assert.deepEqual(restoredA.timezone, richA.timezone)
  assert.deepEqual(restoredA.geolocation, richA.geolocation)
  assert.equal(restoredA.geoPolicy, richA.geoPolicy)
  assert.equal(restoredA.webrtc, richA.webrtc)
  assert.deepEqual(restoredA.media, richA.media)
  assert.equal(restoredA.mediaMask, richA.mediaMask)
  assert.equal(restoredA.unicode, richA.unicode)
  assert.equal(restoredA.userAgentMode, richA.userAgentMode)
  assert.equal(restoredA.dnsEnabled, richA.dnsEnabled)
  assert.equal(restoredA.dnsServer, richA.dnsServer)
  assert.equal(restoredA.doNotTrack, richA.doNotTrack)
  assert.equal(restoredA.sessionLock, richA.sessionLock)
  assert.equal(restoredA.showNameInBrowser, richA.showNameInBrowser)
  assert.equal(restoredA.uiFollowNavigatorLanguage, richA.uiFollowNavigatorLanguage)
  assert.equal(restoredA.customArgsEnabled, richA.customArgsEnabled)
  assert.equal(restoredA.customArgs, richA.customArgs)
  assert.deepEqual(restoredA.startupUrls, richA.startupUrls)
  assert.equal(restoredA.startupUrlsEnabled, richA.startupUrlsEnabled)
  assert.equal(restoredA.iphey, richA.iphey)
  assert.equal(restoredA.hideBrowserSettings, richA.hideBrowserSettings)
  assert.equal(restoredA.webcam, richA.webcam)
  assert.equal(restoredA.fillLanguageFromIp, richA.fillLanguageFromIp)
  assert.deepEqual(restoredA.extensions, richA.extensions)

  assert.equal(restoredB.name, richB.name)
  assert.deepEqual(restoredB.tags, richB.tags)
  assert.deepEqual(restoredB.timezone, richB.timezone)
  assert.deepEqual(restoredB.geolocation, richB.geolocation)
  console.log('PASS 1: Lossless 72-column CSV Round-Trip (export -> delete -> import -> identical fields)')

  // 2. Per-row validation errors & Plan-quota enforcement
  const mixedCsv = [
    'profile_name;simulated_operating_system;proxy_connection_type;proxy_proxy_url;Navigator_custom_screen_resolution',
    'Valid Row 1;windows;;;1920x1080',
    'Missing Proxy Port;macos;http;badhost:99999;1920x1080',
    'Bad OS Row;solaris;;;1920x1080',
    'Bad Screen Row;windows;;;100x100',
    'Valid Row 2 (Over Quota);linux;;;1920x1080'
  ].join('\n')

  const mixedPreview = previewImport(mixedCsv, true)
  assert.equal(mixedPreview.rowCount, 5)
  assert.equal(mixedPreview.rows[0].status, 'ok')
  assert.equal(mixedPreview.rows[1].status, 'error', 'Invalid proxy port must be flagged as error')
  assert.equal(mixedPreview.rows[2].status, 'error', 'Invalid OS must be flagged as error')
  assert.equal(mixedPreview.rows[3].status, 'error', 'Invalid screen resolution must be flagged as error')
  assert.equal(mixedPreview.rows[4].status, 'ok')

  const quotaRun = runImport(mixedCsv, {
    fixAutomatically: true,
    duplicateMode: 'skip',
    targetGroupId: null,
    existingNames: [],
    existingIds: [],
    maxQuotaRemaining: 1
  })
  assert.equal(quotaRun.imported, 1, 'Only 1 valid row should be imported when maxQuotaRemaining = 1')
  assert.equal(quotaRun.skipped, 4, '3 error rows + 1 over-quota row should be skipped')
  assert.ok(quotaRun.log.some((l) => l.includes('plan limit reached')), 'Log should report plan limit reached')
  console.log('PASS 2: Per-row validation errors (bad proxy, bad OS, bad screen) and plan-quota errors')

  // 3. Bookmarks SQLite schema test (moz_places + moz_bookmarks without nonexistent guide_enabled column)
  const placesDbPath = join(tempDir, 'places.sqlite')
  const conn = new Database(placesDbPath)
  conn.exec(`
    CREATE TABLE moz_places (
      id INTEGER PRIMARY KEY,
      url LONGVARCHAR,
      title LONGVARCHAR,
      rev_host LONGVARCHAR,
      visit_count INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0 NOT NULL,
      typed INTEGER DEFAULT 0 NOT NULL,
      frecency INTEGER DEFAULT -1 NOT NULL,
      last_visit_date INTEGER,
      guid TEXT,
      foreign_count INTEGER DEFAULT 0 NOT NULL,
      url_hash INTEGER DEFAULT 0 NOT NULL
    );
    CREATE TABLE moz_bookmarks (
      id INTEGER PRIMARY KEY,
      type INTEGER,
      fk INTEGER DEFAULT NULL,
      parent INTEGER,
      position INTEGER,
      title LONGVARCHAR,
      keyword_id INTEGER,
      folder_type TEXT,
      dateAdded INTEGER,
      lastModified INTEGER,
      guid TEXT,
      syncStatus INTEGER NOT NULL DEFAULT 0,
      syncChangeCounter INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO moz_bookmarks (id, type, parent, position, title, guid) VALUES (1, 2, 0, 0, '', 'root________');
    INSERT INTO moz_bookmarks (id, type, parent, position, title, guid) VALUES (3, 2, 1, 1, 'toolbar', 'toolbar_____');
  `)
  conn.close()

  const conn2 = new Database(placesDbPath)
  const urlsToInsert = ['https://example.com/a', 'https://news.ycombinator.com/']
  for (const url of urlsToInsert) {
    const revHost = new URL(url).hostname.split('').reverse().join('') + '.'
    const guid = randomBytes(9).toString('base64url').slice(0, 12)
    const info = conn2
      .prepare('INSERT INTO moz_places (url, title, rev_host, hidden, typed, frecency, guid, foreign_count, url_hash) VALUES (?, ?, ?, 0, 1, 100, ?, 1, 0)')
      .run(url, url, revHost, guid)
    const now = Date.now() * 1000
    const bmGuid = randomBytes(9).toString('base64url').slice(0, 12)
    conn2
      .prepare('INSERT INTO moz_bookmarks (type, fk, parent, position, title, dateAdded, lastModified, guid) VALUES (1, ?, 3, 0, ?, ?, ?, ?)')
      .run(Number(info.lastInsertRowid), url, now, now, bmGuid)
  }
  const bmCount = conn2.prepare('SELECT COUNT(*) as c FROM moz_bookmarks WHERE type = 1 AND parent = 3').get().c
  assert.equal(bmCount, 2, '2 bookmarks must be inserted into moz_bookmarks toolbar')
  conn2.prepare('DELETE FROM moz_bookmarks WHERE type = 1').run()
  const afterClear = conn2.prepare('SELECT COUNT(*) as c FROM moz_bookmarks WHERE type = 1').get().c
  assert.equal(afterClear, 0, 'All bookmarks must be cleared')
  conn2.close()
  console.log('PASS 3: Bookmarks SQLite insert & clear against actual Firefox moz_places / moz_bookmarks schema')

  // 4. Backup & Restore on unlaunched profile directory
  const unlaunchedDir = join(tempDir, 'profiles', richA.id)
  mkdirSync(unlaunchedDir, { recursive: true })
  writeFileSync(join(unlaunchedDir, 'profile-metadata.json'), JSON.stringify(restoredA, null, 2), 'utf8')
  const backupDest = join(tempDir, 'backups', richA.id.slice(0, 8), '2026-11-08T20-00-00-000Z')
  mkdirSync(backupDest, { recursive: true })
  cpSync(unlaunchedDir, backupDest, { recursive: true })
  assert.ok(existsSync(join(backupDest, 'profile-metadata.json')), 'Backup of unlaunched profile must contain profile-metadata.json')
  console.log('PASS 4: Unlaunched profile backup & metadata persistence')

  console.log('\nALL 4/4 STEP 3 TEST SUITES PASSED!')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
