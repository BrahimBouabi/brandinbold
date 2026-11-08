import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Popover,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message
} from 'antd'
import {
  CaretRightOutlined,
  DownOutlined,
  FilterOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import type { Profile } from '@shared/types'
import { useApp } from '../App'
import { NewProfileModal } from '../components/NewProfileModal'
import { EditProxyModal } from '../components/EditProxyModal'
import { ExportModal } from '../components/ExportModal'
import { ImportModal } from '../components/ImportModal'
import { GroupsPanel, BulkActionBar } from '../components/GroupsPanel'
import { BrandLogo } from '../components/Logo'
import { ENABLE_PLAN_LIMITS } from '../../shared/config'
import { BRAND } from '../theme'

const rea = (window as any).rea

const statusColor: Record<string, string> = {
  ready: '#3fb96a',
  launching: '#8952ef',
  launched: '#8952ef',
  stopping: '#e8b93e',
  error: '#e05252'
}

export function ProfilesPage() {
  const { t } = useTranslation()
  const { profiles, groups, proxies, settings, statuses, cloudStatus, profileFilter: tab, setProfileFilter: setTab, refresh } = useApp()
  const [search, setSearch] = useState('')
  const [condensed, setCondensed] = useState(false)
  const [selected, setSelected] = useState<React.Key[]>([])
  const [visibleCols, setVisibleCols] = useState<string[]>([
    'name', 'proxy', 'group', 'tags', 'status', 'browserVersion', 'lastEdited', 'actions'
  ])
  const [creating, setCreating] = useState(false)
  const [proxyFor, setProxyFor] = useState<Profile | null>(null)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [editTab, setEditTab] = useState<any>(undefined)
  const [exportIds, setExportIds] = useState<string[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const qs = new URLSearchParams(window.location.search)
  useEffect(() => {
    if (qs.get('modal') === 'proxy' && profiles.length) setProxyFor(profiles[0])
    const tb = qs.get('tab')
    if (tb) setTab(tb)
  }, [profiles.length])
  useEffect(() => {
    if (qs.get('bulk') === '1') setSelected(['preview-1', 'preview-2', 'preview-3'])
    if (qs.get('modal') === 'new') setCreating(true)
    if (qs.get('modal') === 'import') setImporting(true)
    const onExportAll = () => {
      const ids = profiles.map((p) => p.id)
      if (ids.length) setExportIds(ids)
    }
    window.addEventListener('brandinbold-export-all', onExportAll)
    const onImport = () => setImporting(true)
    window.addEventListener('brandinbold-import', onImport)
    return () => {
      window.removeEventListener('brandinbold-export-all', onExportAll)
      window.removeEventListener('brandinbold-import', onImport)
    }
  }, [profiles])

  const authed = !!cloudStatus?.authed && !!cloudStatus?.user
  const max = authed ? (cloudStatus!.user!.maxProfiles ?? 3) : (settings.maxProfiles ?? 3)
  const atQuota = ENABLE_PLAN_LIMITS && authed && profiles.length >= max
  const unsyncedSet = useMemo(() => new Set(cloudStatus?.unsyncedProfileIds ?? []), [cloudStatus])

  const rows = useMemo(() => {
    let list = [...profiles]
    const validGroupIds = new Set(groups.map((g) => g.id))
    if (tab === 'unassigned') list = list.filter((p) => !p.groupId || !validGroupIds.has(p.groupId))
    if (tab === 'groups') list = list.filter((p) => !!p.groupId && validGroupIds.has(p.groupId))
    if (validGroupIds.has(tab)) list = list.filter((p) => p.groupId === tab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((tg) => tg.toLowerCase().includes(q)) ||
          (groups.find((g) => g.id === p.groupId)?.name.toLowerCase().includes(q) ?? false)
      )
    }
    return list.map((p) => ({ ...p, status: statuses[p.id] ?? 'ready', key: p.id }))
  }, [profiles, tab, search, statuses, groups])

  const launch = async (id: string, opts?: { extraArgs?: string; openUrlAfter?: string; maximized?: boolean }) => {
    try {
      await rea.launch(id, opts)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      await refresh.statuses(id)
      await refresh.profiles()
    }
  }

  const stopProfile = async (id: string) => {
    try {
      await rea.stop(id)
    } catch (e: any) {
      message.error(e.message)
    } finally {
      await refresh.statuses(id)
      await refresh.profiles()
    }
  }

  const trashProfile = async (id: string) => {
    Modal.confirm({
      title: t('profiles.deleteConfirm'),
      onOk: async () => {
        await rea.profiles.trash(id)
        await refresh.profiles()
      }
    })
  }

  const bulk = async (action: 'launch' | 'stop' | 'delete') => {
    for (const id of selected) {
      try {
        if (action === 'launch') await rea.launch(id as string)
        else if (action === 'stop') await rea.stop(id as string)
        else await rea.profiles.trash(id as string)
      } catch {
        /* continue */
      }
    }
    setSelected([])
    await refresh.profiles()
  }

  const allColumns: Record<string, ColumnsType<any>[number]> = {
    name: {
      title: t('profiles.name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.pinned === b.pinned ? a.name.localeCompare(b.name) : a.pinned ? -1 : 1),
      render: (v, p) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 22, height: 22, borderRadius: 6, flex: 'none',
              background: p.color ?? '#8952ef',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <BrandLogo size={13} color="#ffffff" />
          </span>
          <b>{v}</b>
          {p.disabled ? <Tag style={{ borderRadius: 6 }}>disabled</Tag> : null}
          {unsyncedSet.has(p.id) ? (
            <Tag color="warning" style={{ borderRadius: 6, fontSize: 11 }}>
              local only (plan limit)
            </Tag>
          ) : null}
        </span>
      )
    },
    proxy: {
      title: t('profiles.proxy'),
      key: 'proxy',
      render: (_: any, p: Profile) => {
        const lib = p.proxyId ? proxies.find((x) => x.id === p.proxyId) : null
        const hasProxy = (lib && lib.type !== undefined) || (!p.proxyId && p.proxy.type !== 'none')
        const host = lib ? `${lib.host}:${lib.port}` : p.proxy.type !== 'none' ? `${p.proxy.host}:${p.proxy.port}` : null
        const status = p.proxyLastCheck
        return hasProxy ? (
          <a onClick={() => setProxyFor(p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7, height: 7, borderRadius: 4, flex: 'none',
                background: !status ? '#9aa3af' : status.ok ? '#3fb96a' : '#e05252'
              }}
            />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{host}</span>
          </a>
        ) : (
          <a onClick={() => setProxyFor(p)} style={{ opacity: 0.75 }}>{t('profiles.addProxy')}</a>
        )
      }
    },
    group: {
      title: t('profiles.group'),
      key: 'group',
      render: (_, p) => {
        const g = groups.find((x) => x.id === p.groupId)
        return (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'none', label: t('newProfile.noGroup') },
                ...groups.map((grp) => ({
                  key: grp.id,
                  label: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: grp.color ?? '#8952ef' }} />
                      {grp.name}
                    </span>
                  )
                }))
              ],
              onClick: async ({ key }) => {
                const list = await rea.profiles.list()
                const cur = list.find((x: any) => x.id === p.id)
                if (cur) {
                  await rea.profiles.save({ ...cur, groupId: key === 'none' ? null : key })
                  await refresh.profiles()
                }
              }
            }}
          >
            <a style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit' }}>
              {g ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: g.color ?? '#8952ef' }} />
                  <span>{g.name}</span>
                </>
              ) : (
                <span style={{ opacity: 0.55 }}>—</span>
              )}
            </a>
          </Dropdown>
        )
      }
    },
    tags: {
      title: t('profiles.tags'),
      key: 'tags',
      render: (_: any, p: Profile) =>
        p.tags.length ? (
          <Space size={4} wrap>
            {p.tags.map((tg: string) => (
              <Tag key={tg} color="gold" style={{ borderRadius: 6 }}>{tg}</Tag>
            ))}
          </Space>
        ) : (
          <a
            style={{ opacity: 0.7 }}
            onClick={async () => {
              const tg = window.prompt(t('profiles.addTag'))
              if (tg?.trim()) {
                const list = await rea.profiles.list()
                const cur = list.find((x: any) => x.id === p.id)
                if (cur) await rea.profiles.save({ ...cur, tags: [...cur.tags, tg.trim()] })
                await refresh.profiles()
              }
            }}
          >
            {t('profiles.addTag')}
          </a>
        )
    },
    status: {
      title: t('profiles.status'),
      key: 'status',
      render: (_, p) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: 4,
              background: statusColor[p.status] ?? '#999'
            }}
          />
          {p.status === 'launched' ? 'Launched' : p.status === 'ready' ? 'Ready' : p.status}
        </span>
      )
    },
    browserVersion: {
      title: t('profiles.browserVersion'),
      key: 'browserVersion',
      render: (_, p) => (p.browserVersion ? '🦊' : '—')
    },
    lastEdited: {
      title: t('profiles.lastEdited'),
      key: 'lastEdited',
      dataIndex: 'updatedAt',
      sorter: (a, b) => (a.updatedAt > b.updatedAt ? 1 : -1),
      render: (v) => new Date(v).toLocaleDateString()
    },
    actions: {
      title: '',
      key: 'actions',
      width: 120,
      align: 'right',
      render: (_, p) => (
        <Space size={4}>
          {p.status === 'launched' ? (
            <Button size="small" danger ghost icon={<span style={{ fontSize: 10 }}>■</span>} onClick={() => void stopProfile(p.id)}>
              Stop
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<CaretRightOutlined />}
              disabled={p.status === 'launching' || p.disabled}
              onClick={() => void launch(p.id)}
            >
              Start
            </Button>
          )}
          <Dropdown
            menu={rowMenu(p)}
            trigger={['click']}
          >
            <Button size="small" type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      )
    }
  }

  const columns = visibleCols.map((c) => allColumns[c]).filter(Boolean)

  return (
    <div>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['all', 'groups', 'unassigned'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 14px',
                fontSize: 14,
                fontWeight: tab === k ? 700 : 500,
                color: tab === k ? BRAND.accent : 'inherit',
                opacity: tab === k ? 1 : 0.65,
                cursor: 'pointer',
                borderBottom: tab === k ? `2px solid ${BRAND.accent}` : '2px solid transparent'
              }}
            >
              {k === 'all' ? t('nav.all') : k === 'groups' ? t('proxies.groups') : t('nav.unassigned')}
            </button>
          ))}
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setTab(g.id)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 14px',
                fontSize: 14,
                fontWeight: tab === g.id ? 700 : 500,
                color: tab === g.id ? BRAND.accent : 'inherit',
                opacity: tab === g.id ? 1 : 0.65,
                cursor: 'pointer',
                borderBottom: tab === g.id ? `2px solid ${BRAND.accent}` : '2px solid transparent'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: g.color ?? '#8952ef' }} />
                {g.name}
              </span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Dropdown
            menu={{
              items: [
                { key: 'single', label: t('profiles.newProfile') },
                { key: 'bulk', label: t('profiles.bulkCreate') },
                { key: 'import', label: t('profiles.import') }
              ],
              onClick: ({ key }) => {
                if (key === 'single') setCreating(true)
                else if (key === 'bulk') void bulkCreate()
                else message.info(t('profiles.import') + ' — CSV/JSON (soon)')
              }
            }}
          >
            <Button type="primary" disabled={atQuota}>
              {t('profiles.newProfile')} <DownOutlined />
            </Button>
          </Dropdown>
        </div>
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Input
          prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
          placeholder={t('profiles.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 320, borderRadius: 18 }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12.5, opacity: 0.7 }}>{t('profiles.condensed')}</span>
          <Switch size="small" checked={condensed} onChange={setCondensed} />
          <Button icon={<FilterOutlined />}>{t('profiles.filter')}</Button>
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
                {Object.keys(allColumns).map((c) => (
                  <label key={c} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={visibleCols.includes(c)}
                      onChange={(e) =>
                        setVisibleCols((cur) =>
                          e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)
                        )
                      }
                    />
                    {allColumns[c]?.title?.toString() || c}
                  </label>
                ))}
              </div>
            }
          >
            <Button icon={<SettingOutlined />} />
          </Popover>
        </div>
      </div>

      {unsyncedSet.size > 0 && (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(232,185,62,0.1)',
            border: '1px solid rgba(232,185,62,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12.5
          }}
        >
          <span>
            <b>{unsyncedSet.size} profile{unsyncedSet.size === 1 ? '' : 's'} stored locally only</b> — your{' '}
            <b>{cloudStatus?.user?.plan ?? 'free'}</b> plan syncs up to <b>{max}</b> profiles to the cloud.
          </span>
          <a
            onClick={() =>
              void rea.system.openExternal(cloudStatus?.webUrl || 'https://cloud-web-production-f49c.up.railway.app')
            }
            style={{ color: '#8952ef', fontWeight: 600 }}
          >
            Manage Plan ↗
          </a>
        </div>
      )}

      {tab === 'groups' ? (
        <GroupsPanel onGoToGroup={(g) => setTab(g)} />
      ) : (
      <>
      {/* table */}
      <Table
        dataSource={rows}
        columns={columns}
        rowKey="id"
        size={condensed ? 'small' : 'middle'}
        pagination={false}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        expandable={{
          expandedRowRender: (p: any) => (
            <ExpandedRow
              profile={p}
              notes={notes[p.id] ?? p.notes}
              onNotesChange={(v) => setNotes((n) => ({ ...n, [p.id]: v }))}
              onSave={async () => {
                await rea.profiles.save({ ...p, notes: notes[p.id] ?? p.notes })
                message.success(t('profiles.notesSaved'))
                await refresh.profiles()
              }}
            />
          ),
          expandIcon: ({ expanded, onExpand, record }) => (
            <DownOutlined
              onClick={(e) => onExpand(record, e)}
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s', fontSize: 10, opacity: 0.5 }}
            />
          )
        }}
        locale={{ emptyText: (
          <div style={{ padding: 40 }}>
            <b>{t('profiles.noProfiles')}</b>
            <div style={{ opacity: 0.6, marginTop: 6 }}>{t('profiles.emptyHint')}</div>
            <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 14 }} onClick={() => setCreating(true)}>
              {t('profiles.newProfile')}
            </Button>
          </div>
        )}}
      />

      {/* quota banner */}
      {atQuota && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 14,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(224,82,82,0.08)',
            border: '1px solid rgba(224,82,82,0.25)'
          }}
        >
          <Typography.Text type="danger">●</Typography.Text>
          <b style={{ fontSize: 13 }}>{t('profiles.maxProfiles')}</b>
          <div style={{ marginLeft: 'auto' }}>
            <Button type="primary" danger>{t('profiles.upgrade')}</Button>
          </div>
        </div>
      )}
      </>
      )}

      {exportIds && (
        <ExportModal ids={exportIds} open onClose={() => setExportIds(null)} />
      )}
      {importing && (
        <ImportModal
          open
          onClose={() => setImporting(false)}
          onImported={async () => {
            await refresh.profiles()
            await refresh.groups()
          }}
        />
      )}

      <BulkActionBar
        selected={selected as string[]}
        profiles={rows as any}
        onClear={() => setSelected([])}
        onExport={() => setExportIds(selected as string[])}
        onChanged={async () => {
          await refresh.profiles()
          setSelected([])
        }}
      />

      {proxyFor && (
        <EditProxyModal
          profile={proxyFor}
          open={!!proxyFor}
          onClose={() => setProxyFor(null)}
          onSaved={() => void refresh.profiles()}
        />
      )}

      <NewProfileModal
        open={creating}
        initialTab={(qs.get('tab') as any) ?? undefined}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false)
          await refresh.profiles()
        }}
      />
      {editingProfile && (
        <NewProfileModal
          open
          editing={editingProfile}
          initialTab={editTab}
          onClose={() => {
            setEditingProfile(null)
            setEditTab(undefined)
          }}
          onCreated={async () => {
            setEditingProfile(null)
            setEditTab(undefined)
            await refresh.profiles()
          }}
        />
      )}
    </div>
  )

  function rowMenu(p: any) {
    const launched = p.status === 'launched'
    return {
      items: [
        { key: 'edit', label: 'Edit' },
        { key: 'sync', label: 'Start Synchronizer (As Main)' },
        {
          key: 'movegroup',
          label: 'Move to Group',
          children: [
            { key: 'mg:none', label: 'Unassigned (No group)' },
            ...groups.map((g) => ({
              key: `mg:${g.id}`,
              label: `${g.name}${p.groupId === g.id ? ' ✓' : ''}`
            }))
          ]
        },
        { key: 'pin', label: p.pinned ? 'Unpin' : 'Pin to Top' },
        { key: 'tags', label: 'Manage tags' },
        { type: 'divider' as const },
        { key: 'proxy', label: 'Edit Proxy' },
        { type: 'divider' as const },
        { key: 'clone', label: 'Clone Profile' },
        { key: 'csv', label: 'Export to CSV' },
        ...(launched ? [{ key: 'stop', label: 'Stop Browser' }] : []),
        {
          key: 'launchopt', label: 'Launch Options',
          children: [
            { key: 'lo-normal', label: 'Start normally' },
            { key: 'lo-max', label: 'Start maximized' },
            { key: 'lo-args', label: 'Start with custom arguments' },
            { key: 'lo-url', label: 'Start with a specific URL' },
            { key: 'lo-private', label: 'Start in a private window', disabled: true }
          ]
        },
        {
          key: 'browsermgmt', label: 'Browser Management',
          children: [
            { key: 'bm-import', label: 'Import Cookies' },
            { key: 'bm-export', label: 'Export Cookies' },
            { key: 'bm-clean', label: 'Clean cookies' },
            { key: 'bm-collector', label: 'Start Cookie Collector' },
            { key: 'bm-addbm', label: 'Add Bookmarks' },
            { key: 'bm-clearbm', label: 'Clear Bookmarks' },
            { key: 'bm-urls', label: 'Edit Startup URLs' }
          ]
        },
        { key: 'extensions', label: 'Extensions' },
        {
          key: 'backup', label: 'Backup & Recovery',
          children: [
            { key: 'bk-now', label: 'Back up now' },
            { key: 'bk-restore', label: 'Restore from backup' },
            { key: 'bk-export', label: 'Export profile data' },
            { key: 'bk-import', label: 'Import profile data' },
            { key: 'bk-folder', label: 'Open backup folder' }
          ]
        },
        { type: 'divider' as const },
        { key: 'disable', label: p.disabled ? 'Enable profile' : 'Disable profile' },
        { key: 'delete', label: 'Delete', danger: true }
      ],
      onClick: async ({ key }: { key: string }) => {
        const reload = async () => { await refresh.profiles() }
        if (key.startsWith('mg:')) {
          const targetId = key === 'mg:none' ? null : key.slice(3)
          const list = await rea.profiles.list()
          const cur = list.find((x: any) => x.id === p.id)
          if (cur) await rea.profiles.save({ ...cur, groupId: targetId })
          await reload()
          message.success(targetId ? 'Moved to group' : 'Moved to Unassigned')
          return
        }
        switch (key) {
          case 'edit': setEditingProfile(p); break
          case 'sync': message.info('Synchronizer — coming soon'); break
          case 'pin': {
            const list = await rea.profiles.list()
            const cur = list.find((x: any) => x.id === p.id)
            if (cur) await rea.profiles.save({ ...cur, pinned: !cur.pinned })
            await reload()
            break
          }
          case 'tags': {
            const tg = window.prompt('Manage tags (comma separated):', (p.tags ?? []).join(', '))
            if (tg !== null) {
              const list = await rea.profiles.list()
              const cur = list.find((x: any) => x.id === p.id)
              if (cur) await rea.profiles.save({ ...cur, tags: tg.split(',').map((s) => s.trim()).filter(Boolean) })
              await reload()
            }
            break
          }
          case 'proxy': setProxyFor(p); break
          case 'clone': {
            const copy = await rea.profiles.create(`${p.name} (copy)`)
            await rea.profiles.save({ ...p, id: copy.id, name: `${p.name} (copy)`, fingerprint: p.fingerprint, color: p.color })
            await reload()
            break
          }
          case 'csv': setExportIds([p.id]); break
          case 'stop': await stopProfile(p.id); break
          case 'lo-normal': await launch(p.id); break
          case 'lo-max': await launch(p.id, { maximized: true }); break
          case 'lo-args': {
            const args = window.prompt('Custom browser arguments:', '')
            if (args) await launch(p.id, { extraArgs: args })
            break
          }
          case 'lo-url': {
            const url = window.prompt('URL to open at launch:', 'https://')
            if (url && /^https?:\/\//.test(url)) await launch(p.id, { openUrlAfter: url })
            break
          }
          case 'lo-private': break
          case 'bm-import': await rea.cookies.import(p.id).catch((e: Error) => message.warning(e.message)); break
          case 'bm-export': await rea.cookies.export(p.id, 'json').catch((e: Error) => message.warning(e.message)); break
          case 'bm-clean': await rea.cookies.clear(p.id).then(() => message.success('Cookies cleared')).catch((e: Error) => message.warning(e.message)); break
          case 'bm-collector': await rea.cookies.collect(p.id).then(() => message.success('Cookie collector finished')).catch((e: Error) => message.warning(e.message)); break
          case 'bm-addbm': {
            const urls = window.prompt('Bookmarks to add (one URL per line):', '')
            if (urls?.trim()) {
              const list = urls.split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s))
              const n = await rea.bookmarks.add(p.id, list).catch((e: Error) => { message.warning(e.message); return 0 })
              if (n) message.success(`${n} bookmarks added`)
            }
            break
          }
          case 'bm-clearbm': await rea.bookmarks.clear(p.id).then(() => message.success('Bookmarks cleared')).catch((e: Error) => message.warning(e.message)); break
          case 'bm-urls': {
            const urls = window.prompt('Startup URLs (one per line):', (p.startupUrls ?? []).join('\n'))
            if (urls !== null) {
              const list = await rea.profiles.list()
              const cur = list.find((x: any) => x.id === p.id)
              if (cur) await rea.profiles.save({ ...cur, startupUrls: urls.split('\n').map((s) => s.trim()).filter(Boolean), startupUrlsEnabled: true })
              await reload()
            }
            break
          }
          case 'extensions': setEditingProfile(p); setEditTab('extensions'); break
          case 'bk-now': await rea.backup.now(p.id).then((r: string | null) => message.success(r ? `Backup saved: ${r}` : 'Backup skipped')).catch((e: Error) => message.warning(e.message)); break
          case 'bk-restore': await rea.backup.restore(p.id).then((r: string | null) => message.success(r ? `Restored from ${r}` : 'No backups found')).catch((e: Error) => message.warning(e.message)); break
          case 'bk-export': await rea.backup.exportData(p.id).then((r: string | null) => r && message.success(`Exported to ${r}`)).catch((e: Error) => message.warning(e.message)); break
          case 'bk-import': await rea.backup.importData(p.id).then((r: any) => r && message.success('Profile data imported')).catch((e: Error) => message.warning(e.message)); break
          case 'bk-folder': await rea.backup.openFolder(p.id); break
          case 'disable': {
            const list = await rea.profiles.list()
            const cur = list.find((x: any) => x.id === p.id)
            if (cur) await rea.profiles.save({ ...cur, disabled: !cur.disabled })
            await reload()
            break
          }
          case 'delete': await trashProfile(p.id); break
        }
      }
    }
  }

  async function bulkCreate() {
    const n = window.prompt(t('profiles.bulkCreate'), '5')
    const count = parseInt(n ?? '0', 10)
    if (!count) return
    for (let i = 0; i < count; i++) await rea.profiles.create(`Profile ${i + 1}`)
    await refresh.profiles()
  }
}

