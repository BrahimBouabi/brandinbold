const BASE = (import.meta.env?.VITE_API_URL as string) ?? 'http://localhost:8787'

export interface CloudUser {
  id: string
  email: string
  name: string
  plan: string
  maxProfiles: number
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
    const err = typeof body === 'object' && body && 'error' in (body as any) ? (body as any).error : `HTTP ${res.status}`
    throw Object.assign(new Error(err), { statusCode: res.status })
  }
  return body
}

export const api = {
  health: () => request('/api/health', {}, false),
  register: (email: string, name: string, password: string) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }, false),
  login: (email: string, password: string) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false),
  me: () => request('/api/auth/me'),
  updateName: (name: string) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  pull: () => request('/api/sync/pull')
}
