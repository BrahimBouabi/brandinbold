import { randomUUID } from 'crypto'
import type { Group, Profile, TargetOS } from '@shared/types'

/**
 * CSV import (TASK 8 Part B) — Incogniton-compatible + Brandinbold formats.
 * Real CSV parser (quoted fields, multi-line values), case-insensitive
 * headers, auto format detection. Never overwrites existing profiles.
 */

export function detectDelimiter(text: string): ';' | ',' {
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000)
  // count delimiters outside quotes
  let semi = 0
  let comma = 0
  let inQ = false
  for (const c of firstLine) {
    if (c === '"') inQ = !inQ
    else if (c === ';' && !inQ) semi++
    else if (c === ',' && !inQ) comma++
  }
  return semi >= comma ? ';' : ','
}

export function parseCsv(text: string, delim?: ';' | ','): string[][] {
  const d = delim ?? detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  const clean = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (inQ) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ }
        else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === d) { row.push(field); field = '' }
    else if (c === '\n') {
      if (field.endsWith('\r')) field = field.slice(0, -1)
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((f) => f.trim().length))
}

export type SourceFormat = 'incogniton' | 'brandinbold-json' | 'unknown'

export function detectFormat(text: string): SourceFormat {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.includes('"brandinbold"')) return 'brandinbold-json'
  const header = (text.split('\n')[0] ?? '').toLowerCase()
  if (header.includes('profile_name') && header.includes('simulated_operating_system')) return 'incogniton'
  if (header.includes('name') && header.includes('os')) return 'incogniton' // our old simple csv
  return 'unknown'
}

const PLATFORM_BY_OS: Record<TargetOS, string> = {
  windows: 'Win32', macos: 'MacIntel', linux: 'Linux x86_64'
}

const bool = (v: string | undefined) => /^true$/i.test((v ?? '').trim())

const normLang = (l: string) => l.trim().replace('_', '-')

export interface ImportRowResult {
  name: string
  os: string
  proxy: string
  status: 'ok' | 'warning' | 'error'
  messages: string[]
  profile: Profile | null
}

export interface ImportPreview {
  format: SourceFormat
  delimiter: string
  rowCount: number
  rows: ImportRowResult[]
  unmappedColumns: string[]
}

export interface ImportRunResult {
  imported: number
  skipped: number
  fixed: number
  warnings: number
  log: string[]
  profiles?: Profile[]
}

interface RowMap { [header: string]: string }

function rowToMap(header: string[], values: string[]): RowMap {
  const map: RowMap = {}
  header.forEach((h, i) => {
    map[h.trim().toLowerCase()] = values[i] ?? ''
  })
  return map
}
const g = (m: RowMap, ...names: string[]): string => {
  for (const n of names) {
    const v = m[n.toLowerCase()]
    if (v !== undefined && v !== '') return v
  }
  return ''
}

