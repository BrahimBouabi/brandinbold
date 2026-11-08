import { ConfigProvider, message, theme as antdTheme } from 'antd'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettings, Group, Profile, ProfileStatus, ProxyEntry } from '@shared/types'
import { darkTheme, lightTheme } from './theme'
import './i18n'
import { Sidebar, ChatButton } from './components/Sidebar'
import { AuthGate } from './components/AuthGate'
import { ProfilesPage } from './pages/ProfilesPage'
import { ProxiesPage } from './pages/ProxiesPage'
import { ProxyShopPage } from './pages/ProxyShopPage'
import { BrowserAssetsPage } from './pages/BrowserAssetsPage'
import { TeamPage } from './pages/TeamPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrashPage } from './pages/TrashPage'

const rea = (window as any).rea

export interface CloudStatusState {
  enabled: boolean
  authed: boolean
  user: {
    id: string
    email: string
    username?: string
    name: string
    plan: string
    maxProfiles: number
    totpEnabled?: boolean
  } | null
  offlineMode: boolean
  apiUrl: string
  webUrl: string
  apiUrlFromEnv: boolean
  unsyncedProfileIds: string[]
}

export interface AppState {
  profiles: Profile[]
  deleted: Profile[]
  groups: Group[]
  proxies: ProxyEntry[]
  settings: AppSettings
  statuses: Record<string, ProfileStatus>
  apiPort: number | null
  cloudStatus: CloudStatusState | null
  profileFilter: string
  setProfileFilter: (filter: string) => void
  openAuthGate: () => void
  refresh: {
    profiles: () => Promise<void>
    groups: () => Promise<void>
    proxies: () => Promise<void>
    settings: (patch?: Partial<AppSettings>) => Promise<void>
    statuses: (id?: string) => Promise<void>
    cloud: () => Promise<CloudStatusState | null>
    all: () => Promise<void>
  }
}

const Ctx = createContext<AppState | null>(null)
export const useApp = (): AppState => useContext(Ctx)!

