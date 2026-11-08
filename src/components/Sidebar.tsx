import { Avatar, Dropdown, Input, Modal, Popover, Radio, Segmented, Switch, Typography, message } from 'antd'
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
  LogoutOutlined,
  MoreOutlined
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
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
  const { profiles, settings, cloudStatus, openAuthGate } = useApp()
  const authed = !!cloudStatus?.authed && !!cloudStatus?.user
  const max = authed ? (cloudStatus!.user!.maxProfiles ?? 3) : (settings.maxProfiles ?? 3)
  const planName = authed ? cloudStatus!.user!.plan : 'local'
  const unsyncedCount = authed ? (cloudStatus?.unsyncedProfileIds?.length ?? 0) : 0
  const syncedCount = authed ? Math.min(max, Math.max(0, profiles.length - unsyncedCount)) : Math.min(profiles.length, max)
  const pct = Math.min(100, Math.round((syncedCount / Math.max(1, max)) * 100))

  const onAction = () => {
    if (!authed) {
      openAuthGate()
      return
    }
    const url = cloudStatus?.webUrl || 'https://cloud-web-production-f49c.up.railway.app'
    void rea.system.openExternal(url)
  }

  return (
    <div style={{ margin: '10px 10px 8px', padding: '12px', borderRadius: 12, border: '1px solid rgba(137,82,239,0.25)', background: 'rgba(137,82,239,0.06)' }}>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(137,82,239,0.2)', marginBottom: 10 }}>
        <div style={{ width: `${pct}%`, height: 4, borderRadius: 2, background: '#8952ef' }} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>
        {authed ? `${planName} plan` : 'Offline mode'}
      </div>
      <div style={{ fontSize: 12, opacity: 0.65, margin: '3px 0 9px' }}>
        {authed ? (
          <>
            {syncedCount} of {max} cloud profiles
            {unsyncedCount > 0 ? ` (+${unsyncedCount} local)` : ''}
          </>
        ) : (
          `${profiles.length} local profile${profiles.length === 1 ? '' : 's'}`
        )}
      </div>
      <button
        onClick={onAction}
        className="upgrade-btn"
        style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(137,82,239,0.5)', background: 'transparent', color: '#8952ef', fontWeight: 600, padding: '6px 0', cursor: 'pointer' }}
      >
        {authed ? '♛ Manage plan' : '☁ Sign in to Cloud'}
      </button>
    </div>
  )
}

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { settings, cloudStatus, openAuthGate, refresh } = useApp()
  const [langOpen, setLangOpen] = useState(false)

  const openManageAccount = () => {
    const url = cloudStatus?.webUrl || 'https://cloud-web-production-f49c.up.railway.app'
    void rea.system.openExternal(url)
  }

  const doLogout = async () => {
    await rea.cloud.logout()
    await refresh.cloud()
    openAuthGate()
  }

  const authed = !!cloudStatus?.authed && !!cloudStatus?.user
  const user = authed
    ? cloudStatus!.user!
    : (settings.user ?? { name: 'Local User', email: 'local@brandinbold.app' })
  const initial = (user.name || 'U').charAt(0).toUpperCase()

  const setLang = async (code: string) => {
    await refresh.settings({ language: code })
    setLangOpen(false)
  }

  const menu = (
    <div style={{ minWidth: 230 }}>
      <MenuRow
        icon={<UserOutlined />}
        label="Manage account"
        right={<span style={{ opacity: 0.5, fontSize: 11 }}>↗</span>}
        onClick={openManageAccount}
      />
      {authed ? (
        <MenuRow
          icon={<ReloadOutlined />}
          label="Sync cloud now"
          onClick={async () => {
            await rea.cloud.syncNow()
            await refresh.all()
            message.success('Cloud synced')
          }}
        />
      ) : (
        <MenuRow
          icon={<UserOutlined />}
          label="Sign in to Cloud"
          onClick={() => openAuthGate()}
        />
      )}
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
      <MenuRow icon={<QuestionCircleOutlined />} label={t('common.helpSupport')} onClick={openManageAccount} />
      <MenuRow icon={<AppstoreOutlined />} label={t('common.checkForUpdates')} onClick={() => message.info(t('common.upToDate'))} />
      <MenuRow icon={<ReloadOutlined />} label={t('common.reinstallBrowser')} onClick={() => void rea.engine.install()} />
      <div style={{ height: 1, background: 'rgba(128,128,128,0.2)', margin: '6px 0' }} />
      {authed ? (
        <MenuRow icon={<LogoutOutlined />} label={t('common.logout')} onClick={() => void doLogout()} />
      ) : (
        <MenuRow icon={<UserOutlined />} label="Sign in to Cloud" onClick={() => openAuthGate()} />
      )}
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
              {authed ? (
                <span style={{ fontSize: 9, color: '#8952ef', fontWeight: 700 }}>● CLOUD SYNC</span>
              ) : (
                <span style={{ fontSize: 9, color: '#6b7280' }}>LOCAL ONLY</span>
              )}
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
  const { profiles, deleted, groups, profileFilter, setProfileFilter, refresh } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const [profilesOpen, setProfilesOpen] = useState(true)
  const [proxiesOpen, setProxiesOpen] = useState(false)
  const [groupModal, setGroupModal] = useState<{
    id?: string
    name: string
    color: string
    description: string
    pinned: boolean
  } | null>(null)
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
  const validGroupIds = new Set(groups.map((g) => g.id))
  const unassigned = profiles.filter((p) => !p.groupId || !validGroupIds.has(p.groupId)).length

  const saveGroupModal = async () => {
    if (!groupModal || !groupModal.name.trim()) {
      message.warning('Group name is required')
      return
    }
    const cleanName = groupModal.name.trim()
    if (groupModal.id) {
      await rea.groups.rename(groupModal.id, cleanName)
      await rea.groups.pin(groupModal.id, groupModal.pinned)
      await rea.groups.updateMeta?.(groupModal.id, groupModal.color, groupModal.description)
      message.success('Group updated')
    } else {
      const created = await rea.groups.create(cleanName, groupModal.pinned, groupModal.color, groupModal.description)
      if (created?.id) {
        setProfileFilter(created.id)
        onNavigate('profiles')
      }
      message.success('Group created')
    }
    setGroupModal(null)
    await refresh.groups()
  }

  const deleteGroupFromSidebar = (g: any) => {
    Modal.confirm({
      title: `${t('groups.deleteConfirm')} (${g.name})`,
      okButtonProps: { danger: true },
      onOk: async () => {
        await rea.groups.delete(g.id)
        if (profileFilter === g.id) setProfileFilter('all')
        await refresh.groups()
        await refresh.profiles()
        message.success('Group deleted — profiles moved to Unassigned')
      }
    })
  }

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
        <div
          style={itemStyle(page === 'profiles')}
          onClick={() => {
            onNavigate('profiles')
            if (!profilesOpen) setProfilesOpen(true)
          }}
        >
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
        {profilesOpen && !collapsed && (
          <div style={{ marginLeft: 30, borderLeft: '2px solid rgba(124,58,237,0.25)', paddingLeft: 6 }}>
            <SubItem
              label={`${t('nav.all')} (${profiles.length})`}
              active={page === 'profiles' && profileFilter === 'all'}
              onClick={() => {
                setProfileFilter('all')
                onNavigate('profiles')
              }}
            />
            <SubItem
              label={`${t('nav.unassigned')} (${unassigned})`}
              active={page === 'profiles' && profileFilter === 'unassigned'}
              onClick={() => {
                setProfileFilter('unassigned')
                onNavigate('profiles')
              }}
            />
            {groups.filter((g) => g.pinned).map((g) => (
              <SubItem
                key={g.id}
                label={`${g.name} (${profiles.filter((p) => p.groupId === g.id).length})`}
                pin
                color={g.color}
                active={page === 'profiles' && profileFilter === g.id}
                onClick={() => {
                  setProfileFilter(g.id)
                  onNavigate('profiles')
                }}
                onEdit={() => setGroupModal({ id: g.id, name: g.name, color: g.color || '#8952ef', description: g.description || '', pinned: !!g.pinned })}
                onTogglePin={async () => {
                  await rea.groups.pin(g.id, !g.pinned)
                  await refresh.groups()
                }}
                onDelete={() => deleteGroupFromSidebar(g)}
              />
            ))}
            {groups.filter((g) => !g.pinned).map((g) => (
              <SubItem
                key={g.id}
                label={`${g.name} (${profiles.filter((p) => p.groupId === g.id).length})`}
                color={g.color}
                active={page === 'profiles' && profileFilter === g.id}
                onClick={() => {
                  setProfileFilter(g.id)
                  onNavigate('profiles')
                }}
                onEdit={() => setGroupModal({ id: g.id, name: g.name, color: g.color || '#8952ef', description: g.description || '', pinned: !!g.pinned })}
                onTogglePin={async () => {
                  await rea.groups.pin(g.id, !g.pinned)
                  await refresh.groups()
                }}
                onDelete={() => deleteGroupFromSidebar(g)}
              />
            ))}
            <SubItem
              label={t('nav.createGroup')}
              plus
              onClick={() => setGroupModal({ name: '', color: '#8952ef', description: '', pinned: false })}
            />
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
          {!collapsed && (
            <span style={{ flex: 1 }}>
              {t('nav.trash')}
              {deleted.length > 0 ? ` (${deleted.length})` : ''}
            </span>
          )}
        </div>
      </div>

      {ENABLE_PLAN_LIMITS && <PlanCard />}
      <UserBlock collapsed={collapsed} />

      <Modal
        open={!!groupModal}
        title={groupModal?.id ? t('groups.editTitle') : t('groups.newTitle')}
        onCancel={() => setGroupModal(null)}
        onOk={() => void saveGroupModal()}
        okText={t('proxies.save')}
      >
        {groupModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input
              placeholder={t('groups.groupName')}
              value={groupModal.name}
              onChange={(e) => setGroupModal({ ...groupModal, name: e.target.value })}
              onPressEnter={() => void saveGroupModal()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, opacity: 0.65 }}>{t('groups.color')}</span>
              {['#8952ef', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'].map((c) => (
                <span
                  key={c}
                  onClick={() => setGroupModal({ ...groupModal, color: c })}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: c,
                    cursor: 'pointer',
                    outline: groupModal.color === c ? '2px solid rgba(137,82,239,0.6)' : 'none',
                    outlineOffset: 2
                  }}
                />
              ))}
            </div>
            <Input
              placeholder={t('groups.description')}
              value={groupModal.description}
              onChange={(e) => setGroupModal({ ...groupModal, description: e.target.value })}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch
                size="small"
                checked={groupModal.pinned}
                onChange={(v) => setGroupModal({ ...groupModal, pinned: v })}
              />
              <span style={{ fontSize: 12.5 }}>Pin group to Profiles topbar</span>
            </div>
          </div>
        )}
      </Modal>
    </aside>
  )
}

