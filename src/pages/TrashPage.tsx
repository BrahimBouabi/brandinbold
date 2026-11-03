import { Button, Table } from 'antd'
import { useTranslation } from 'react-i18next'
import { useApp } from '../App'

const rea = (window as any).rea

export function TrashPage() {
  const { t } = useTranslation()
  const { deleted, refresh } = useApp()
  return (
    <div>
      <h2 style={{ marginBottom: 18 }}>{t('trash.title')}</h2>
      <Table
        dataSource={deleted}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: t('trash.empty') }}
        columns={[
          { title: t('trash.name'), dataIndex: 'name', key: 'name', render: (v) => <b>{v}</b> },
          {
            title: t('trash.deleted'),
            key: 'deleted',
            render: (_, p: any) => '—'
          },
          {
            title: '',
            key: 'actions',
            width: 280,
            render: (_, p: any) => (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  onClick={async () => {
                    await rea.profiles.restore(p.id)
                    await refresh.all()
                  }}
                >
                  {t('trash.restore')}
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={async () => {
                    await rea.profiles.purge(p.id)
                    await refresh.all()
                  }}
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
