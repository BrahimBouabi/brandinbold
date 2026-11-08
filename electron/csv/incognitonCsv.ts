import { createHash } from 'crypto'
import type { Group, Profile } from '@shared/types'

/**
 * Incogniton-compatible CSV export (TASK 8 Part B).
 * Semicolon delimiter, quoted fields, 68 columns in Incogniton's exact
 * order. Values marked true/false like Incogniton. Multi-line notes and
 * quotes survive via standard CSV quoting.
 *
 * SECURITY: notes often contain credentials — the caller gates them via
 * `includeNotes`; proxy credentials are gated via `includeCredentials`.
 * Cookies/sessions are never written.
 */

export interface ExportOptions {
  includeNotes: boolean
  includeCredentials: boolean
}

/** The exact Incogniton header, in order. */
export const INCOGNITON_COLUMNS = [
  'profile_browser_version',
  'profile_name',
  'profile_notes',
  'simulated_operating_system',
  'profile_last_edited',
  'profile_last_launched',
  'profile_group',
  'proxy_connection_type',
  'proxy_proxy_url',
  'proxy_proxy_username',
  'Proxy_proxy_password',
  'Proxy_rotating',
  'Proxy_proxy_provider',
  'Proxy_proxy_rotation_url',
  'proxy_notes',
  'Navigator_useragent_always_latest',
  'Navigator_user_agent',
  'Navigator_languages',
  'Navigator_navigator_languageIPToggle',
  'Navigator_platform',
  'Navigator_do_not_track',
  'Navigator_hardware_concurrency',
  'Navigator_device_memory',
  'Navigator_useragent_match_chrome_core',
  'Navigator_custom_screen_resolution',
  'Hardware_Canvas_behavior',
  'Canvas_hash',
  'Hardware_AudioContext_behavior',
  'AudioContext_hash',
  'Hardware_WebGL_behavior',
  'WebGL_hash',
  'Hardware_WebGL_meta_behavior',
  'Hardware_WebGL_meta_vendor',
  'Hardware_WebGL_meta_renderer',
  'Hardware_WebGL_meta_unmasked_vendor',
  'Hardware_WebGL_meta_unmasked_renderer',
  'Timezone_timezone_name',
  'Timezone_fill_timezone_based_on_ip',
  'Geolocation_behavior',
  'Geolocation_fill_geolocation_based_on_ip',
  'Geolocation_location_information_latitude',
  'Geolocation_location_information_longitude',
  'Geolocation_location_information_accuracy',
  'Fonts_enable_font_list_masking',
  'Fonts_enable_unicode_glyps_domrect',
  'Media_devices_enable_media_masking',
  'Media_devices_video_outputs',
  'Media_devices_audio_inputs',
  'Media_devices_audio_outputs',
  'WebRTC_behavior',
  'WebRTC_set_external_ip',
  'WebRTC_public_ip',
  'WebRTC_local_ip',
  'customDNS_enabled',
  'customDNS_details',
  'Other_active_session_lock',
  'Other_other_ShowProfileName',
  'Other_browser_language_lock',
  'Other_custom_browser_language',
  'Other_custom_browser_args_enabled',
  'Other_custom_browser_args_string',
  'Other_startup_urls_enabled',
  'Other_startup_urls_string',
  'other_try_to_pass_iphey',
  'browser_allowRealMediaDevices',
  'other_doNotShowChromeSettings',
  'unblocked_free_proxy_enabled',
  'unblocked_free_proxy_country',
  // Brandinbold extras (ignored by Incogniton):
  'brandinbold_id',
  'brandinbold_tags',
  'brandinbold_extensions',
  'brandinbold_color'
]

