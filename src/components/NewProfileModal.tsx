import { useEffect, useMemo, useState } from 'react'
import { Table as _Table } from 'antd'
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Radio,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Typography,
  message
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  CopyOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  RedoOutlined
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Group, Profile, TargetOS } from '@shared/types'
import { useApp } from '../App'

const rea = (window as any).rea

type TabKey = 'details' | 'proxy' | 'privacy' | 'navigator' | 'hardware' | 'extensions' | 'other'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'proxy', label: 'Proxy' },
  { key: 'privacy', label: 'Privacy & Network' },
  { key: 'navigator', label: 'Browser & Navigator' },
  { key: 'hardware', label: 'Hardware' },
  { key: 'extensions', label: 'Extensions & Cookies' },
  { key: 'other', label: 'Other' }
]

const ADVANCED_TABS = TABS.slice(2)

const SCREENS = [
  '1024x768', '1280x800', '1366x768', '1440x900', '1536x864', '1600x900',
  '1680x1050', '1920x1080', '2560x1440', '3440x1440', '3840x2160'
]

/** GPU presets per OS — the unmasked renderer list the consistency engine uses. */
const GPU_BY_OS: Record<TargetOS, { vendor: string; unmaskedVendor: string; renderer: string; unmaskedRenderer: string }[]> = {
  macos: [
    { vendor: 'Google Inc. (Apple)', unmaskedVendor: 'Google Inc. (Apple)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
    { vendor: 'Google Inc. (Apple)', unmaskedVendor: 'Google Inc. (Apple)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)' },
    { vendor: 'Google Inc. (Intel)', unmaskedVendor: 'Google Inc. (Intel)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 645, OpenGL 4.1)' }
  ],
  windows: [
    { vendor: 'Google Inc. (Intel)', unmaskedVendor: 'Google Inc. (Intel)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', unmaskedVendor: 'Google Inc. (NVIDIA)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', unmaskedVendor: 'Google Inc. (AMD)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)' }
  ],
  linux: [
    { vendor: 'Google Inc. (Intel)', unmaskedVendor: 'Google Inc. (Intel)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics (CML GT2), OpenGL 4.6 (Core Profile) Mesa 24.0.9)' },
    { vendor: 'Google Inc. (AMD)', unmaskedVendor: 'Google Inc. (AMD)', renderer: 'WebKit WebGL', unmaskedRenderer: 'ANGLE (AMD, AMD Radeon RX 6600 (radeonsi navi23 LLVM 17.0.6), OpenGL 4.6)' }
  ]
}

const FONT_POOL: Record<TargetOS, string[]> = {
  macos: ['Helvetica Neue', 'Helvetica', 'Arial', 'Avenir', 'Avenir Next', 'Menlo', 'Monaco', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Geneva', 'Futura', 'Gill Sans', 'Trebuchet MS', 'Impact', 'Copperplate', 'Optima', 'Hoefler Text', 'Baskerville', 'Palatino', 'Charter', 'Cochin', 'Didot', 'Lucida Grande'],
  windows: ['Segoe UI', 'Arial', 'Tahoma', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Impact', 'Comic Sans MS', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel', 'Franklin Gothic', 'Gabriola', 'Lucida Console', 'Marlett', 'Microsoft Sans Serif', 'Palatino Linotype', 'SimSun', 'Symbol', 'Wingdings'],
  linux: ['DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'Ubuntu', 'Ubuntu Mono', 'Cantarell', 'Noto Sans', 'Noto Serif', 'FreeSans', 'FreeSerif', 'FreeMono', 'Nimbus Sans', 'Nimbus Roman', 'Charter', 'Clear Sans', 'Open Sans', 'Roboto']
}

function randomFonts(os: TargetOS): string[] {
  const pool = FONT_POOL[os]
  const n = 18 + Math.floor(Math.random() * 8)
  return [...pool].sort(() => Math.random() - 0.5).slice(0, n)
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

const ENGINE = 'camoufox' // profile engine; used for capability disabling
const IS_FIREFOX_ENGINE = ENGINE === 'camoufox'

const HOST_OS: TargetOS = (() => {
  const p = navigator.platform
  if (p.startsWith('Win')) return 'windows'
  if (p.startsWith('Mac')) return 'macos'
  return 'linux'
})()

const SCREENS_BY_OS: Record<TargetOS, string[]> = {
  windows: ['1366x768', '1600x900', '1920x1080', '2560x1440', '3840x2160'],
  macos: ['1440x900', '1536x864', '1680x1050', '1920x1080', '2560x1440', '3456x2234'],
  linux: ['1366x768', '1600x900', '1920x1080', '2560x1440']
}
const TYPICAL_CORES: Record<TargetOS, number> = { windows: 8, macos: 10, linux: 8 }

export function NewProfileModal({
  open,
  editing,
  initialTab,
  onClose,
  onCreated
}: {
  open: boolean
  /** existing profile → edit mode */
  editing?: Profile | null
  initialTab?: TabKey
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const { groups, settings, refresh } = useApp()
  const isEdit = !!editing

  const [tab, setTab] = useState<TabKey>(initialTab ?? 'details')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [narrow, setNarrow] = useState(
    () => new URLSearchParams(window.location.search).get('narrow') === '1' || window.innerWidth < 980
  )
  const [busy, setBusy] = useState(false)

  // draft state — a full Profile-like object
  const [d, setD] = useState<Profile>(() => editing ?? makeDraft())
  const patch = (p: Partial<Profile>) => setD((cur) => ({ ...cur, ...p }))

  useEffect(() => {
    const fn = () => setNarrow(window.innerWidth < 980)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  useEffect(() => {
    if (open) {
      setTab(initialTab ?? 'details')
      const base = editing ?? makeDraft()
      const qs = new URLSearchParams(window.location.search)
      const prevOs = qs.get('os') as TargetOS | null
      if (!editing && prevOs && ['windows', 'macos', 'linux'].includes(prevOs)) {
        setD({ ...base, os: prevOs })
      } else {
        setD(base)
      }
    }
  }, [open, editing?.id, initialTab])

  // ---------- consistency engine ----------
  const warnings = useMemo(() => {
    const w: string[] = []
    if (d.os !== HOST_OS) {
      w.push(
        `The spoofed OS (${d.os.charAt(0).toUpperCase() + d.os.slice(1)}) differs from this machine (${HOST_OS}). Font and rendering differences are detectable — Brandinbold applies this machine's real font set to keep the UI stable, and the canvas protection covers pixel readback. The strongest results come from ${HOST_OS} profiles on this machine.`
      )
    }
    if (d.os === 'linux') w.push('Linux is a small share of real traffic — the fingerprint is a stronger signal than Windows or macOS.')
    if (d.deviceMemory && ![1, 2, 4, 8].includes(d.deviceMemory)) w.push('Device memory should be 1, 2, 4 or 8 — other values are an obvious spoof.')
    const gpuList = GPU_BY_OS[d.os]
    if (d.webgl.unmaskedRenderer && !gpuList.some((g) => g.unmaskedRenderer === d.webgl.unmaskedRenderer)) {
      w.push(`The selected GPU does not match ${d.os} — values were validated against the engine's GPU list.`)
    }
    if (d.proxyLastCheck?.ok && d.timezone.mode === 'custom' && d.timezone.name && d.proxyLastCheck.timezone && d.timezone.name !== d.proxyLastCheck.timezone) {
      w.push(`Proxy exit IP is in ${d.proxyLastCheck.timezone} but the profile timezone is ${d.timezone.name}.`)
    }
    return w
  }, [d])

  const [flash, setFlash] = useState(false)
  const onOsChange = (os: TargetOS) => {
    const platform = os === 'windows' ? 'Win32' : os === 'macos' ? 'MacIntel' : 'Linux x86_64'
    const gpu = GPU_BY_OS[os][0]
    const presets = SCREENS_BY_OS[os]
    setD((cur) => ({
      ...cur,
      os,
      navigator: {
        ...cur.navigator,
        platform,
        hardwareConcurrency: TYPICAL_CORES[os],
      },
      screen: presets.includes(`${cur.screen.width}x${cur.screen.height}`)
        ? cur.screen
        : { width: parseInt(presets[Math.min(2, presets.length - 1)], 10), height: parseInt(presets[Math.min(2, presets.length - 1)].split('x')[1], 10) },
      webgl: { ...cur.webgl, vendor: cur.webglMeta !== 'off' ? gpu.vendor : cur.webgl.vendor, renderer: gpu.renderer, unmaskedVendor: gpu.unmaskedVendor, unmaskedRenderer: cur.webglMeta !== 'off' ? gpu.unmaskedRenderer : cur.webgl.unmaskedRenderer },
      fonts: cur.fonts.mode === 'custom' ? { mode: 'custom', list: randomFonts(os) } : cur.fonts,
      hardwareConcurrencyOverride: TYPICAL_CORES[os],
      fingerprint: null // stale — redrawn from the new OS on create/launch
    }))
    setFlash(true)
    setTimeout(() => setFlash(false), 2600)
    message.success(t('consistency.updated', { os: os.charAt(0).toUpperCase() + os.slice(1) }))
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const generated: Profile = await rea.profiles.generate(d)
      setD((cur) => ({ ...generated, ...keepUiFields(cur) }))
      message.success('New fingerprint generated')
    } finally {
      setBusy(false)
    }
  }

  const keepUiFields = (cur: Profile): Partial<Profile> => ({
    name: cur.name,
    notes: cur.notes,
    tags: cur.tags,
    groupId: cur.groupId,
    proxy: cur.proxy,
    proxyId: cur.proxyId,
    os: cur.os,
    color: cur.color
  })

  const randomizeFonts = () => {
    patch({ fonts: { mode: 'custom', list: randomFonts(d.os) } })
  }

  const checkProxy = async () => {
    setBusy(true)
    try {
      const res = await rea.proxies.test(d.proxy)
      patch({ proxyLastCheck: res })
      if (res.ok) {
        if (d.timezone.mode !== 'off' && res.timezone) patch({ timezone: { mode: 'ip', name: res.timezone } })
        if (res.lat != null && res.lon != null) patch({ geolocation: { ...d.geolocation, mode: d.geolocation.mode === 'off' ? 'ip' : d.geolocation.mode, latitude: res.lat, longitude: res.lon } })
        if (d.fillLanguageFromIp) patch({ navigator: { ...d.navigator, languages: countryLocales(res.countryCode ?? 'US') } })
      }
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    setBusy(true)
    try {
      let saved: Profile
      if (isEdit && editing) {
        saved = await rea.profiles.save({ ...d, id: editing.id })
      } else {
        const created = await rea.profiles.create(d.name || 'New profile')
        // draw + pin the fingerprint for the final id
        const generated = await rea.profiles.generate({ ...d, id: created.id })
        saved = await rea.profiles.save({ ...generated, ...keepUiFields(d), id: created.id, name: d.name || created.name })
      }
      void saved
      await refresh.profiles()
      onCreated()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }


  const Stepper = ({ v, set }: { v: number; set: (n: number) => void }) => (
    <Space>
      <Button size="small" icon={<span>−</span>} onClick={() => set(Math.max(0, v - 1))} />
      <span style={{ minWidth: 20, textAlign: 'center', fontSize: 13 }}>{v}</span>
      <Button size="small" icon={<span>+</span>} onClick={() => set(v + 1)} />
    </Space>
  )

  const parseIpPort = (raw: string) => {
    const parts = raw.trim().split(':').filter(Boolean)
    if (parts.length >= 2 && /^\d+$/.test(parts[1] ?? '')) {
      setD((cur) => ({ ...cur, proxy: { ...cur.proxy, host: parts[0], port: parseInt(parts[1], 10), username: parts[2] ?? cur.proxy.username, password: parts[3] ?? cur.proxy.password } }))
      return true
    }
    return false
  }

  const [showPw, setShowPw] = useState(false)

  const visibleTabs = narrow ? TABS.slice(0, 2) : TABS

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={960}
      footer={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }} />
          <Button style={{ marginRight: 10 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={busy} onClick={() => void create()}>{isEdit ? 'Save' : 'Create'}</Button>
        </div>
      }
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 17, background: '#8952ef', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 16 }}>👤</span>
          </span>
          <span style={{ fontSize: 17 }}>{isEdit ? `Edit ${d.name}` : 'New profile'}</span>
        </div>
      }
    >
      {/* ---- tab bar ---- */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(128,128,128,0.12)', borderRadius: 10, padding: '4px 6px', marginBottom: 8 }}>
        {!narrow && (
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} disabled={TABS[0].key === tab}
            onClick={() => setTab(TABS[Math.max(0, TABS.findIndex((x) => x.key === tab) - 1)].key)} />
        )}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {visibleTabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{
                background: 'none', border: 'none', padding: '9px 16px', fontSize: 13.5,
                fontWeight: tab === tb.key ? 700 : 500, cursor: 'pointer', color: tab === tb.key ? '#8952ef' : 'inherit', opacity: tab === tb.key ? 1 : 0.7
              }}
            >
              {tb.label}
            </button>
          ))}
        </div>
        {narrow ? (
          <Dropdown
            menu={{
              items: ADVANCED_TABS.map((tb) => ({ key: tb.key, label: tb.label })),
              onClick: ({ key }) => setTab(key as TabKey)
            }}
          >
            <Button type="text">Advanced <Typography.Text type="secondary">›</Typography.Text></Button>
          </Dropdown>
        ) : (
          <>
            <Button type="text" size="small" icon={<ArrowRightOutlined />} disabled={TABS[TABS.length - 1].key === tab}
              onClick={() => setTab(TABS[Math.min(TABS.length - 1, TABS.findIndex((x) => x.key === tab) + 1)].key)} />
          </>
        )}
      </div>

      {/* ---- consistency warnings ---- */}
      {warnings.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12.5, color: '#d97706' }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
        {/* ================= TAB: DETAILS ================= */}
        {tab === 'details' && (
          <div>
            <Row label="Profile name *">
              <Input value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="New profile" />
            </Row>
            <Row label="Group">
              <Select
                style={{ width: '100%' }}
                value={d.groupId}
                onChange={(v) => patch({ groupId: v })}
                allowClear
                placeholder="Unassigned"
                options={[{ value: null as any, label: 'Unassigned' }, ...groups.map((g: Group) => ({ value: g.id, label: g.name }))]}
              />
            </Row>
            <Row label="Tags">
              <div>
                {d.tags.length === 0 ? <div style={{ color: '#8a93a0', fontSize: 13 }}>No tags yet</div> : (
                  <Space size={4} wrap style={{ marginBottom: 8 }}>
                    {d.tags.map((tg) => <Tag key={tg} color="gold" closable onClose={() => patch({ tags: d.tags.filter((x) => x !== tg) })}>{tg}</Tag>)}
                  </Space>
                )}
                <Input.Search
                  enterButton="Add tag"
                  placeholder="Type a tag and press Add"
                  onSearch={(v) => v.trim() && !d.tags.includes(v.trim()) && patch({ tags: [...d.tags, v.trim()] })}
                />
              </div>
            </Row>
            <Row label="Browser version" desc={IS_FIREFOX_ENGINE ? `Engine build managed by Brandinbold (${settings.engine === 'camoufox' ? 'Camoufox' : 'Chrome'}).` : undefined}>
              <Select style={{ width: 240 }} value="managed" disabled
                options={[{ value: 'managed', label: 'Latest (managed build)' }]} />
            </Row>
            <Row label="">
              <a onClick={() => void regenerate()} style={{ color: '#8952ef', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                <RedoOutlined /> Get New Fingerprint
              </a>
            </Row>
            <Row label="">
              <T on={!!d.webcam} set={(v) => patch({ webcam: v })} label="Allow webcam access" desc="Grants the camera permission on launch." />
              <T on={!!d.fillLanguageFromIp} set={(v) => patch({ fillLanguageFromIp: v })} label="Fill language based on IP" desc="Sets navigator languages from the exit IP country on launch." />
              <T on={!!d.freeProxy} set={(v) => patch({ freeProxy: v })} label="Use free proxy" desc="Free unblocked proxies arrive with the provider integration." />
            </Row>
            <Button block style={{ marginTop: 12 }} onClick={() => setTab('proxy')}>Add Proxy</Button>
          </div>
        )}

        {/* ================= TAB: PROXY ================= */}
        {tab === 'proxy' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { key: 'library', label: 'Proxy Library', icon: '📚' },
                { key: 'buy', label: 'Buy proxy', icon: '🛒' },
                { key: 'custom', label: 'Custom proxy', icon: '⚙️' },
                { key: 'free', label: 'Free proxy', icon: '🆓' }
              ].map((c) => (
                <div
                  key={c.key}
                  onClick={() => c.key !== 'buy' && setD((cur) => ({ ...cur, proxySource: c.key } as any))}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    border: (d as any).proxySource === c.key ? '1px solid #8952ef' : '1px solid rgba(128,128,128,0.3)',
                    borderRadius: 10, padding: '13px 16px', cursor: c.key === 'buy' ? 'pointer' : 'pointer',
                    fontWeight: 600, fontSize: 13.5
                  }}
                >
                  {c.label}
                  <span>{c.key === 'buy' ? '↗' : <Radio checked={(d as any).proxySource === c.key} />}</span>
                </div>
              ))}
            </div>
            <Row label="Connection type">
              <Select
                style={{ width: '100%' }}
                value={d.proxy.type}
                onChange={(v) => patch({ proxy: { ...d.proxy, type: v } })}
                options={[
                  { value: 'none', label: 'Without proxy' },
                  { value: 'http', label: 'HTTP' },
                  { value: 'https', label: 'HTTPS' },
                  { value: 'socks4', label: 'SOCKS4' },
                  { value: 'socks5', label: 'SOCKS5' }
                ]}
              />
            </Row>
            {d.proxy.type !== 'none' && (
              <>
                <Row label="Proxy (ip:port)" desc='You can paste the proxy as "url:port:username:password"'>
                  <Input
                    value={d.proxy.host ? `${d.proxy.host}:${d.proxy.port || ''}` : ''}
                    onChange={(e) => {
                      if (!parseIpPort(e.target.value)) {
                        const [h, p] = e.target.value.split(':')
                        patch({ proxy: { ...d.proxy, host: h ?? '', port: p ? parseInt(p, 10) : (undefined as any) } })
                      }
                    }}
                    placeholder="192.168.1.1:8080"
                  />
                </Row>
                <Row label="Proxy username">
                  <Input value={d.proxy.username} onChange={(e) => patch({ proxy: { ...d.proxy, username: e.target.value } })} />
                </Row>
                <Row label="Proxy password">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={d.proxy.password}
                    onChange={(e) => patch({ proxy: { ...d.proxy, password: e.target.value } })}
                    suffix={<a onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOutlined /> : <EyeInvisibleOutlined />}</a>}
                  />
                </Row>
                <Row label="">
                  <T on={!!(d as any).rotating} set={(v) => setD((cur) => ({ ...cur, proxyRotating: v } as any))} label="Rotating proxy" />
                </Row>
                <Row label="Proxy information provider">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Select style={{ width: 320 }} value="main" options={[{ value: 'main', label: 'Main provider' }]} />
                    <Tooltip__noop />
                  </div>
                </Row>
                <Space style={{ marginTop: 8 }}>
                  <Button icon={<CheckOutlined />} loading={busy} onClick={() => void checkProxy()}>Check</Button>
                  <Button icon={<CopyOutlined />} onClick={() => void navigator.clipboard.writeText(`${d.proxy.host}:${d.proxy.port}:${d.proxy.username}:${d.proxy.password}`)}>Copy</Button>
                </Space>
                {d.proxyLastCheck?.ok && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: '#10b981' }}>
                    {d.proxyLastCheck.ip} · {d.proxyLastCheck.country} · {d.proxyLastCheck.timezone} · {d.proxyLastCheck.latencyMs}ms
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= TAB: PRIVACY & NETWORK ================= */}
        {tab === 'privacy' && (
          <div>
            <Row label="WebRTC">
              <RadioList
                value={d.webrtc}
                set={(v) => patch({ webrtc: v })}
                options={[
                  { value: 'altered', label: 'Altered', desc: 'WebRTC stays on and reports the spoofed public IP and a valid fake local IP instead of the real ones.' },
                  { value: 'real', label: 'Real', desc: 'Leaks the real IP. Only recommended without a proxy.' },
                  { value: 'disabled', label: 'Disabled', desc: 'WebRTC completely off (websites can see it is off).' },
                  { value: 'proxy-only', label: 'Only Proxy', desc: 'Tries to use the proxy for WebRTC; disables WebRTC if the proxy does not support it.' }
                ]}
              />
              <div style={{ marginTop: 8 }}>
                <T on={d.webrtc === 'altered' && d.proxy.type !== 'none'} set={(v) => patch({ webrtc: v ? 'altered' : 'real' })} label="Fill WebRTC Public IP based on the IP." />
              </div>
            </Row>
            <Row label="Geolocation">
              <RadioList
                value={d.geoPolicy}
                set={(v) => patch({ geoPolicy: v })}
                options={[
                  { value: 'prompt', label: 'Prompt', desc: 'The site asks; if accepted the profile coordinates are used.' },
                  { value: 'allow', label: 'Allow', desc: 'Always grants the configured coordinates.' },
                  { value: 'block', label: 'Block', desc: 'Always denies geolocation requests.' }
                ]}
              />
              <div style={{ marginTop: 8 }}>
                <T on={d.geolocation.mode === 'ip'} set={(v) => patch({ geolocation: { ...d.geolocation, mode: v ? 'ip' : 'off' } })} label="Fill location based on IP" desc="Fills geolocation coordinates at profile start based on the external IP." />
              </div>
            </Row>
            <Row label="DNS">
              <T on={!!d.dnsEnabled} set={(v) => patch({ dnsEnabled: v })} label="Enable custom DNS" desc="Routes the browser profile's DNS lookups through a custom server (DoH) instead of the system default." />
              {d.dnsEnabled && (
                <Input
                  style={{ marginTop: 8, maxWidth: 420 }}
                  placeholder="https://dns.cloudflare.com/dns-query"
                  value={d.dnsServer}
                  onChange={(e) => patch({ dnsServer: e.target.value })}
                />
              )}
            </Row>
          </div>
        )}

        {/* ================= TAB: BROWSER & NAVIGATOR ================= */}
        {tab === 'navigator' && (
          <div>
            <Row label="User agent">
              <RadioList
                value={d.userAgentMode}
                set={(v) => patch({ userAgentMode: v })}
                options={[
                  { value: 'latest', label: IS_FIREFOX_ENGINE ? 'Always use latest browser user agent' : 'Always use latest Chrome user agent', desc: 'Always uses the latest user agent, regardless of the engine core this profile runs on.' },
                  { value: 'match', label: 'Match browser user agent', desc: 'Matches the engine core being used — often not the latest, but it looks more legitimate.' },
                  { value: 'specific', label: 'Use specific version', desc: 'Pin the user agent to an exact engine version.' }
                ]}
              />
              {d.userAgentMode === 'specific' && (
                <Input
                  style={{ marginTop: 8, maxWidth: 240 }}
                  placeholder="156"
                  value={d.userAgentVersion}
                  onChange={(e) => patch({ userAgentVersion: e.target.value })}
                />
              )}
            </Row>
            <Row label="Navigator">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11.5, color: '#8952ef' }}>Resolution</label>
                  <Select
                    style={{ width: '100%' }}
                    value={`${d.screen.width}x${d.screen.height}`}
                    onChange={(v) => { const [w, h] = v.split('x').map(Number); patch({ screen: { width: w, height: h } }) }}
                    options={[...new Set([`${d.screen.width}x${d.screen.height}`, ...SCREENS_BY_OS[d.os]])].map((s) => ({ value: s, label: s }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, color: '#8952ef' }}>Platform</label>
                  <Input value={d.navigator.platform} onChange={(e) => patch({ navigator: { ...d.navigator, platform: e.target.value } })} />
                </div>
              </div>
            </Row>
            <Row label="Timezone">
              <T on={d.timezone.mode === 'ip'} set={(v) => patch({ timezone: { ...d.timezone, mode: v ? 'ip' : 'off' } })} label="Fill timezone based on IP" desc="Fills the timezone at profile start based on the external IP." />
            </Row>
            <Row label="Fonts">
              <T on={true} set={() => {}} label="Enable font list masking" desc={IS_FIREFOX_ENGINE ? 'The engine draws a coherent per-identity font set natively — masking is always on.' : 'Spoofs the list of installed system fonts reported to websites.'} />
              <T on={!!d.unicode} set={(v) => patch({ unicode: v })} label="Enable Unicode" desc={IS_FIREFOX_ENGINE ? 'Unicode glyph and DOMRect protection is built into the engine and always on — this toggle is reserved for the Chromium engine.' : 'Enables Unicode glyphs and DOMRect fingerprinting protection.'} />
              <Button style={{ marginTop: 8 }} onClick={randomizeFonts}>Randomize fonts</Button>
              {d.fonts.mode === 'custom' && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#8a93a0' }}>{d.fonts.list.length} fonts in the custom set (additive — system fallbacks for Arabic/CJK stay enabled)</div>
              )}
            </Row>
            <Row label="Media Devices">
              <T on={!!d.mediaMask} set={(v) => patch({ mediaMask: v })} label="Mask media devices" desc="Reports a spoofed list of cameras, microphones and speakers instead of the real devices." />
              {d.mediaMask && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Stepper v={d.media.videoInputs} set={(n) => patch({ media: { ...d.media, videoInputs: n } })} /> Video inputs</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Stepper v={d.media.audioInputs} set={(n) => patch({ media: { ...d.media, audioInputs: n } })} /> Audio inputs</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Stepper v={d.media.audioOutputs} set={(n) => patch({ media: { ...d.media, audioOutputs: n } })} /> Audio outputs</div>
                </div>
              )}
            </Row>
          </div>
        )}

        {/* ================= TAB: HARDWARE ================= */}
        {tab === 'hardware' && (
          <div>
            <Row label="Canvas">
              <RadioList
                value={d.canvas === 'noise' ? 'noise' : (d as any).canvasBlock ? 'block' : 'off'}
                set={(v) => setD((cur) => ({ ...cur, canvas: v === 'off' ? 'off' : 'noise', canvasBlock: v === 'block' } as any))}
                options={[
                  { value: 'noise', label: 'Noise', desc: 'Canvas fingerprint masked with a unique, persistent noise per profile.' },
                  { value: 'off', label: 'Off', desc: "Don't mask Canvas. Suitable for most users." },
                  { value: 'block', label: 'Block', desc: 'Block websites from reading the Canvas fingerprint.', disabled: IS_FIREFOX_ENGINE }
                ]}
              />
              {IS_FIREFOX_ENGINE && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Canvas "Block" is a Chromium-engine capability — Camoufox noise covers readback instead.</Typography.Text>}
              <div style={{ color: '#8a93a0', fontSize: 12.5, marginTop: 8 }}>Canvas hash: {fingerprintHash(d, 'canvas')}</div>
            </Row>
            <Row label="Audio Context">
              <RadioList
                value={d.audio}
                set={(v) => patch({ audio: v as any })}
                options={[
                  { value: 'noise', label: 'Noise', desc: 'AudioContext fingerprint masked with unique, persistent noise.' },
                  { value: 'off', label: 'Off', desc: "Don't mask AudioContext.", disabled: IS_FIREFOX_ENGINE }
                ]}
              />
              {IS_FIREFOX_ENGINE && <Typography.Text type="secondary" style={{ fontSize: 12 }}>The engine applies a per-identity audio seed natively — "Off" is reserved for the Chromium engine.</Typography.Text>}
            </Row>
            <Row label="WebGL image">
              <RadioList
                value="off"
                set={() => {}}
                options={[
                  { value: 'off', label: 'Off', desc: "Don't mask WebGL image fingerprint. The engine's canvas protection covers GPU readback.", disabled: true },
                  { value: 'noise', label: 'Noise', desc: 'Chromium-engine capability.', disabled: IS_FIREFOX_ENGINE }
                ]}
              />
              <div style={{ color: '#8a93a0', fontSize: 12.5, marginTop: 8 }}>WebGL image hash: {fingerprintHash(d, 'webgl')}</div>
            </Row>
            <Row label="WebGL metadata">
              <RadioList
                value={(d as any).webglMeta ?? 'mask'}
                set={(v) => setD((cur) => ({ ...cur, webglMeta: v } as any))}
                options={[
                  { value: 'mask', label: 'Mask', desc: 'Spoofs the WebGL vendor and renderer strings the browser reports.' },
                  { value: 'off', label: 'Off', desc: 'Reports the real GPU — only meaningful when the profile OS matches this machine.' }
                ]}
              />
              {(d as any).webglMeta !== 'off' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                  <Input value={d.webgl.vendor} onChange={(e) => patch({ webgl: { ...d.webgl, vendor: e.target.value } })} placeholder="WebGL vendor" />
                  <Input value={d.webgl.renderer} onChange={(e) => patch({ webgl: { ...d.webgl, renderer: e.target.value } })} placeholder="WebGL unmasked renderer" />
                  <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>GPU list filtered by {d.os}:</Typography.Text>
                  <Select
                    size="small"
                    value={GPU_BY_OS[d.os].some((g) => g.unmaskedRenderer === d.webgl.renderer) ? d.webgl.renderer : undefined}
                    placeholder="Pick from validated GPU list"
                    onChange={(v) => {
                      const g = GPU_BY_OS[d.os].find((x) => x.unmaskedRenderer === v)
                      if (g) patch({ webgl: { vendor: g.vendor, renderer: g.renderer, unmaskedVendor: g.unmaskedVendor, unmaskedRenderer: g.unmaskedRenderer } })
                    }}
                    options={GPU_BY_OS[d.os].map((g) => ({ value: g.unmaskedRenderer, label: g.unmaskedRenderer.slice(0, 60) }))}
                  />
                </div>
              )}
              <Button style={{ marginTop: 10 }} onClick={() => void regenerate()}>Get New Fingerprint</Button>
            </Row>
          </div>
        )}

        {/* ================= TAB: EXTENSIONS & COOKIES ================= */}
        {tab === 'extensions' && (
          <ExtensionsTab d={d} patch={patch} IS_FIREFOX_ENGINE={IS_FIREFOX_ENGINE} Row={Row} T={T} />
        )}

        {/* ================= TAB: OTHER ================= */}
        {tab === 'other' && (
          <div style={flash ? { background: 'rgba(137,82,239,0.06)', borderRadius: 10, transition: 'background .3s' } : { transition: 'background .3s' }}>
            <Row label="Operating system">
              <RadioList
                value={d.os}
                set={(v) => onOsChange(v)}
                options={[
                  { value: 'windows', label: 'Windows', desc: 'Widest compatibility.' },
                  { value: 'macos', label: 'MacOS', desc: 'Default on a Mac.' },
                  { value: 'linux', label: 'Linux', desc: 'Not advised: small share of real traffic, so a stronger fingerprint signal.' }
                ]}
              />
            </Row>
            <Row label="Do not track">
              <T on={!!d.doNotTrack} set={(v) => patch({ doNotTrack: v })} label="Send 'Do Not Track' with browsing requests" desc="Most sites ignore it, and it is itself a mildly distinctive signal." />
            </Row>
            <Row label="Hardware concurrency">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Slider style={{ flex: 1, maxWidth: 320 }} min={1} max={12} value={d.hardwareConcurrencyOverride ?? d.navigator.hardwareConcurrency ?? 10}
                  onChange={(v) => patch({ hardwareConcurrencyOverride: v })} />
                <InputNumberBox value={d.hardwareConcurrencyOverride ?? d.navigator.hardwareConcurrency ?? 10} onChange={(n) => patch({ hardwareConcurrencyOverride: n })} />
              </div>
              <div style={{ color: '#8a93a0', fontSize: 12.5, marginTop: 4 }}>Pick a value matching typical consumer hardware.</div>
            </Row>
            <Row label="Device Memory" desc={(settings.engine ?? 'camoufox') === 'camoufox' ? 'Firefox does not expose deviceMemory to websites — the value applies to the Chromium engine. Chrome caps at 8.' : 'Chrome caps at 8, so any other value is an obvious spoof.'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: (settings.engine ?? 'camoufox') === 'camoufox' ? 0.6 : 1 }}>
                <Slider style={{ flex: 1, maxWidth: 320 }} min={0} max={3} step={1}
                  value={[1, 2, 4, 8].indexOf(d.deviceMemory) >= 0 ? [1, 2, 4, 8].indexOf(d.deviceMemory) : 3}
                  marks={{ 0: '1', 1: '2', 2: '4', 3: '8' }}
                  onChange={(i) => patch({ deviceMemory: [1, 2, 4, 8][i] })} disabled={(settings.engine ?? 'camoufox') === 'camoufox'} />
              </div>
            </Row>
            <Row label="">
              <Button onClick={() => void regenerate()}>Randomize hardware (coherent set)</Button>
            </Row>
            <Row label="Active session lock">
              <T on={d.sessionLock !== false} set={(v) => patch({ sessionLock: v })} label="Prevent the same profile from launching in two places at once" desc="Avoids cookie/session conflicts when teammates share an account." />
            </Row>
            <Row label="Profile name in browser">
              <T on={d.showNameInBrowser !== false} set={(v) => patch({ showNameInBrowser: v })} label="Show profile name in browser" desc="Shows the profile name in the window title bar and taskbar." />
            </Row>
            <Row label="Browser language">
              <T on={!!d.uiFollowNavigatorLanguage} set={(v) => patch({ uiFollowNavigatorLanguage: v })} label="Use the navigator language for the browser UI" desc="When OFF the browser UI stays in English. Verified safe with Arabic locales, but keep OFF unless needed." />
            </Row>
            <Row label="Browser arguments">
              <T on={!!d.customArgsEnabled} set={(v) => patch({ customArgsEnabled: v })} label="Custom browser arguments" desc="Extra flags passed at launch, for example --restore-last-session" />
              {d.customArgsEnabled && (
                <Input style={{ marginTop: 8 }} value={d.customArgs} onChange={(e) => patch({ customArgs: e.target.value })} placeholder="--restore-last-session" />
              )}
            </Row>
            <Row label="Startup URLs">
              <T on={!!d.startupUrlsEnabled} set={(v) => patch({ startupUrlsEnabled: v })} label="Open URLs at startup" desc="One URL per line." />
              {d.startupUrlsEnabled && (
                <Input.TextArea style={{ marginTop: 8 }} rows={3} value={(d.startupUrls ?? []).join('\n')}
                  onChange={(e) => patch({ startupUrls: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
              )}
            </Row>
            <Row label="iphey">
              <T on={!!d.iphey} set={(v) => patch({ iphey: v })} label="Try to pass iphey check" desc="Applies extra engine tweaks aimed at the iphey.com trust test." />
            </Row>
            <Row label="Hide browser settings">
              <T on={!!d.hideBrowserSettings} set={() => {}} label="Hide the browser's settings UI" desc={IS_FIREFOX_ENGINE ? 'Chromium-engine capability — not supported by Camoufox.' : 'Suppresses the browser settings page for end users.'} />
            </Row>
          </div>
        )}
      </div>
    </Modal>
  )
}


