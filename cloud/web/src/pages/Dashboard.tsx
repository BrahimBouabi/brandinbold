import { useEffect, useState } from 'react'
import { Button, Card, Statistic, Typography, message } from 'antd'
import { BrandLogo } from '../components/Logo'
import { api, logout, storedUser, type CloudUser } from '../api'

export function Dashboard({ onNav }: { onNav: (r: string) => void }) {
  const [user, setUser] = useState<CloudUser | null>(storedUser())
  const [counts, setCounts] = useState<{ profiles: number; groups: number; proxies: number } | null>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const me = await api.me()
        setUser(me.user)
        localStorage.setItem('bb_user', JSON.stringify(me.user))
        const pull = await api.pull()
        setCounts({ profiles: pull.profiles.length, groups: pull.groups.length, proxies: pull.proxies.length })
      } catch (e: any) {
        if (e.statusCode === 401) {
          logout()
          onNav('login')
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveName = async () => {
    setBusy(true)
    try {
      await api.updateName(name)
      const me = await api.me()
      setUser(me.user)
      localStorage.setItem('bb_user', JSON.stringify(me.user))
      message.success('Name updated')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    setBusy(true)
    try {
      await api.changePassword(pw.current, pw.next)
      setPw({ current: '', next: '' })
      message.success('Password changed')
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null
  const quotaPct = Math.min(100, Math.round(((counts?.profiles ?? 0) / user.maxProfiles) * 100))

  return (
    <div style={{ background: '#0d0f13', minHeight: '100vh', color: '#d7dbe2', fontFamily: '-apple-system, system-ui' }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 36px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <BrandLogo size={22} color="#8952ef" />
        <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>Brandinbold</span>
        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>Dashboard</span>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="small" onClick={() => { logout(); onNav('landing') }}>Sign Out</Button>
        </div>
      </nav>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
          <div style={{ width: 46, height: 46, borderRadius: 23, background: '#8952ef', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{user.name}</div>
            <div style={{ fontSize: 13, color: '#9aa3af' }}>{user.email}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ background: 'rgba(137,82,239,0.15)', color: '#8952ef', borderRadius: 12, padding: '4px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
              {user.plan} plan
            </span>
            <a
              href="https://github.com/brandinbold/brandinbold/releases"
              target="_blank"
              rel="noreferrer"
              style={{ background: '#8952ef', color: '#fff', borderRadius: 8, padding: '8px 16px', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
            >
              ⬇ Download Desktop App
            </a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 26 }}>
          <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Statistic title="Profiles" value={counts?.profiles ?? '…'} />
          </Card>
          <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Statistic title="Groups" value={counts?.groups ?? '…'} />
          </Card>
          <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Statistic title="Proxies" value={counts?.proxies ?? '…'} />
          </Card>
        </div>

        <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <Typography.Title level={5} style={{ color: '#fff' }}>Plan & quota</Typography.Title>
          <div style={{ fontSize: 13, color: '#9aa3af', marginBottom: 8 }}>
            {counts?.profiles ?? 0} of {user.maxProfiles} profiles used on the {user.plan} plan
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: `${quotaPct}%`, height: 6, borderRadius: 3, background: '#8952ef' }} />
          </div>
        </Card>

        <Card style={{ background: '#15171d', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <Typography.Title level={5} style={{ color: '#fff' }}>Account settings</Typography.Title>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, maxWidth: 420 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              style={{ flex: 1, background: '#0d0f13', border: '1px solid rgba(255,255,255,0.12)', color: '#d7dbe2', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            />
            <Button size="small" loading={busy} onClick={() => void saveName()}>Save name</Button>
          </div>
          <div style={{ display: 'flex', gap: 10, maxWidth: 420 }}>
            <input
              type="password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
              placeholder="Current password"
              style={{ flex: 1, background: '#0d0f13', border: '1px solid rgba(255,255,255,0.12)', color: '#d7dbe2', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            />
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              placeholder="New password"
              style={{ flex: 1, background: '#0d0f13', border: '1px solid rgba(255,255,255,0.12)', color: '#d7dbe2', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            />
            <Button size="small" loading={busy} onClick={() => void savePassword()}>Change</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

