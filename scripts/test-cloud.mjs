/* TASK 10 + Step 1 acceptance — cloud API end-to-end.
 * register → login → me → push (profiles/groups/proxies) → pull →
 * BUG-009 partial upload & per-item quota_exceeded → session-state upload/download →
 * delete tombstones → newer-wins → refresh token →
 * username change & login by username → strong password policy →
 * TOTP 2FA (setup, enable, login challenge, single-use backup code, disable) →
 * auth rate limiting (429). */
import { gzipSync } from 'zlib'
import { createHmac } from 'crypto'

const BASE = process.env.CLOUD_API_URL ?? 'http://localhost:8787'

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function computeTotp(secretBase32) {
  const key = base32Decode(secretBase32)
  const buf = Buffer.alloc(8)
  let c = Math.floor(Date.now() / 30000)
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000
  return String(code).padStart(6, '0')
}

// wait for the API container (it may be restarting after a rebuild)
for (let i = 0; i < 20; i++) {
  try {
    const h = await fetch(`${BASE}/api/health`)
    if (h.ok) break
  } catch {}
  await new Promise((r) => setTimeout(r, 1000))
}

const RUN = Date.now()
const uid = (n) => `00000000-0000-4000-8000-${String(RUN).slice(-8)}${String(n).padStart(4, '0')}`
let pass = 0
const failures = []
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else failures.push(name + (detail ? ` — ${detail}` : ''))
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const email = `test-${Date.now()}@brandinbold.app`
const password = 'supersecret123'

// 1. register
let r = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, name: 'Cloud Test', password })
})
let body = await r.json()
check('register', r.status === 200 && !!body.token && !!body.user?.username, `status ${r.status}`)
const { token } = body

// 2. login
r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
})
body = await r.json()
check('login', r.status === 200 && !!body.token, `status ${r.status}`)

