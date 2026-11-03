import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import type { IpInfo, ProxyConfig } from '@shared/types'

/**
 * Proxy check = plain HTTP GET of ip-api.com through the proxy.
 * The response gives exit IP, country, timezone and coordinates — exactly
 * the IPInformation Incogniton uses to auto-match timezone/locale/geo.
 */
export function checkProxy(proxy: ProxyConfig, timeoutMs = 12000): Promise<IpInfo> {
  const started = Date.now()
  return new Promise<IpInfo>((resolve) => {
    if (proxy.type === 'none') {
      // direct connection, no proxy
      return resolve(performLookup(null, started, timeoutMs))
    }
    if (!proxy.host || !proxy.port) {
      return resolve({ ok: false, error: 'Proxy host/port missing' })
    }
    const proxyUrl =
      proxy.username && proxy.password
        ? `${authScheme(proxy.type)}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`
        : `${authScheme(proxy.type)}://${proxy.host}:${proxy.port}`
    let agent: (url: URL) => any
    if (proxy.type === 'http' || proxy.type === 'https') agent = () => new HttpProxyAgent(proxyUrl)
    else agent = () => new SocksProxyAgent(proxyUrl)
    resolve(performLookup(agent, started, timeoutMs))
  })
}

function authScheme(type: string): string {
  return type === 'socks4' ? 'socks4' : type === 'socks5' ? 'socks5' : 'http'
}

function performLookup(agentFactory: ((url: URL) => any) | null, started: number, timeoutMs: number): Promise<IpInfo> {
  return new Promise<IpInfo>((resolve) => {
    const url = new URL('http://ip-api.com/json/?fields=status,message,country,countryCode,timezone,lat,lon,isp,query')
    const req = httpRequest(
      url,
      { agent: agentFactory ? agentFactory(url) : undefined, timeout: timeoutMs },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          const latencyMs = Date.now() - started
          try {
            const j = JSON.parse(body)
            if (j.status === 'fail') {
              resolve({ ok: false, error: j.message || 'IP lookup failed', latencyMs })
              return
            }
            resolve({
              ok: true,
              ip: j.query,
              country: j.country,
              countryCode: j.countryCode,
              timezone: j.timezone,
              lat: j.lat,
              lon: j.lon,
              isp: j.isp,
              latencyMs
            })
          } catch {
            resolve({ ok: false, error: 'Bad response from IP lookup', latencyMs })
          }
        })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, error: `Timeout after ${timeoutMs}ms` })
    })
    req.on('error', (e) => resolve({ ok: false, error: e.message }))
    req.end()
  })
}
