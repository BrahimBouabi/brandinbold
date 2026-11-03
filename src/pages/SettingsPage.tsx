import { useEffect, useState } from 'react'
import { Button, Input, Select, Slider, Switch, Table, Tabs, message } from 'antd'
import { useTranslation } from 'react-i18next'
import type { AppSettings, EngineId } from '@shared/types'
import { useApp } from '../App'

const rea = (window as any).rea

function ProfileStorageRow({ onDone }: { onDone: (freedBytes: number) => void }) {
  const rea = (window as any).rea
  const [info, setInfo] = useState<{ totalBytes: number; cacheBytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void (async () => setInfo(await rea.profiles.storageInfo()))() }, [])
  const fmt = (b: number) => (b > 1024 * 1024 * 1024 ? (b / 1024 ** 3).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(1) + ' MB')
  return (
    <div style={{ display: 'flex', gap: 20, padding: '10px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
      <div style={{ width: 190, fontSize: 13.5, fontWeight: 600, paddingTop: 2 }}>Profile storage</div>
      <div style={{ flex: 1 }}>
        {info ? (
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Total: <b>{fmt(info.totalBytes)}</b>
            <span style={{ opacity: 0.6 }}> (transient cache: {fmt(info.cacheBytes)})</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.5 }}>Measuring…</div>
        )}
        <Button
          size="small"
          disabled={!info || info.cacheBytes === 0 || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true)
            const res = await rea.profiles.purgeCache()
            setBusy(false)
            onDone(res.freedBytes)
            setInfo(await rea.profiles.storageInfo())
          }}
        >
          Clean profiles cache
        </Button>
        <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 6 }}>
          Removes transient network caches (cache2, startupCache, thumbnails, shader-cache, crash dumps) from stopped profiles. Cookies, history, sessions and logins are never touched. Running profiles are skipped.
        </div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { settings, refresh } = useApp()
  const save = async (patch: Partial<AppSettings>) => {
    await refresh.settings(patch)
    message.success(t('settings.saved'))
  }

  const Row = ({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) => (
    <div style={{ display: 'flex', gap: 20, padding: '10px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
      <div style={{ width: 190, fontSize: 13.5, fontWeight: 600, paddingTop: 2 }}>{label}</div>
      <div style={{ flex: 1, maxWidth: wide ? undefined : 560 }}>{children}</div>
    </div>
  )

  const Toggle = ({ field, label }: { field: keyof AppSettings; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <Switch size="small" checked={!!settings[field]} onChange={(v) => void save({ [field]: v } as any)} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  )

  const tabItems = [
    {
      key: 'details',
      label: t('settings.details'),
      children: (
        <div>
          <Row label={t('settings.username')}>
            <Input
              value={settings.user?.name}
              onChange={(e) => void save({ user: { ...settings.user, name: e.target.value } })}
            />
          </Row>
          <Row label={t('settings.email')}>
            <Input
              value={settings.user?.email}
              onChange={(e) => void save({ user: { ...settings.user, email: e.target.value } })}
            />
          </Row>
          <Row label={t('settings.changePassword')}>
            <Button disabled>Local account — no password</Button>
          </Row>
          <Row label={t('settings.twoFa')}>
            <Switch size="small" disabled />
          </Row>
        </div>
      )
    },
    {
      key: 'security',
      label: t('settings.security'),
      children: (
        <div>
          <Row label={t('settings.sessions')}>
            <Table
              pagination={false}
              rowKey="k"
              dataSource={[{ k: 'this', device: 'This Mac', os: 'macOS', ip: '127.0.0.1', last: 'now' }]}
              columns={[
                { title: 'Device', dataIndex: 'device' },
                { title: 'OS', dataIndex: 'os' },
                { title: 'IP', dataIndex: 'ip' },
                { title: 'Last seen', dataIndex: 'last' }
              ]}
            />
          </Row>
          <Row label="">
            <Button danger disabled>{t('settings.logoutEverywhere')}</Button>
          </Row>
        </div>
      )
    },
    {
      key: 'preferences',
      label: t('settings.preferences'),
      children: (
        <div>
          <Row label={t('settings.fingerprint')}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Select
                style={{ width: 180 }}
                value={settings.minScreen}
                onChange={(v) => void save({ minScreen: v })}
                options={['1280x960', '1366x768', '1440x900'].map((v) => ({ value: v, label: v }))}
              />
              <Select
                style={{ width: 180 }}
                value={settings.maxScreen}
                onChange={(v) => void save({ maxScreen: v })}
                options={['1920x1080', '2560x1440', '5120x2880'].map((v) => ({ value: v, label: v }))}
              />
            </div>
          </Row>
          <Row label="">
            <Toggle field="latestUaNewProfiles" label={t('settings.latestUa')} />
            <Toggle field="webcamByDefault" label={t('settings.webcam')} />
          </Row>
          <Row label={t('settings.otherPrefs')}>
            <Toggle field="autoProxyCheck" label={t('settings.autoProxyCheck')} />
            <Toggle field="condensedRows" label={t('settings.condensedRows')} />
            <Toggle field="colorfulStatus" label={t('settings.colorfulStatus')} />
            <Toggle field="confirmBeforeClose" label={t('settings.confirmClose')} />
          </Row>
        </div>
      )
    },
    {
      key: 'browser',
      label: t('settings.browser'),
      children: (
        <div>
          <ProfileStorageRow onDone={(freed) => message.success(`Cache cleaned — ${(freed / 1024 / 1024).toFixed(1)} MB freed`)} />
          <Row label={t('settings.browserSettings')}>
            <Toggle field="savePasswords" label={t('settings.savePasswords')} />
            <Toggle field="saveHistory" label={t('settings.saveHistory')} />
            <Toggle field="restoreSessions" label={t('settings.restoreSessions')} />
            <Toggle field="quitOnWindowClose" label={t('settings.quitOnClose')} />
            <Toggle field="colorBadges" label={t('settings.colorBadges')} />
            <Toggle field="blockTurnServers" label={t('settings.blockTurn')} />
            <Toggle field="useGoogleStun" label={t('settings.googleStun')} />
            <div style={{ marginTop: 8, width: 340 }}>
              <Select
                style={{ width: '100%' }}
                value={settings.windowNameMode}
                onChange={(v) => void save({ windowNameMode: v })}
                options={[
                  { value: 'tab', label: 'Show tab profile name' },
                  { value: 'window', label: 'Show window profile name' },
                  { value: 'none', label: 'No profile name' }
                ]}
              />
            </div>
          </Row>
        </div>
      )
    },
    {
      key: 'automation',
      label: t('settings.automation'),
      children: (
        <div>
          <Row label={t('settings.automation')}>
            <Toggle field="automationEnabled" label={t('settings.enableApi')} />
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <div>
                <label style={{ fontSize: 11.5, opacity: 0.6 }}>{t('settings.apiPort')}</label>
                <Input
                  style={{ width: 140 }}
                  type="number"
                  value={settings.automationPort}
                  onChange={(e) => void save({ automationPort: +e.target.value })}
                />
              </div>
            </div>
            <Toggle field="walkPortIfTaken" label={t('settings.walkPort')} />
            <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>
              API docs: GET /alive · /profile/all · /profile/launch/:id · /automation/launch/puppeteer/:id
            </p>
          </Row>
          <Row label={t('settings.engine')}>
            <Select
              style={{ width: 420 }}
              value={settings.engine}
              onChange={(v) => void save({ engine: v as EngineId })}
              options={[
                { value: 'camoufox', label: t('settings.camoufox') },
                { value: 'chrome-cdp', label: t('settings.chromeCdp') }
              ]}
            />
          </Row>
          <Row label={t('settings.remoteControl')}>
            <Toggle field="allowRemoteControl" label={t('settings.remoteControl')} />
          </Row>
        </div>
      )
    },
    {
      key: 'transfer',
      label: t('settings.profileTransfer'),
      children: (
        <div>
          <Row label={t('settings.profileTransfer')}>
            <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>{t('settings.transferHint')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button disabled>{t('settings.transfer')}</Button>
              <Button disabled>{t('settings.accept')}</Button>
              <Button disabled>{t('settings.cancelTransfers')}</Button>
            </div>
          </Row>
        </div>
      )
    },
    {
      key: 'debug',
      label: t('settings.debugTools'),
      children: (
        <div>
          <Row label="Browser">
            <p style={{ fontSize: 13, marginBottom: 8 }}>Check all installed browser versions for available updates</p>
            <Button onClick={() => void rea.engine.install()}>{t('settings.checkUpdates')}</Button>
          </Row>
          <Row label="Data">
            <Button
              onClick={() =>
                message.info('Data directory: ~/Library/Application Support/Rea')
              }
            >
              {t('settings.openDataDir')}
            </Button>
          </Row>
          <Row label="Old profiles">
            <Button disabled>{t('settings.cleanOld')}</Button>
          </Row>
          <Row label="Export">
            <Button onClick={() => window.dispatchEvent(new CustomEvent('brandinbold-export-all'))}>
              Export all profiles (CSV)
            </Button>
          </Row>
          <Row label="Import">
            <Button onClick={() => window.dispatchEvent(new CustomEvent('brandinbold-import'))}>
              Import profiles (CSV / JSON)
            </Button>
          </Row>
          <Row label="Refresh">
            <Button onClick={() => window.location.reload()}>{t('settings.refreshApp')}</Button>
          </Row>
        </div>
      )
    },
    {
      key: 'share',
      label: t('settings.shareAccount'),
      children: (
        <div>
          <Row label={t('settings.sharedByYou')}>
            <p style={{ fontSize: 13, opacity: 0.6, padding: '14px 16px', background: 'rgba(124,58,237,0.06)', borderRadius: 10 }}>
              {t('settings.noShared')}
            </p>
          </Row>
          <Row label={t('settings.sharedWithYou')}>
            <p style={{ fontSize: 13, opacity: 0.6, padding: '14px 16px', background: 'rgba(124,58,237,0.06)', borderRadius: 10 }}>
              {t('settings.noShared')}
            </p>
          </Row>
        </div>
      )
    },
    {
      key: 'backup',
      label: t('settings.localBackup'),
      children: (
        <div>
          <Row label={t('settings.backups')}>
            <label style={{ fontSize: 12.5, opacity: 0.7 }}>{t('settings.maxBackups')}</label>
            <Slider min={0} max={10} value={settings.maxBackups} onChange={(v) => void save({ maxBackups: v })} style={{ maxWidth: 420 }} />
            <label style={{ fontSize: 12.5, opacity: 0.7, marginTop: 8 }}>{t('settings.maxBackupSize')}</label>
            <Slider min={0} max={1000} value={settings.maxBackupSizeMb} onChange={(v) => void save({ maxBackupSizeMb: v })} style={{ maxWidth: 420 }} />
            <Button danger style={{ marginTop: 12 }} disabled>{t('settings.deleteBackups')}</Button>
          </Row>
        </div>
      )
    }
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>{t('settings.title')}</h2>
      <Tabs items={tabItems} />
    </div>
  )
}
