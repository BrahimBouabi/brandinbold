import { and, eq, ne, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { hashPassword, verifyPassword, signToken, signRefreshToken, verifyRefreshToken, type TokenUser } from '../lib/auth.js'
import {
  buildOtpAuthUri,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotp
} from '../lib/totp.js'

export interface CloudUserDto {
  id: string
  email: string
  username: string
  name: string
  plan: string
  maxProfiles: number
  totpEnabled: boolean
}

export interface AuthResult {
  token: string
  refreshToken: string
  user: CloudUserDto
}

const USERNAME_RE = /^[a-z0-9_.-]{3,30}$/

export function toUser(u: typeof users.$inferSelect): CloudUserDto {
  const fallbackUsername = u.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) || 'user'
  return {
    id: u.id,
    email: u.email,
    username: u.username || fallbackUsername,
    name: u.name,
    plan: u.plan,
    maxProfiles: u.maxProfiles,
    totpEnabled: !!u.totpEnabled
  }
}

export function validateStrongPassword(pw: string): string | null {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(pw)) return 'Password must include at least one uppercase letter'
  if (!/[a-z]/.test(pw)) return 'Password must include at least one lowercase letter'
  if (!/[0-9]/.test(pw)) return 'Password must include at least one digit'
  return null
}

async function resolveUniqueUsername(preferred: string): Promise<string> {
  let base = preferred.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24)
  if (base.length < 3) base = `user_${base || 'bb'}`
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, base))
  if (!existing.length) return base
  return `${base.slice(0, 20)}_${Math.floor(1000 + Math.random() * 9000)}`
}

export async function register(email: string, name: string, password: string, username?: string): Promise<AuthResult> {
  const existing = await db.select().from(users).where(eq(users.email, email))
  if (existing.length) throw Object.assign(new Error('Email already registered'), { statusCode: 409 })

  let finalUsername: string
  if (username && username.trim()) {
    const clean = username.trim().toLowerCase()
    if (!USERNAME_RE.test(clean)) {
      throw Object.assign(new Error('Username must be 3-30 characters (letters, digits, _, ., -)'), { statusCode: 400 })
    }
    const taken = await db.select({ id: users.id }).from(users).where(eq(users.username, clean))
    if (taken.length) throw Object.assign(new Error('Username already taken'), { statusCode: 409 })
    finalUsername = clean
  } else {
    finalUsername = await resolveUniqueUsername(email.split('@')[0])
  }

  const inserted = await db
    .insert(users)
    .values({
      email,
      username: finalUsername,
      name: name || email.split('@')[0],
      passwordHash: hashPassword(password)
    })
    .returning()
  const u = toUser(inserted[0])
  const tu: TokenUser = { sub: u.id, email: u.email }
  return { token: signToken(tu), refreshToken: signRefreshToken(tu), user: u }
}

export async function login(identifier: string, password: string, totpCode?: string): Promise<AuthResult> {
  const cleanId = identifier.trim().toLowerCase()
  const found = await db
    .select()
    .from(users)
    .where(or(eq(users.email, cleanId), eq(users.username, cleanId)))
  if (!found.length || !verifyPassword(password, found[0].passwordHash)) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 })
  }
  const row = found[0]
  if (row.totpEnabled && row.totpSecret) {
    const code = (totpCode ?? '').trim()
    if (!code) {
      throw Object.assign(new Error('Two-factor authentication code required'), {
        statusCode: 401,
        totpRequired: true
      })
    }
    const totpOk = verifyTotp(row.totpSecret, code)
    if (!totpOk) {
      const backup = consumeBackupCode(code, row.totpBackupCodes)
      if (!backup.matched) {
        throw Object.assign(new Error('Invalid 2FA verification code'), {
          statusCode: 401,
          totpRequired: true
        })
      }
      await db.update(users).set({ totpBackupCodes: backup.remainingJson }).where(eq(users.id, row.id))
    }
  }
  const u = toUser(row)
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

export async function updateProfile(
  userId: string,
  patch: { name?: string; username?: string }
): Promise<CloudUserDto> {
  const updates: Partial<typeof users.$inferInsert> = {}
  if (patch.name !== undefined) {
    const cleanName = patch.name.trim()
    if (!cleanName) throw Object.assign(new Error('Name required'), { statusCode: 400 })
    updates.name = cleanName
  }
  if (patch.username !== undefined) {
    const cleanUsername = patch.username.trim().toLowerCase()
    if (!USERNAME_RE.test(cleanUsername)) {
      throw Object.assign(new Error('Username must be 3-30 characters (letters, digits, _, ., -)'), { statusCode: 400 })
    }
    const conflict = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, cleanUsername), ne(users.id, userId)))
    if (conflict.length) {
      throw Object.assign(new Error('Username already taken'), { statusCode: 409 })
    }
    updates.username = cleanUsername
  }
  if (Object.keys(updates).length === 0) {
    throw Object.assign(new Error('Name or username required'), { statusCode: 400 })
  }
  const updated = await db.update(users).set(updates).where(eq(users.id, userId)).returning()
  if (!updated.length) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  return toUser(updated[0])
}

export async function updateName(userId: string, name: string): Promise<void> {
  await updateProfile(userId, { name })
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId))
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  if (!currentPassword || !verifyPassword(currentPassword, rows[0].passwordHash)) {
    throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 })
  }
  const policyErr = validateStrongPassword(newPassword)
  if (policyErr) {
    throw Object.assign(new Error(policyErr), { statusCode: 400 })
  }
  await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, userId))
}

export async function setup2fa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
  const rows = await db.select().from(users).where(eq(users.id, userId))
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  const secret = generateTotpSecret()
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, userId))
  return {
    secret,
    otpauthUrl: buildOtpAuthUri(rows[0].email, secret)
  }
}

export async function enable2fa(userId: string, code: string): Promise<{ enabled: true; backupCodes: string[] }> {
  const rows = await db.select().from(users).where(eq(users.id, userId))
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  const secret = rows[0].totpSecret
  if (!secret) throw Object.assign(new Error('Run 2FA setup first'), { statusCode: 400 })
  if (!verifyTotp(secret, code)) {
    throw Object.assign(new Error('Invalid 6-digit authenticator code'), { statusCode: 400 })
  }
  const { plain, hashes } = generateBackupCodes(8)
  await db
    .update(users)
    .set({ totpEnabled: true, totpBackupCodes: JSON.stringify(hashes) })
    .where(eq(users.id, userId))
  return { enabled: true, backupCodes: plain }
}

export async function disable2fa(
  userId: string,
  opts: { password?: string; code?: string }
): Promise<{ enabled: false }> {
  const rows = await db.select().from(users).where(eq(users.id, userId))
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 })
  const row = rows[0]
  let verified = false
  if (opts.password && verifyPassword(opts.password, row.passwordHash)) {
    verified = true
  } else if (opts.code && row.totpSecret) {
    if (verifyTotp(row.totpSecret, opts.code)) {
      verified = true
    } else if (consumeBackupCode(opts.code, row.totpBackupCodes).matched) {
      verified = true
    }
  }
  if (!verified) {
    throw Object.assign(new Error('Valid password or 2FA code required to disable 2FA'), { statusCode: 401 })
  }
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, totpBackupCodes: null })
    .where(eq(users.id, userId))
  return { enabled: false }
}
