import { createHash } from 'crypto'
import type { Profile } from '@shared/types'

/**
 * Deterministic fingerprint generator: internally consistent sets of
 * userAgent <-> platform <-> GPU <-> screen <-> hardware, picked by a
 * seed derived from the profile id, so the same id always regenerates
 * the same fingerprint (like Incogniton's per-profile canvas hash).
 */

interface Preset {
  os: 'win' | 'mac' | 'linux'
  userAgent: string
  platform: string
  gpuVendors: { vendor: string; renderer: string }[]
  screens: [number, number][]
  cores: number[]
  memories: number[]
  languages: string[][]
}

const CHROME_VERSIONS = ['141.0.7390.108', '142.0.7444.97', '143.0.7499.90']

const PRESETS: Preset[] = [
  {
    os: 'win',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSIONS[0]} Safari/537.36`,
    platform: 'Win32',
    gpuVendors: [
      {
        vendor: 'Google Inc. (Intel)',
        renderer:
          'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)'
      },
      {
        vendor: 'Google Inc. (NVIDIA)',
        renderer:
          'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER (0x000021C4) Direct3D11 vs_5_0 ps_5_0, D3D11)'
      },
      {
        vendor: 'Google Inc. (AMD)',
        renderer:
          'ANGLE (AMD, AMD Radeon(TM) Graphics (0x0000164E) Direct3D11 vs_5_0 ps_5_0, D3D11)'
      }
    ],
    screens: [
      [1920, 1080],
      [2560, 1440],
      [1600, 900]
    ],
    cores: [4, 6, 8, 12, 16],
    memories: [4, 8, 16],
    languages: [
      ['en-US', 'en'],
      ['fr-FR', 'fr', 'en'],
      ['de-DE', 'de', 'en']
    ]
  },
  {
    os: 'mac',
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSIONS[1]} Safari/537.36`,
    platform: 'MacIntel',
    gpuVendors: [
      { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
      { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)' },
      {
        vendor: 'Google Inc. (Intel)',
        renderer: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 645, OpenGL 4.1)'
      }
    ],
    screens: [
      [1680, 1050],
      [2560, 1440],
      [1440, 900]
    ],
    cores: [4, 8, 10, 12],
    memories: [8, 16],
    languages: [
      ['en-US', 'en'],
      ['en-GB', 'en']
    ]
  },
  {
    os: 'linux',
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSIONS[2]} Safari/537.36`,
    platform: 'Linux x86_64',
    gpuVendors: [
      {
        vendor: 'Google Inc. (Intel)',
        renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics (CML GT2), OpenGL 4.6 (Core Profile) Mesa 24.0.9)'
      },
      {
        vendor: 'Google Inc. (AMD)',
        renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (radeonsi navi23 LLVM 17.0.6), OpenGL 4.6)'
      }
    ],
    screens: [
      [1920, 1080],
      [1366, 768]
    ],
    cores: [4, 8, 16],
    memories: [4, 8, 16],
    languages: [['en-US', 'en']]
  }
]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFrom(id: string): number {
  const h = createHash('sha256').update(id).digest()
  return h.readUInt32LE(0)
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Fill the fingerprint-related fields of a profile with a consistent random set. */
export function generateFingerprint(profile: Profile): Profile {
  const rng = mulberry32(seedFrom(profile.id + ':' + Date.now().toString(36)))
  const preset = pick(rng, PRESETS)
  const gpu = pick(rng, preset.gpuVendors)
  const screen = pick(rng, preset.screens)
  return {
    ...profile,
    navigator: {
      userAgent: preset.userAgent,
      platform: preset.platform,
      languages: pick(rng, preset.languages),
      hardwareConcurrency: pick(rng, preset.cores),
      deviceMemory: pick(rng, preset.memories)
    },
    screen: { width: screen[0], height: screen[1] },
    webgl: { vendor: gpu.vendor, renderer: gpu.renderer },
    canvas: 'noise',
    audio: 'noise'
  }
}
