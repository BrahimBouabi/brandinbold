export type ProxyType = 'none' | 'http' | 'https' | 'socks4' | 'socks5'

export type EngineId = 'camoufox' | 'chrome-cdp'

export type TargetOS = 'windows' | 'macos' | 'linux'

export interface ProxyConfig {
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
}

export interface NavigatorCfg {
  userAgent: string
  platform: string // 'Win32' | 'MacIntel' | 'Linux x86_64'
  languages: string[]
  hardwareConcurrency: number
  deviceMemory: number
}

export interface ScreenCfg {
  width: number
  height: number
}

export interface WebGlCfg {
  vendor: string
  renderer: string
  unmaskedVendor?: string
  unmaskedRenderer?: string
}

export type NoiseMode = 'off' | 'noise'

export interface TimezoneCfg {
  mode: 'off' | 'ip' | 'custom'
  name: string // IANA name, e.g. 'Europe/Paris'
}

export interface GeolocationCfg {
  mode: 'off' | 'ip' | 'custom'
  latitude: number
  longitude: number
  accuracy: number
}

export type WebRtcPolicy = 'altered' | 'real' | 'public-only' | 'proxy-only' | 'disabled'
export type GeoPolicy = 'prompt' | 'allow' | 'block'

export interface MediaCfg {
  videoInputs: number
  audioInputs: number
  audioOutputs: number
}

export interface FontsCfg {
  mode: 'default' | 'custom'
  list: string[]
}

export interface StartupCfg {
  homepage: string
  /** undefined = follow the global "Restore sessions" setting; true/false override. */
  restoreSession?: boolean
  /** Per-profile opt-in: wipe the session store before launch (fresh start). */
  clearSession?: boolean
}

/**
 * The pinned fingerprint: an fpgen (camoufox) fingerprint object drawn once
 * per profile and persisted, so every session presents the same identity.
 * The engine consumes it natively — never via JS injection.
 */
export interface PinnedFingerprint {
  drawnAt: string
  engine: EngineId
  fpgen: Record<string, any>
}

export interface ProfileExtension {
  name: string
  path: string
  type: 'custom' | 'webstore'
}

export interface Profile {
  id: string
  name: string
  notes: string
  tags: string[]
  os: TargetOS
  color: string
  groupId: string | null
  proxyId: string | null
  proxy: ProxyConfig
  proxyLastCheck: IpInfo | null
  pinned: boolean
  disabled: boolean
  navigator: NavigatorCfg
  screen: ScreenCfg
  webgl: WebGlCfg
  canvas: NoiseMode
  audio: NoiseMode
  timezone: TimezoneCfg
  geolocation: GeolocationCfg
  webrtc: WebRtcPolicy
  geoPolicy: GeoPolicy
  webglMeta: 'mask' | 'off'
  canvasBlock: boolean
  proxyRotating: boolean
  proxySource: 'library' | 'buy' | 'custom' | 'free'
  media: MediaCfg
  mediaMask: boolean
  fonts: FontsCfg
  unicode: boolean
  userAgentMode: 'latest' | 'match' | 'specific'
  userAgentVersion: string
  dnsEnabled: boolean
  dnsServer: string
  doNotTrack: boolean
  hardwareConcurrencyOverride: number | null
  deviceMemory: number
  sessionLock: boolean
  showNameInBrowser: boolean
  uiFollowNavigatorLanguage: boolean
  customArgsEnabled: boolean
  customArgs: string
  startupUrls: string[]
  startupUrlsEnabled: boolean
  iphey: boolean
  hideBrowserSettings: boolean
  webcam: boolean
  fillLanguageFromIp: boolean
  freeProxy: boolean
  extensions: ProfileExtension[]
  pendingCookies: { format: 'json' | 'netscape' | 'b64json' | 'b64netscape'; raw: string; count: number } | null
  startup: StartupCfg
  fingerprint: PinnedFingerprint | null
  lastLaunchedAt: string | null
  browserVersion: string | null
  createdAt: string
  updatedAt: string
}

export type ProfileStatus =
  | 'ready'
  | 'launching'
  | 'launched'
  | 'stopping'
  | 'error'

export interface RunningInfo {
  profileId: string
  pid: number | null
  debugPort: number | null
  browserWsUrl: string | null
  startedAt: number
}

export interface IpInfo {
  ok: boolean
  ip?: string
  country?: string
  countryCode?: string
  timezone?: string
  lat?: number
  lon?: number
  isp?: string
  latencyMs?: number
  error?: string
}

export interface LaunchResult {
  profileId: string
  engine: EngineId
  pid: number | null
  debugPort: number | null
  browserWsUrl: string | null
  remoteKind: 'cdp' | 'playwright' | null
}

export interface Group {
  id: string
  name: string
  pinned: boolean
  color: string
  description: string
  createdAt: string
}

export interface ProxyEntry {
  id: string
  name: string
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string
  password: string
  rotating: boolean
  groupId: string | null
  tags: string[]
  lastStatus: 'unknown' | 'ok' | 'failed'
  lastCheckedAt: string | null
  lastIpInfo: IpInfo | null
  createdAt: string
}

export type ThemeMode = 'system' | 'light' | 'dark'

export interface AppSettings {
  engine: EngineId
  theme: ThemeMode
  language: string
  maxProfiles: number
  automationEnabled: boolean
  automationPort: number
  walkPortIfTaken: boolean
  allowRemoteControl: boolean
  savePasswords: boolean
  saveHistory: boolean
  restoreSessions: boolean
  quitOnWindowClose: boolean
  colorBadges: boolean
  blockTurnServers: boolean
  useGoogleStun: boolean
  windowNameMode: 'tab' | 'window' | 'none'
  autoProxyCheck: boolean
  condensedRows: boolean
  colorfulStatus: boolean
  confirmBeforeClose: boolean
  minScreen: string
  maxScreen: string
  latestUaNewProfiles: boolean
  webcamByDefault: boolean
  maxBackups: number
  maxBackupSizeMb: number
  user: { name: string; email: string }
}

export const DEFAULT_SETTINGS: AppSettings = {
  engine: 'camoufox',
  theme: 'dark',
  language: 'en',
  maxProfiles: 3,
  automationEnabled: true,
  automationPort: 35000,
  walkPortIfTaken: true,
  allowRemoteControl: true,
  savePasswords: true,
  saveHistory: true,
  restoreSessions: true,
  quitOnWindowClose: true,
  colorBadges: true,
  blockTurnServers: false,
  useGoogleStun: true,
  windowNameMode: 'tab',
  autoProxyCheck: true,
  condensedRows: false,
  colorfulStatus: true,
  confirmBeforeClose: true,
  minScreen: '1280x960',
  maxScreen: '5120x2880',
  latestUaNewProfiles: true,
  webcamByDefault: false,
  maxBackups: 10,
  maxBackupSizeMb: 100,
  user: { name: 'Local User', email: 'local@brandinbold.app' }
}

export type ProfileEvent =
  | { type: 'status'; profileId: string; status: ProfileStatus; detail?: string }
  | { type: 'api-port'; port: number | null }
