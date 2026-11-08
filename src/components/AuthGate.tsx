import { useState } from 'react'
import { Button, Form, Input, Typography } from 'antd'
import { BrandLogo } from './Logo'
import { CloudServerField } from './CloudServerField'

const rea = (window as any).rea

function cleanError(msg: string): { text: string; totpRequired: boolean } {
  const stripped = String(msg ?? '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  const totpRequired = stripped.includes('[2FA_REQUIRED]') || /two-factor|2fa/i.test(stripped)
  return {
    text: stripped.replace('[2FA_REQUIRED] ', ''),
    totpRequired
  }
}

export function AuthGate({ onAuthed, onOffline }: { onAuthed: () => void; onOffline: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [showServer, setShowServer] = useState(false)

  const submit = async (v: { email: string; password: string; name?: string; username?: string; totpCode?: string }) => {
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await rea.cloud.login(v.email, v.password, v.totpCode)
      } else {
        await rea.cloud.register(v.email, v.name ?? '', v.password, v.username)
      }
      onAuthed()
    } catch (e: any) {
      const parsed = cleanError(e.message)
      if (parsed.totpRequired) setNeedsTotp(true)
      setError(parsed.text)
    } finally {
      setBusy(false)
    }
  }

  const goOffline = async () => {
    await rea.cloud.setOfflineMode(true)
    onOffline()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0f13', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, system-ui' }}>
      <div style={{ width: 410, background: '#15171d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
          <BrandLogo size={30} color="#8952ef" />
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Brandinbold</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
          <Button
            type={mode === 'login' ? 'primary' : 'default'}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            Sign In
          </Button>
          <Button
            type={mode === 'register' ? 'primary' : 'default'}
            onClick={() => {
              setMode('register')
              setNeedsTotp(false)
              setError('')
            }}
          >
            Create Account
          </Button>
        </div>

        <Form layout="vertical" onFinish={submit} disabled={busy}>
          {mode === 'register' && (
            <>
              <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]}>
                <Input placeholder="Your name" size="large" />
              </Form.Item>
              <Form.Item name="username">
                <Input placeholder="Username (optional, e.g. alex_b)" size="large" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="email"
            rules={
              mode === 'register'
                ? [{ required: true, type: 'email', message: 'Valid email required' }]
                : [{ required: true, message: 'Email or username required' }]
            }
          >
            <Input placeholder={mode === 'register' ? 'Email' : 'Email or username'} size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
            <Input.Password placeholder="Password (8+ characters)" size="large" />
          </Form.Item>
          {mode === 'login' && needsTotp && (
            <Form.Item
              name="totpCode"
              label={<span style={{ color: '#d7dbe2', fontSize: 12.5 }}>Authenticator 2FA Code (or Backup Code)</span>}
              rules={[{ required: true, message: 'Enter your 6-digit 2FA code or backup code' }]}
            >
              <Input placeholder="123456 or XXXX-XXXX" size="large" autoFocus />
            </Form.Item>
          )}
          {error ? <Typography.Text type="danger" style={{ fontSize: 12.5 }}>{error}</Typography.Text> : null}
          <Button type="primary" htmlType="submit" block size="large" style={{ marginTop: 10 }} loading={busy}>
            {mode === 'login' ? (needsTotp ? 'Verify & Sign In' : 'Sign In') : 'Create Account'}
          </Button>
        </Form>

        <div style={{ marginTop: 14 }}>
          {showServer ? (
            <CloudServerField compact />
          ) : (
            <a onClick={() => setShowServer(true)} style={{ color: '#6b7280', fontSize: 12 }}>
              Server settings…
            </a>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
          <a onClick={() => void goOffline()} style={{ color: '#6b7280', fontSize: 12.5 }}>
            Continue in Local Offline Mode →
          </a>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            Cloud sync off — profiles stay on this machine. Re-enable anytime in Settings or Sidebar.
          </div>
        </div>
      </div>
    </div>
  )
}
