/**
 * Build-time defaults and feature flags for Brandinbold Desktop & Cloud.
 * Can be overridden at runtime via BRANDINBOLD_CLOUD_API_URL / BRANDINBOLD_CLOUD_WEB_URL
 * or in Settings → Cloud server (CloudServerField).
 */
const env = (globalThis as any).process?.env as Record<string, string | undefined> | undefined

export const DEFAULT_CLOUD_API_URL =
  env?.BRANDINBOLD_CLOUD_API_URL ||
  env?.VITE_DEFAULT_CLOUD_API_URL ||
  'https://cloud-api-production-8852.up.railway.app'

export const DEFAULT_CLOUD_WEB_URL =
  env?.BRANDINBOLD_CLOUD_WEB_URL ||
  env?.VITE_DEFAULT_CLOUD_WEB_URL ||
  'https://cloud-web-production-f49c.up.railway.app'

export const ENABLE_PLAN_LIMITS = true

export function resolveDashboardUrl(apiUrl?: string): string {
  const envWeb = env?.BRANDINBOLD_CLOUD_WEB_URL || env?.VITE_DEFAULT_CLOUD_WEB_URL
  if (envWeb) return envWeb.replace(/\/+$/, '')
  if (apiUrl && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(apiUrl.trim())) {
    return 'http://localhost:5180'
  }
  return DEFAULT_CLOUD_WEB_URL
}