/** Map an Incogniton row to a Brandinbold profile, with consistency fixes. */
function mapIncognitonRow(
  m: RowMap,
  unknownColumns: string[],
  fixAutomatically: boolean
): { profile: Profile; messages: string[]; fixed: boolean } {
  const messages: string[] = []
  let fixed = false

  const rawName = g(m, 'profile_name', 'name').trim()
  if (!rawName) {
    throw new Error('Missing required profile_name')
  }

  const osRaw = (g(m, 'simulated_operating_system', 'os') || 'macos').toLowerCase()
  if (!osRaw.includes('win') && !osRaw.includes('lin') && !osRaw.includes('mac') && !osRaw.includes('darwin')) {
    throw new Error(`Invalid simulated_operating_system "${osRaw}" (expected windows, macos, or linux)`)
  }
  const os: TargetOS = osRaw.includes('win') ? 'windows' : osRaw.includes('lin') ? 'linux' : 'macos'
  const ua = g(m, 'Navigator_user_agent')
  const platformInFile = g(m, 'Navigator_platform')
  const bbId = g(m, 'brandinbold_id')
  const isBrandinboldExport = !!bbId
  const isChromeUa = /Chrome\/\d+/i.test(ua) && !/Firefox\/\d+/i.test(ua)

  // consistency: platform must match the OS
  const expectedPlatform = PLATFORM_BY_OS[os]
  const platform = fixAutomatically ? expectedPlatform : platformInFile || expectedPlatform
  if (platformInFile && platformInFile !== expectedPlatform && fixAutomatically) {
    messages.push(`platform ${platformInFile} aligned to ${expectedPlatform} (${os})`)
    fixed = true
  }
  // consistency: Incogniton UA is a Chrome UA — our engine presents its own
  // (Firefox) identity; the pinned fingerprint is regenerated at launch.
  // If the UA is already a Firefox/Camoufox UA (or Brandinbold export), keep it!
  const replaceUa = fixAutomatically && !!ua && isChromeUa && !isBrandinboldExport
  if (replaceUa) {
    messages.push('UA from file replaced by the engine-drawn identity (Camoufox)')
    fixed = true
  }

  // timezone/geo without proxy: align to IP
  const tzName = g(m, 'Timezone_timezone_name')
  const tzFill = bool(g(m, 'Timezone_fill_timezone_based_on_ip'))
  const geoLatRaw = g(m, 'Geolocation_location_information_latitude')
  const geoLonRaw = g(m, 'Geolocation_location_information_longitude')
  const geoLat = parseFloat(geoLatRaw)
  const geoLon = parseFloat(geoLonRaw)
  const hasGeo = geoLatRaw !== '' && Number.isFinite(geoLat) && (geoLat !== 0 || (Number.isFinite(geoLon) && geoLon !== 0))
  const proxyType = (g(m, 'proxy_connection_type', 'proxy_type') || 'none').toLowerCase()
  const hasProxy = proxyType !== '' && proxyType !== 'none'
  if (hasProxy && !['http', 'https', 'socks4', 'socks5'].includes(proxyType)) {
    throw new Error(`Unsupported proxy_connection_type "${proxyType}"`)
  }
  let timezoneMode: 'off' | 'ip' | 'custom' = tzName ? 'custom' : 'off'
  if (tzFill) timezoneMode = 'ip'
  let geoMode: 'off' | 'ip' | 'custom' = hasGeo ? 'custom' : 'off'
  const geoFill = bool(g(m, 'Geolocation_fill_geolocation_based_on_ip'))
  if (geoFill) geoMode = 'ip'
  if (fixAutomatically && !isBrandinboldExport && !hasProxy && (timezoneMode === 'custom' || geoMode === 'custom')) {
    timezoneMode = 'ip'
    geoMode = 'ip'
    messages.push(`timezone/geo (${tzName || 'custom'}) aligned to IP — no proxy set`)
    fixed = true
  }

  const languages = g(m, 'Navigator_languages')
    .split(';')
    .map(normLang)
    .filter(Boolean)

  const proxyUrl = g(m, 'proxy_proxy_url')
  let host = g(m, 'proxy_host')
  let port = parseInt(g(m, 'proxy_port'), 10) || 0
  if (proxyUrl) {
    const parts = proxyUrl.split(':')
    host = parts[0]?.trim() ?? ''
    port = parseInt(parts[1] ?? '', 10) || 0
  }
  if (hasProxy && (!host || port <= 0 || port > 65535)) {
    throw new Error(`Invalid proxy endpoint "${proxyUrl || `${host}:${port}`}" (expected host:port)`)
  }

  const canvas = (g(m, 'Hardware_Canvas_behavior') || 'Off').toLowerCase()
  const audio = (g(m, 'Hardware_AudioContext_behavior') || 'Off').toLowerCase()
  const webrtcRaw = g(m, 'WebRTC_behavior').toLowerCase()
  const webrtc = webrtcRaw.includes('real')
    ? 'real'
    : webrtcRaw.includes('disabl')
      ? 'disabled'
      : webrtcRaw.includes('only proxy') || webrtcRaw === 'proxy-only'
        ? 'proxy-only'
        : webrtcRaw.includes('public')
          ? 'public-only'
          : 'altered'
  const webglMeta = (g(m, 'Hardware_WebGL_meta_behavior') || 'Mask').toLowerCase() === 'off' ? 'off' : 'mask'

  const startupUrls = g(m, 'Other_startup_urls_string')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const dnsEnabled = bool(g(m, 'customDNS_enabled'))

  // legacy hashes kept for round trip (honest: not our noise seeds)
  const legacy = {
    canvas: g(m, 'Canvas_hash'),
    audio: g(m, 'AudioContext_hash'),
    webgl: g(m, 'WebGL_hash')
  }
  const extra: Record<string, string> = {}
  for (const col of unknownColumns) {
    const v = m[col.toLowerCase()]
    if (v) extra[col] = v
  }

  const now = new Date().toISOString()
  const groupName = g(m, 'profile_group', 'group')
  const browserLanguage = g(m, 'Other_custom_browser_language')
  const proxyProvider = g(m, 'Proxy_proxy_provider')
  const freeProxyCountry = g(m, 'unblocked_free_proxy_country')
  const webrtcLocalIp = g(m, 'WebRTC_local_ip')

  const bbTagsRaw = g(m, 'brandinbold_tags', 'tags')
  const tags = bbTagsRaw ? bbTagsRaw.split('|').map((s) => s.trim()).filter(Boolean) : []
  const bbColor = g(m, 'brandinbold_color') || '#8952ef'
  const bbExtRaw = g(m, 'brandinbold_extensions')
  const extensions = bbExtRaw
    ? bbExtRaw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) => ({
          name: p.split('/').filter(Boolean).pop() ?? 'extension',
          path: p,
          type: 'custom' as const
        }))
    : []

  const uaLatestRaw = g(m, 'Navigator_useragent_always_latest')
  const uaMatch = bool(g(m, 'Navigator_useragent_match_chrome_core'))
  const browserVerRaw = g(m, 'profile_browser_version')
  const userAgentMode: Profile['userAgentMode'] = uaMatch
    ? 'match'
    : uaLatestRaw !== '' && !bool(uaLatestRaw)
      ? 'specific'
      : 'latest'
  const userAgentVersion = userAgentMode === 'specific' ? browserVerRaw : ''

  const metaVendor = g(m, 'Hardware_WebGL_meta_vendor')
  const metaRenderer = g(m, 'Hardware_WebGL_meta_renderer')
  const unmaskedVendor = g(m, 'Hardware_WebGL_meta_unmasked_vendor')
  const unmaskedRenderer = g(m, 'Hardware_WebGL_meta_unmasked_renderer')

  const hwRaw = g(m, 'Navigator_hardware_concurrency')
  const hwParsed = parseInt(hwRaw, 10)
  const hwConcurrency = Number.isFinite(hwParsed) && hwParsed > 0 ? hwParsed : 8
  const memParsed = parseInt(g(m, 'Navigator_device_memory'), 10)
  const devMemory = Number.isFinite(memParsed) && memParsed > 0 ? memParsed : 8

  const profile: Profile = {
    id: bbId || randomUUID(),
    name: rawName,
    notes: g(m, 'profile_notes', 'notes'),
    tags,
    os,
    color: bbColor,
    groupId: null,
    proxyId: null,
    proxy: {
      type: hasProxy ? ((proxyType === 'https' ? 'https' : proxyType === 'socks4' ? 'socks4' : proxyType === 'socks5' ? 'socks5' : 'http') as Profile['proxy']['type']) : 'none',
      host,
      port,
      username: g(m, 'proxy_proxy_username'),
      password: g(m, 'Proxy_proxy_password')
    },
    proxyLastCheck: null,
    pinned: false,
    disabled: false,
    navigator: {
      userAgent: replaceUa ? '' : ua,
      platform,
      languages: languages.length ? languages : ['en-US', 'en'],
      hardwareConcurrency: hwConcurrency,
      deviceMemory: devMemory
    },
    screen: (() => {
      const res = g(m, 'Navigator_custom_screen_resolution')
      if (!res) return { width: 1920, height: 1080 }
      const [w, h] = res.split('x').map(Number)
      if (!w || !h || w < 320 || h < 240) {
        throw new Error(`Invalid screen resolution "${res}"`)
      }
      return { width: w, height: h }
    })(),
    webgl: {
      vendor: unmaskedVendor || metaVendor || '',
      renderer: (metaRenderer && metaRenderer !== 'WebKit WebGL' ? metaRenderer : unmaskedRenderer || metaRenderer) || '',
      ...(unmaskedVendor ? { unmaskedVendor } : {}),
      ...(unmaskedRenderer ? { unmaskedRenderer } : {})
    },
    canvas: canvas === 'noise' ? 'noise' : 'off',
    canvasBlock: canvas === 'block',
    audio: audio === 'noise' ? 'noise' : 'off',
    timezone: { mode: timezoneMode, name: tzName },
    geolocation: {
      mode: geoMode,
      latitude: hasGeo ? geoLat : 0,
      longitude: hasGeo && Number.isFinite(geoLon) ? geoLon : 0,
      accuracy: parseFloat(g(m, 'Geolocation_location_information_accuracy')) || 100
    },
    geoPolicy: (() => {
      const b = (g(m, 'Geolocation_behavior') || 'Prompt').toLowerCase()
      return b === 'allow' ? 'allow' : b === 'block' ? 'block' : 'prompt'
    })(),
    webrtc,
    webglMeta,
    proxyRotating: bool(g(m, 'Proxy_rotating')),
    proxySource: 'custom',
    media: {
      videoInputs: parseInt(g(m, 'Media_devices_video_outputs'), 10) || 1,
      audioInputs: parseInt(g(m, 'Media_devices_audio_inputs'), 10) || 1,
      audioOutputs: parseInt(g(m, 'Media_devices_audio_outputs'), 10) || 1
    },
    mediaMask: g(m, 'Media_devices_enable_media_masking') === '' ? true : bool(g(m, 'Media_devices_enable_media_masking')),
    fonts: { mode: 'default', list: [] },
    unicode: bool(g(m, 'Fonts_enable_unicode_glyps_domrect')),
    userAgentMode,
    userAgentVersion,
    dnsEnabled,
    dnsServer: g(m, 'customDNS_details'),
    doNotTrack: bool(g(m, 'Navigator_do_not_track')),
    hardwareConcurrencyOverride: Number.isFinite(hwParsed) && hwParsed > 0 ? hwParsed : null,
    deviceMemory: devMemory,
    sessionLock: g(m, 'Other_active_session_lock') === '' ? true : bool(g(m, 'Other_active_session_lock')),
    showNameInBrowser: g(m, 'Other_other_ShowProfileName') === '' ? true : bool(g(m, 'Other_other_ShowProfileName')),
    uiFollowNavigatorLanguage: bool(g(m, 'Other_browser_language_lock')),
    customArgsEnabled: bool(g(m, 'Other_custom_browser_args_enabled')),
    customArgs: g(m, 'Other_custom_browser_args_string'),
    startupUrls,
    startupUrlsEnabled: bool(g(m, 'Other_startup_urls_enabled')),
    iphey: bool(g(m, 'other_try_to_pass_iphey')),
    hideBrowserSettings: bool(g(m, 'other_doNotShowChromeSettings')),
    webcam: bool(g(m, 'browser_allowRealMediaDevices')),
    fillLanguageFromIp: g(m, 'Navigator_navigator_languageIPToggle') === '' ? true : bool(g(m, 'Navigator_navigator_languageIPToggle')),
    freeProxy: bool(g(m, 'unblocked_free_proxy_enabled')),
    extensions,
    pendingCookies: null,
    fingerprint: null, // regenerated for OUR engine at first launch
    lastLaunchedAt: null,
    browserVersion: browserVerRaw || null,
    createdAt: now,
    updatedAt: now,
    startup: { homepage: '', restoreSession: undefined, clearSession: false },
    ...( { legacy, extra, groupName, proxyProvider, freeProxyCountry, webrtcLocalIp, browserLanguage } as any )
  } as Profile

  return { profile, messages, fixed }
}

