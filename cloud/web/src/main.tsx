import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'

// TASK 10 Étape 2.1 scaffold — the real landing/auth/dashboard lands in Étape 2.3
// with the full Brandinbold identity (#8952ef, boldin logo, dark/light).
function Stub() {
  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: '#8952ef', borderRadius: 8 },
        algorithm: theme.darkAlgorithm
      }}
    >
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#101216', color: '#d7dbe2', fontFamily: '-apple-system, system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 40 }}>Brandinbold</h1>
          <p style={{ opacity: 0.6 }}>Next-Gen Antidetect Browser — cloud scaffold (Étape 2.3)</p>
        </div>
      </div>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Stub />
  </React.StrictMode>
)
