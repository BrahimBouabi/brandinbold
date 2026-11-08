/**
 * Cloud client (TASK 10 Étape 2.4 + Step 1) — HTTP surface of cloud/api for the
 * Electron main process. Framework-free: config (api url + token store) is
 * injected, so the module is testable standalone via esbuild.
 */

export interface CloudUser {
  id: string
  email: string
  username?: string
  name: string
  plan: string
  maxProfiles: number
  totpEnabled?: boolean
}

export interface RejectedProfile {
  id: string
  name: string
  reason: 'quota_exceeded'
  maxProfiles: number
}

export interface CloudPushResponse {
  profiles: number
  groups: number
  proxies: number
  deleted: number
  skipped: number
  maxProfiles?: number
  activeProfiles?: number
  rejectedProfiles?: RejectedProfile[]
}

export interface CloudClientConfig {
  apiUrl: string
  getToken(): string | null
  getRefreshToken(): string | null
  setTokens(access: string | null, refresh: string | null): void
}

export function createCloudClient(cfg: CloudClientConfig) {
  async function raw(path: string, options: RequestInit = {}, auth = true): Promise<Response> {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}) }
    const tok = cfg.getToken()
    if (auth && tok) headers.authorization = `Bearer ${tok}`
    if (options.body && typeof options.body === 'string') headers['content-type'] = headers['content-type'] ?? 'application/json'
    return fetch(`${cfg.apiUrl}${path}`, { ...options, headers })
  }

  async function refreshTokens(): Promise<boolean> {
    const rt = cfg.getRefreshToken()
    if (!rt) return false
    try {
      const res = await fetch(`${cfg.apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt })
      })
      if (!res.ok) return false
      const body = (await res.json()) as { token: string; refreshToken?: string }
      cfg.setTokens(body.token, body.refreshToken ?? rt)
      return true
    } catch {
      return false
    }
  }

  async function request(path: string, options: RequestInit = {}, auth = true): Promise<any> {
    let res = await raw(path, options, auth)
    if (res.status === 401 && auth && (await refreshTokens())) {
      res = await raw(path, options, auth)
    }
    const ct = res.headers.get('content-type') ?? ''
    const parsed: unknown = ct.includes('json') ? await res.json() : res
    if (!res.ok) {
      const errObj = typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {}
      const msg = 'error' in errObj ? String(errObj.error) : `HTTP ${res.status}`
      const prefix = errObj.totpRequired ? '[2FA_REQUIRED] ' : ''
      throw Object.assign(new Error(prefix + msg), {
        statusCode: res.status,
        totpRequired: !!errObj.totpRequired
      })
    }
    return parsed
  }

  return {
    health: () => raw('/api/health', {}, false).then((r) => r.ok).catch(() => false),
    register: async (email: string, name: string, password: string, username?: string) => {
      const body = await request(
        '/api/auth/register',
        { method: 'POST', body: JSON.stringify({ email, name, password, username }) },
        false
      )
      cfg.setTokens(body.token, body.refreshToken)
      return body as { user: CloudUser }
    },
    login: async (email: string, password: string, totpCode?: string) => {
      const body = await request(
        '/api/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password, totpCode }) },
        false
      )
      cfg.setTokens(body.token, body.refreshToken)
      return body as { user: CloudUser }
    },
    logout: () => cfg.setTokens(null, null),
    me: () => request('/api/auth/me') as Promise<{ user: CloudUser }>,
    updateProfile: (patch: { name?: string; username?: string }) =>
      request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<{ ok: boolean; user: CloudUser }>,
    changePassword: (currentPassword: string, newPassword: string) =>
      request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
    pull: () => request('/api/sync/pull'),
    push: async (payload: { profiles?: unknown[]; groups?: unknown[]; proxies?: unknown[]; deleted?: unknown }): Promise<CloudPushResponse> =>
      await request('/api/sync/push', { method: 'PUT', body: JSON.stringify(payload) }),
    deleteProfile: (id: string) => request(`/api/profiles/${id}`, { method: 'DELETE' }),
    uploadSession: (profileId: string, data: Buffer): Promise<{ size: number; updatedAt?: string }> =>
      request(`/api/profiles/${profileId}/session-state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: data
      }),
    downloadSessionMeta: async (profileId: string): Promise<{ updatedAt: string } | null> => {
      try {
        const res = await raw(`/api/profiles/${profileId}/session-state/meta`, { method: 'GET' }, true)
        if (!res.ok) return null
        return (await res.json()) as { updatedAt: string }
      } catch {
        return null
      }
    },
    downloadSession: async (profileId: string): Promise<Buffer | null> => {
      try {
        const res = await raw(`/api/profiles/${profileId}/session-state`, { method: 'GET' }, true)
        if (!res.ok) return null
        return Buffer.from(await res.arrayBuffer())
      } catch {
        return null
      }
    }
  }
}

export type CloudClient = ReturnType<typeof createCloudClient>
