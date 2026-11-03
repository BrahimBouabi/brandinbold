import Fastify from 'fastify'
import type { ProfileStore } from '../store/db'
import type { ProcessRegistry } from '../launcher/processRegistry'
import type { Launcher } from '../launcher/launcher'
import { app } from 'electron'
import type { Profile } from '@shared/types'

/**
 * Local automation API, loopback-only, mirroring Incogniton's REST surface
 * (their AutomationRestService on 127.0.0.1:35000). Like their
 * LocalOriginPolicy we reject requests whose Host header is not loopback,
 * so external pages cannot DNS-rebind into this API.
 */
export class AutomationApi {
  readonly app = Fastify({ logger: false })
  private port: number | null = null

  constructor(
    private store: ProfileStore,
    private registry: ProcessRegistry,
    private launcher: Launcher,
    private onPort: (port: number | null) => void
  ) {
    this.registerRoutes()
  }

  private registerRoutes(): void {
    this.app.addHook('onRequest', async (req, reply) => {
      const host = String(req.headers.host ?? '')
      const okHost = host.startsWith('127.0.0.1:') || host.startsWith('localhost:')
      if (!okHost) {
        return reply.code(403).send({ error: 'Host header not allowed' })
      }
    })

    this.app.get('/alive', async () => ({ alive: true, app: 'Brandinbold', version: app.getVersion() }))

    this.app.get('/profile/all', async () => this.store.list())

    this.app.get<{ Params: { id: string } }>('/profile/get/:id', async (req, reply) => {
      const p = this.store.get(req.params.id)
      if (!p) return reply.code(404).send({ error: 'Profile not found' })
      return p
    })

    this.app.get<{ Params: { id: string } }>('/profile/status/:id', async (req, reply) => {
      const p = this.store.get(req.params.id)
      if (!p) return reply.code(404).send({ error: 'Profile not found' })
      return { profileId: p.id, status: this.registry.status(p.id).status, running: this.registry.get(p.id) }
    })

    this.app.post<{ Body: Partial<Profile> }>('/profile/add', async (req) => {
      const created = this.store.create(req.body?.name || 'New profile')
      const saved = req.body ? { ...created, ...req.body, id: created.id } : created
      return this.store.save(saved)
    })

    this.app.post<{ Body: Profile }>('/profile/update', async (req, reply) => {
      const existing = this.store.get(req.body?.id)
      if (!existing) return reply.code(404).send({ error: 'Profile not found' })
      return this.store.save({ ...req.body, createdAt: existing.createdAt })
    })

    this.app.delete<{ Params: { id: string } }>('/profile/delete/:id', async (req, reply) => {
      if (this.registry.get(req.params.id)) {
        return reply.code(409).send({ error: 'Profile is running' })
      }
      if (!this.store.get(req.params.id)) return reply.code(404).send({ error: 'Profile not found' })
      this.store.purge(req.params.id)
      return { deleted: true }
    })

    this.app.get<{ Params: { id: string } }>('/profile/launch/:id', async (req, reply) => {
      const p = this.store.get(req.params.id)
      if (!p) return reply.code(404).send({ error: 'Profile not found' })
      try {
        const result = await this.launcher.launch(p)
        return result
      } catch (e: any) {
        return reply.code(500).send({ error: e.message })
      }
    })

    this.app.get<{ Params: { id: string } }>('/profile/stop/:id', async (req, reply) => {
      const ok = await this.registry.stop(req.params.id)
      if (!ok) return reply.code(404).send({ error: 'Profile not running' })
      return { stopped: true }
    })

    this.app.get<{ Params: { id: string } }>('/automation/launch/puppeteer/:id', async (req, reply) => {
      const p = this.store.get(req.params.id)
      if (!p) return reply.code(404).send({ error: 'Profile not found' })
      try {
        const result = await this.launcher.launch(p)
        if (!result.browserWsUrl) {
          return reply.code(501).send({
            error:
              'The Camoufox engine is Playwright-based (no CDP). Connect with Playwright over CJP, or switch the profile engine to Chrome for a Puppeteer endpoint.'
          })
        }
        return { browserWsUrl: result.browserWsUrl, debugPort: result.debugPort }
      } catch (e: any) {
        return reply.code(500).send({ error: e.message })
      }
    })

    this.app.post<{ Params: { id: string }; Body: { url?: string } }>(
      '/profile/openUrl/:id',
      async (req, reply) => {
        const handle = this.registry.getHandle(req.params.id)
        if (!handle) return reply.code(409).send({ error: 'Profile not running' })
        const url = req.body?.url
        if (!url || !/^https?:\/\//.test(url)) {
          return reply.code(400).send({ error: 'url (http/https) required' })
        }
        try {
          await handle.openUrl(url)
          return { opened: true }
        } catch (e: any) {
          return reply.code(500).send({ error: e.message })
        }
      }
    )
  }

  /** Bind loopback, walking the port upward if taken (like Incogniton's walkPortIfTaken). */
  async start(preferredPort = 35000): Promise<number> {
    for (let port = preferredPort; port < preferredPort + 100; port++) {
      try {
        await this.app.listen({ port, host: '127.0.0.1' })
        this.port = port
        this.onPort(port)
        return port
      } catch {
        /* port taken, try next */
      }
    }
    throw new Error(`No free port in ${preferredPort}-${preferredPort + 99}`)
  }

  async stop(): Promise<void> {
    if (this.port !== null) {
      await this.app.close().catch(() => {})
      this.port = null
      this.onPort(null)
    }
  }

  get currentPort(): number | null {
    return this.port
  }
}
