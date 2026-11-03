/* TASK 10 Étape 2.2 acceptance — cloud API end-to-end.
 * register → login → me → push (profiles/groups/proxies) → pull →
 * plan-limit enforcement → session-state upload/download → delete. */
import { gzipSync } from 'zlib'

const BASE = process.env.CLOUD_API_URL ?? 'http://localhost:8787'

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
check('register', r.status === 200 && !!body.token, `status ${r.status}`)
const { token, user } = body

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
console.log('   debug pull:', JSON.stringify(body).slice(0, 200))
check('pull profiles', body.profiles?.length === 2)
check('pull groups', body.groups?.length === 1 && body.groups[0].name === 'Cloud Group')
check('pull proxies', body.proxies?.length === 1)

// 7. plan limit (free = 3 max) — pushing 4 profiles → 403
r = await fetch(`${BASE}/api/sync/push`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ profiles: [1, 2, 3, 4].map((i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, name: `X${i}`, updatedAt: new Date().toISOString() })) })
})
check('plan limit enforced (4 > free 3 → 403)', r.status === 403, `status ${r.status}`)

// 8. session archive upload (gzip tar-like blob) + download round-trip
const archive = gzipSync(Buffer.from('fake-tar:cookies.sqlite|sessionstore-backups|places.sqlite'))
r = await fetch(`${BASE}/api/profiles/${profileDocs[0].id}/session-state`, {
  method: 'PUT',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' },
  body: archive
})
body = await r.json()
check('session-state upload', r.status === 200 && body.size === archive.length, `size ${body.size}`)

r = await fetch(`${BASE}/api/profiles/${profileDocs[0].id}/session-state`, {
  headers: { authorization: `Bearer ${token}` }
})
const back = Buffer.from(await r.arrayBuffer())
check('session-state download identical', r.status === 200 && back.equals(archive), `bytes ${back.length}`)

// 9. delete profile (tombstone) → pull excludes it
r = await fetch(`${BASE}/api/profiles/${profileDocs[1].id}`, {
  method: 'DELETE',
  headers: { authorization: `Bearer ${token}` }
})
r = await fetch(`${BASE}/api/sync/pull`, { headers: { authorization: `Bearer ${token}` } })
body = await r.json()
check('delete tombstone + pull excludes', body.profiles?.length === 1, `remaining ${body.profiles?.length}`)

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

console.log(`\n=== CLOUD API: ${pass} pass / ${failures.length} fail ===`)
if (failures.length) { failures.forEach((f) => console.log('FAIL: ' + f)); process.exit(1) }
console.log('ALL PASS')
