import type { BrowserHandle, ExportedCookie } from '../engine/handle'
import type { ProcessRegistry } from '../launcher/processRegistry'
import type { ProfileStore } from '../store/db'
import type { LaunchResult, Profile } from '@shared/types'
import { checkProxy } from '../proxy/checker'
import { ensureFingerprint } from '../fingerprint/pinning'
import type { BrowserEngine } from '../engine/BrowserEngine'

/**
 * The launch pipeline (mirrors Incogniton's StartLauncherAction):
 * ensure fingerprint pinned -> validate engine -> proxy check + IP info ->
 * launch through the engine (native fingerprint application) -> register.
 */
export class Launcher {
  constructor(
    private engine: BrowserEngine,
    private registry: ProcessRegistry,
    private store: ProfileStore
  ) {}

  setEngine(engine: BrowserEngine): void {
    this.engine = engine
  }

  async launch(profile: Profile, opts?: { extraArgs?: string; openUrlAfter?: string }): Promise<LaunchResult> {
    if (this.registry.get(profile.id)) {
      throw new Error('Profile is already running')
    }
    this.registry.markLaunching(profile.id)
    try {
      // per-launch options (Launch Options submenu): extra args + URL to open
      if (opts?.extraArgs) {
        profile = {
          ...profile,
          customArgsEnabled: true,
          customArgs: [profile.customArgs, opts.extraArgs].filter(Boolean).join(' ')
        }
      }

      // resolve library proxy reference into the effective proxy config
      const libProxy = profile.proxyId ? this.store.getProxy(profile.proxyId) : null
      if (libProxy) {
        profile = {
          ...profile,
          proxy: {
            type: libProxy.type,
            host: libProxy.host,
            port: libProxy.port,
            username: libProxy.username,
            password: libProxy.password
          }
        }
      }

      // stage 1: validate browser FIRST (downloads the engine on fresh installs)
      await this.engine.ensureInstalled()

      // stage 0: pin the fingerprint once — same identity every session
      const pinned = await ensureFingerprint(profile)
      if (pinned) {
        profile = { ...profile, fingerprint: pinned }
        this.store.save(profile)
      }


      // stage 2: proxy check + IP info (feeds geoip and custom geo modes)
      const ipInfo = await checkProxy(profile.proxy)
      if (profile.proxy.type !== 'none' && !ipInfo.ok) {
        this.registry.markError(profile.id, `Proxy check failed: ${ipInfo.error}`)
        throw new Error(`Proxy check failed: ${ipInfo.error}`)
      }

      // stages 3-5: engine builds config, applies fingerprint natively, spawns
      const { join } = await import('path')
      const { app } = await import('electron')
      const userDataDir = join(app.getPath('userData'), 'profiles', profile.id)
      const { mkdir } = await import('fs/promises')
      await mkdir(userDataDir, { recursive: true })
      const { result, handle } = await this.engine.launch(profile, userDataDir, ipInfo)

      this.registry.register(result, handle)
      this.store.save({
        ...profile,
        lastLaunchedAt: new Date().toISOString(),
        browserVersion: this.engine.name
      })
      return result
    } catch (e: any) {
      this.registry.markError(profile.id, e.message)
      throw e
    }
  }

  async stop(profileId: string): Promise<boolean> {
    return this.registry.stop(profileId)
  }
}

export type { BrowserHandle }