function mapSimpleRow(m: RowMap): { profile: Profile; messages: string[]; fixed: boolean } {
  // our old simple CSV: id,name,os,notes,proxy_type,proxy_host,proxy_port,tags,group
  const now = new Date().toISOString()
  const os = (g(m, 'os') || 'macos') as TargetOS
  const messages = ['legacy Brandinbold CSV — fresh fingerprint will be generated']
  const profile: Profile = {
    id: randomUUID(),
    name: g(m, 'name') || 'Imported profile',
    notes: g(m, 'notes'),
    tags: (g(m, 'tags') || '').split('|').filter(Boolean),
    os: (['windows', 'macos', 'linux'].includes(os) ? os : 'macos') as TargetOS,
    color: '#8952ef',
    groupId: null,
    proxyId: null,
    proxy: {
      type: ((g(m, 'proxy_type') || 'none') as Profile['proxy']['type']),
      host: g(m, 'proxy_host'),
      port: parseInt(g(m, 'proxy_port'), 10) || 0,
      username: '',
      password: ''
    },
    proxyLastCheck: null,
    pinned: false,
    disabled: false,
    navigator: { userAgent: '', platform: 'MacIntel', languages: ['en-US', 'en'], hardwareConcurrency: 8, deviceMemory: 8 },
    screen: { width: 1920, height: 1080 },
    webgl: { vendor: '', renderer: '' },
    canvas: 'noise', audio: 'noise',
    timezone: { mode: 'off', name: '' },
    geolocation: { mode: 'off', latitude: 0, longitude: 0, accuracy: 100 },
    geoPolicy: 'prompt', webrtc: 'altered', webglMeta: 'mask', canvasBlock: false,
    proxyRotating: false, proxySource: 'custom',
    media: { videoInputs: 1, audioInputs: 1, audioOutputs: 1 }, mediaMask: true,
    fonts: { mode: 'default', list: [] }, unicode: false,
    userAgentMode: 'latest', userAgentVersion: '', dnsEnabled: false, dnsServer: '',
    doNotTrack: false, hardwareConcurrencyOverride: null, deviceMemory: 8,
    sessionLock: true, showNameInBrowser: true, uiFollowNavigatorLanguage: false,
    customArgsEnabled: false, customArgs: '', startupUrls: [], startupUrlsEnabled: false,
    iphey: false, hideBrowserSettings: false, webcam: false, fillLanguageFromIp: true,
    freeProxy: false, extensions: [], pendingCookies: null, fingerprint: null,
    lastLaunchedAt: null, browserVersion: null,
    createdAt: now, updatedAt: now,
    startup: { homepage: '', restoreSession: undefined, clearSession: false }
  } as Profile
  return { profile, messages, fixed: false }
}

