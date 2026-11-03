import type { EngineId, LaunchResult, Profile } from '@shared/types'
import type { EngineLaunch, BrowserHandle } from './handle'

/**
 * Engine abstraction. Everything above this layer (launcher, registry,
 * REST API, UI) only sees BrowserHandle, so engines are pluggable.
 */
export interface BrowserEngine {
  readonly id: EngineId
  readonly name: string
  /** Human-readable version of the installed browser binary, if any. */
  installedVersion(): Promise<string | null>
  /** Download/install the browser if missing. Reports progress lines. */
  ensureInstalled(onProgress?: (line: string) => void): Promise<void>
  launch(
    profile: Profile,
    userDataDir: string,
    ipInfo: { timezone?: string; lat?: number; lon?: number; ip?: string } | null
  ): Promise<EngineLaunch>
}
