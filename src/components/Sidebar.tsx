import { Avatar, Dropdown, Popover, Radio, Segmented, Switch, Typography, message } from 'antd'
import {
  UserOutlined,
  RightOutlined,
  LeftOutlined,
  TeamOutlined,
  SettingOutlined,
  DeleteOutlined,
  ShoppingCartOutlined,
  GlobalOutlined,
  AppstoreOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  LogoutOutlined
} from '@ant-design/icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApp } from '../App'
import { LANGUAGES } from '../i18n'
import { BRAND } from '../theme'
import { ENABLE_PLAN_LIMITS } from '../../shared/config'
import { BrandLogo } from './Logo'

const rea = (window as any).rea

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px 10px' }}>
      <BrandLogo size={26} color={BRAND.accent} />
      {!collapsed && (
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2 }}>{BRAND.name}</span>
      )}
    </div>
  )
}

function PlanCard() {
  const { t } = useTranslation()
  const { profiles, settings } = useApp()
  const max = settings.maxProfiles ?? 3
  const used = Math.min(profiles.length, max)
  const pct = Math.min(100, Math.round((used / max) * 100))
  return (
    <div
      style={{
        margin: '10px 10px 8px',
        padding: '12px',
        borderRadius: 12,
        border: '1px solid rgba(124,58,237,0.25)',
        background: 'rgba(124,58,237,0.06)'
      }}
    >
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(124,58,237,0.2)', marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: BRAND.accent }} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{t('common.basePlan')}</div>
      <div style={{ fontSize: 12, opacity: 0.65, margin: '3px 0 9px' }}>
        {t('common.profilesUsed', { used: used, max: max })}
      </div>
      <button
        className="upgrade-btn"
        style={{
          width: '100%',
          borderRadius: 8,
          border: '1px solid rgba(124,58,237,0.5)',
          background: 'transparent',
          color: BRAND.accent,
          fontWeight: 600,
          padding: '6px 0',
          cursor: 'pointer'
        }}
      >
        ♛ {t('common.upgradeNow')}
      </button>
    </div>
  )
}

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { settings, refresh } = useApp()
  const [langOpen, setLangOpen] = useState(false)
  const user = settings.user ?? { name: 'Local User', email: '' }
  const initial = (user.name || 'U').charAt(0).toUpperCase()

  const setLang = async (code: string) => {
    await refresh.settings({ language: code })
    setLangOpen(false)
  }

  const menu = (
    <div style={{ minWidth: 230 }}>
      <MenuRow icon={<UserOutlined />} label={t('common.myProfile')} />
      <MenuRow
        icon={<GlobalOutlined />}
        label={t('common.language')}
        right={<span style={{ opacity: 0.6, fontSize: 12 }}>{LANGUAGES.find((l) => l.code === settings.language)?.label} <RightOutlined style={{ fontSize: 10 }} /></span>}
        onClick={() => setLangOpen(true)}
      />
      {langOpen && (
        <div style={{ maxHeight: 260, overflowY: 'auto', margin: '4px 0', borderRadius: 8 }}>
          {LANGUAGES.map((l) => (
            <div
              key={l.code}
              onClick={() => void setLang(l.code)}
              style={{ padding: '7px 26px', cursor: 'pointer', fontSize: 13 }}
            >
              {l.flag} {l.label}
            </div>
          ))}
        </div>
      )}
      <ThemeRow />
      <MenuRow icon={<QuestionCircleOutlined />} label={t('common.helpSupport')} />
      <MenuRow icon={<AppstoreOutlined />} label={t('common.checkForUpdates')} onClick={() => message.info(t('common.upToDate'))} />
      <MenuRow icon={<ReloadOutlined />} label={t('common.reinstallBrowser')} onClick={() => void rea.engine.install()} />
      <div style={{ height: 1, background: 'rgba(128,128,128,0.2)', margin: '6px 0' }} />
      <MenuRow icon={<LogoutOutlined />} label={t('common.logout')} />
    </div>
  )

  return (
    <Popover content={menu} trigger="click" placement="topRight" arrow={false}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: collapsed ? '10px 8px' : '10px 12px',
          cursor: 'pointer',
          borderTop: '1px solid rgba(128,128,128,0.15)'
        }}
      >
        <Avatar style={{ background: BRAND.accent, flex: 'none' }} size={collapsed ? 28 : 34}>
          {initial}
        </Avatar>
        {!collapsed && (
          <>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 16 }}>⋮</Typography.Text>
          </>
        )}
      </div>
    </Popover>
  )
}

