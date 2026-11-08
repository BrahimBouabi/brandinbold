import { useState } from 'react'
import { Button, Dropdown, Input, Modal, Popover, Space, Switch, Table, message } from 'antd'
import {
  CaretRightOutlined,
  FolderOutlined,
  MoreOutlined,
  PauseOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useApp } from '../App'
import { BrandLogo } from './Logo'

const rea = (window as any).rea

export function GroupsPanel({ onGoToGroup }: { onGoToGroup: (groupId: string) => void }) {
  const { t } = useTranslation()
  const { groups, profiles, refresh } = useApp()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ id?: string; name: string; color: string; description: string; pinned?: boolean } | null>(null)

  const validGroupIds = new Set(groups.map((g) => g.id))
  const rows = groups
    .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    .map((g) => ({ ...g, key: g.id, count: profiles.filter((p) => p.groupId === g.id).length }))

  const save = async () => {
    if (!editing || !editing.name.trim()) return
    const cleanName = editing.name.trim()
    if (editing.id) {
      await rea.groups.rename(editing.id, cleanName)
      await rea.groups.pin(editing.id, !!editing.pinned)
      await rea.groups.updateMeta?.(editing.id, editing.color, editing.description)
    } else {
      await rea.groups.create(cleanName, !!editing.pinned, editing.color, editing.description)
    }
    setEditing(null)
    await refresh.groups()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <Input
          prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
          placeholder={t('groups.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300, borderRadius: 18 }}
        />
        <div style={{ marginLeft: 'auto' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ name: '', color: '#8952ef', description: '' })}>
            {t('groups.newGroup')}
          </Button>
        </div>
      </div>

      <Table
        dataSource={rows}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: t('groups.noGroups') }}
        columns={[
          {
            title: '',
            key: 'check',
            width: 48,
            render: () => <input type="checkbox" style={{ accentColor: '#8952ef' }} />
          },
          {
            title: t('groups.name'),
            dataIndex: 'name',
            key: 'name',
            render: (v: string, r: any) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: r.color }} />
                <b>{v}</b>
                {r.description ? <span style={{ opacity: 0.5, fontSize: 12 }}>{r.description}</span> : null}
              </span>
            )
          },
          { title: t('groups.profiles'), dataIndex: 'count', key: 'count', width: 100 },
          {
            title: <SettingOutlined style={{ opacity: 0.5 }} />,
            key: 'actions',
            width: 260,
            align: 'right',
            render: (_: any, r: any) => (
              <Space size={4}>
                <Button size="small" onClick={() => onGoToGroup(r.id)}>{t('groups.goTo')}</Button>
                <Button
                  size="small"
                  onClick={async () => {
                    await rea.groups.pin(r.id, !r.pinned)
                    await refresh.groups()
                  }}
                >
                  {r.pinned ? 'Unpin' : 'Pin'}
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    setEditing({
                      id: r.id,
                      name: r.name,
                      color: r.color,
                      description: r.description,
                      pinned: !!r.pinned
                    })
                  }
                >
                  {t('groups.edit')}
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={() =>
                    Modal.confirm({
                      title: t('groups.deleteConfirm'),
                      onOk: async () => {
                        await rea.groups.delete(r.id)
                        await refresh.groups()
                        await refresh.profiles()
                      }
                    })
                  }
                >
                  {t('groups.delete')}
                </Button>
              </Space>
            )
          }
        ]}
        footer={() => (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => onGoToGroup('unassigned')}
          >
            <span style={{ width: 10, height: 10, borderRadius: 5, border: '1px dashed #888' }} />
            <b>{t('groups.unassigned')}</b>
            <span style={{ opacity: 0.55, fontSize: 12.5 }}>
              {profiles.filter((p) => !p.groupId || !validGroupIds.has(p.groupId)).length}
            </span>
            <div style={{ marginLeft: 'auto' }}>
              <Button size="small" onClick={() => onGoToGroup('unassigned')}>{t('groups.goTo')}</Button>
            </div>
          </div>
        )}
      />

      <Modal
        open={!!editing}
        title={editing?.id ? t('groups.editTitle') : t('groups.newTitle')}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        okText={t('proxies.save')}
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input
              placeholder={t('groups.groupName')}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, opacity: 0.65 }}>{t('groups.color')}</span>
              {['#8952ef', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map((c) => (
                <span
                  key={c}
                  onClick={() => setEditing({ ...editing, color: c })}
                  style={{
                    width: 20, height: 20, borderRadius: 10, background: c, cursor: 'pointer',
                    outline: editing.color === c ? '2px solid rgba(137,82,239,0.6)' : 'none',
                    outlineOffset: 2
                  }}
                />
              ))}
            </div>
            <Input
              placeholder={t('groups.description')}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch
                size="small"
                checked={!!editing.pinned}
                onChange={(v) => setEditing({ ...editing, pinned: v })}
              />
              <span style={{ fontSize: 12.5 }}>Pin group to Profiles topbar</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Floating bottom-center action bar for multi-selection. */
export function BulkActionBar({
  selected,
  profiles,
  onClear,
  onChanged,
  onExport
}: {
  selected: string[]
  profiles: any[]
  onClear: () => void
  onChanged: () => void | Promise<void>
  onExport?: () => void
}) {
  const { t } = useTranslation()
  const { groups, refresh } = useApp()
  if (!selected.length) return null
  const iconBtn = (icon: React.ReactNode, title: string, onClick: () => void, danger = false) => (
    <Button
      type="text"
      icon={icon}
      title={title}
      danger={danger}
      onClick={onClick}
      style={{ color: '#fff' }}
    />
  )

  const bulkLaunch = async (stop = false) => {
    for (const id of selected) {
      try {
        if (stop) await rea.stop(id)
        else await rea.launch(id)
      } catch {
        /* continue */
      }
    }
    await onChanged()
  }

  const bulkDelete = () =>
    Modal.confirm({
      title: t('profiles.deleteConfirm'),
      okButtonProps: { danger: true },
      onOk: async () => {
        for (const id of selected) await rea.profiles.trash(id).catch(() => {})
        await onChanged()
      }
    })

  const bulkProxyCheck = async () => {
    for (const id of selected) {
      const list = await rea.profiles.list()
      const p = list.find((x: any) => x.id === id)
      if (!p || p.proxy.type === 'none') continue
      const res = await rea.proxies.test(p.proxy)
      await rea.profiles.save({ ...p, proxyLastCheck: res })
    }
    await onChanged()
    message.success(t('settings.saved'))
  }

  const moreItems = [
    { key: 'update', label: t('bulk.updateBrowser') },
    { key: 'launch', label: t('bulk.launchOptions') },
    { key: 'edit', label: t('bulk.editSettings') },
    { key: 'browser', label: t('bulk.browserMgmt') },
    { key: 'proxy', label: t('bulk.proxy') },
    { key: 'tags', label: t('bulk.manageTags') },
    { key: 'pin', label: t('bulk.pinTop') },
    { key: 'disable', label: t('bulk.disable') }
  ]

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 26,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 14px',
        borderRadius: 30,
        background: 'rgba(50,32,90,0.97)',
        boxShadow: '0 8px 26px rgba(0,0,0,0.45)',
        zIndex: 60
      }}
    >
      <span style={{ color: '#e7ddff', fontSize: 13, fontWeight: 700, marginRight: 8 }}>
        {t('bulk.selected', { n: selected.length })}
      </span>
      <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.25)', margin: '0 6px' }} />
      {iconBtn(<CaretRightOutlined />, t('bulk.start'), () => void bulkLaunch(false))}
      {iconBtn(<PauseOutlined />, t('bulk.stop'), () => void bulkLaunch(true))}
      <Dropdown
        menu={{
          items: [
            { key: 'none', label: t('newProfile.noGroup') },
            ...groups.map((g) => ({ key: g.id, label: g.name }))
          ],
          onClick: async ({ key }) => {
            const list = await rea.profiles.list()
            for (const id of selected) {
              const p = list.find((x: any) => x.id === id)
              if (p) await rea.profiles.save({ ...p, groupId: key === 'none' ? null : key })
            }
            await refresh.profiles()
            await onChanged()
          }
        }}
      >
        <Button type="text" icon={<FolderOutlined />} title={t('bulk.moveTo')} style={{ color: '#fff' }} />
      </Dropdown>
      <Dropdown
        menu={{
          items: [
            { key: 'import', label: t('bulk.importCookies') },
            { key: 'export', label: t('bulk.exportCookies') },
            { key: 'netscape', label: t('bulk.exportNetscape') },
            { key: 'collect', label: t('bulk.collector') }
          ],
          onClick: async ({ key }) => {
            for (const id of selected) {
              try {
                if (key === 'import') await rea.cookies.import(id)
                else if (key === 'export') await rea.cookies.export(id, 'json')
                else if (key === 'netscape') await rea.cookies.export(id, 'netscape')
                else if (key === 'collect') await rea.cookies.collect(id)
              } catch (e: any) {
                message.warning(`${id.slice(0, 8)}: ${e.message}`)
              }
            }
            message.success(t('bulk.collectorDone'))
          }
        }}
      >
        <Button type="text" title={t('bulk.cookies')} style={{ color: '#fff', fontSize: 15 }}>🍪</Button>
      </Dropdown>
      {iconBtn(
        <span style={{ fontSize: 13 }}>⤓</span>,
        'Export CSV',
        () => onExport?.()
      )}
      {iconBtn(
        <span style={{ fontSize: 14 }}>🗑</span>,
        t('bulk.delete'),
        () => bulkDelete(),
        true
      )}
      <Dropdown
        menu={{
          items: moreItems,
          onClick: async ({ key }) => {
            const list = await rea.profiles.list()
            const targets = list.filter((p: any) => selected.includes(p.id))
            if (key === 'update') {
              await rea.engine.install()
              message.success(t('common.upToDate'))
            } else if (key === 'browser') {
              message.info(t('nav.browserAssets'))
            } else if (key === 'proxy') {
              message.info(t('bulk.assignProxy'))
            } else if (key === 'tags') {
              const tag = window.prompt(t('profiles.tags'))
              if (tag) {
                for (const p of targets) {
                  if (!p.tags.includes(tag)) await rea.profiles.save({ ...p, tags: [...p.tags, tag] })
                }
              }
            } else if (key === 'pin') {
              const anyUnpinned = targets.some((p: any) => !p.pinned)
              for (const p of targets) await rea.profiles.save({ ...p, pinned: anyUnpinned })
            } else if (key === 'disable') {
              const anyEnabled = targets.some((p: any) => !p.disabled)
              for (const p of targets) await rea.profiles.save({ ...p, disabled: anyEnabled })
            } else if (key === 'launch') {
              const hp = window.prompt(t('newProfile.screen'), 'https://example.com')
              if (hp) for (const p of targets) await rea.profiles.save({ ...p, startup: { ...p.startup, homepage: hp } })
            } else if (key === 'edit') {
              const tag = window.prompt(t('profiles.notes'))
              if (tag != null) for (const p of targets) await rea.profiles.save({ ...p, notes: tag })
            }
            await refresh.profiles()
          }
        }}
      >
        <Button type="text" icon={<MoreOutlined />} style={{ color: '#fff' }} />
      </Dropdown>
      <Popover
        content={
          <div style={{ maxWidth: 260, fontSize: 12.5 }}>
            {profiles.filter((p: any) => selected.includes(p.id)).map((p: any) => (
              <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />
                {p.name}
              </div>
            ))}
          </div>
        }
      >
        <Button type="text" style={{ color: '#fff' }} icon={<SearchOutlined />} title={t('bulk.selected', { n: selected.length })} />
      </Popover>
    </div>
  )
}
