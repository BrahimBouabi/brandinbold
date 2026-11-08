import { useState } from 'react'
import { Button, Form, Input, Typography } from 'antd'
import { BrandLogo } from '../components/Logo'
import { api, setAuth } from '../api'

export function Login({ onNav, onAuthed }: { onNav: (r: string) => void; onAuthed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)

  const submit = async (v: { email: string; password: string; totpCode?: string }) => {
    setBusy(true)
    setError('')
    try {
      const res = await api.login(v.email, v.password, v.totpCode)
      setAuth(res.token, res.user)
      onAuthed()
    } catch (e: any) {
      if (e.totpRequired) {
        setNeedsTotp(true)
      }
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign In" onNav={onNav}>
      <Form layout="vertical" onFinish={submit} disabled={busy}>
        <Form.Item name="email" rules={[{ required: true, message: 'Email or username required' }]}>
          <Input placeholder="Email or username" size="large" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: 'Password required' }]}>
          <Input.Password placeholder="Password" size="large" />
        </Form.Item>
        {needsTotp && (
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
          {needsTotp ? 'Verify & Sign In' : 'Sign In'}
        </Button>
      </Form>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
        No account?{' '}
        <a onClick={() => onNav('register')} style={{ color: '#8952ef' }}>Create one</a>
      </div>
    </AuthShell>
  )
}

export function Register({ onNav, onAuthed }: { onNav: (r: string) => void; onAuthed: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (v: { email: string; name: string; username?: string; password: string; confirm: string }) => {
    if (v.password !== v.confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await api.register(v.email, v.name, v.password, v.username)
      setAuth(res.token, res.user)
      onAuthed()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create Account" onNav={onNav}>
      <Form layout="vertical" onFinish={submit} disabled={busy}>
        <Form.Item name="name" rules={[{ required: true, message: 'Name required' }]}>
          <Input placeholder="Your name" size="large" />
        </Form.Item>
        <Form.Item name="username">
          <Input placeholder="Username (optional, e.g. alex_b)" size="large" />
        </Form.Item>
        <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
          <Input placeholder="Email" size="large" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
          <Input.Password placeholder="Password (8+ characters)" size="large" />
        </Form.Item>
        <Form.Item
          name="confirm"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Confirm the password' },
            ({ getFieldValue }) => ({
              validator: (_, v) => (v === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')))
            })
          ]}
        >
          <Input.Password placeholder="Confirm password" size="large" />
        </Form.Item>
        {error ? <Typography.Text type="danger" style={{ fontSize: 12.5 }}>{error}</Typography.Text> : null}
        <Button type="primary" htmlType="submit" block size="large" style={{ marginTop: 10 }} loading={busy}>
          Create Account
        </Button>
      </Form>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
        Already registered?{' '}
        <a onClick={() => onNav('login')} style={{ color: '#8952ef' }}>Sign in</a>
      </div>
    </AuthShell>
  )
}

function AuthShell({ title, children, onNav }: { title: string; children: React.ReactNode; onNav: (r: string) => void }) {
  return (
    <div style={{ background: '#0d0f13', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, system-ui' }}>
      <div style={{ width: 380, background: '#15171d', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '30px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, justifyContent: 'center' }}>
          <BrandLogo size={30} color="#8952ef" />
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Brandinbold</span>
        </div>
        <h2 style={{ textAlign: 'center', fontSize: 18, marginBottom: 20, color: '#fff' }}>{title}</h2>
        {children}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <a onClick={() => onNav('landing')} style={{ color: '#6b7280', fontSize: 12.5 }}>← Back to home</a>
        </div>
      </div>
    </div>
  )
}
