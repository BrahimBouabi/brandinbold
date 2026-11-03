import { useState } from 'react'
import { Button, Empty, Input, Modal, Select, Space, Table, Tag, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import type { ProxyEntry } from '@shared/types'
import { useApp } from '../App'

const rea = (window as any).rea

interface Draft {
  id?: string
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string
  password: string
  rotating: boolean
}

export function ProxiesPage() {
  const { t } = useTranslation()
  const { proxies, profiles, refresh } = useApp()
  const [tab, setTab] = useState<'all' | 'groups'>('all')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string>('')

  const openNew = () =>
    setEditing({ name: '', type: 'http', host: '', port: 0, username: '', password: '', rotating: false })

  const save = async () => {
    if (!editing) return
    if (!editing.host || !editing.port) {
      message.error(`${t('proxies.host')}/${t('proxies.port')}?`)
      return
    }
    if (editing.id) {
      const existing = proxies.find((p) => p.id === editing.id)!
      await rea.proxies.save({ ...existing, ...editing })
    } else {
      await rea.proxies.create(editing)
    }
    setEditing(null)
    await refresh.proxies()
  }

  const test = async () => {
    if (!editing) return
    setTesting(true)
    setTestResult(t('proxies.checking'))
    const res = await rea.proxies.test({
      type: editing.type === 'https' ? 'http' : editing.type,
      host: editing.host,
      port: editing.port,
      username: editing.username,
      password: editing.password
    })
    setTestResult(res.ok ? `${t('proxies.ok')}: ${res.ip} · ${res.country} · ${res.timezone} · ${res.latencyMs}ms` : `${t('proxies.failed')}: ${res.error}`)
    setTesting(false)
  }

  const columns: ColumnsType<ProxyEntry> = [
    { title: t('proxies.name'), dataIndex: 'name', key: 'name', render: (v) => <b>{v}</b> },
    {
      title: t('proxies.colStatus'),
      key: 'status',
      render: (_, p) =>
        p.lastStatus === 'ok' ? (
          <Tag color="success">{t('proxies.ok')}</Tag>
        ) : p.lastStatus === 'failed' ? (
          <Tag color="error">{t('proxies.failed')}</Tag>
        ) : (
          <Tag>—</Tag>
        )
    },
    {
      title: t('proxies.rotating'),
      key: 'rotating',
      render: (_, p) => (p.rotating ? '✔' : '—')
    },
    {
      title: t('proxies.assigned'),
      key: 'assigned',
      render: (_, p) => profiles.filter((pf) => pf.proxyId === p.id).length
    },
    {
      title: 'Endpoint',
      key: 'endpoint',
      render: (_: any, p: ProxyEntry) => <code style={{ fontSize: 11.5 }}>{p.type}://{p.host}:{p.port}</code>
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, p) => (
        <Space>
          <Button size="small" onClick={() => setEditing({ ...p })}>{t('proxies.edit')}</Button>
          <Button
            size="small"
            danger
            onClick={async () => {
              await rea.proxies.delete(p.id)
              await refresh.proxies()
            }}
          >
            {t('proxies.delete')}
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {(['all', 'groups'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                background: 'none', border: 'none', padding: '8px 14px', fontSize: 14,
                fontWeight: tab === k ? 700 : 500, cursor: 'pointer',
                color: tab === k ? 'rgb(124,58,237)' : 'inherit',
                borderBottom: tab === k ? '2px solid rgb(124,58,237)' : '2px solid transparent'
              }}
            >
              {k === 'all' ? t('proxies.allProxies') : t('proxies.groups')}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
            {t('proxies.newProxy')}
          </Button>
        </div>
      </div>

      <Table
        dataSource={proxies}
        columns={columns}
        rowKey="id"
        pagination={false}
        locale={{
          emptyText: (
            <div style={{ padding: 40 }}>
              <b>{t('proxies.noProxies')}</b>
              <div style={{ opacity: 0.6, marginTop: 6 }}>{t('proxies.emptyHint')}</div>
              <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 14 }} onClick={openNew}>
                {t('proxies.addProxy')}
              </Button>
            </div>
          )
        }}
      />

      <Modal
        open={!!editing}
        title={editing?.id ? t('proxies.edit') : t('proxies.newProxy')}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        okText={t('proxies.save')}
      >
        {editing && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, opacity: 0.65 }}>{t('proxies.name')}</label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.65 }}>{t('proxies.type')}</label>
              <Select
                style={{ width: '100%' }}
                value={editing.type}
                onChange={(v) => setEditing({ ...editing, type: v })}
                options={['http', 'https', 'socks5'].map((v) => ({ value: v, label: v.toUpperCase() }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.65 }}>{t('proxies.host')}</label>
              <Input value={editing.host} onChange={(e) => setEditing({ ...editing, host: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.65 }}>{t('proxies.port')}</label>
              <Input type="number" value={editing.port || ''} onChange={(e) => setEditing({ ...editing, port: +e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.65 }}>{t('proxies.username')}</label>
              <Input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.65 }}>{t('proxies.password')}</label>
              <Input.Password value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={editing.rotating}
                onChange={(e) => setEditing({ ...editing, rotating: e.target.checked })}
              />
              <span style={{ fontSize: 13 }}>{t('proxies.rotating')}</span>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Button onClick={() => void test()} loading={testing}>{t('proxies.test')}</Button>
              {testResult && (
                <span style={{ marginLeft: 10, fontSize: 12.5, opacity: 0.8 }}>{testResult}</span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