export interface ImportOptions {
  fixAutomatically: boolean
  duplicateMode: 'skip' | 'rename'
  targetGroupId: string | null
  existingNames: string[]
  existingIds: string[]
  maxQuotaRemaining?: number | null
}

export function previewImport(text: string, fixAutomatically = true): ImportPreview {
  const format = detectFormat(text)
  if (format === 'unknown') {
    return { format, delimiter: '', rowCount: 0, rows: [], unmappedColumns: [] }
  }
  if (format === 'brandinbold-json') {
    const data = JSON.parse(text)
    const rows: ImportRowResult[] = (data.profiles ?? []).map((p: any) => ({
      name: p.name, os: p.os, proxy: p.proxy?.type ?? 'none', status: 'ok',
      messages: [], profile: p
    }))
    return { format, delimiter: '', rowCount: rows.length, rows, unmappedColumns: [] }
  }
  const delim = detectDelimiter(text)
  const parsed = parseCsv(text, delim)
  if (!parsed.length) {
    return { format: 'unknown', delimiter: delim, rowCount: 0, rows: [], unmappedColumns: [] }
  }
  const header = parsed[0].map((h) => h.trim())
  const known = new Set([
    'profile_browser_version', 'profile_name', 'profile_notes', 'simulated_operating_system',
    'profile_last_edited', 'profile_last_launched', 'profile_group', 'proxy_connection_type',
    'proxy_proxy_url', 'proxy_proxy_username', 'proxy_proxy_password', 'proxy_rotating',
    'proxy_proxy_provider', 'proxy_proxy_rotation_url', 'proxy_notes',
    'navigator_useragent_always_latest', 'navigator_user_agent', 'navigator_languages',
    'navigator_navigator_languageiptoggle', 'navigator_platform', 'navigator_do_not_track',
    'navigator_hardware_concurrency', 'navigator_device_memory', 'navigator_useragent_match_chrome_core',
    'navigator_custom_screen_resolution', 'hardware_canvas_behavior', 'canvas_hash',
    'hardware_audiocontext_behavior', 'audiocontext_hash', 'hardware_webgl_behavior', 'webgl_hash',
    'hardware_webgl_meta_behavior', 'hardware_webgl_meta_vendor', 'hardware_webgl_meta_renderer',
    'hardware_webgl_meta_unmasked_vendor', 'hardware_webgl_meta_unmasked_renderer',
    'timezone_timezone_name', 'timezone_fill_timezone_based_on_ip', 'geolocation_behavior',
    'geolocation_fill_geolocation_based_on_ip', 'geolocation_location_information_latitude',
    'geolocation_location_information_longitude', 'geolocation_location_information_accuracy',
    'fonts_enable_font_list_masking', 'fonts_enable_unicode_glyps_domrect',
    'media_devices_enable_media_masking', 'media_devices_video_outputs', 'media_devices_audio_inputs',
    'media_devices_audio_outputs', 'webrtc_behavior', 'webrtc_set_external_ip', 'webrtc_public_ip',
    'webrtc_local_ip', 'customdns_enabled', 'customdns_details', 'other_active_session_lock',
    'other_other_showprofilename', 'other_browser_language_lock', 'other_custom_browser_language',
    'other_custom_browser_args_enabled', 'other_custom_browser_args_string',
    'other_startup_urls_enabled', 'other_startup_urls_string', 'other_try_to_pass_iphey',
    'browser_allowrealmediadevices', 'other_donotshowchromesettings', 'unblocked_free_proxy_enabled',
    'unblocked_free_proxy_country',
    'brandinbold_id', 'brandinbold_tags', 'brandinbold_extensions', 'brandinbold_color',
    'id', 'name', 'os', 'notes', 'proxy_type', 'proxy_host', 'proxy_port', 'tags', 'group'
  ])
  const unmappedColumns = header.filter((h) => h && !known.has(h.toLowerCase()))

  const rows: ImportRowResult[] = []
  for (let i = 1; i < parsed.length; i++) {
    const m = rowToMap(header, parsed[i])
    try {
      const { profile, messages } = mapIncognitonRow(m, unmappedColumns, fixAutomatically)
      const status: ImportRowResult['status'] = messages.length ? 'warning' : 'ok'
      rows.push({ name: profile.name, os: profile.os, proxy: profile.proxy.type, status, messages, profile })
    } catch (e: any) {
      rows.push({ name: m['profile_name'] || m['name'] || `Row ${i}`, os: m['simulated_operating_system'] || m['os'] || '?', proxy: '?', status: 'error', messages: [e.message], profile: null })
    }
  }
  return { format: 'incogniton', delimiter: delim, rowCount: rows.length, rows, unmappedColumns }
}

