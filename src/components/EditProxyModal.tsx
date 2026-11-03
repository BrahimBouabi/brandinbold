import { useState } from 'react'
import { Button, Input, Modal, Select, Space, Switch, Tooltip, Typography, message } from 'antd'
import { EyeInvisibleOutlined, EyeOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { IpInfo, Profile, ProxyType } from '@shared/types'
import { useApp } from '../App'

const rea = (window as any).rea

interface Draft {
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
  rotating: boolean
  provider: string
}

export function EditProxyModal({
  profile,
  open,
  onClose,
  onSaved
}: {
  profile: Profile
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { proxies } = useApp()
  const [libraryId, setLibraryId] = useState<string | null>(profile.proxyId)
  const [draft, setDraft] = useState<Draft>({
    type: profile.proxy.type,
    host: profile.proxy.host,
    port: profile.proxy.port || undefined as any,
    username: profile.proxy.username,
    password: profile.proxy.password,
    rotating: false,
    provider: 'main'
  })
  const [showPw, setShowPw] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<IpInfo | null>(null)

  const parse = (raw: string) => {
    // url:port:username:password (also host:port)
    const parts = raw.trim().split(':').filter(Boolean)
    if (parts.length >= 2 && /^\d+$/.test(parts[1] ?? '')) {
      setDraft((d) => ({
        ...d,
        host: parts[0],
        port: parseInt(parts[1], 10),
        username: parts[2] ?? '',
        password: parts[3] ?? ''
      }))
      return true
    }
    return false
  }

  const check = async () => {
    setChecking(true)
    setResult(null)
    const res: IpInfo = await rea.proxies.test({
      type: draft.type === 'https' ? 'http' : draft.type,
      host: draft.host,
      port: draft.port,
      username: draft.username,
      password: draft.password
    })
    setResult(res)
    setChecking(false)
    if (res.ok) {
      Modal.confirm({
        title: t('editProxy.align'),
        okText: t('common.yes'),
        cancelText: t('common.no'),
        onOk: async () => {
          const fresh = await rea.profiles.save({
            ...profile,
            timezone: { mode: 'ip', name: res.timezone ?? '' },
            geolocation: { mode: 'ip', latitude: res.lat ?? 0, longitude: res.lon ?? 0, accuracy: 100 },
            navigator: { ...profile.navigator, languages: countryLocales(res.countryCode ?? 'US') }
          })
          void fresh
          message.success(t('editProxy.aligned'))
          onSaved()
        }
      })
    }
  }

  const save = async () => {
    const next: Profile =
      draft.type === 'none'
        ? { ...profile, proxy: { type: 'none', host: '', port: 0, username: '', password: '' }, proxyId: null }
        : {
            ...profile,
            proxy: { type: draft.type, host: draft.host, port: draft.port, username: draft.username, password: draft.password },
            proxyId: null
          }
    if (result?.ok) next.proxyLastCheck = result
    await rea.profiles.save(next)
    message.success(t('settings.saved'))
    onSaved()
    onClose()
  }

  const labelStyle = { fontSize: 11.5, opacity: 0.6, marginBottom: 4, display: 'block' }

  return (
    <Modal
      open={open}
      title={
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 17 }}>{t('editProxy.title')}</b>
        </span>
      }
      onCancel={onClose}
      width={560}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button onClick={() => void check()} loading={checking}>{t('editProxy.check')}</Button>
          <Button
            onClick={() =>
              void navigator.clipboard.writeText(
                draft.type === 'none' ? '' : `${draft.host}:${draft.port}:${draft.username}:${draft.password}`
              )
            }
          >
            {t('editProxy.copy')}
          </Button>
          <div style={{ flex: 1 }} />
          <Button onClick={onClose}>{t('editProxy.cancel')}</Button>
          <Button type="primary" onClick={() => void save()}>{t('editProxy.save')}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Space style={{ width: '100%' }}>
          <Button block style={{ flex: 1 }} onClick={() => message.info(t('newProfile.fromLibrary'))}>
            {t('editProxy.fromLibrary')}
          </Button>
          <Tooltip title={t('editProxy.freeHint')}>
            <Button block style={{ flex: 1 }}>{t('editProxy.freeProxy')}</Button>
          </Tooltip>
        </Space>

        <div>
          <label style={labelStyle}>{t('editProxy.connectionType')}</label>
          <Select
            style={{ width: '100%' }}
            value={draft.type}
            onChange={(v) => setDraft({ ...draft, type: v })}
            options={[
              { value: 'none', label: t('editProxy.without') },
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
              { value: 'socks4', label: 'SOCKS4' },
              { value: 'socks5', label: 'SOCKS5' }
            ]}
          />
        </div>

        {draft.type !== 'none' && (
          <>
            <div>
              <label style={labelStyle}>{t('editProxy.ipPort')}</label>
              <Input
                placeholder="192.168.1.1:8080"
                value={draft.host ? `${draft.host}:${draft.port || ''}` : ''}
                onChange={(e) => {
                  if (!parse(e.target.value)) {
                    const [h, p] = e.target.value.split(':')
                    setDraft({ ...draft, host: h ?? '', port: p ? parseInt(p, 10) : (undefined as any) })
                  }
                }}
              />
              <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>{t('editProxy.pasteHint')}</Typography.Text>
            </div>
            <Input
              placeholder={t('editProxy.username')}
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            />
            <Input
              type={showPw ? 'text' : 'password'}
              placeholder={t('editProxy.password')}
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              suffix={
                <a onClick={() => setShowPw(!showPw)}>
                  {showPw ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                </a>
              }
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch size="small" checked={draft.rotating} onChange={(v) => setDraft({ ...draft, rotating: v })} />
              <span style={{ fontSize: 13.5 }}>{t('editProxy.rotating')}</span>
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>{t('editProxy.provider')}</label>
            <Select
              style={{ width: '100%' }}
              value={draft.provider}
              onChange={(v) => setDraft({ ...draft, provider: v })}
              options={[{ value: 'main', label: t('editProxy.mainProvider') }]}
            />
          </div>
          <Tooltip title="Geo-IP provider used for the proxy Check">
            <InfoCircleOutlined style={{ opacity: 0.5, marginTop: 18 }} />
          </Tooltip>
        </div>

        {result && (
          <div
            style={{
              fontSize: 12.5,
              padding: '8px 10px',
              borderRadius: 8,
              background: result.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: result.ok ? '#10b981' : '#ef4444'
            }}
          >
            {result.ok
              ? t('editProxy.checkOk', { ip: result.ip, country: result.country, timezone: result.timezone, latency: result.latencyMs })
              : `${t('proxies.failed')}: ${result.error}`}
          </div>
        )}
      </div>
    </Modal>
  )
}

function countryLocales(cc: string): string[] {
  const map: Record<string, string[]> = {
    US: ['en-US', 'en'], GB: ['en-GB', 'en'], FR: ['fr-FR', 'fr', 'en'], DE: ['de-DE', 'de', 'en'],
    ES: ['es-ES', 'es'], PT: ['pt-PT', 'pt'], BR: ['pt-BR', 'pt'], RU: ['ru-RU', 'ru'],
    CN: ['zh-CN', 'zh'], JP: ['ja-JP', 'ja'], MA: ['ar-MA', 'ar', 'fr-FR', 'fr'], AE: ['ar-AE', 'ar', 'en'],
    SA: ['ar-SA', 'ar'], EG: ['ar-EG', 'ar'], IT: ['it-IT', 'it'], NL: ['nl-NL', 'nl']
  }
  return map[cc.toUpperCase()] ?? ['en-US', 'en']
}
