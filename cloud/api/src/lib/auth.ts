import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_TTL = '7d'
const REFRESH_TTL = '30d'

export interface TokenUser {
  sub: string
  email: string
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash)
}

export function signToken(user: TokenUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_TTL })
}

export function signRefreshToken(user: TokenUser): string {
  return jwt.sign({ ...user, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_TTL })
}

export function verifyToken(token: string): TokenUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenUser & { type?: string }
    if (payload.type === 'refresh') return null // refresh tokens are not access tokens
    return { sub: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): TokenUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenUser & { type?: string }
    if (payload.type !== 'refresh') return null
    return { sub: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function authHook(request: { headers: Record<string, unknown> }): TokenUser | null {
  const raw = request.headers.authorization
  const header = Array.isArray(raw) ? raw[0] : raw
  if (!header || !header.startsWith('Bearer ')) return null
  return verifyToken(header.slice(7))
}
