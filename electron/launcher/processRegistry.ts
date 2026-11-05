import type { CdpConnection } from '../cdp/connection'
import type { BrowserHandle, ExportedCookie } from '../engine/handle'
import type { LaunchResult, ProfileStatus, RunningInfo } from '@shared/types'

/**
 * Tracks launched profile browsers and their status, like Incogniton's
 * PendingSpawns + InstancesRegistry. Status changes are pushed to the
 * renderer; the REST API reads from here.
 */
export class ProcessRegistry {
  private running = new Map<string, { info: RunningInfo; handle: BrowserHandle | null }>()
  private statuses = new Map<string, { status: ProfileStatus; detail?: string }>()
  private listeners: ((profileId: string, status: ProfileStatus, detail?: string) => void)[] = []

  onStatus(fn: (profileId: string, status: ProfileStatus, detail?: string) => void): void {
    this.listeners.push(fn)
  }

  private setStatus(profileId: string, status: ProfileStatus, detail?: string): void {
    this.statuses.set(profileId, { status, detail })
    for (const fn of this.listeners) fn(profileId, status, detail)
  }

  register(result: LaunchResult, handle: BrowserHandle | null): void {
    this.running.set(result.profileId, {
      info: {
        profileId: result.profileId,
        pid: result.pid,
        debugPort: result.debugPort,
        browserWsUrl: result.browserWsUrl,
        startedAt: Date.now()
      },
      handle
    })
    this.setStatus(result.profileId, 'launched')
  }

  markLaunching(profileId: string): void {
    this.setStatus(profileId, 'launching')
  }

  markError(profileId: string, detail: string): void {
    this.setStatus(profileId, 'error', detail)
  }

  /** Engine tells us the browser exited on its own. */
  onBrowserExit(profileId: string): void {
    if (this.running.has(profileId)) {
      this.running.delete(profileId)
      this.setStatus(profileId, 'ready')
    }
  }

  /** UI/registry-level exit without touching the engine. */
  onHandleClosed(profileId: string): void {
    this.onBrowserExit(profileId)
  }

  get(profileId: string): RunningInfo | null {
    return this.running.get(profileId)?.info ?? null
  }

  getHandle(profileId: string): BrowserHandle | null {
    return this.running.get(profileId)?.handle ?? null
  }

  status(profileId: string): { status: ProfileStatus; detail?: string } {
    return this.statuses.get(profileId) ?? { status: 'ready' }
  }

  listRunning(): RunningInfo[] {
    return [...this.running.values()].map((r) => r.info)
  }

  async stop(profileId: string): Promise<boolean> {
    const entry = this.running.get(profileId)
    if (!entry) {
      const cur = this.statuses.get(profileId)?.status
      if (cur && cur !== 'ready') {
        this.setStatus(profileId, 'ready')
        return true
      }
      return false
    }
    this.setStatus(profileId, 'stopping')
    try {
      await entry.handle?.stop()
    } catch {
      /* fall through */
    }
    this.running.delete(profileId)
    this.setStatus(profileId, 'ready')
    return true
  }
}

export type { BrowserHandle, ExportedCookie, CdpConnection }
