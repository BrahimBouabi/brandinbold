import { useEffect, useState } from 'react'
import { ConfigProvider, theme as antdTheme } from 'antd'
import { Landing } from './pages/Landing'
import { Login, Register } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
import { token, storedUser } from './api'

type Route = 'landing' | 'login' | 'register' | 'app'

function routeFromHash(): Route {
  const raw = window.location.hash.replace('#/', '')
  if (raw.startsWith('invite')) {
    const match = raw.match(/[?&]token=([a-f0-9]+)/i)
    if (match) sessionStorage.setItem('bb_pending_invite_token', match[1])
    return token() && storedUser() ? 'app' : 'login'
  }
  const h = raw.split('?')[0]
  return (['landing', 'login', 'register', 'app'] as const).includes(h as Route) ? (h as Route) : 'landing'
}

export default function WebApp() {
  const [route, setRoute] = useState<Route>(routeFromHash())

  useEffect(() => {
    const fn = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])

  const nav = (r: string) => {
    window.location.hash = `#/${r}`
    setRoute(r as Route)
  }

  // logged-in users land on the dashboard
  useEffect(() => {
    if (route === 'landing' && token() && storedUser()) nav('app')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#8952ef', borderRadius: 8, fontFamily: '-apple-system, system-ui' },
        algorithm: antdTheme.darkAlgorithm
      }}
    >
      {route === 'landing' && <Landing onNav={nav} />}
      {route === 'login' && <Login onNav={nav} onAuthed={() => nav('app')} />}
      {route === 'register' && <Register onNav={nav} onAuthed={() => nav('app')} />}
      {route === 'app' && <Dashboard onNav={nav} />}
    </ConfigProvider>
  )
}
