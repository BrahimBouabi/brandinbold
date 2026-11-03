import type { CdpConnection } from '../cdp/connection'
import type { ExportedCookie } from '../engine/handle'

export async function exportCdpCookies(cdp: CdpConnection): Promise<ExportedCookie[]> {
  const { cookies } = await cdp.send('Storage.getCookies', {})
  return (cookies as any[]).map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires > 0 ? c.expires : undefined,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite
  }))
}

export async function importCdpCookies(cdp: CdpConnection, cookies: ExportedCookie[]): Promise<number> {
  let n = 0
  for (const c of cookies) {
    const ok = await cdp
      .send('Network.setCookie', {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite ?? 'Lax',
        ...(c.expires && c.expires > 0 ? { expires: c.expires } : {})
      })
      .catch(() => false)
    if (ok) n++
  }
  return n
}
