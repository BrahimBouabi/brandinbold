/**
 * Lightweight sliding-window rate limiter for authentication endpoints.
 */
interface Bucket {
  timestamps: number[]
}

const buckets = new Map<string, Bucket>()

export function checkRateLimit(
  key: string,
  maxRequests = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 15),
  windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000)
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const cutoff = now - windowMs
  const b = buckets.get(key) ?? { timestamps: [] }
  b.timestamps = b.timestamps.filter((t) => t > cutoff)
  if (b.timestamps.length >= maxRequests) {
    const oldest = b.timestamps[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    buckets.set(key, b)
    return { allowed: false, retryAfterSec }
  }
  b.timestamps.push(now)
  buckets.set(key, b)
  return { allowed: true, retryAfterSec: 0 }
}

export function resetRateLimits(): void {
  buckets.clear()
}