export function runImport(
  text: string,
  options: ImportOptions
): ImportRunResult {
  const preview = previewImport(text, options.fixAutomatically)
  const log: string[] = []
  const profiles: Profile[] = []
  const seenNames = new Set(options.existingNames)
  const seenIds = new Set(options.existingIds)
  let imported = 0
  let skipped = 0
  let fixedCount = 0
  let warningCount = 0
  for (const row of preview.rows) {
    if (!row.profile) {
      skipped++
      log.push(`ERROR ${row.name}: ${row.messages.join('; ')}`)
      continue
    }
    if (options.maxQuotaRemaining != null && imported >= options.maxQuotaRemaining) {
      skipped++
      log.push(`SKIPPED ${row.name}: plan limit reached`)
      continue
    }
    const dupName = seenNames.has(row.profile.name)
    if (dupName && options.duplicateMode === 'skip') {
      skipped++
      log.push(`SKIPPED ${row.name}: duplicate name`)
      continue
    }
    if (dupName && options.duplicateMode === 'rename') {
      row.profile.name = `${row.profile.name} (imported)`
    }
    if (seenIds.has(row.profile.id)) {
      row.profile.id = randomUUID()
    }
    seenNames.add(row.profile.name)
    seenIds.add(row.profile.id)
    if (row.messages.length) {
      fixedCount++
      log.push(`FIXED ${row.profile.name}: ${row.messages.join('; ')}`)
    }
    if (row.status === 'warning') warningCount++
    if (options.targetGroupId) row.profile.groupId = options.targetGroupId
    log.push(`IMPORTED ${row.profile.name} (${row.profile.os})`)
    imported++
    profiles.push(row.profile)
    ;(row as any)._profile = row.profile
  }
  return { imported, skipped, fixed: fixedCount, warnings: warningCount, log, profiles }
}