function esc(value: unknown): string {
  const s = String(value ?? '')
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function bool(v: unknown): string {
  return v ? 'true' : 'false'
}

function dateInc(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Stable legacy-style hash (base64) so Incogniton round-trips keep a value.
 *  NOTE: this is NOT Incogniton's own noise seed and does not reproduce
 *  their fingerprint — our engine derives its own seeds. */
function legacyHash(profileId: string, kind: string): string {
  return createHash('sha256').update(`legacy.incogniton.${kind}:${profileId}`).digest('base64').slice(0, 64)
}

function coreVersion(profile: Profile): string {
  const m = String(profile.browserVersion ?? '').match(/(\d{2,3})/)
  return m ? m[1] : ''
}

function uaOf(profile: Profile): string {
  return (
    profile.fingerprint?.fpgen?.navigator?.userAgent ??
    profile.navigator.userAgent ??
    ''
  )
}

function languagesInc(profile: Profile): string {
  const langs = profile.navigator.languages ?? []
  return langs.map((l) => l.replace('-', '_')).join(';')
}

function webrtcBehavior(profile: Profile): string {
  switch (profile.webrtc) {
    case 'real': return 'Real'
    case 'disabled': return 'Disabled'
    case 'proxy-only': return 'Only Proxy'
    case 'public-only': return 'Public Only'
    default: return 'Altered'
  }
}

function canvasBehavior(profile: Profile): string {
  if ((profile as any).canvasBlock) return 'Block'
  return profile.canvas === 'noise' ? 'Noise' : 'Off'
}

export function buildIncognitonCsv(
  profiles: Profile[],
  groups: Group[],
  options: ExportOptions
): string {
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? ''
  const rows: string[] = [INCOGNITON_COLUMNS.join(';')]

  for (const p of profiles) {
    const ua = uaOf(p)
    const gpuMetaVendor = p.webglMeta === 'off' ? '' : (p.webgl.vendor || 'WebKit')
    const gpuMetaRenderer = p.webglMeta === 'off' ? '' : (p.webgl.renderer || 'WebKit WebGL')
    const gpuUnmaskedVendor = p.webglMeta === 'off' ? '' : (p.webgl.unmaskedVendor ?? p.webgl.vendor)
    const gpuUnmaskedRenderer = p.webglMeta === 'off' ? '' : (p.webgl.unmaskedRenderer ?? p.webgl.renderer)
    const tzName = p.timezone.name || (p.timezone.mode === 'custom' ? '' : (p.proxyLastCheck?.timezone ?? ''))
    const values: Record<string, unknown> = {
      profile_browser_version: p.userAgentMode === 'specific' && p.userAgentVersion ? p.userAgentVersion : coreVersion(p),
      profile_name: p.name,
      profile_notes: options.includeNotes ? p.notes : '',
      simulated_operating_system: p.os,
      profile_last_edited: dateInc(p.updatedAt),
      profile_last_launched: dateInc(p.lastLaunchedAt),
      profile_group: groupName(p.groupId) || (p as any).groupName || '',
      proxy_connection_type: p.proxy.type === 'none' ? '' : p.proxy.type,
      proxy_proxy_url: p.proxy.type === 'none' ? '' : `${p.proxy.host}:${p.proxy.port}`,
      proxy_proxy_username: options.includeCredentials ? p.proxy.username : '',
      Proxy_proxy_password: options.includeCredentials ? p.proxy.password : '',
      Proxy_rotating: bool((p as any).proxyRotating),
      Proxy_proxy_provider: (p as any).proxyProvider || 'main',
      Proxy_proxy_rotation_url: '',
      proxy_notes: '',
      Navigator_useragent_always_latest: bool(p.userAgentMode === 'latest'),
      Navigator_user_agent: ua,
      Navigator_languages: languagesInc(p),
      Navigator_navigator_languageIPToggle: bool(p.fillLanguageFromIp),
      Navigator_platform: p.navigator.platform,
      Navigator_do_not_track: bool(p.doNotTrack),
      Navigator_hardware_concurrency: p.hardwareConcurrencyOverride ?? p.navigator.hardwareConcurrency ?? '',
      Navigator_device_memory: p.deviceMemory ?? '',
      Navigator_useragent_match_chrome_core: bool(p.userAgentMode === 'match'),
      Navigator_custom_screen_resolution: p.screen.width && p.screen.height ? `${p.screen.width}x${p.screen.height}` : '',
      Hardware_Canvas_behavior: canvasBehavior(p),
      Canvas_hash: legacyHash(p.id, 'canvas'),
      Hardware_AudioContext_behavior: p.audio === 'noise' ? 'Noise' : 'Off',
      AudioContext_hash: legacyHash(p.id, 'audio'),
      Hardware_WebGL_behavior: 'Off',
      WebGL_hash: legacyHash(p.id, 'webgl'),
      Hardware_WebGL_meta_behavior: p.webglMeta === 'off' ? 'Off' : 'Mask',
      Hardware_WebGL_meta_vendor: gpuMetaVendor,
      Hardware_WebGL_meta_renderer: gpuMetaRenderer,
      Hardware_WebGL_meta_unmasked_vendor: gpuUnmaskedVendor,
      Hardware_WebGL_meta_unmasked_renderer: gpuUnmaskedRenderer,
      Timezone_timezone_name: tzName,
      Timezone_fill_timezone_based_on_ip: bool(p.timezone.mode === 'ip'),
      Geolocation_behavior: p.geoPolicy === 'allow' ? 'Allow' : p.geoPolicy === 'block' ? 'Block' : 'Prompt',
      Geolocation_fill_geolocation_based_on_ip: bool(p.geolocation.mode === 'ip'),
      Geolocation_location_information_latitude: p.geolocation.mode === 'custom' ? (p.geolocation.latitude ?? '') : '',
      Geolocation_location_information_longitude: p.geolocation.mode === 'custom' ? (p.geolocation.longitude ?? '') : '',
      Geolocation_location_information_accuracy: p.geolocation.accuracy ?? '',
      Fonts_enable_font_list_masking: bool(true),
      Fonts_enable_unicode_glyps_domrect: bool(p.unicode),
      Media_devices_enable_media_masking: bool(p.mediaMask),
      Media_devices_video_outputs: p.media.videoInputs,
      Media_devices_audio_inputs: p.media.audioInputs,
      Media_devices_audio_outputs: p.media.audioOutputs,
      WebRTC_behavior: webrtcBehavior(p),
      WebRTC_set_external_ip: bool(p.timezone.mode === 'ip' && p.webrtc === 'altered'),
      WebRTC_public_ip: p.proxyLastCheck?.ip ?? '',
      WebRTC_local_ip: (p as any).webrtcLocalIp ?? '',
      customDNS_enabled: bool(p.dnsEnabled),
      customDNS_details: p.dnsServer ?? '',
      Other_active_session_lock: bool(p.sessionLock !== false),
      Other_other_ShowProfileName: bool(p.showNameInBrowser !== false),
      Other_browser_language_lock: bool(p.uiFollowNavigatorLanguage),
      Other_custom_browser_language: (p as any).browserLanguage || (p.uiFollowNavigatorLanguage ? (p.navigator.languages?.[0] ?? '') : ''),
      Other_custom_browser_args_enabled: bool(p.customArgsEnabled),
      Other_custom_browser_args_string: p.customArgs ?? '',
      Other_startup_urls_enabled: bool(p.startupUrlsEnabled),
      Other_startup_urls_string: (p.startupUrls ?? []).join('\n'),
      other_try_to_pass_iphey: bool(p.iphey),
      browser_allowRealMediaDevices: bool(p.webcam),
      other_doNotShowChromeSettings: bool(p.hideBrowserSettings),
      unblocked_free_proxy_enabled: bool(p.freeProxy),
      unblocked_free_proxy_country: (p as any).freeProxyCountry ?? '',
      brandinbold_id: p.id,
      brandinbold_tags: (p.tags ?? []).join('|'),
      brandinbold_extensions: (p.extensions ?? []).map((e) => e.path).join('|'),
      brandinbold_color: p.color ?? ''
    }
    rows.push(INCOGNITON_COLUMNS.map((c) => esc(values[c])).join(';'))
  }
  return rows.join('\r\n') + '\r\n'
}

/** Lossless Brandinbold backup (JSON). */
export function buildBrandinboldJson(profiles: Profile[], groups: Group[]): string {
  return JSON.stringify({ brandinbold: '1.0', exportedAt: new Date().toISOString(), groups, profiles }, null, 2)
}
