import { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Radio, Select, Space, Typography, message } from 'antd'
import type { Group, ProxyEntry, TargetOS } from '@shared/types'
import { useApp } from '../App'
import { ENABLE_PLAN_LIMITS } from '../../shared/config'

const rea = (window as any).rea

export function BulkCreateModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { profiles, groups, proxies, settings, cloudStatus } = useApp()
  const [count, setCount] = useState(5)
  const [prefix, setPrefix] = useState('Profile')
  const [startIndex, setStartIndex] = useState(1)
  const [os, setOs] = useState<TargetOS>('macos')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [proxyId, setProxyId] = useState<string | null>(null)
  const [tagsRaw, setTagsRaw] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setStartIndex(profiles.length + 1)
    }
  }, [open, profiles.length])

  const authed = !!cloudStatus?.authed && !!cloudStatus?.user
  const max = authed ? (cloudStatus!.user!.maxProfiles ?? 3) : (settings.maxProfiles ?? 3)
  const enforceQuota = ENABLE_PLAN_LIMITS && authed
  const remainingQuota = enforceQuota ? Math.max(0, max - profiles.length) : null

  const submit = async () => {
    if (count < 1 || count > 50) {
      message.warning('Please enter a count between 1 and 50')
      return
    }
    if (enforceQuota && remainingQuota === 0) {
      message.error(`Plan limit reached (${profiles.length}/${max} profiles)`)
      return
    }
    setBusy(true)
    try {
      const tags = tagsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await rea.profiles.bulkCreate({
        count,
        prefix: prefix.trim() || 'Profile',
        startIndex,
        os,
        groupId,
        proxyId,
        tags
      })
      if (res.skippedQuota > 0) {
        message.warning(`Created ${res.created.length} profile(s); ${res.skippedQuota} skipped due to plan limit (${max} max)`)
      } else {
        message.success(`Created ${res.created.length} profile${res.created.length === 1 ? '' : 's'} with unique fingerprints`)
      }
      onCreated()
      onClose()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Bulk create profiles"
      onCancel={onClose}
      width={540}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={enforceQuota && remainingQuota === 0}
            onClick={() => void submit()}
          >
            Create {count} profile{count === 1 ? '' : 's'}
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          Each profile receives a unique, coherent Camoufox fingerprint pinned at creation time.
        </Typography.Text>

        {enforceQuota && remainingQuota !== null && count > remainingQuota && (
          <Alert
            type="warning"
            showIcon
            message={`Your ${cloudStatus?.user?.plan ?? 'free'} plan has ${remainingQuota} profile slot(s) remaining (${profiles.length}/${max} used). Excess profiles will be skipped.`}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 10 }}>
          <div>
            <Typography.Text style={{ fontSize: 12, opacity: 0.75 }}>Name prefix</Typography.Text>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="Profile"
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Typography.Text style={{ fontSize: 12, opacity: 0.75 }}>Number of profiles (1–50)</Typography.Text>
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
              style={{ marginTop: 4 }}
            />
          </div>
          <div>
            <Typography.Text style={{ fontSize: 12, opacity: 0.75 }}>Start index</Typography.Text>
            <Input
              type="number"
              min={1}
              value={startIndex}
              onChange={(e) => setStartIndex(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ marginTop: 4 }}
            />
          </div>
        </div>

        <div>
          <Typography.Text style={{ fontSize: 12, opacity: 0.75, display: 'block', marginBottom: 6 }}>
            Operating System
          </Typography.Text>
          <Radio.Group value={os} onChange={(e) => setOs(e.target.value)}>
            <Radio.Button value="macos">macOS</Radio.Button>
            <Radio.Button value="windows">Windows</Radio.Button>
            <Radio.Button value="linux">Linux</Radio.Button>
          </Radio.Group>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Typography.Text style={{ fontSize: 12, opacity: 0.75 }}>Assign to Group</Typography.Text>
            <Select
              allowClear
              placeholder="Unassigned"
              style={{ width: '100%', marginTop: 4 }}
              value={groupId}
              onChange={(v) => setGroupId(v ?? null)}
              options={[
                { value: null as any, label: 'Unassigned' },
                ...groups.map((g: Group) => ({ value: g.id, label: g.name }))
              ]}
            />
          </div>
          <div>
            <Typography.Text style={{ fontSize: 12, opacity: 0.75 }}>Proxy (from Proxy Library)</Typography.Text>
            <Select
              allowClear
              placeholder="Without proxy"
              style={{ width: '100%', marginTop: 4 }}
              value={proxyId}
              onChange={(v) => setProxyId(v ?? null)}
              options={[
                { value: null as any, label: 'Without proxy' },
                ...proxies.map((px: ProxyEntry) => ({
                  value: px.id,
                  label: `${px.name || px.host} (${px.host}:${px.port})`
                }))
              ]}
            />
          </div>
        </div>

        <div>
          <Typography.Text style={{ fontSize: 12, opacity: 0.75 }}>Tags (comma separated)</Typography.Text>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="batch-1, warm-up"
            style={{ marginTop: 4 }}
          />
        </div>
      </div>
    </Modal>
  )
}
