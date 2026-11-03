import type { Profile } from '@shared/types'
import type { ExportedCookie } from '../engine/handle'
import { parseNetscapeFormat } from './importExport'

/** Parse the four supported paste formats; returns null on invalid data. */
export function parsePendingCookies(
  pending: NonNullable<Profile['pendingCookies']>
): ExportedCookie[] | null {
  try {
    let raw = pending.raw
    if (pending.format === 'b64json' || pending.format === 'b64netscape') {
      raw = Buffer.from(raw.trim(), 'base64').toString('utf8')
    }
    if (pending.format === 'json' || pending.format === 'b64json') {
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return null
      return arr.map((c: any) => ({
        name: String(c.name ?? ''),
        value: String(c.value ?? ''),
        domain: String(c.domain ?? ''),
        path: String(c.path ?? '/'),
        expires: typeof c.expirationDate === 'number' ? c.expirationDate : c.expires,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite:
          c.sameSite === 'no_restriction'
            ? 'None'
            : c.sameSite === 'strict'
              ? 'Strict'
              : c.sameSite === 'lax'
                ? 'Lax'
                : undefined
      }))
    }
    return parseNetscapeFormat(raw)
  } catch {
    return null
  }
}