/* ---- shared row primitives (module scope) ---- */
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 22, padding: '14px 0', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
      <div style={{ width: 180, flex: 'none', fontSize: 13.5, fontWeight: 600, paddingTop: 2 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
        {desc ? <div style={{ color: '#8a93a0', fontSize: 12.5, marginTop: 6 }}>{desc}</div> : null}
      </div>
    </div>
  )
}

function T({ on, set, label, desc }: { on: boolean; set: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '5px 0' }}>
      <Switch size="small" checked={on} onChange={set} />
      <div>
        <div style={{ fontSize: 13.5 }}>{label}</div>
        {desc ? <div style={{ color: '#8a93a0', fontSize: 12.5 }}>{desc}</div> : null}
      </div>
    </div>
  )
}

function RadioList<V extends string>({ value, set, options }: { value: V; set: (v: V) => void; options: { value: V; label: string; desc?: string; disabled?: boolean }[] }) {
  return (
    <Radio.Group value={value} onChange={(e) => set(e.target.value)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((o) => (
          <Radio key={o.value} value={o.value} disabled={o.disabled}>
            <div>
              <span style={{ fontSize: 13.5 }}>{o.label}</span>
              {o.desc ? <div style={{ color: '#8a93a0', fontSize: 12.5, marginLeft: 26 }}>{o.desc}</div> : null}
            </div>
          </Radio>
        ))}
      </div>
    </Radio.Group>
  )
}

