const DEFAULT_API =
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8787'
    : 'https://cloud-api-production-8852.up.railway.app'

const BASE = ((import.meta.env?.VITE_API_URL as string) || DEFAULT_API).replace(/\/+$/, '')

export interface CloudUser {
  id: string
  email: string
  username?: string
  name: string
  plan: string
  maxProfiles: number
  totpEnabled?: boolean
}

export function token(): string | null {
  return localStorage.getItem('bb_token')
}

export function setAuth(tok: string, user: CloudUser): void {
  localStorage.setItem('bb_token', tok)
  localStorage.setItem('bb_user', JSON.stringify(user))
}

export function storedUser(): CloudUser | null {
  try {
    const u = localStorage.getItem('bb_user')
    return u ? (JSON.parse(u) as CloudUser) : null
  } catch {
    return null
  }
}

export function logout(): void {
  localStorage.removeItem('bb_token')
  localStorage.removeItem('bb_user')
}

async function request(path: string, options: RequestInit = {}, auth = true): Promise<any> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {})
  }
  if (auth && token()) headers.authorization = `Bearer ${token()}`
  if (options.body && typeof options.body === 'string') {
    headers['content-type'] = headers['content-type'] ?? 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const ct = res.headers.get('content-type') ?? ''
  const body = ct.includes('json') ? await res.json() : await res.arrayBuffer()
  if (!res.ok) {
    const errObj = typeof body === 'object' && body ? (body as Record<string, any>) : {}
    const msg = typeof errObj.error === 'string' ? errObj.error : `HTTP ${res.status}`
    throw Object.assign(new Error(msg), {
      statusCode: res.status,
      totpRequired: !!errObj.totpRequired
    })
  }
  return body
}

export const api = {
  health: () => request('/api/health', {}, false),
  register: (email: string, name: string, password: string, username?: string) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password, username }) }, false),
  login: (email: string, password: string, totpCode?: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, totpCode }) }, false),
  me: () => request('/api/auth/me'),
  updateName: (name: string) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  updateProfile: (patch: { name?: string; username?: string }) =>
    request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  setup2fa: (): Promise<{ secret: string; otpauthUrl: string }> =>
    request('/api/auth/2fa/setup', { method: 'POST', body: '{}' }),
  enable2fa: (code: string): Promise<{ enabled: boolean; backupCodes: string[] }> =>
    request('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  disable2fa: (payload: { password?: string; code?: string }): Promise<{ enabled: boolean }> =>
    request('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify(payload) }),
  pull: () => request('/api/sync/pull')
}
