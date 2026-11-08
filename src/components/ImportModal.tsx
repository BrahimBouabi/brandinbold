import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Radio, Select, Space, Table, Typography, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useApp } from '../App'

interface ImportRow {
  name: string
  os: string
  proxy: string
  status: 'ok' | 'warning' | 'error'
  messages: string[]
}
interface ImportPreviewData {
  format: string
  delimiter: string
  rowCount: number
  rows: ImportRow[]
  unmappedColumns: string[]
}

const rea = (window as any).rea

export function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreviewData | null>(null)
  const [fixAutomatically, setFixAutomatically] = useState(true)
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'rename'>('skip')
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<{ imported: number; skipped: number; fixed: number; warnings: number; log: string[] } | null>(null)

  const reset = () => {
    setText(null)
    setPreview(null)
    setReport(null)
  }

  const onFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    setReport(null)
    try {
      const pv = await rea.profiles.importPreview(content, fixAutomatically)
      setPreview(pv)
      if (pv.format === 'unknown') message.error('Format not recognized')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const onToggleFix = async (val: boolean) => {
    setFixAutomatically(val)
    if (text) {
      try {
        const pv = await rea.profiles.importPreview(text, val)
        setPreview(pv)
      } catch {
        /* ignore */
      }
    }
  }

  // capture démo: ?importdemo=1 charge un échantillon sans données sensibles
  useEffect(() => {
    if (open && new URLSearchParams(window.location.search).get('importdemo') === '1') {
      const demo = 'profile_browser_version;profile_name;profile_notes;simulated_operating_system;profile_group;proxy_connection_type;Navigator_platform;Timezone_timezone_name;Timezone_fill_timezone_based_on_ip\n134;PROFILE 01;note;windows;Structure FB-01;;Win32;Asia/Ho_Chi_Minh;true\n134;PROFILE 03;note;windows;Structure FB-01;;MacIntel;America/Cancun;true'
      void onFile(new File([demo], 'profiles-export.csv', { type: 'text/csv' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const run = async () => {
    if (!text) return
    setBusy(true)
    try {
      const result = await rea.profiles.importRun({ text, fixAutomatically, duplicateMode, targetGroupId })
      setReport(result)
      onImported()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const statusColor = (s: string) => (s === 'ok' ? '#3fb96a' : s === 'warning' ? '#e8b93e' : '#e05252')

  return (
    <Modal
      open={open}
      title="Import profiles"
      onCancel={() => { reset(); onClose() }}
      width={760}
      footer={
        report ? (
          <Button type="primary" onClick={() => { reset(); onClose() }}>Close</Button>
        ) : preview ? (
          <Space>
            <Button onClick={reset}>Back</Button>
            <Button type="primary" loading={busy} onClick={() => void run()}>Import {preview.rowCount} profiles</Button>
          </Space>
        ) : (
          <Button type="primary" onClick={() => fileRef.current?.click()}>Choose CSV / JSON file</Button>
        )
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json,.txt"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
      />

      {!text && (
        <div style={{ padding: '30px 0', textAlign: 'center' }}>
          <Typography.Paragraph type="secondary">
            Import profiles from an <b>Incogniton CSV export</b>, a <b>Brandinbold CSV/JSON backup</b>.<br />
            The format is detected automatically. Import never overwrites existing profiles.
          </Typography.Paragraph>
          <Button type="primary" onClick={() => fileRef.current?.click()}>Choose file…</Button>
        </div>
      )}

      {text && preview && !report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Alert
            type={preview.format === 'unknown' ? 'error' : 'info'}
            message={
              preview.format === 'unknown'
                ? 'Format not recognized'
                : `Detected: ${preview.format} · delimiter "${preview.delimiter || '—'}" · ${preview.rowCount} rows`
            }
          />
          {preview.format === 'unknown' && (
            <Typography.Text type="secondary">
              Expected: an Incogniton CSV export (profile_name; simulated_operating_system; …) or a Brandinbold JSON backup.
            </Typography.Text>
          )}
          {preview.format !== 'unknown' && (
            <>
              <Table
                size="small"
                rowKey={(_r, i) => String(i)}
                pagination={{ pageSize: 6 }}
                dataSource={preview.rows}
                columns={[
                  {
                    title: 'Name', dataIndex: 'name', render: (v, r: any) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: statusColor(r.status) }} />
                        <b>{v}</b>
                      </span>
                    )
                  },
                  { title: 'OS', dataIndex: 'os', width: 90 },
                  { title: 'Proxy', dataIndex: 'proxy', width: 90 },
                  {
                    title: 'Notes', dataIndex: 'messages', render: (msgs: string[], r: any) =>
                      msgs.length ? (
                        <Typography.Text type={r.status === 'error' ? 'danger' : 'warning'} style={{ fontSize: 12 }}>
                          {msgs.join(' · ')}
                        </Typography.Text>
                      ) : '—'
                  }
                ]}
              />
              {preview.unmappedColumns.length > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Unmapped columns (kept as metadata): {preview.unmappedColumns.join(', ')}
                </Typography.Text>
              )}
              <div>
                <Typography.Text strong>Inconsistent data</Typography.Text>
                <Radio.Group
                  value={fixAutomatically}
                  onChange={(e) => void onToggleFix(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}
                >
                  <Radio value={true}>
                    <b>Fix automatically</b> — align platform/UA/fonts with the OS, timezone+geo to IP when no proxy (recommended)
                  </Radio>
                  <Radio value={false}>Keep as in file</Radio>
                </Radio.Group>
              </div>
              <Space wrap>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Duplicates</Typography.Text>
                  <Radio.Group size="small" value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value)}>
                    <Radio.Button value="skip">Skip</Radio.Button>
                    <Radio.Button value="rename">Rename</Radio.Button>
                  </Radio.Group>
                </div>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>Put in group</Typography.Text>
                  <GroupSelect value={targetGroupId} onChange={setTargetGroupId} />
                </div>
              </Space>
            </>
          )}
        </div>
      )}

      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Alert
            type="success"
            message={`${report.imported} imported · ${report.skipped} skipped · ${report.fixed} fixed · ${report.warnings} warnings`}
          />
          <pre style={{ maxHeight: 240, overflow: 'auto', background: 'rgba(128,128,128,0.1)', padding: 10, borderRadius: 8, fontSize: 12 }}>
            {report.log.join('\n')}
          </pre>
        </div>
      )}
    </Modal>
  )
}

function GroupSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { groups } = useApp()
  return (
    <Select
      allowClear
      placeholder="Unassigned"
      style={{ width: 180 }}
      value={value}
      onChange={onChange}
      options={[{ value: null as any, label: 'Unassigned' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]}
    />
  )
}