function ExpandedRow({
  profile,
  notes,
  onNotesChange,
  onSave
}: {
  profile: Profile
  notes: string
  onNotesChange: (v: string) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const { groups } = useApp()
  const [copied, setCopied] = useState(false)
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5 }}>
      <span style={{ opacity: 0.55, minWidth: 110 }}>{label}</span>
      <span>{value}</span>
    </div>
  )
  return (
    <div style={{ padding: '6px 4px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {row(t('profiles.profileId'), (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <code style={{ fontSize: 11.5 }}>{profile.id}</code>
          <a
            onClick={() => {
              void navigator.clipboard.writeText(profile.id)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
            style={{ fontSize: 12 }}
          >
            {copied ? t('profiles.copied') : t('profiles.copy')}
          </a>
        </span>
      ))}
      {row(t('profiles.created'), new Date(profile.createdAt).toLocaleString())}
      {row(t('profiles.lastEdited'), new Date(profile.updatedAt).toLocaleString())}
      {row(t('profiles.lastLaunched'), profile.lastLaunchedAt ? new Date(profile.lastLaunchedAt).toLocaleString() : '—')}
      {row(t('profiles.group'), groups.find((g) => g.id === profile.groupId)?.name ?? '—')}
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'flex-start' }}>
        <span style={{ opacity: 0.55, fontSize: 12.5, minWidth: 110 }}>{t('profiles.notes')}</span>
        <Input.TextArea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
          style={{ maxWidth: 520 }}
        />
        <Button size="small" type="primary" ghost onClick={onSave}>{t('profiles.saveChanges')}</Button>
      </div>
    </div>
  )
}
