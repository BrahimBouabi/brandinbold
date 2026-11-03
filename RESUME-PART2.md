# Checkpoint — reprise PART 2 (profil enhancements)

## État au moment de la pause (2026-10-30)

### Terminé et vérifié
- **2.1 Row menu** ✅ — 15 entrées + séparateurs, sous-menus Launch Options / Browser Management / Backup & Recovery, Clone, CSV, Stop Browser, Disable. Table: pastille "Launched" violette, bouton Stop rouge, cellules "Add a group"/"Add a tag" cliquables. Captures: `screenshots/20-row-menu.png`, `21-row-menu-browsermgmt.png`.
- **2.2 Formulaire profils** ✅ — 7 onglets (Details, Proxy, Privacy & Network, Browser & Navigator, Hardware, Extensions & Cookies, Other) + mode étroit "Advanced >", moteur de cohérence (warnings OS/GPU/timezone/deviceMemory), champs mappés au moteur natif Camoufox (config keys vérifiées dans properties.json: mediaDevices:*, webGl:*, webrtc:*, navigator.hardwareConcurrency, navigator.doNotTrack, timezone, geolocation:*, fonts). Options non supportées par Camoufox désactivées avec explication (Canvas Block, WebGL image noise, device memory, hide browser settings, Webstore CRX). Captures: `screenshots/22-form-*.png` (7 onglets) + `29-form-narrow.png`.
- **2.3 Badge — code écrit** — extension template `resources/badge-extension/`, builder `electron/engine/camoufox/badgeExtension.ts` (copie par profil + data.js intégré + icône colorée), `patchWindowTitle` (patch omni.ja brand.ftl), câblé dans CamoufoxEngine (addons + prefs). IPCs ajoutés: cookies:clear, bookmarks:add/clear, backup:* (now/restore/export/import/openFolder), extensions:pickFolder, profiles:exportCsv, launch avec options (maximized/extraArgs/openUrlAfter). Launcher + preload + engines (cookies.clear CDP+Playwright) à jour. Build OK.

### En cours — LE point à reprendre
**Badge addon ne s'enregistre pas dans le profil Firefox** (test e2e: extensions.json ne montre que les thèmes Mozilla, pas profile-badge@brandinbold.app).
- Piste: vérifier comment camoufox-js consomme `addons` dans `node_modules/camoufox/dist/utils.js` (launchOptions) — il attend des chemins d'addons extraits; voir si l'option passe bien par CAMOU_ADDONS/env et si un dossier non-packagé suffit ou s'il faut un .xpi.
- Le test e2e: `/tmp/bb-badge-test.mjs` (relançable). Capture popup OK via file://: `screenshots/30-badge-popup.png`.
- Note: le moteur par défaut de l'app a été mis sur chrome-cdp (par l'utilisateur dans Settings) — le badge est un addon Firefox, donc tester sur camoufox.

### Reste après le badge
1. Corriger l'installation de l'addon + re-test e2e (extensions.json doit lister profile-badge@brandinbold.app, active).
2. Rebuild DMG (`npm run package`) + rapport final avec toutes les captures.
3. Optionnel: vérifier le patch omni.ja (titre de fenêtre) sur un vrai lancement wrapper.

### Tests de non-régression déjà en place
- `npm run test:fingerprint` (CreepJS/BrowserScan/Pixelscan)
- `npm run test:session` (session restore)
- `node scripts/verify-browser-fixes.mjs` (locale/RTL/about:blank)

### Divers
- Tous les process dev ont été arrêtés proprement.
- Aucun fichier en état cassé; `npm run dev` relance l'app; builds: `npx electron-vite build`.
