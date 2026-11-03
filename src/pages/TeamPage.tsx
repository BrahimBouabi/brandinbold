import { Empty, Tabs } from 'antd'
import { useTranslation } from 'react-i18next'

export function TeamPage() {
  const { t } = useTranslation()
  return (
    <div>
      <h2 style={{ marginBottom: 18 }}>{t('team.title')}</h2>
      <Tabs
        items={[
          { key: 'members', label: t('team.members'), children: <Empty description={t('team.empty')} style={{ marginTop: 80 }} /> },
          { key: 'roles', label: t('team.roles'), children: <Empty description={t('team.empty')} style={{ marginTop: 80 }} /> },
          { key: 'activity', label: t('team.activity'), children: <Empty description={t('team.empty')} style={{ marginTop: 80 }} /> }
        ]}
      />
    </div>
  )
}