export default function App() {
  const { t } = useTranslation()
  const [page, setPage] = useState<string>(new URLSearchParams(window.location.search).get('page') ?? 'profiles')
  const [profileFilter, setProfileFilter] = useState<string>(new URLSearchParams(window.location.search).get('tab') ?? 'all')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [deleted, setDeleted] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [proxies, setProxies] = useState<ProxyEntry[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ProfileStatus>>({})
  const [apiPort, setApiPort] = useState<number | null>(null)
  const [cloudStatus, setCloudStatus] = useState<CloudStatusState | null>(null)
  const [authState, setAuthState] = useState<'checking' | 'gate' | 'ready'>('checking')
  const [systemDark, setSystemDark] = useState<boolean>(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  const refreshProfiles = useCallback(async () => {
    setProfiles(await rea.profiles.list())
    setDeleted(await (rea.profiles.listDeleted?.() ?? []))
  }, [])

  const refreshGroups = useCallback(async () => setGroups(await rea.groups.list()), [])
  const refreshProxies = useCallback(async () => setProxies(await rea.proxies.list()), [])
  const refreshSettings = useCallback(async (patch?: Partial<AppSettings>) => {
    const s = patch ? await rea.settings.save(patch) : await rea.settings.get()
    setSettings(s)
    if (patch?.language) void (await import('./i18n')).default.changeLanguage(patch.language)
  }, [])

  const refreshCloud = useCallback(async () => {
    const st = (await rea.cloud.status?.()) ?? null
    setCloudStatus(st)
    return st as CloudStatusState | null
  }, [])

  const refreshStatuses = useCallback(async (id?: string) => {
    if (id && rea.status) {
      const res = await rea.status(id)
      if (res?.status) {
        setStatuses((s) => ({ ...s, [id]: res.status as ProfileStatus }))
      }
      return
    }
    const list: Array<{ profileId: string }> = (await rea.running?.()) ?? []
    const runningIds = new Set(list.map((r) => r.profileId))
    setStatuses((prev) => {
      const next: Record<string, ProfileStatus> = {}
      for (const [k, v] of Object.entries(prev)) {
        next[k] = runningIds.has(k) ? 'launched' : v === 'launching' ? 'launching' : 'ready'
      }
      for (const rid of runningIds) next[rid] = 'launched'
      return next
    })
  }, [])

  const refreshAll = useCallback(async () => {
    const [, , , , , cloudSt] = await Promise.all([
      refreshProfiles(),
      refreshGroups(),
      refreshProxies(),
      refreshSettings(),
      refreshStatuses(),
      refreshCloud()
    ])
    const info = await rea.system.info()
    setApiPort(info.apiPort)
    const s = await rea.settings.get()
    void (await import('./i18n')).default.changeLanguage(s.language)
    setAuthState((prev) => {
      if (prev !== 'checking') return prev
      const isPreview = new URLSearchParams(window.location.search).size > 0
      if (isPreview) return 'ready'
      if (cloudSt && !cloudSt.authed && !cloudSt.offlineMode) return 'gate'
      return 'ready'
    })
  }, [refreshProfiles, refreshGroups, refreshProxies, refreshSettings, refreshStatuses, refreshCloud])

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search)
    const qTheme = qp.get('theme') as any
    if (qTheme) setSettings((s) => ({ ...(s ?? ({} as any)), theme: qTheme }))
    void refreshAll()
    return rea.onProfileEvent((event: any) => {
      if (event.type === 'status' && event.profileId) {
        setStatuses((s) => ({ ...s, [event.profileId]: event.status as ProfileStatus }))
      } else if (event.type === 'cloud-event') {
        void Promise.all([refreshCloud(), refreshProfiles(), refreshGroups(), refreshProxies()])
        if (event.status === 'quota-warning' && event.detail) {
          message.warning(event.detail, 5)
        }
      }
    })
  }, [refreshAll, refreshCloud, refreshProfiles, refreshGroups, refreshProxies])

  const openAuthGate = useCallback(() => {
    void rea.cloud.setOfflineMode(false).then(() => {
      void refreshCloud()
      setAuthState('gate')
    })
  }, [refreshCloud])

  const isDark =
    settings?.theme === 'dark' || (settings?.theme === 'system' && systemDark)

  const state = useMemo<AppState>(
    () => ({
      profiles,
      deleted,
      groups,
      proxies,
      settings: settings ?? ({} as AppSettings),
      statuses,
      apiPort,
      cloudStatus,
      profileFilter,
      setProfileFilter,
      openAuthGate,
      refresh: {
        profiles: refreshProfiles,
        groups: refreshGroups,
        proxies: refreshProxies,
        settings: refreshSettings,
        statuses: refreshStatuses,
        cloud: refreshCloud,
        all: refreshAll
      }
    }),
    [
      profiles,
      deleted,
      groups,
      proxies,
      settings,
      statuses,
      apiPort,
      cloudStatus,
      profileFilter,
      openAuthGate,
      refreshProfiles,
      refreshGroups,
      refreshProxies,
      refreshSettings,
      refreshStatuses,
      refreshCloud,
      refreshAll
    ]
  )

  if (authState === 'gate') {
    return (
      <ConfigProvider
        theme={{
          token: { colorPrimary: '#8952ef', borderRadius: 8, fontFamily: '-apple-system, system-ui' },
          algorithm: antdTheme.darkAlgorithm
        }}
      >
        <AuthGate
          onAuthed={async () => {
            setAuthState('ready')
            await refreshAll()
          }}
          onOffline={async () => {
            setAuthState('ready')
            await refreshAll()
          }}
        />
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider theme={isDark ? darkTheme : lightTheme} componentSize="middle">
      <Ctx.Provider value={state}>
        <div
          className="app"
          style={{
            display: 'flex',
            height: '100vh',
            overflow: 'hidden',
            background: isDark ? '#101216' : '#f6f7f9',
            color: isDark ? '#d7dbe2' : '#1f2329'
          }}
        >
          <Sidebar
            page={page}
            onNavigate={setPage}
            isDark={isDark}
            onToggleTheme={(mode) => void refreshSettings({ theme: mode })}
          />
          <main style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', minWidth: 0 }}>
            {page === 'profiles' && <ProfilesPage />}
            {page === 'proxies' && <ProxiesPage />}
            {page === 'proxyshop' && <ProxyShopPage />}
            {page === 'assets' && <BrowserAssetsPage />}
            {page === 'team' && <TeamPage />}
            {page === 'settings' && <SettingsPage />}
            {page === 'trash' && <TrashPage />}
          </main>
          <ChatButton />
        </div>
      </Ctx.Provider>
    </ConfigProvider>
  )
}