function MenuRow({
  icon,
  label,
  right,
  onClick
}: {
  icon: React.ReactNode
  label: string
  right?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        cursor: 'pointer',
        borderRadius: 8,
        fontSize: 13
      }}
    >
      <span style={{ opacity: 0.75 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </div>
  )
}

function ThemeRow() {
  const { t } = useTranslation()
  const { settings, refresh } = useApp()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13
      }}
    >
      <span style={{ opacity: 0.75 }}>🖥</span>
      <span style={{ flex: 1 }}>{t('common.theme')}</span>
      <Segmented
        size="small"
        value={settings.theme ?? 'system'}
        onChange={(v) => void refresh.settings({ theme: v as any })}
        options={[
          { value: 'system', label: '🖥' },
          { value: 'light', label: '☀️' },
          { value: 'dark', label: '🌙' }
        ]}
      />
    </div>
  )
}

export function Sidebar({
  page,
  onNavigate,
  isDark,
  onToggleTheme
}: {
  page: string
  onNavigate: (p: string) => void
  isDark: boolean
  onToggleTheme: (mode: 'system' | 'light' | 'dark') => void
}) {
  const { t } = useTranslation()
  const { profiles, groups, refresh } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(true)
  const [proxiesOpen, setProxiesOpen] = useState(false)
  const bg = isDark ? '#171a21' : '#ffffff'
  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: collapsed ? '9px 0' : '9px 12px',
    margin: '1px 10px',
    borderRadius: 9,
    cursor: 'pointer',
    fontSize: 13.5,
    fontWeight: 500,
    background: active ? 'rgba(124,58,237,0.12)' : 'transparent',
    color: active ? BRAND.accent : 'inherit',
    justifyContent: collapsed ? 'center' : 'flex-start'
  })
  const unassigned = profiles.filter((p) => !p.groupId).length

  return (
    <aside
      style={{
        width: collapsed ? 66 : 240,
        minWidth: collapsed ? 66 : 240,
        background: bg,
        borderRight: '1px solid rgba(128,128,128,0.15)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width .15s',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Logo collapsed={collapsed} />
        <span
          style={{ marginLeft: 'auto', padding: '0 12px', cursor: 'pointer', opacity: 0.55 }}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <RightOutlined style={{ fontSize: 11 }} /> : <LeftOutlined style={{ fontSize: 11 }} />}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {/* Profiles (expandable) */}
        <div style={itemStyle(page === 'profiles')} onClick={() => onNavigate('profiles')}>
          <UserOutlined />
          {!collapsed && <span style={{ flex: 1 }}>{t('nav.profiles')}</span>}
          {!collapsed && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                setProfilesOpen(!profilesOpen)
              }}
              style={{ transform: profilesOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s', fontSize: 10, opacity: 0.6 }}
            >
              <RightOutlined />
            </span>
          )}
        </div>
        {page === 'profiles' && profilesOpen && !collapsed && (
          <div style={{ marginLeft: 30, borderLeft: '2px solid rgba(124,58,237,0.25)', paddingLeft: 6 }}>
            <SubItem label={`${t('nav.all')} (${profiles.length})`} active onClick={() => onNavigate('profiles')} />
            <SubItem label={`${t('nav.unassigned')} (${unassigned})`} />
            {groups.filter((g) => g.pinned).map((g) => (
              <SubItem key={g.id} label={`${g.name} (${profiles.filter((p) => p.groupId === g.id).length})`} pin color={g.color} onClick={() => onNavigate('profiles')} />
            ))}
            {groups.filter((g) => !g.pinned).map((g) => (
              <SubItem key={g.id} label={`${g.name} (${profiles.filter((p) => p.groupId === g.id).length})`} color={g.color} onClick={() => onNavigate('profiles')} />
            ))}
            <SubItem label={t('nav.createGroup')} plus onClick={async () => {
              const name = window.prompt(t('groups.groupName'))
              if (name) {
                await rea.groups.create(name)
                await refresh.groups()
              }
            }} />
          </div>
        )}

        {/* Proxy Library (expandable) */}
        <div style={itemStyle(page === 'proxies')} onClick={() => onNavigate('proxies')}>
          <AppstoreOutlined />
          {!collapsed && <span style={{ flex: 1 }}>{t('nav.proxyLibrary')}</span>}
          {!collapsed && (
            <span
              onClick={(e) => {
                e.stopPropagation()
                setProxiesOpen(!proxiesOpen)
              }}
              style={{ transform: proxiesOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s', fontSize: 10, opacity: 0.6 }}
            >
              <RightOutlined />
            </span>
          )}
        </div>
        {page === 'proxies' && proxiesOpen && !collapsed && (
          <div style={{ marginLeft: 30, borderLeft: '2px solid rgba(124,58,237,0.25)', paddingLeft: 6 }}>
            <SubItem label={t('proxies.allProxies')} active onClick={() => onNavigate('proxies')} />
            <SubItem label={t('nav.createGroup')} plus />
          </div>
        )}

        <div style={itemStyle(page === 'proxyshop')} onClick={() => onNavigate('proxyshop')}>
          <ShoppingCartOutlined />
          {!collapsed && <span>{t('nav.proxyShop')}</span>}
        </div>
        <div style={itemStyle(page === 'assets')} onClick={() => onNavigate('assets')}>
          <GlobalOutlined />
          {!collapsed && <span>{t('nav.browserAssets')}</span>}
        </div>
        <div style={itemStyle(page === 'team')} onClick={() => onNavigate('team')}>
          <TeamOutlined />
          {!collapsed && <span>{t('nav.team')}</span>}
        </div>
        <div style={itemStyle(page === 'settings')} onClick={() => onNavigate('settings')}>
          <SettingOutlined />
          {!collapsed && <span>{t('nav.settings')}</span>}
        </div>
        <div style={itemStyle(page === 'trash')} onClick={() => onNavigate('trash')}>
          <DeleteOutlined />
          {!collapsed && <span>{t('nav.trash')}</span>}
        </div>
      </div>

      {ENABLE_PLAN_LIMITS && <PlanCard />}
      <UserBlock collapsed={collapsed} />
    </aside>
  )
}

function SubItem({
  label,
  active,
  pin,
  plus,
  color,
  onClick
}: {
  label: string
  active?: boolean
  pin?: boolean
  plus?: boolean
  color?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 7,
        cursor: 'pointer',
        fontSize: 12.5,
        color: active ? BRAND.accent : 'inherit',
        background: active ? 'rgba(137,82,239,0.1)' : 'transparent',
        opacity: 0.9
      }}
    >
      {plus && <span style={{ color: BRAND.accent }}>+</span>}
      {color && !plus && (
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flex: 'none' }} />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {pin && <span style={{ fontSize: 10, opacity: 0.5 }}>📌</span>}
    </div>
  )
}

export function ChatButton() {
  return (
    <button
      className="chat-fab"
      style={{
        position: 'fixed',
        right: 22,
        bottom: 22,
        width: 52,
        height: 52,
        borderRadius: 26,
        border: 'none',
        background: BRAND.accent,
        color: '#fff',
        fontSize: 20,
        cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(124,58,237,0.45)',
        zIndex: 50
      }}
      title="Support"
    >
      💬
    </button>
  )
}
