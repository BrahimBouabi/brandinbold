import { generateFingerprint } from 'camoufox/dist/fingerprints.js'
import { ensureModel } from 'camoufox/dist/fpgen/index.js'
import { setupEngineHome } from '../engine/camoufox/engineHome'
import type { PinnedFingerprint, Profile, TargetOS } from '@shared/types'

/**
 * Draws the fingerprint ONCE per profile with camoufox's own fpgen
 * (internally coherent by construction: UA, platform, screen, GPU, fonts,
 * voices and hardware all agree) and persists it. Every launch replays the
 * same pinned identity natively — never re-randomized per session.
 */
let modelReady = false

/** The fpgen coherence model downloads on first use — make sure it is there
 *  before drawing (a fresh machine or a cleared cache would otherwise fail). */
export async function ensureFingerprintModel(): Promise<void> {
  setupEngineHome()
  if (modelReady) return
  await ensureModel()
  modelReady = true
}

export async function ensureFingerprint(profile: Profile): Promise<PinnedFingerprint | null> {
  const pinned = profile.fingerprint
  if (pinned?.fpgen && pinnedOs(pinned) === profile.os) return null
  await ensureFingerprintModel()
  return draw(profile)
}

export async function regenerateFingerprint(profile: Profile): Promise<PinnedFingerprint> {
  await ensureFingerprintModel()
  return draw(profile)
}

function pinnedOs(pinned: PinnedFingerprint): TargetOS {
  return (pinned as any).os ?? readOsFromFpgen(pinned.fpgen)
}

async function draw(profile: Profile): Promise<PinnedFingerprint> {
  const fp = await generateFingerprint({ os: mapOs(profile.os) })
  return {
    drawnAt: new Date().toISOString(),
    engine: 'camoufox',
    ...( { os: profile.os } as any),
    fpgen: fp
  } as PinnedFingerprint
}

/** Copies the pinned identity's visible values into the profile for the UI. */
export function syncDisplayFields(profile: Profile, pinned: PinnedFingerprint): Profile {
  const nav = pinned.fpgen?.navigator ?? {}
  const screen = pinned.fpgen?.screen ?? {}
  const webgl = pinned.fpgen?.webgl ?? {}
  return {
    ...profile,
    navigator: {
      ...profile.navigator,
      userAgent: nav.userAgent ?? profile.navigator.userAgent,
      platform: nav.platform ?? profile.navigator.platform,
      languages: Array.isArray(nav.languages) ? nav.languages : profile.navigator.languages,
      hardwareConcurrency: nav.hardwareConcurrency ?? profile.navigator.hardwareConcurrency
    },
    screen: {
      width: screen.width ?? screen.maxWidth ?? profile.screen.width,
      height: screen.height ?? screen.maxHeight ?? profile.screen.height
    },
    webgl: {
      vendor: webgl.vendor ?? profile.webgl.vendor,
      renderer: webgl.renderer ?? profile.webgl.renderer
    }
  }
}

function readOsFromFpgen(fp: Record<string, any>): TargetOS {
  const ua: string = fp?.navigator?.userAgent ?? ''
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'macos'
  if (/X11|Linux/i.test(ua)) return 'linux'
  return 'windows'
}

function mapOs(os: TargetOS): 'windows' | 'macos' | 'linux' {
  if (os === 'macos') return 'macos'
  if (os === 'linux') return 'linux'
  return 'windows'
}
