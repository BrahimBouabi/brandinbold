import Fastify from 'fastify'
import cors from '@fastify/cors'
import { and, eq } from 'drizzle-orm'
import { MIGRATION_SQL } from './db/migrate.js'
import { db, pool } from './db/index.js'
import { sessionArchives, users } from './db/schema.js'
import {
  register,
  login,
  refresh,
  updateProfile,
  changePassword,
  setup2fa,
  enable2fa,
  disable2fa,
  toUser
} from './routes/auth.js'
import { pull, push, deleteProfile, putSessionState, getSessionState, userExists } from './routes/sync.js'
import { authHook } from './lib/auth.js'
import { checkRateLimit } from './lib/rateLimit.js'

/**
 * Brandinbold Cloud API — TASK 10 + Step 1 (Auth, Username, Strong Password, TOTP 2FA, Rate Limiting, Partial Quota Sync).
 * Migrations run at boot (idempotent DDL) so Railway deployments self-migrate.
 */

const app = Fastify({ logger: false, bodyLimit: 60 * 1024 * 1024 })

// raw binary bodies for the session-archive endpoint
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
  done(null, body)
})

function clientIp(req: any): string {
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim()
  return req.ip || '127.0.0.1'
}

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
    const body = (req.body ?? {}) as { email?: string; name?: string; username?: string; password?: string }
    const email = (body.email ?? '').trim().toLowerCase()
    const rl = checkRateLimit(`register:${clientIp(req)}:${email}`)
    if (!rl.allowed) {
      reply.header('Retry-After', String(rl.retryAfterSec))
      return reply.code(429).send({ error: 'Too many attempts. Please try again later.', retryAfter: rl.retryAfterSec })
    }
    const password = body.password ?? ''
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: 'Invalid email' })
    if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
    try {
      return await register(email, (body.name ?? '').trim(), password, body.username)
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; password?: string; totpCode?: string }
    const identifier = (body.email ?? '').trim().toLowerCase()
    const rl = checkRateLimit(`login:${clientIp(req)}:${identifier}`)
    if (!rl.allowed) {
      reply.header('Retry-After', String(rl.retryAfterSec))
      return reply.code(429).send({ error: 'Too many sign-in attempts. Please try again later.', retryAfter: rl.retryAfterSec })
    }
    try {
      return await login(identifier, body.password ?? '', body.totpCode)
    } catch (e: any) {
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message, ...(e.totpRequired ? { totpRequired: true } : {}) })
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

  // ---------- sync & account (auth required) ----------
  app.addHook('onRequest', async (req, reply) => {
    if (
      !req.url.startsWith('/api/sync') &&
      !req.url.startsWith('/api/profiles') &&
      !req.url.startsWith('/api/auth/me') &&
      !req.url.startsWith('/api/auth/change-password') &&
      !req.url.startsWith('/api/auth/2fa')
    ) {
      return
    }
    const user = authHook(req)
    if (!user) return reply.code(401).send({ error: 'Unauthorized' })
    ;(req as any).user = user
    if (!(await userExists(user.sub))) return reply.code(401).send({ error: 'User no longer exists' })
  })

  app.get('/api/auth/me', async (req, reply) => {
    const user = (req as any).user as { sub: string }
    const rows = await db.select().from(users).where(eq(users.id, user.sub))
    if (!rows.length) return reply.code(401).send({ error: 'User not found' })
    return { user: toUser(rows[0]) }
  })

  app.patch('/api/auth/me', async (req, reply) => {
    const user = (req as any).user as { sub: string }
    const body = (req.body ?? {}) as { name?: string; username?: string }
    try {
      const updated = await updateProfile(user.sub, body)
      return { ok: true, user: updated }
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post('/api/auth/change-password', async (req, reply) => {
    const user = (req as any).user as { sub: string }
    const rl = checkRateLimit(`pw:${clientIp(req)}:${user.sub}`)
    if (!rl.allowed) {
      reply.header('Retry-After', String(rl.retryAfterSec))
      return reply.code(429).send({ error: 'Too many password change attempts. Please try again later.', retryAfter: rl.retryAfterSec })
    }
    const body = (req.body ?? {}) as { currentPassword?: string; newPassword?: string }
    try {
      await changePassword(user.sub, body.currentPassword ?? '', body.newPassword ?? '')
      return { ok: true }
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post('/api/auth/2fa/setup', async (req, reply) => {
    const user = (req as any).user as { sub: string }
    try {
      return await setup2fa(user.sub)
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post('/api/auth/2fa/enable', async (req, reply) => {
    const user = (req as any).user as { sub: string }
    const rl = checkRateLimit(`2fa:${clientIp(req)}:${user.sub}`)
    if (!rl.allowed) {
      reply.header('Retry-After', String(rl.retryAfterSec))
      return reply.code(429).send({ error: 'Too many 2FA attempts. Please try again later.', retryAfter: rl.retryAfterSec })
    }
    const body = (req.body ?? {}) as { code?: string }
    try {
      return await enable2fa(user.sub, body.code ?? '')
    } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post('/api/auth/2fa/disable', async (req, reply) => {
    const user = (req as any).user as { sub: string }
    const rl = checkRateLimit(`2fa:${clientIp(req)}:${user.sub}`)
    if (!rl.allowed) {
      reply.header('Retry-After', String(rl.retryAfterSec))
      return reply.code(429).send({ error: 'Too many 2FA attempts. Please try again later.', retryAfter: rl.retryAfterSec })
    }
    const body = (req.body ?? {}) as { password?: string; code?: string }
    try {
      return await disable2fa(user.sub, body)
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
