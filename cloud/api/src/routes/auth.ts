import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { hashPassword, verifyPassword, signToken, signRefreshToken, verifyRefreshToken, type TokenUser } from '../lib/auth.js'

export interface AuthResult {
  token: string
  refreshToken: string
  user: { id: string; email: string; name: string; plan: string; maxProfiles: number }
}

function toUser(u: typeof users.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, plan: u.plan, maxProfiles: u.maxProfiles }
}

export async function register(email: string, name: string, password: string): Promise<AuthResult> {
  const existing = await db.select().from(users).where(eq(users.email, email))
  if (existing.length) throw Object.assign(new Error('Email already registered'), { statusCode: 409 })
  const inserted = await db
    .insert(users)
    .values({ email, name: name || email.split('@')[0], passwordHash: hashPassword(password) })
    .returning()
  const u = toUser(inserted[0])
  const tu: TokenUser = { sub: u.id, email: u.email }
  return { token: signToken(tu), refreshToken: signRefreshToken(tu), user: u }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const found = await db.select().from(users).where(eq(users.email, email))
  if (!found.length || !verifyPassword(password, found[0].passwordHash)) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 })
  }
  const u = toUser(found[0])
  const tu: TokenUser = { sub: u.id, email: u.email }
  return { token: signToken(tu), refreshToken: signRefreshToken(tu), user: u }
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const tu = verifyRefreshToken(refreshToken)
  if (!tu) throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 })
  const found = await db.select().from(users).where(eq(users.id, tu.sub))
  if (!found.length) throw Object.assign(new Error('User not found'), { statusCode: 401 })
  const u = toUser(found[0])
  return { token: signToken(tu), refreshToken: signRefreshToken(tu), user: u }
}

export async function updateName(userId: string, name: string): Promise<void> {
  await db.update(users).set({ name }).where(eq(users.id, userId))
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId))
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  if (!verifyPassword(currentPassword, rows[0].passwordHash)) {
    throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 })
  }
  if (newPassword.length < 8) throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 })
  await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, userId))
}
