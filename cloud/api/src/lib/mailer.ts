import net from 'node:net'
import tls from 'node:tls'

export interface InviteEmailInput {
  to: string
  inviterName: string
  inviterEmail: string
  role: string
  inviteToken: string
  expiresAt: string
}

export interface InviteEmailResult {
  sent: boolean
  provider: 'resend' | 'smtp' | 'link'
  inviteUrl: string
  error?: string
}

export function buildInviteUrl(inviteToken: string): string {
  const webBase = (
    process.env.CLOUD_WEB_URL ||
    process.env.PUBLIC_WEB_URL ||
    'https://cloud-web-production-f49c.up.railway.app'
  ).replace(/\/+$/, '')
  return `${webBase}/#/invite?token=${encodeURIComponent(inviteToken)}`
}

function buildHtmlBody(input: InviteEmailInput, inviteUrl: string): { subject: string; html: string; text: string } {
  const subject = `${input.inviterName} invited you to join their Brandinbold team (${input.role.toUpperCase()})`
  const text = [
    `Hi,`,
    ``,
    `${input.inviterName} (${input.inviterEmail}) invited you to join their Brandinbold workspace as ${input.role.toUpperCase()}.`,
    ``,
    `Accept invitation link: ${inviteUrl}`,
    `Invite token (for Desktop App): ${input.inviteToken}`,
    `Expires: ${new Date(input.expiresAt).toUTCString()}`,
    ``,
    `— Brandinbold Team`
  ].join('\n')

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#101216;color:#e5e7eb;border-radius:12px;">
      <h2 style="margin:0 0 12px;color:#ffffff;">Brandinbold Team Invitation</h2>
      <p style="font-size:14px;line-height:1.5;color:#d1d5db;">
        <b>${input.inviterName}</b> (${input.inviterEmail}) has invited you to join their Brandinbold workspace with the role <b style="color:#a78bfa;text-transform:uppercase;">${input.role}</b>.
      </p>
      <div style="margin:20px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:#8952ef;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">
          Accept Team Invitation
        </a>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-bottom:6px;">
        Or paste this invite token in the Brandinbold Desktop App (Team → Accept Invite):
      </p>
      <code style="display:block;padding:10px;background:#181b22;color:#c4b5fd;border-radius:6px;font-size:12px;word-break:break-all;">
        ${input.inviteToken}
      </code>
      <p style="font-size:11px;color:#6b7280;margin-top:16px;">
        This invitation expires on ${new Date(input.expiresAt).toUTCString()}.
      </p>
    </div>
  `.trim()

  return { subject, html, text }
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  content: { subject: string; html: string; text: string }
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: content.subject,
      html: content.html,
      text: content.text
    }),
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 160)}`)
  }
}

async function sendViaSmtp(
  cfg: { host: string; port: number; user?: string; pass?: string; from: string },
  to: string,
  content: { subject: string; html: string; text: string }
): Promise<void> {
  const useImplicitTls = cfg.port === 465
  const socket: net.Socket | tls.TLSSocket = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SMTP connection timeout')), 8000)
    const onConnect = (s: net.Socket | tls.TLSSocket) => {
      clearTimeout(timer)
      resolve(s)
    }
    if (useImplicitTls) {
      const s = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, () => onConnect(s))
      s.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    } else {
      const s = net.connect({ host: cfg.host, port: cfg.port }, () => onConnect(s))
      s.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    }
  })

  const readResp = (): Promise<string> =>
    new Promise((resolve, reject) => {
      let buf = ''
      const onData = (chunk: Buffer) => {
        buf += chunk.toString('utf8')
        const lines = buf.split('\r\n').filter(Boolean)
        const last = lines[lines.length - 1] ?? ''
        if (/^\d{3} /.test(last)) {
          socket.off('data', onData)
          if (/^[45]/.test(last)) reject(new Error(`SMTP error: ${last}`))
          else resolve(buf)
        }
      }
      socket.on('data', onData)
      socket.once('error', reject)
    })

  const cmd = async (line: string): Promise<string> => {
    socket.write(line + '\r\n')
    return readResp()
  }

  try {
    await readResp() // 220 banner
    await cmd(`EHLO brandinbold.app`)
    if (cfg.user && cfg.pass) {
      await cmd('AUTH LOGIN')
      await cmd(Buffer.from(cfg.user, 'utf8').toString('base64'))
      await cmd(Buffer.from(cfg.pass, 'utf8').toString('base64'))
    }
    const cleanFrom = cfg.from.includes('<') ? cfg.from.replace(/^.*<([^>]+)>.*$/, '$1') : cfg.from
    await cmd(`MAIL FROM:<${cleanFrom}>`)
    await cmd(`RCPT TO:<${to}>`)
    await cmd('DATA')
    const msg = [
      `From: ${cfg.from}`,
      `To: <${to}>`,
      `Subject: ${content.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      content.html,
      `.`
    ].join('\r\n')
    await cmd(msg)
    await cmd('Quit').catch(() => {})
  } finally {
    socket.destroy()
  }
}

/**
 * Sends a team invitation email using:
 * 1. Resend (if RESEND_API_KEY is configured), else
 * 2. SMTP (if SMTP_HOST is configured), else
 * 3. Returns { sent: false, provider: 'link', inviteUrl } so the UI shows a copyable invite link.
 */
export async function sendInviteEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  const inviteUrl = buildInviteUrl(input.inviteToken)
  const from = process.env.INVITE_FROM_EMAIL || 'Brandinbold <noreply@brandinbold.app>'
  const content = buildHtmlBody(input, inviteUrl)

  const resendKey = (process.env.RESEND_API_KEY ?? '').trim()
  if (resendKey) {
    try {
      await sendViaResend(resendKey, from, input.to, content)
      return { sent: true, provider: 'resend', inviteUrl }
    } catch (e: any) {
      return { sent: false, provider: 'link', inviteUrl, error: e.message }
    }
  }

  const smtpHost = (process.env.SMTP_HOST ?? '').trim()
  if (smtpHost) {
    try {
      const smtpPort = Number(process.env.SMTP_PORT || 587)
      await sendViaSmtp(
        {
          host: smtpHost,
          port: smtpPort,
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
          from
        },
        input.to,
        content
      )
      return { sent: true, provider: 'smtp', inviteUrl }
    } catch (e: any) {
      return { sent: false, provider: 'link', inviteUrl, error: e.message }
    }
  }

  return { sent: false, provider: 'link', inviteUrl }
}
