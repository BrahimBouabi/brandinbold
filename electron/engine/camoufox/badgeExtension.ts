import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import logoSvgRaw from '../../../src/assets/boldin.svg?raw'

export interface BadgeData {
  id: string
  name: string
  color: string
  timezone: string
  coords: string
  ip: string
}

/**
 * Builds the per-profile copy of the badge extension with the profile's
 * identity baked into data.js. The data lives ONLY in the extension's own
 * privileged page — there is no page-visible DOM, no network request and no
 * web-accessible surface, so sites cannot read it or use it for detection.
 */
export function buildBadgeExtension(profile: BadgeData): string | null {
  try {
    const template = join(process.cwd(), 'resources', 'badge-extension')
    const fallback = join(process.resourcesPath ?? '', 'badge-extension')
    const srcDir = existsSync(template) ? template : fallback
    if (!existsSync(join(srcDir, 'manifest.json'))) return null

    const outDir = join(app.getPath('userData'), 'badge-extensions', profile.id.slice(0, 8))
    rmSync(outDir, { recursive: true, force: true })
    mkdirSync(outDir, { recursive: true })
    for (const f of ['manifest.json', 'background.js', 'popup.html', 'popup.js']) {
      copyFileSync(join(srcDir, f), join(outDir, f))
    }

    writeFileSync(
      join(outDir, 'data.js'),
      `const PROFILE_DATA = ${JSON.stringify(profile)};`
    )

    const icon = renderIconPng(profile.color, 48)
    if (icon) writeFileSync(join(outDir, 'icon.png'), icon)
    // reference the icon in the manifest
    if (icon) {
      const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'))
      manifest.browser_action.default_icon = { '48': 'icon.png' }
      writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    }
    return outDir
  } catch {
    return null
  }
}

/** Rasterize the Brandinbold logo on a colored rounded square to PNG bytes. */
export function renderIconPng(colorHex: string, size: number): Buffer | null {
  try {
    const work = `/tmp/bb-badge-${colorHex.replace('#', '')}-${size}`
    rmSync(work, { recursive: true, force: true })
    mkdirSync(work, { recursive: true })
    const html = `<!doctype html><body style="margin:0"><div style="width:256px;height:256px;border-radius:56px;background:${colorHex};display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 1080 1080" width="170" height="170"><path fill="#ffffff" d="M504.621 178.726 C527.414 141.183 564.563 112.009 610.117 112.023 L841.789 112.091 C886.711 112.104 925.528 141.234 946.148 178.993 L1046.674 363.077 C1070.015 405.82 1075.051 457.072 1047.553 499.446 L789.819 896.624 C762.305 939.025 712.641 968.407 661.616 968.467 L415.076 968.753 C353.607 968.824 303.876 931.101 273.231 880.637 L29.742 479.676 C7.25 442.639 9.564 393.89 29.993 356.847 L150.839 137.715 C160.117 120.893 178.081 111.135 195.746 111.248 C214.956 111.371 230.531 121.424 240.831 138.32 L662.946 830.765 C671.653 845.047 689.152 850.727 702.801 850.283 C719.667 849.735 731.761 841.126 741.168 826.847 L977.241 468.502 C987.044 453.622 991.711 436.499 982.899 419.918 L875.927 218.623 C867.713 203.167 854.288 193.948 838.109 192.849 C821.456 191.718 804.89 198.769 795.476 214.127 L623.903 494.004 C613.898 510.324 595.368 516.488 578.049 515.707 C560.52 514.917 546.17 505.079 536.382 489.036 L443.047 336.049 C432.081 318.075 432.187 298.035 442.965 280.282 Z"/></svg></div></body>`
    const htmlPath = join(work, 'icon.html')
    writeFileSync(htmlPath, html)
    // Render via the badge svg directly (qlmanage handles svg; compose color by inlining fill)
    const svg = logoSvgRaw.replace('currentColor', colorHex)
    const svgPath = join(work, 'icon.svg')
    writeFileSync(svgPath, svg)
    execFileSync('qlmanage', ['-t', '-s', '1024', '-o', work, svgPath], { stdio: 'ignore' })
    const png = join(work, 'icon.svg.png')
    if (!existsSync(png)) return null
    const out = join(work, `icon-${size}.png`)
    execFileSync('sips', ['-z', String(size), String(size), png, '--out', out], { stdio: 'ignore' })
    const data = readFileSync(out)
    rmSync(work, { recursive: true, force: true })
    return data
  } catch {
    return null
  }
}

/** Patch the cloned bundle's omni.ja so the window title suffix is the profile name. */
export function patchWindowTitle(bundleApp: string, profileName: string): boolean {
  try {
    const omni = join(bundleApp, 'Contents', 'Resources', 'omni.ja')
    if (!existsSync(omni)) return false
    const work = `/tmp/bb-omni-${randomTail()}`
    mkdirSync(work, { recursive: true })
    // find the brand ftl inside the zip
    const list = execFileSync('unzip', ['-l', omni]).toString()
    const entry =
      list.split('\n').map((l) => l.trim().split(/\s+/).pop()).find((n) => n && n.includes('brand.ftl')) ?? null
    if (!entry) return false
    execFileSync('unzip', ['-o', omni, entry, '-d', work], { stdio: 'ignore' })
    const ftlPath = join(work, entry)
    if (!existsSync(ftlPath)) return false
    let ftl = readFileSync(ftlPath, 'utf8')
    if (/-brand-full-name/.test(ftl)) {
      ftl = ftl.replace(/-brand-full-name\s*=\s*.*/, `-brand-full-name = ${profileName.replace(/\n/g, ' ')}`)
    } else {
      ftl += `\n-brand-full-name = ${profileName.replace(/\n/g, ' ')}\n`
    }
    writeFileSync(ftlPath, ftl)
    // replace the entry inside the zip (zip updates in place when given the same path)
    const parentDir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : ''
    execFileSync('zip', ['-q', omni, entry], { cwd: work, stdio: 'ignore' })
    rmSync(work, { recursive: true, force: true })
    void parentDir
    return true
  } catch {
    return false
  }
}

function randomTail(): string {
  return Math.random().toString(36).slice(2, 8)
}
