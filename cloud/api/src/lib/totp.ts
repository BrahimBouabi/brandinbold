import { createHmac, createHash, randomBytes } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function computeTotp(secretBase32: string, stepCounter = Math.floor(Date.now() / 30000)): string {
  const key = base32Decode(secretBase32)
  const buf = Buffer.alloc(8)
  let c = stepCounter
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const hmac = createHmac('sha1', key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000
  return String(code).padStart(6, '0')
}

export function verifyTotp(secretBase32: string, code: string, window = 1): boolean {
  const clean = String(code ?? '').trim().replace(/\s+/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const current = Math.floor(Date.now() / 30000)
  for (let w = -window; w <= window; w++) {
    if (computeTotp(secretBase32, current + w) === clean) return true
  }
  return false
}

export function buildOtpAuthUri(accountName: string, secret: string, issuer = 'Brandinbold'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30'
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

function hashBackupCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return createHash('sha256').update(`bb-backup:${normalized}`).digest('hex')
}

export function generateBackupCodes(count = 8): { plain: string[]; hashes: string[] } {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const plain: string[] = []
  const hashes: string[] = []
  for (let i = 0; i < count; i++) {
    const rnd = randomBytes(8)
    let p1 = ''
    let p2 = ''
    for (let j = 0; j < 4; j++) p1 += chars[rnd[j] % chars.length]
    for (let j = 4; j < 8; j++) p2 += chars[rnd[j] % chars.length]
    const code = `${p1}-${p2}`
    plain.push(code)
    hashes.push(hashBackupCode(code))
  }
  return { plain, hashes }
}

export function consumeBackupCode(
  code: string,
  hashesJson: string | null | undefined
): { matched: boolean; remainingJson: string } {
  if (!hashesJson) return { matched: false, remainingJson: '[]' }
  let hashes: string[] = []
  try {
    hashes = JSON.parse(hashesJson)
  } catch {
    return { matched: false, remainingJson: '[]' }
  }
  const target = hashBackupCode(code)
  const idx = hashes.indexOf(target)
  if (idx === -1) return { matched: false, remainingJson: hashesJson }
  const next = hashes.slice(0, idx).concat(hashes.slice(idx + 1))
  return { matched: true, remainingJson: JSON.stringify(next) }
}

