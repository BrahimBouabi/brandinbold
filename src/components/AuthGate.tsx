import { useState } from 'react'
import { Button, Form, Input, Typography } from 'antd'
import { BrandLogo } from './Logo'

const rea = (window as any).rea

export function AuthGate({ onAuthed, onOffline }: { onAuthed: () => void; onOffline: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (v: { email: string; password: string; name?: string }) => {
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') await rea.cloud.login(v.email, v.password)
      else await rea.cloud.register(v.email, v.name ?? '', v.password)
      onAuthed()
    } catch (e: any) {
      setError(e.message)
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
      <div style={{ width: 400, background: '#15171d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
          <BrandLogo size={30} color="#8952ef" />
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Brandinbold</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center' }}>
          <Button type={mode === 'login' ? 'primary' : 'default'} onClick={() => setMode('login')}>Sign In</Button>
          <Button type={mode === 'register' ? 'primary' : 'default'} onClick={() => setMode('register')}>Create Account</Button>
        </div>

        <Form layout="vertical" onFinish={submit} disabled={busy}>
          {mode === 'register' && (
            <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]}>
              <Input placeholder="Your name" size="large" />
            </Form.Item>
          )}
          <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
            <Input placeholder="Email" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
            <Input.Password placeholder="Password (8+ characters)" size="large" />
          </Form.Item>
          {error ? <Typography.Text type="danger" style={{ fontSize: 12.5 }}>{error}</Typography.Text> : null}
          <Button type="primary" htmlType="submit" block size="large" style={{ marginTop: 10 }} loading={busy}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
          <a onClick={() => void goOffline()} style={{ color: '#6b7280', fontSize: 12.5 }}>
            Continue in Local Offline Mode →
          </a>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            Cloud sync off — profiles stay on this machine. Re-enable anytime in Settings.
          </div>
        </div>
      </div>
    </div>
  )
}