// 3. me (Bearer)
r = await fetch(`${BASE}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })
body = await r.json()
check('auth/me', r.status === 200 && body.user.email === email, JSON.stringify(body.user ?? {}).slice(0, 60))

// 4. unauthorized push rejected
r = await fetch(`${BASE}/api/sync/push`, { method: 'PUT', body: '{}' })
check('push without token → 401', r.status === 401, `status ${r.status}`)

// 5. push profiles + groups + proxies
const profileDocs = [
  { id: uid(1), name: 'Cloud P1', os: 'windows', updatedAt: new Date().toISOString(), navigator: { platform: 'Win32' }, proxy: { type: 'none' } },
  { id: uid(2), name: 'Cloud P2', os: 'macos', updatedAt: new Date().toISOString(), proxy: { type: 'none' } }
]
r = await fetch(`${BASE}/api/sync/push`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    profiles: profileDocs,
    groups: [{ id: uid(3), name: 'Cloud Group', pinned: false, color: '#8952ef' }],
    proxies: [{ id: uid(4), name: 'Cloud Proxy', type: 'http', host: '1.2.3.4', port: 8080 }]
  })
})
body = await r.json()
check('push 2 profiles + 1 group + 1 proxy', r.status === 200 && body.profiles === 2 && body.groups === 1 && body.proxies === 1, JSON.stringify(body))

// 6. pull contains them
r = await fetch(`${BASE}/api/sync/pull`, { headers: { authorization: `Bearer ${token}` } })
body = await r.json()
check('pull profiles', body.profiles?.length === 2)
check('pull groups', body.groups?.length === 1 && body.groups[0].name === 'Cloud Group')
check('pull proxies', body.proxies?.length === 1)

// 7. BUG-009 fix: pushing 6 profiles on Free plan (max 3) accepts up to 3 total and reports 3 in rejectedProfiles (no whole-batch 403!)
const sixProfiles = [
  ...profileDocs,
  { id: uid(11), name: 'Cloud P3 (Pinned)', pinned: true, updatedAt: new Date().toISOString() },
  { id: uid(12), name: 'Excess P4', updatedAt: new Date().toISOString() },
  { id: uid(13), name: 'Excess P5', updatedAt: new Date().toISOString() },
  { id: uid(14), name: 'Excess P6', updatedAt: new Date().toISOString() }
]
r = await fetch(`${BASE}/api/sync/push`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ profiles: sixProfiles })
})
body = await r.json()
check(
  'BUG-009 partial upload (6 local vs 3 free quota → 3 active, 3 rejected with quota_exceeded)',
  r.status === 200 &&
    body.activeProfiles === 3 &&
    body.rejectedProfiles?.length === 3 &&
    body.rejectedProfiles.every((x) => x.reason === 'quota_exceeded'),
  JSON.stringify({ status: r.status, active: body.activeProfiles, rejected: body.rejectedProfiles?.length })
)

// Delete P3 so we are back to 2 profiles for subsequent tests
await fetch(`${BASE}/api/profiles/${uid(11)}`, {
  method: 'DELETE',
  headers: { authorization: `Bearer ${token}` }
})

// 8. session archive upload (gzip tar-like blob) + download round-trip
const archive = gzipSync(Buffer.from('fake-tar:cookies.sqlite|sessionstore-backups|places.sqlite'))
r = await fetch(`${BASE}/api/profiles/${profileDocs[0].id}/session-state`, {
  method: 'PUT',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
  body: archive
})
body = await r.json()
check('session-state upload', r.status === 200 && body.size === archive.length && !!body.updatedAt, `size ${body.size} updatedAt ${body.updatedAt}`)

r = await fetch(`${BASE}/api/profiles/${profileDocs[0].id}/session-state`, {
  headers: { authorization: `Bearer ${token}` }
})
const back = Buffer.from(await r.arrayBuffer())
check('session-state download identical', r.status === 200 && back.equals(archive), `bytes ${back.length}`)

// 9. delete profile (tombstone) → pull excludes it + lists it in deleted.profiles
r = await fetch(`${BASE}/api/profiles/${profileDocs[1].id}`, {
  method: 'DELETE',
  headers: { authorization: `Bearer ${token}` }
})
r = await fetch(`${BASE}/api/sync/pull`, { headers: { authorization: `Bearer ${token}` } })
body = await r.json()
check(
  'delete tombstone + pull excludes + deleted list',
  body.profiles?.length === 1 && body.deleted?.profiles?.some((t) => t.id === profileDocs[1].id),
  `remaining ${body.profiles?.length} tombstones ${body.deleted?.profiles?.length}`
)

// 9b. Step B: stale push (updatedAt in the past) must NOT resurrect a deleted profile or overwrite a newer one
const past = new Date(Date.now() - 60_000).toISOString()
r = await fetch(`${BASE}/api/sync/push`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    profiles: [
      { ...profileDocs[0], name: 'STALE NAME', updatedAt: past },
      { ...profileDocs[1], name: 'ZOMBIE', updatedAt: past }
    ]
  })
})
body = await r.json()
r = await fetch(`${BASE}/api/sync/pull`, { headers: { authorization: `Bearer ${token}` } })
const afterStale = await r.json()
check(
  'stale push skipped (no overwrite, no zombie resurrection)',
  body.skipped === 2 && afterStale.profiles?.length === 1 && afterStale.profiles[0].name === 'Cloud P1',
  JSON.stringify(body)
)

// 9c. Step B: newer push updates group + proxy, and resurrects profileDocs[1] when edited AFTER deletion
const future = new Date(Date.now() + 5_000).toISOString()
r = await fetch(`${BASE}/api/sync/push`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    profiles: [{ ...profileDocs[1], name: 'Restored P2', updatedAt: future }],
    groups: [{ id: uid(3), name: 'Renamed Group', pinned: true, color: '#8952ef', updatedAt: future }],
    proxies: [{ id: uid(4), name: 'Updated Proxy', type: 'socks5', host: '9.9.9.9', port: 1080, updatedAt: future }]
  })
})
r = await fetch(`${BASE}/api/sync/pull`, { headers: { authorization: `Bearer ${token}` } })
const afterNewer = await r.json()
check(
  'newer-wins updates group/proxy + resurrects restored profile',
  afterNewer.profiles?.length === 2 &&
    afterNewer.groups?.[0]?.name === 'Renamed Group' &&
    afterNewer.proxies?.[0]?.host === '9.9.9.9',
  JSON.stringify({ p: afterNewer.profiles?.length, g: afterNewer.groups?.[0]?.name, x: afterNewer.proxies?.[0]?.host })
)

// 9d. Step B: queued tombstones in push payload delete group + proxy
const delAt = new Date(Date.now() + 10_000).toISOString()
r = await fetch(`${BASE}/api/sync/push`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    deleted: {
      groups: [{ id: uid(3), deletedAt: delAt }],
      proxies: [{ id: uid(4), deletedAt: delAt }]
    }
  })
})
body = await r.json()
r = await fetch(`${BASE}/api/sync/pull`, { headers: { authorization: `Bearer ${token}` } })
const afterDel = await r.json()
check(
  'push tombstones deletes group + proxy and exposes them in pull.deleted',
  body.deleted === 2 &&
    afterDel.groups?.length === 0 &&
    afterDel.proxies?.length === 0 &&
    afterDel.deleted?.groups?.length === 1 &&
    afterDel.deleted?.proxies?.length === 1,
  JSON.stringify(body)
)

// 10. refresh token flow
r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
})
body = await r.json()
r = await fetch(`${BASE}/api/auth/refresh`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ refreshToken: body.refreshToken })
})
body = await r.json()
check('refresh token flow', r.status === 200 && !!body.token, `status ${r.status}`)

// 11. Step 1: Username update + login by username
const customUsername = `bb_user_${String(RUN).slice(-6)}`
r = await fetch(`${BASE}/api/auth/me`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ name: 'Updated Name', username: customUsername })
})
body = await r.json()
check('PATCH /api/auth/me updates name & username', r.status === 200 && body.user?.username === customUsername, JSON.stringify(body))

r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: customUsername, password })
})
body = await r.json()
check('login by username works', r.status === 200 && !!body.token, `status ${r.status}`)

// 12. Step 1: Strong password policy (min 8, upper, lower, digit, current password required)
r = await fetch(`${BASE}/api/auth/change-password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ currentPassword: 'wrongpassword', newPassword: 'ValidPass123' })
})
check('change-password rejects wrong currentPassword (401)', r.status === 401, `status ${r.status}`)

