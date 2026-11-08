import { useMemo, useState } from 'react'
import { Button, Input, Modal, Space, Table, Tag, message } from 'antd'
import { DeleteOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useApp } from '../App'
import { BrandLogo } from '../components/Logo'

const rea = (window as any).rea

function formatDeletedAt(iso?: string | null): { text: string; daysLeft: number } {
  if (!iso) return { text: '—', daysLeft: 30 }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { text: '—', daysLeft: 30 }
  const elapsedDays = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const daysLeft = Math.max(0, 30 - elapsedDays)
  return {
    text: d.toLocaleString(),
    daysLeft
  }
}

export function TrashPage() {
  const { t } = useTranslation()
  const { deleted, groups, refresh } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<React.Key[]>([])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return deleted
    return deleted.filter((p) => p.name.toLowerCase().includes(q))
  }, [deleted, search])

  const restoreOne = async (id: string) => {
    await rea.profiles.restore(id)
    setSelected((prev) => prev.filter((k) => k !== id))
    await refresh.all()
    message.success('Profile restored from Trash')
  }

  const purgeOne = (id: string, name: string) => {
    Modal.confirm({
      title: `Delete "${name}" permanently?`,
      content: 'This will permanently delete the profile and its local browser data directory. This action cannot be undone.',
      okText: t('trash.purge'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await rea.profiles.purge(id)
        setSelected((prev) => prev.filter((k) => k !== id))
        await refresh.all()
        message.success('Profile permanently deleted')
      }
    })
  }

  const restoreSelected = async () => {
    for (const id of selected) {
      await rea.profiles.restore(String(id))
    }
    const n = selected.length
    setSelected([])
    await refresh.all()
    message.success(`Restored ${n} profile${n === 1 ? '' : 's'}`)
  }

  const purgeSelected = () => {
    const n = selected.length
    Modal.confirm({
      title: `Permanently delete ${n} selected profile${n === 1 ? '' : 's'}?`,
      content: 'This will permanently delete the selected profiles and their local browser data directories.',
      okText: t('trash.purge'),
      okButtonProps: { danger: true },
      onOk: async () => {
        for (const id of selected) {
          await rea.profiles.purge(String(id))
        }
        setSelected([])
        await refresh.all()
        message.success(`Permanently deleted ${n} profile${n === 1 ? '' : 's'}`)
      }
    })
  }

  const emptyTrash = () => {
    Modal.confirm({
      title: `Empty Trash (${deleted.length} profile${deleted.length === 1 ? '' : 's'})?`,
      content: 'All profiles in Trash and their local browser folders will be permanently removed.',
      okText: 'Empty Trash',
      okButtonProps: { danger: true },
      onOk: async () => {
        const count = await rea.profiles.emptyTrash()
        setSelected([])
        await refresh.all()
        message.success(`Emptied Trash (${count} profile${count === 1 ? '' : 's'} deleted)`)
      }
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{t('trash.title')}</h2>
          <div style={{ fontSize: 12.5, opacity: 0.65, marginTop: 4 }}>
            Deleted profiles are kept in Trash for 30 days before automatic permanent removal.
          </div>
        </div>
        <Space>
          {selected.length > 0 && (
            <>
              <Button icon={<RollbackOutlined />} onClick={() => void restoreSelected()}>
                Restore selected ({selected.length})
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={purgeSelected}>
                Delete selected ({selected.length})
              </Button>
            </>
          )}
          {deleted.length > 0 && (
            <Button danger onClick={emptyTrash}>
              Empty Trash
            </Button>
          )}
        </Space>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Input
          prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
          placeholder="Search deleted profiles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 320, borderRadius: 18 }}
        />
      </div>

      <Table
        dataSource={rows}
        rowKey="id"
        pagination={false}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        locale={{ emptyText: t('trash.empty') }}
        columns={[
          {
            title: t('trash.name'),
            dataIndex: 'name',
            key: 'name',
            render: (v: string, p: any) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    flex: 'none',
                    background: p.color ?? '#8952ef',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <BrandLogo size={13} color="#ffffff" />
                </span>
                <b>{v}</b>
              </span>
            )
          },
          {
            title: t('profiles.group'),
            key: 'group',
            render: (_: any, p: any) => {
              const g = groups.find((x) => x.id === p.groupId)
              return g ? g.name : '—'
            }
          },
          {
            title: 'OS',
            dataIndex: 'os',
            key: 'os',
            width: 100,
            render: (os: string) => <Tag style={{ textTransform: 'capitalize' }}>{os || 'macos'}</Tag>
          },
          {
            title: t('trash.deleted'),
            key: 'deleted',
            render: (_, p: any) => {
              const info = formatDeletedAt(p.deletedAt)
              return (
                <span>
                  {info.text}{' '}
                  <Tag color={info.daysLeft <= 5 ? 'error' : 'default'} style={{ marginLeft: 6, fontSize: 11 }}>
                    {info.daysLeft}d left
                  </Tag>
                </span>
              )
            }
          },
          {
            title: '',
            key: 'actions',
            width: 280,
            align: 'right',
            render: (_, p: any) => (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<RollbackOutlined />}
                  onClick={() => void restoreOne(p.id)}
                >
                  {t('trash.restore')}
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => purgeOne(p.id, p.name)}
                >
                  {t('trash.purge')}
                </Button>
              </div>
            )
          }
        ]}
      />
    </div>
  )
}