function Tooltip__noop() {
  return <InfoCircleOutlined style={{ opacity: 0.5 }} />
}

function InputNumberBox({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Input
      style={{ width: 64 }}
      type="number"
      value={value}
      onChange={(e) => onChange(Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))}
    />
  )
}

/** Stable display hash derived from the pinned fingerprint (deterministic per profile). */
function fingerprintHash(d: Profile, kind: 'canvas' | 'webgl'): string {
  const seed = d.fingerprint?.fpgen
    ? JSON.stringify(kind === 'canvas' ? d.fingerprint.fpgen.canvasSeed ?? d.fingerprint.fpgen.navigator : d.fingerprint.fpgen.webgl ?? {})
    : d.id
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  let out = ''
  while (out.length < 56) {
    h = (h * 1664525 + 1013904223) >>> 0
    out += h.toString(36)
  }
  return out.slice(0, 56)
}

function makeDraft(): Profile {
  return {
    id: crypto.randomUUID(),
    name: 'New profile',
    notes: '',
    tags: [],
    os: 'macos',
    color: '#8952ef',
    groupId: null,
    proxyId: null,
    proxy: { type: 'none', host: '', port: 0, username: '', password: '' },
    proxyLastCheck: null,
    pinned: false,
    disabled: false,
    navigator: { userAgent: '', platform: 'MacIntel', languages: ['en-US', 'en'], hardwareConcurrency: 10, deviceMemory: 8 },
    screen: { width: 1440, height: 900 },
    webgl: { vendor: 'Google Inc. (Apple)', renderer: 'WebKit WebGL', unmaskedVendor: 'Google Inc. (Apple)', unmaskedRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
    webglMeta: 'mask',
    canvasBlock: false,
    proxyRotating: false,
    proxySource: 'custom',
    canvas: 'noise',
    audio: 'noise',
    timezone: { mode: 'ip', name: '' },
    geolocation: { mode: 'ip', latitude: 0, longitude: 0, accuracy: 100 },
    geoPolicy: 'prompt',
    webrtc: 'altered',
    media: { videoInputs: 1, audioInputs: 3, audioOutputs: 2 },
    mediaMask: true,
    fonts: { mode: 'default', list: [] },
    unicode: false,
    userAgentMode: 'latest',
    userAgentVersion: '',
    dnsEnabled: false,
    dnsServer: '',
    doNotTrack: false,
    hardwareConcurrencyOverride: 10,
    deviceMemory: 8,
    sessionLock: true,
    showNameInBrowser: true,
    uiFollowNavigatorLanguage: false,
    customArgsEnabled: false,
    customArgs: '',
    startupUrls: [],
    startupUrlsEnabled: false,
    iphey: false,
    hideBrowserSettings: false,
    webcam: false,
    fillLanguageFromIp: true,
    freeProxy: false,
    extensions: [],
    pendingCookies: null,
    fingerprint: null,
    lastLaunchedAt: null,
    browserVersion: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startup: { homepage: '', restoreSession: undefined, clearSession: false }
  } as Profile
}

/* ============ Extensions & Cookies tab ============ */
function ExtensionsTab({
  d,
  patch,
  IS_FIREFOX_ENGINE,
  Row,
  T
}: {
  d: Profile
  patch: (p: Partial<Profile>) => void
  IS_FIREFOX_ENGINE: boolean
  Row: (p: { label: string; desc?: string; children: React.ReactNode }) => React.ReactElement
  T: (p: { on: boolean; set: (v: boolean) => void; label: string; desc?: string }) => React.ReactElement
}) {
  const [webstoreUrl, setWebstoreUrl] = useState('')
  const [library, setLibrary] = useState<{ name: string; desc: string }[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [cookieFormat, setCookieFormat] = useState<'json' | 'netscape' | 'b64json' | 'b64netscape'>('json')
  const [cookieText, setCookieText] = useState('')
  const [cookieCount, setCookieCount] = useState<number | null>(null)

  const validateCookies = (text: string, format: typeof cookieFormat) => {
    try {
      let raw = text
      if (format === 'b64json' || format === 'b64netscape') raw = atob(text.trim())
      if (format === 'json' || format === 'b64json') {
        const arr = JSON.parse(raw)
        setCookieCount(Array.isArray(arr) ? arr.length : 0)
      } else {
        setCookieCount(raw.split('\n').filter((l) => l.trim() && !l.startsWith('#') && l.split('\t').length >= 7).length)
      }
    } catch {
      setCookieCount(-1)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, margin: '6px 0 10px' }}>Extensions</div>
      <Row label="Assigned to this profile">
        <div>
          <div style={{ fontSize: 12.5, color: '#8a93a0', marginBottom: 6 }}>{d.extensions?.length ?? 0} assigned</div>
          <Table
            size="small"
            rowKey="path"
            pagination={false}
            dataSource={d.extensions ?? []}
            locale={{ emptyText: 'No extensions assigned to this profile yet.' }}
            columns={[
              { title: 'Name', dataIndex: 'name' },
              { title: 'Type', dataIndex: 'type' },
              {
                title: '',
                render: (_: any, r: any) => (
                  <a style={{ color: '#e05252' }} onClick={() => patch({ extensions: (d.extensions ?? []).filter((x) => x.path !== r.path) })}>Remove</a>
                )
              }
            ]}
            footer={() => (
              <Space>
                <Button size="small" disabled={!(d.extensions ?? []).length} onClick={() => patch({ extensions: [] })}>Remove all</Button>
              </Space>
            )}
          />
        </div>
      </Row>
      <Row label="Add extension">
        <div>
          <div style={{ marginBottom: 10 }}>
            <Select
              style={{ width: 220 }}
              value="webstore"
              options={[{ value: 'webstore', label: 'Webstore' }, { value: 'custom', label: 'Custom' }]}
            />
          </div>
          {IS_FIREFOX_ENGINE ? (
            <>
              <Input
                placeholder="Path to .xpi or unpacked add-on folder"
                value={webstoreUrl}
                onChange={(e) => setWebstoreUrl(e.target.value)}
                style={{ maxWidth: 480 }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Button
                  onClick={async () => {
                    const picked2 = await rea.extensions.pickFolder()
                    if (picked2) setWebstoreUrl(picked2)
                  }}
                >
                  Choose folder…
                </Button>
                <Button
                  type="primary"
                  ghost
                  onClick={() => {
                    if (!webstoreUrl.trim()) return
                    const name = webstoreUrl.split('/').filter(Boolean).pop() ?? 'extension'
                    patch({ extensions: [...(d.extensions ?? []), { name, path: webstoreUrl.trim(), type: 'custom' }] })
                    setWebstoreUrl('')
                  }}
                >
                  Add
                </Button>
              </div>
              <div style={{ color: '#8a93a0', fontSize: 12, marginTop: 8 }}>
                Camoufox is Firefox-based: Chrome Web Store extensions cannot load. Use Firefox add-ons (.xpi or unpacked folders). The Webstore field unlocks with the Chromium engine.
              </div>
            </>
          ) : (
            <>
              <Input placeholder="https://chromewebstore.google.com/detail/extension-name/id" value={webstoreUrl} onChange={(e) => setWebstoreUrl(e.target.value)} style={{ maxWidth: 480 }} />
              <div style={{ color: '#8a93a0', fontSize: 12, marginTop: 8 }}>e.g. https://chromewebstore.google.com/detail/extension-name/id</div>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Webstore library</div>
            <Input placeholder="Search extensions..." style={{ maxWidth: 320, marginBottom: 8 }} />
            <Table
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={library}
              locale={{ emptyText: 'No webstore extensions yet. Paste a Chrome Web Store URL above to add one.' }}
              columns={[
                { title: '', render: (_: any, r: any) => <input type="checkbox" checked={picked.includes(r.name)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, r.name] : cur.filter((x) => x !== r.name)))} /> },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Description', dataIndex: 'desc' }
              ]}
              footer={() => <Button size="small" disabled={!picked.length}>Add selected</Button>}
            />
          </div>
        </div>
      </Row>

      <div style={{ fontSize: 14, fontWeight: 700, margin: '18px 0 10px' }}>Import Cookies</div>
      <Row label="Cookie format">
        <Radio.Group value={cookieFormat} onChange={(e) => setCookieFormat(e.target.value)}>
          <Radio value="json">JSON</Radio>
          <Radio value="netscape">Netscape</Radio>
          <Radio value="b64json">Base64 JSON</Radio>
          <Radio value="b64netscape">Base64 Netscape</Radio>
        </Radio.Group>
        <div style={{ fontSize: 12.5, color: '#8a93a0', margin: '6px 0 8px' }}>
          JSON: EditThisCookie / Cookie-Editor exports · Netscape: cookies.txt (curl) · Base64 variants are decoded on import.
        </div>
        <Input.TextArea
          rows={4}
          placeholder="Paste cookie data here..."
          value={cookieText}
          onChange={(e) => {
            setCookieText(e.target.value)
            if (e.target.value.trim()) validateCookies(e.target.value, cookieFormat)
            else setCookieCount(null)
          }}
        />
        {cookieCount !== null && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: cookieCount >= 0 ? '#10b981' : '#e05252' }}>
            {cookieCount >= 0 ? `${cookieCount} cookies parsed — imported on first launch.` : 'Invalid cookie data for the selected format.'}
          </div>
        )}
        {cookieCount != null && cookieCount >= 0 && (
          <Button
            style={{ marginTop: 8 }}
            onClick={() => patch({ pendingCookies: { format: cookieFormat, raw: cookieText, count: cookieCount } })}
          >
            Attach to profile
          </Button>
        )}
      </Row>
    </div>
  )
}

function Table(props: any) {
  return <_Table {...props} size={props.size ?? 'small'} />
}
