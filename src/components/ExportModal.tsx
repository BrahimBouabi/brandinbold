import { useState } from 'react'
import { Alert, Button, Checkbox, Modal, Radio, Space, Typography, message } from 'antd'
import { useTranslation } from 'react-i18next'

const rea = (window as any).rea

export function ExportModal({
  ids,
  open,
  onClose
}: {
  ids: string[]
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [format, setFormat] = useState<'incogniton' | 'brandinbold'>('incogniton')
  const [includeNotes, setIncludeNotes] = useState(true)
  const [includeCredentials, setIncludeCredentials] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const path = await rea.profiles.export(ids, { format, includeNotes, includeCredentials })
      if (path) message.success(`Exported: ${path}`)
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
      title={`Export ${ids.length} profile${ids.length > 1 ? 's' : ''}`}
      onCancel={onClose}
      width={560}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={busy} onClick={() => void run()}>
            Export
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Typography.Text strong>Format</Typography.Text>
          <Radio.Group
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}
          >
            <Radio value="incogniton">
              <b>Incogniton-compatible CSV</b>
              <div style={{ color: '#8a93a0', fontSize: 12, marginLeft: 24 }}>
                Semicolon-separated, 68 columns — importable back into Incogniton. Extra
                Brandinbold columns (id, tags, extensions, color) are added at the end and
                ignored by Incogniton.
              </div>
            </Radio>
            <Radio value="brandinbold">
              <b>Brandinbold full backup (JSON)</b>
              <div style={{ color: '#8a93a0', fontSize: 12, marginLeft: 24 }}>
                Lossless: every Brandinbold field, groups included. Use for backup/restore.
              </div>
            </Radio>
          </Radio.Group>
        </div>

        <div>
          <Typography.Text strong>Security</Typography.Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <Checkbox checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)}>
              Include profile notes
            </Checkbox>
            <Checkbox checked={includeCredentials} onChange={(e) => setIncludeCredentials(e.target.checked)}>
              Include proxy credentials (username + password)
            </Checkbox>
          </div>
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 10 }}
            message="Notes often contain plaintext passwords. The exported file is NOT encrypted — handle it accordingly. Cookies and sessions are never exported."
          />
        </div>
      </div>
    </Modal>
  )
}
