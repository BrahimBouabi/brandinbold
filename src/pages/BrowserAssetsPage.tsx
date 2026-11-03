import { useEffect, useState } from 'react'
import { Button, Table, Tag, message } from 'antd'
import { useTranslation } from 'react-i18next'
import type { EngineId } from '@shared/types'
import { useApp } from '../App'

const rea = (window as any).rea

export function BrowserAssetsPage() {
  const { t } = useTranslation()
  const { settings, refresh } = useApp()
  const [status, setStatus] = useState<{ camoufox: string | null; chrome: string | null } | null>(null)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    void rea.engine.status().then(setStatus)
    return rea.onProfileEvent((e: any) => {
      if (e.type === 'engine-progress') setProgress(e.status)
    })
  }, [])

  const install = async () => {
    setInstalling(true)
    try {
      await rea.engine.install()
      message.success(t('common.upToDate'))
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setInstalling(false)
      setStatus(await rea.engine.status())
      await refresh.all()
    }
  }

  const rows = [
    {
      key: 'camoufox',
      engine: 'Camoufox (patched Firefox)',
      version: status?.camoufox ?? null,
      primary: (settings.engine ?? 'camoufox') === 'camoufox'
    },
    {
      key: 'chrome',
      engine: 'Google Chrome (CDP)',
      version: status?.chrome ?? null,
      primary: settings.engine === 'chrome-cdp'
    }
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 6 }}>{t('browserAssets.title')}</h2>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 18 }}>{t('browserAssets.hint')}</p>
      <Table
        dataSource={rows}
        rowKey="key"
        pagination={false}
        columns={[
          { title: t('browserAssets.engine'), dataIndex: 'engine', key: 'engine', render: (v) => <b>{v}</b> },
          {
            title: t('browserAssets.version'),
            dataIndex: 'version',
            key: 'version',
            render: (v) => (v ? <Tag color="success">{v}</Tag> : <Tag>{t('browserAssets.notInstalled')}</Tag>)
          },
          {
            title: '',
            key: 'primary',
            render: (_, r) =>
              r.primary ? <Tag color="purple">{t('browserAssets.primary')}</Tag> : null
          },
          {
            title: '',
            key: 'actions',
            width: 220,
            render: (_, r) => (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  loading={installing && r.key === 'camoufox'}
                  onClick={() => void install()}
                >
                  {r.version ? t('browserAssets.update') : t('browserAssets.install')}
                </Button>
                {!r.primary && (
                  <Button
                    size="small"
                    onClick={async () => {
                      await refresh.settings({ engine: r.key as EngineId })
                      message.success(t('browserAssets.setPrimary'))
                    }}
                  >
                    {t('browserAssets.setPrimary')}
                  </Button>
                )}
              </div>
            )
          }
        ]}
      />
      {installing && progress && (
        <p style={{ marginTop: 12, fontSize: 12.5, opacity: 0.7 }}>{progress}</p>
      )}
    </div>
  )
}
