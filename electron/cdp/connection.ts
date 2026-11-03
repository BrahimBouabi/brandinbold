import WebSocket from 'ws'
import { EventEmitter } from 'events'
import type { Profile } from '@shared/types'
import { buildFingerprintScript } from '../engine/fingerprintScript'

/**
 * Minimal CDP client: connects to the browser endpoint, auto-attaches to every
 * new target, and applies the two spoof layers per session:
 *  1. Native Emulation.* overrides (UA/platform/lang/timezone/geo)
 *  2. Page.addScriptToEvaluateOnNewDocument with the fingerprint JS
 */
export class CdpConnection extends EventEmitter {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private scriptSource = ''
  private overrides: {
    userAgent: string
    acceptLanguage: string
    platform: string
    locale: string
    timezone: string
    geo: { latitude: number; longitude: number; accuracy: number } | null
  } | null = null

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  async connect(
    port: number,
    browserPath: string,
    profile: Profile,
    ipInfo: { timezone?: string; lat?: number; lon?: number } | null
  ): Promise<void> {
    this.scriptSource = buildFingerprintScript(profile)
    const lang = profile.navigator.languages.join(',')
    const tz =
      profile.timezone.mode === 'custom'
        ? profile.timezone.name
        : profile.timezone.mode === 'ip'
          ? (ipInfo?.timezone ?? '')
          : ''
    const geo =
      profile.geolocation.mode === 'custom'
        ? {
            latitude: profile.geolocation.latitude,
            longitude: profile.geolocation.longitude,
            accuracy: profile.geolocation.accuracy
          }
        : profile.geolocation.mode === 'ip' && ipInfo?.lat != null && ipInfo?.lon != null
          ? { latitude: ipInfo.lat, longitude: ipInfo.lon, accuracy: 100 }
          : null
    this.overrides = {
      userAgent: profile.navigator.userAgent,
      acceptLanguage: lang,
      platform: profile.navigator.platform,
      locale: lang,
      timezone: tz,
      geo
    }

    const url = `ws://127.0.0.1:${port}${browserPath}`
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, { perMessageDeflate: false })
      this.ws = ws
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    const ws = this.ws!
    ws.on('message', (data) => this.onMessage(data.toString()))
    ws.on('close', () => this.emit('close'))

    // attach to existing and future targets
    await this.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    })
    // Apply to targets that already exist (setAutoAttach fires for new ones)
    const { targetInfos } = await this.send('Target.getTargets', {})
    for (const t of targetInfos as { targetId: string; type: string }[]) {
      if (t.type === 'page' || t.type === 'background_page' || t.type === 'iframe') {
        const { sessionId } = await this.send('Target.attachToTarget', {
          targetId: t.targetId,
          flatten: true
        })
        await this.applyToSession(sessionId)
      }
    }
  }

  private async onMessage(raw: string): Promise<void> {
    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'))
        else p.resolve(msg.result)
      }
      return
    }
    if (msg.method === 'Target.attachedToTarget') {
      const sessionId: string = msg.params.sessionId
      try {
        await this.applyToSession(sessionId)
      } catch (e) {
        this.emit('session-error', e)
      }
    }
  }

  /** Layer 1 (native) + layer 2 (script) for one target session. */
  private async applyToSession(sessionId: string): Promise<void> {
    const ov = this.overrides
    if (!ov) return
    await this.send('Page.enable', {}, sessionId)
    if (ov.userAgent) {
      await this.send(
        'Emulation.setUserAgentOverride',
        { userAgent: ov.userAgent, acceptLanguage: ov.acceptLanguage, platform: ov.platform },
        sessionId
      )
    }
    if (ov.locale) {
      await this.send('Emulation.setLocaleOverride', { locale: ov.locale }, sessionId).catch(() => {})
    }
    if (ov.timezone) {
      await this.send('Emulation.setTimezoneOverride', { timezoneId: ov.timezone }, sessionId).catch(() => {})
    }
    if (ov.geo) {
      await this.send('Emulation.setGeolocationOverride', { ...ov.geo }, sessionId).catch(() => {})
    }
    await this.send(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: this.scriptSource, runOnEveryNewDocument: true },
      sessionId
    )
    // The page may already be loaded — evaluate the same script now so
    // existing tabs are spoofed too (new documents get it automatically).
    await this.send('Runtime.evaluate', { expression: this.scriptSource }, sessionId).catch(() => {})
  }

  send(method: string, params: Record<string, unknown>, sessionId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('CDP socket not open'))
      }
      const id = this.nextId++
      const payload: Record<string, unknown> = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }

  async close(): Promise<void> {
    try {
      await this.send('Browser.close', {})
    } catch {
      /* socket may already be gone */
    }
    this.ws?.close()
    this.ws = null
  }
}