function SubItem({
  label,
  active,
  pin,
  plus,
  color,
  onClick,
  onEdit,
  onTogglePin,
  onDelete
}: {
  label: string
  active?: boolean
  pin?: boolean
  plus?: boolean
  color?: string
  onClick?: () => void
  onEdit?: () => void
  onTogglePin?: () => void
  onDelete?: () => void
}) {
  const hasMenu = !!(onEdit || onTogglePin || onDelete)
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
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {pin && <span style={{ fontSize: 10, opacity: 0.5 }}>📌</span>}
      {hasMenu && (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              ...(onEdit ? [{ key: 'edit', label: 'Edit / Rename' }] : []),
              ...(onTogglePin ? [{ key: 'pin', label: pin ? 'Unpin from topbar' : 'Pin to topbar' }] : []),
              ...(onDelete ? [{ key: 'delete', label: 'Delete group', danger: true }] : [])
            ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation()
              if (key === 'edit') onEdit?.()
              else if (key === 'pin') onTogglePin?.()
              else if (key === 'delete') onDelete?.()
            }
          }}
        >
          <span
            onClick={(e) => e.stopPropagation()}
            style={{ opacity: 0.55, padding: '0 2px', fontSize: 12 }}
            title="Group options"
          >
            <MoreOutlined />
          </span>
        </Dropdown>
      )}
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
