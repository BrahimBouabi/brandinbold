import { useEffect, useState } from 'react'
import { Button, Input, Space, Typography, message } from 'antd'

const rea = (window as any).rea

/**
 * Cloud API URL editor (Settings → Debug tools and the AuthGate).
 * Test = probe /api/health without saving; Save = persist + sign out if the
 * server changed. Locked (read-only) when BRANDINBOLD_CLOUD_API_URL is set.
 */
export function CloudServerField({ compact = false, onSaved }: { compact?: boolean; onSaved?: (url: string) => void }) {
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState('')
  const [fromEnv, setFromEnv] = useState(false)
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void rea.cloud.status().then((s: any) => {
      setUrl(s.apiUrl)
      setSaved(s.apiUrl)
      setFromEnv(!!s.apiUrlFromEnv)
    })
  }, [])

  const test = async () => {
    setBusy('test')
    const r = await rea.cloud.testUrl(url)
    setBusy(null)
    setStatus(r.ok ? { ok: true, text: `Connected — ${r.app} v${r.version}` } : { ok: false, text: r.error ?? 'Unreachable' })
    return r.ok as boolean
  }

  const save = async () => {
    setBusy('save')
    try {
      const r = await rea.cloud.setApiUrl(url)
      setSaved(r.apiUrl)
      setUrl(r.apiUrl)
      message.success(r.signedOut ? 'Server saved — signed out of the previous server' : 'Server saved')
      onSaved?.(r.apiUrl)
    } catch (e: any) {
      message.error(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <Space.Compact style={{ width: '100%', maxWidth: compact ? undefined : 520 }}>
        <Input
          value={url}
          disabled={fromEnv}
          placeholder="https://brandinbold-api.up.railway.app"
          onChange={(e) => {
            setUrl(e.target.value)
            setStatus(null)
          }}
          onPressEnter={() => void test()}
        />
        <Button onClick={() => void test()} loading={busy === 'test'} disabled={!url}>
          Test
        </Button>
        <Button type="primary" onClick={() => void save()} loading={busy === 'save'} disabled={fromEnv || !url || url === saved}>
          Save
        </Button>
      </Space.Compact>
      <div style={{ marginTop: 6, fontSize: 12 }}>
        {status ? (
          <Typography.Text type={status.ok ? 'success' : 'danger'}>{status.text}</Typography.Text>
        ) : fromEnv ? (
          <Typography.Text type="secondary">Set by BRANDINBOLD_CLOUD_API_URL (read-only)</Typography.Text>
        ) : (
          <Typography.Text type="secondary">Cloud API server used for sign-in and sync</Typography.Text>
        )}
      </div>
    </div>
  )
}

