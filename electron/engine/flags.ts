import type { Profile } from '@shared/types'

/**
 * Builds the browser command line. Mirrors Incogniton's
 * StartLauncherAction.buildFinalLaunchCommand, minus their server-provided
 * --encodeddata (our fingerprint rides over CDP instead of a patched binary).
 */
export function buildLaunchFlags(profile: Profile, userDataDir: string): string[] {
  const flags: string[] = [
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0', // OS-assigned port, read back from DevToolsActivePort
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    '--disable-background-networking',
    '--disable-client-side-phishing-detection',
    '--disable-sync',
    '--disable-component-update',
    '--metrics-recording-local-only',
    '--disable-features=OptimizationGuideOnDeviceModel,PromptApiForGeminiNano,OnDeviceModelBackgroundDownload,PreemptiveSodaDownload,AimEnabled'
  ]

  if (profile.navigator.userAgent) {
    flags.push(`--user-agent=${profile.navigator.userAgent}`)
  }
  if (profile.navigator.languages?.length) {
    flags.push(`--lang=${profile.navigator.languages[0]}`)
  }
  if (profile.proxy.type !== 'none' && profile.proxy.host && profile.proxy.port) {
    const scheme =
      profile.proxy.type === 'http' ? 'http' : profile.proxy.type === 'socks4' ? 'socks4' : 'socks5'
    flags.push(`--proxy-server=${scheme}://${profile.proxy.host}:${profile.proxy.port}`)
    flags.push('--proxy-bypass-list=<-loopback>')
  }
  if (profile.screen.width && profile.screen.height) {
    flags.push(`--window-size=${profile.screen.width},${profile.screen.height}`)
  }
  if (profile.startup.homepage && /^https?:\/\//.test(profile.startup.homepage)) {
    flags.push(profile.startup.homepage)
  }
  return flags
}
