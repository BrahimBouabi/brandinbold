import { Empty } from 'antd'
import { useTranslation } from 'react-i18next'

export function ProxyShopPage() {
  const { t } = useTranslation()
  return (
    <div>
      <h2 style={{ marginBottom: 18 }}>{t('nav.proxyShop')}</h2>
      <Empty description="Proxy providers marketplace — coming soon" style={{ marginTop: 120 }} />
    </div>
  )
}
