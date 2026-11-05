const { execFileSync } = require('child_process')
const { existsSync, readdirSync } = require('fs')
const { join } = require('path')

/**
 * electron-builder afterPack hook:
 * When `mac.identity: null` is used, electron-builder skips code signing after
 * modifying Info.plist, Resources/app.asar, and icons. That leaves the outer
 * Mach-O bundle with a broken linker-signed signature ("code has no resources
 * but signature indicates they must be present"), causing macOS Gatekeeper to
 * report: “Brandinbold” is damaged and can’t be opened.
 *
 * This hook strips extended attributes (quarantine/provenance), ad-hoc signs any
 * bundled Camoufox.app inside engine-bundle, ad-hoc signs Brandinbold.app with
 * `codesign --force --deep --sign -`, and verifies the resulting signature.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  if (!existsSync(appPath)) return

  console.log(`  • afterPack: stripping xattr & ad-hoc signing ${appPath}`)
  try {
    execFileSync('/usr/bin/xattr', ['-cr', appPath], { stdio: 'inherit' })
  } catch {
    /* ignore */
  }

  // If offline engine-bundle is embedded, sign nested Camoufox.app first
  const officialDir = join(appPath, 'Contents', 'Resources', 'engine-bundle', 'browsers', 'official')
  if (existsSync(officialDir)) {
    for (const entry of readdirSync(officialDir)) {
      const camoufoxApp = join(officialDir, entry, 'Camoufox.app')
      if (existsSync(camoufoxApp)) {
        console.log(`  • afterPack: ad-hoc signing nested ${camoufoxApp}`)
        execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', camoufoxApp], {
          stdio: 'inherit'
        })
      }
    }
  }

  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit'
  })
  console.log(`  • afterPack: verified ad-hoc signature on ${appPath}`)
}

