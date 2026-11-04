import Fastify from 'fastify'
import cors from '@fastify/cors'
import { and, eq } from 'drizzle-orm'
import { MIGRATION_SQL } from './db/migrate.js'
import { db, pool } from './db/index.js'
import { sessionArchives, users } from './db/schema.js'
import { register, login, refresh, updateName, changePassword } from './routes/auth.js'
import { pull, push, deleteProfile, putSessionState, getSessionState, userExists } from './routes/sync.js'
import { authHook } from './lib/auth.js'

/**
 * Brandinbold Cloud API — TASK 10 Étape 2.2.
 * Auth (JWT) + profile/group/proxy sync + roaming session archives.
 * Migrations run at boot (idempotent DDL) so Railway deployments self-migrate.
 */

const app = Fastify({ logger: false, bodyLimit: 60 * 1024 * 1024 })

// raw binary bodies for the session-archive endpoint
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})

async function main(): Promise<void> {
  await app.register(cors, { origin: true })

  // migrations at boot
  {
    const client = await pool.connect()
    try {
      await client.query(MIGRATION_SQL)
      app.log.info('migrations OK')
    } finally {
      client.release()
    }
  }

app.get('/api/health', async () => ({ alive: true, app: 'Brandinbold Cloud API', version: '0.1.0' }))

// ---------- auth ----------
app.post('/api/auth/register', async (req, reply) => {
  const body = (req.body ?? {}) as { email?: string; name?: string; password?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: 'Invalid email' })
  if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
  try {
    return await register(email, (body.name ?? '').trim(), password)
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ error: e.message })
  }
})

app.post('/api/auth/login', async (req, reply) => {
  const body = (req.body ?? {}) as { email?: string; password?: string }
  try {
    return await login((body.email ?? '').trim().toLowerCase(), body.password ?? '')
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ error: e.message })
  }
})

app.post('/api/auth/refresh', async (req, reply) => {
  const body = (req.body ?? {}) as { refreshToken?: string }
  try {
    return await refresh(body.refreshToken ?? '')
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ error: e.message })
  }
})

// ---------- sync (auth required) ----------
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/sync') && !req.url.startsWith('/api/profiles') && !req.url.startsWith('/api/auth/me')) return
  const user = authHook(req)
  if (!user) return reply.code(401).send({ error: 'Unauthorized' })
  ;(req as any).user = user
  if (!(await userExists(user.sub))) return reply.code(401).send({ error: 'User no longer exists' })
})

app.get('/api/auth/me', async (req, reply) => {
  const user = authHook(req)
  if (!user) return reply.code(401).send({ error: 'Unauthorized' })
  const rows = await db.select().from(users).where(eq(users.id, user.sub))
  if (!rows.length) return reply.code(401).send({ error: 'User not found' })
  const u = rows[0]
  return { user: { id: u.id, email: u.email, name: u.name, plan: u.plan, maxProfiles: u.maxProfiles } }
})

app.patch('/api/auth/me', async (req, reply) => {
  const user = authHook(req)
  if (!user) return reply.code(401).send({ error: 'Unauthorized' })
  const body = (req.body ?? {}) as { name?: string }
  if (!body.name?.trim()) return reply.code(400).send({ error: 'Name required' })
  await updateName(user.sub, body.name.trim())
  return { ok: true }
})

app.post('/api/auth/change-password', async (req, reply) => {
  const user = authHook(req)
  if (!user) return reply.code(401).send({ error: 'Unauthorized' })
  const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string }
  try {
    await changePassword(user.sub, body.currentPassword ?? '', body.newPassword ?? '')
    return { ok: true }
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ error: e.message })
  }
})

app.get('/api/sync/pull', async (req) => {
  const user = (req as any).user as { sub: string }
  return pull(user.sub)
})

app.put('/api/sync/push', async (req, reply) => {
  const user = (req as any).user as { sub: string }
  try {
    const rows = await db.select().from(users).where(eq(users.id, user.sub))
    if (!rows.length) return reply.code(401).send({ error: 'User not found' })
    return await push(user.sub, (req.body ?? {}) as any, rows[0].maxProfiles)
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ error: e.message })
  }
})

app.delete('/api/profiles/:id', async (req, reply) => {
  const user = (req as any).user as { sub: string }
  const { id } = req.params as { id: string }
  const ok = await deleteProfile(user.sub, id)
  return ok ? { deleted: true } : reply.code(404).send({ error: 'Profile not found' })
})

// ---------- roaming session archives ----------
app.put('/api/profiles/:id/session-state', async (req, reply) => {
  const user = (req as any).user as { sub: string }
  const { id } = req.params as { id: string }
  try {
    const buf = (req.body ?? Buffer.alloc(0)) as Buffer
    return await putSessionState(user.sub, id, buf)
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ error: e.message })
  }
})

app.get('/api/profiles/:id/session-state/meta', async (req, reply) => {
  const user = (req as any).user as { sub: string }
  const { id } = req.params as { id: string }
  const rows = await db
    .select()
    .from(sessionArchives)
    .where(and(eq(sessionArchives.profileId, id), eq(sessionArchives.userId, user.sub)))
  if (!rows.length) return reply.code(404).send({ error: 'No session archive' })
  return { updatedAt: rows[0].updatedAt, size: rows[0].size }
})

app.get('/api/profiles/:id/session-state', async (req, reply) => {
  const user = (req as any).user as { sub: string }
  const { id } = req.params as { id: string }
  const data = await getSessionState(user.sub, id)
  if (!data) return reply.code(404).send({ error: 'No session archive' })
  reply.header('content-type', 'application/octet-stream')
  return data
})

  const port = Number(process.env.PORT ?? 8787)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Brandinbold Cloud API listening on :${port}`)
}

main().catch((e) => {
  console.error('fatal:', e)
  process.exit(1)
})