r = await fetch(`${BASE}/api/auth/change-password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ currentPassword: password, newPassword: 'alllowercase123' })
})
check('change-password rejects missing uppercase (400)', r.status === 400, `status ${r.status}`)

const newStrongPassword = 'StrongPassword99'
r = await fetch(`${BASE}/api/auth/change-password`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ currentPassword: password, newPassword: newStrongPassword })
})
check('change-password accepts strong password (200)', r.status === 200, `status ${r.status}`)

// 13. Step 1: TOTP 2FA setup, enable, login enforcement, single-use backup code, disable
r = await fetch(`${BASE}/api/auth/2fa/setup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: '{}'
})
const setupData = await r.json()
check('2fa/setup returns secret and otpauthUrl', r.status === 200 && !!setupData.secret && setupData.otpauthUrl?.startsWith('otpauth://totp/'))

const validTotp = computeTotp(setupData.secret)
r = await fetch(`${BASE}/api/auth/2fa/enable`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ code: validTotp })
})
const enableData = await r.json()
check('2fa/enable verifies TOTP and returns 8 backup codes', r.status === 200 && enableData.enabled === true && enableData.backupCodes?.length === 8)

// Login without TOTP must fail with 401 + totpRequired: true
r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: newStrongPassword })
})
body = await r.json()
check('login without 2FA code rejected with totpRequired=true', r.status === 401 && body.totpRequired === true)

// Login with valid TOTP succeeds
r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: newStrongPassword, totpCode: computeTotp(setupData.secret) })
})
body = await r.json()
check('login with valid 6-digit TOTP code succeeds', r.status === 200 && !!body.token)

// Login with backup code succeeds once, then fails if reused
const firstBackup = enableData.backupCodes[0]
r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: newStrongPassword, totpCode: firstBackup })
})
check('login with single-use backup code succeeds first time', r.status === 200)

r = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: newStrongPassword, totpCode: firstBackup })
})
check('reusing consumed backup code is rejected (401)', r.status === 401)

// Disable 2FA
r = await fetch(`${BASE}/api/auth/2fa/disable`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ password: newStrongPassword })
})
check('2fa/disable with password succeeds', r.status === 200)

// 14. Step 1: Rate limiting on /api/auth/login (exceed 15 attempts for same identifier)
const rateEmail = `ratelimit-${RUN}@brandinbold.app`
let got429 = false
for (let i = 0; i < 18; i++) {
  const rlRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: rateEmail, password: 'bad' })
  })
  if (rlRes.status === 429) {
    got429 = true
    break
  }
}
check('auth rate limiter returns 429 Too Many Requests after burst', got429)

console.log(`\n=== CLOUD API: ${pass} pass / ${failures.length} fail ===`)
if (failures.length) {
  failures.forEach((f) => console.log('FAIL: ' + f))
  process.exit(1)
}
console.log('ALL PASS')
