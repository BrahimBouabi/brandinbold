import type { LaunchResult } from '@shared/types'

export interface ExportedCookie {
  name: string
  value: string
  domain: string
  path: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

/** Cookie access of a running profile browser, however the engine talks to it. */
export interface CookieAccess {
  export(): Promise<ExportedCookie[]>
  import(cookies: ExportedCookie[]): Promise<number>
  clear?(): Promise<void>
}

/**
 * A running profile browser, engine-agnostic. The manager only ever talks
 * to this surface, so a ChromiumEngine can be added later without touching
 * anything above the engine layer.
 */
export interface BrowserHandle {
  profileId: string
  pid: number | null
  debugPort: number | null
  /** Remote-automation endpoint, when the engine provides one. */
  remote: { kind: 'cdp' | 'playwright'; wsUrl: string } | null
  cookies: CookieAccess | null
  openUrl(url: string): Promise<void>
  stop(): Promise<void>
}

export interface EngineLaunch {
  result: LaunchResult
  handle: BrowserHandle
}
