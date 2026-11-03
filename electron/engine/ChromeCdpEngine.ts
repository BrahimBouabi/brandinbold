import { spawn, ChildProcess } from 'child_process'
import { existsSync, readFileSync, readlinkSync, rmSync } from 'fs'
import { join } from 'path'
import net from 'net'
import { EventEmitter } from 'events'
import type { BrowserEngine } from './BrowserEngine'
import type { EngineLaunch, BrowserHandle, ExportedCookie } from './handle'
import { buildLaunchFlags } from './flags'
import { purgeTransientCaches } from '../launcher/profileCache'
import { CdpConnection } from '../cdp/connection'
import { exportCdpCookies, importCdpCookies } from '../cookies/cdp'
import type { LaunchResult, Profile } from '@shared/types'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
]

const DEVTOOLS_WAIT_MS = 20000

export class ChromeCdpEngine extends EventEmitter implements BrowserEngine {
  readonly id = 'chrome-cdp' as const
  readonly name = 'Google Chrome (CDP)'

  async installedVersion(): Promise<string | null> {
    for (const p of CHROME_CANDIDATES) {
      if (existsSync(p)) return 'installed'
    }
    return null
  }

  async ensureInstalled(onProgress?: (line: string) => void): Promise<void> {
    const v = await this.installedVersion()
    if (!v) throw new Error('No Chrome/Chromium found in /Applications')
    onProgress?.('Chrome available')
  }

  async launch(
    profile: Profile,
    userDataDir: string,
    ipInfo: { timezone?: string; lat?: number; lon?: number; ip?: string } | null
  ): Promise<EngineLaunch> {
    const binary = await this.resolveBinary()
    prepareUserDataDir(userDataDir)
    purgeTransientCaches(userDataDir, 'chromium')
    const flags = buildLaunchFlags(profile, userDataDir)

    const child: ChildProcess = spawn(binary, flags, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    const portFile = join(userDataDir, 'DevToolsActivePort')
    const devtools = await waitForDevToolsInfo(portFile, DEVTOOLS_WAIT_MS, child, userDataDir)

    const cdp = new CdpConnection()
    await cdp.connect(devtools.port, devtools.browserPath, profile, ipInfo)

    const result: LaunchResult = {
      profileId: profile.id,
      engine: this.id,
      pid: child.pid ?? null,
      debugPort: devtools.port,
      browserWsUrl: `ws://127.0.0.1:${devtools.port}${devtools.browserPath}`,
      remoteKind: 'cdp'
    }

    const handle: BrowserHandle = {
      profileId: profile.id,
      pid: child.pid ?? null,
      debugPort: devtools.port,
      remote: { kind: 'cdp', wsUrl: result.browserWsUrl! },
      cookies: {
        async clear() {
          await cdp.send('Network.clearBrowserCookies', {})
        },
        async export() {
          return exportCdpCookies(cdp)
        },
        async import(list: ExportedCookie[]) {
          return importCdpCookies(cdp, list)
        }
      },
      async openUrl(url: string) {
        const { targetInfos } = await cdp.send('Target.getTargets', {})
        const page = (targetInfos as any[]).find((t) => t.type === 'page')
        if (!page) throw new Error('No open page target')
        const { sessionId } = await cdp.send('Target.attachToTarget', {
          targetId: page.targetId,
          flatten: true
        })
        await cdp.send('Page.navigate', { url }, sessionId)
      },
      async stop() {
        await cdp.close().catch(() => {})
        try {
          child.kill('SIGTERM')
        } catch {
          /* gone */
        }
        setTimeout(() => {
          try {
            child.kill('SIGKILL')
          } catch {
            /* gone */
          }
        }, 3000)
        purgeTransientCaches(userDataDir, 'chromium')
      }
    }

    child.once('exit', (code) => {
      this.emit('exit', profile.id, code ?? 0)
      void cdp.close().catch(() => {})
    })

    return { result, handle }
  }

  private async resolveBinary(): Promise<string> {
    for (const p of CHROME_CANDIDATES) {
      if (existsSync(p)) return p
    }
    throw new Error(
      'No Chrome/Chromium found. Install Google Chrome in /Applications, or switch back to the Camoufox engine.'
    )
  }
}

function waitForDevToolsInfo(
  portFile: string,
  timeoutMs: number,
  child: ChildProcess,
  userDataDir: string
): Promise<{ port: number; browserPath: string }> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      void (async () => {
        if (child.exitCode !== null) {
          clearInterval(timer)
          if (child.exitCode === 0 && singletonHolderAlive(userDataDir)) {
            return reject(
              new Error('Profile browser is already running outside this session — stop it first')
            )
          }
          return reject(new Error(`Browser exited during startup (code ${child.exitCode})`))
        }
        if (existsSync(portFile)) {
          try {
            const lines = readFileSync(portFile, 'utf8').trim().split('\n')
            const port = parseInt(lines[0], 10)
            const browserPath = lines[1]?.trim() || '/devtools/browser'
            if (Number.isFinite(port) && port > 0 && (await canConnect(port))) {
              clearInterval(timer)
              return resolve({ port, browserPath })
            }
          } catch {
            /* file not fully written yet */
          }
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer)
          reject(new Error('Timed out waiting for DevToolsActivePort'))
        }
      })()
    }, 150)
  })
}

/** Remove leftovers from a previous crashed run that would break a fresh launch. */
function prepareUserDataDir(dir: string): void {
  rmSync(join(dir, 'DevToolsActivePort'), { force: true })
  try {
    const target = readlinkSync(join(dir, 'SingletonLock'))
    const m = target.match(/-(\d+)$/)
    if (m) {
      const pid = parseInt(m[1], 10)
      let alive = false
      try {
        process.kill(pid, 0)
        alive = true
      } catch {
        /* dead */
      }
      if (!alive) {
        for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
          rmSync(join(dir, f), { force: true })
        }
      }
    }
  } catch {
    /* no lock present */
  }
}

function singletonHolderAlive(dir: string): boolean {
  try {
    const target = readlinkSync(join(dir, 'SingletonLock'))
    const m = target.match(/-(\d+)$/)
    if (!m) return false
    try {
      process.kill(parseInt(m[1], 10), 0)
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

function canConnect(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' })
    const done = (ok: boolean) => {
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('error', () => done(false))
    sock.once('timeout', () => done(false))
  })
}
