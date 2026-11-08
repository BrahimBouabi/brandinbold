# Versions Brandinbold — journal de rollback

| Version | Date | Contenu | Fichier |
|---|---|---|---|
| v2026-11-01-task8-baseline | 2026-11-01 | État avant TASK 8 (Part A OS switching + Part B CSV). Inclut: rebrand, badge OK, formulaire 7 onglets, row menu, session restore, comparatif fingerprint (100% BrowserScan / iphey Trustworthy). DMG: release/Brandinbold-0.1.0-arm64.dmg | versions/v2026-11-01-task8-baseline.tar.gz |

| v2026-11-01-task8-step3-consistency | 2026-11-01 | Étape 3: cohérence formulaire (OS → platform/GPU/fonts/screen/hw + toast + warning cross-OS + note deviceMemory gated) | versions/v2026-11-01-task8-step3-consistency.tar.gz |
| v2026-11-01-task8-step2-osfix | 2026-11-01 | Étape 2: fix polices cross-OS (polices hôte quand OS usurpé ≠ hôte) + nettoyage onglets 127.0.0.1 + test matrice 3OS×3locales (9/9 PASS) | versions/v2026-11-01-task8-step2-osfix.tar.gz |

| v2026-11-01-task8-step5-import | 2026-11-01 | Étape 5: Import CSV (détection auto, preview avec statuts/corrections, doublons, groupe, rapport) + round-trip 59/68 identiques (9 diffs documentées) | versions/v2026-11-01-task8-step5-import.tar.gz |

| v2026-11-01-task8-final | 2026-11-01 | TASK 8 complet: Part A (fix OS cross-platform + matrice 9/9 + cohérence formulaire) + Part B (export/import CSV Incogniton 68 colonnes, round-trip 59/68). DMG: release/Brandinbold-0.1.0-arm64.dmg | versions/v2026-11-01-task8-final.tar.gz |

| v2026-11-02-hotfix-fpgen-model | 2026-11-02 | Hotfix: le modèle fpgen (203 MB) s'installe automatiquement avant toute génération d'empreinte + ordre corrigé (navigateur d'abord) — corrige l'erreur ModelNotInstalled après un nettoyage de cache ou une installation fraîche | versions/v2026-11-02-hotfix-fpgen-model.tar.gz |

| v2026-11-02-task9-step1.1-baseline | 2026-11-02 | TASK 9 Étape 1.1 baseline (avant migration engine storage) | versions/v2026-11-02-task9-step1.1-baseline.tar.gz |

| v2026-11-03-task9-step1.1-engine-home | 2026-11-03 | TASK 9 Étape 1.1: engine storage migré vers ~/Library/Application Support/Brandinbold/engine (2.7GB, rename instantané) + symlink auto-réparé ~/Library/Caches/camoufox → engine (cache cleaners ne cassent plus l'app). Vérifié: wipe simulation + génération FP zéro re-download + CLI séparée OK | versions/v2026-11-03-task9-step1.1-engine-home.tar.gz |

| v2026-11-03-task9-step1.2-baseline | 2026-11-03 | TASK 9 Étape 1.2 baseline (avant purge cache profils) | versions/v2026-11-03-task9-step1.2-baseline.tar.gz |

| v2026-11-03-task9-step1.2-cache-purge | 2026-11-03 | TASK 9 Étape 1.2: purge auto des caches transitoires (cache2/startupCache/thumbnails/shader-cache/jumpListCache/minidumps) au stop et pré-launch, whitelist stricte (cookies/places/sessionstore/storage/prefs/extensions intouchables), getProfileDiskInfo + bouton Clean profiles cache dans Settings→Browser. Test: 22.5MB libérés, sessions/localStorage 100% préservés — PASS | versions/v2026-11-03-task9-step1.2-cache-purge.tar.gz |

| v2026-11-03-task9-step1.3-baseline | 2026-11-03 | TASK 9 Étape 1.3 baseline (avant Fat DMG offline) | versions/v2026-11-03-task9-step1.3-baseline.tar.gz |

| v2026-11-03-task9-step1.3-offline-dmg | 2026-11-03 | TASK 9 Étape 1.3: Fat DMG offline (1.4GB, moteur embarqué dans Resources/engine-bundle, restauration machine neuve en 10s par clone APFS zéro réseau) + script prepare-engine-bundle.mjs + scripts package (light) / package:offline (fat). PHASE 1 COMPLÈTE | versions/v2026-11-03-task9-step1.3-offline-dmg.tar.gz |

| v2026-11-03-task10-step2.1-baseline | 2026-11-03 | TASK 10 Étape 2.1 baseline (avant git init + workspace cloud) | versions/v2026-11-03-task10-step2.1-baseline.tar.gz |

| v2026-11-03-task10-step2.2-baseline | 2026-11-03 | TASK 10 Étape 2.2 baseline (avant cloud api + docker) | versions/v2026-11-03-task10-step2.2-baseline.tar.gz |

| v2026-11-03-task10-step2.2-cloud-api | 2026-11-03 | TASK 10 Étape 2.2: Cloud API complète (JWT auth register/login/refresh/me, sync push/pull ownership-safe, plan limits, session archives gzip ≤50MB) + Docker Compose (postgres 16 + api + web, migrations boot) + test automatisé 13/13 PASS. Fixes: ownership-aware upserts (sécurité multi-user), .dockerignore (binaires hôte), TLA→main() cjs | versions/v2026-11-03-task10-step2.2-cloud-api.tar.gz |

| v2026-11-03-task10-step2.3-baseline | 2026-11-03 | TASK 10 Étape 2.3 baseline (avant cloud/web réel) | versions/v2026-11-03-task10-step2.3-baseline.tar.gz |

| v2026-11-03-task10-step2.3-web | 2026-11-03 | TASK 10 Étape 2.3: cloud/web réel — Landing (hero/features/plans/download), Register/Login (JWT localStorage), Dashboard (plan+quota, counts, name/password change). API: PATCH me + change-password. Captures 34-37 | versions/v2026-11-03-task10-step2.3-web.tar.gz |

| v2026-11-03-task10-step2.4-baseline | 2026-11-03 | TASK 10 Étape 2.4 baseline (avant auth gate + sync Electron) | versions/v2026-11-03-task10-step2.4-baseline.tar.gz |

| v2026-11-03-task10-step2.4-auth-gate-sync | 2026-11-03 | TASK 10 Étape 2.4: auth gate Electron (login/register/offline bypass), cloud sync bidirectionnel (pull merge au start, push debounced aux mutations, session archives upload au stop / restore au launch), Sidebar live user + plan cloud | versions/v2026-11-03-task10-step2.4-auth-gate-sync.tar.gz |

| v2026-11-03-task10-step2.5-baseline | 2026-11-04 | TASK 10 Étape 2.5 baseline (avant Railway + guides) | versions/v2026-11-03-task10-step2.5-baseline.tar.gz |

## Rollback
`tar -xzf versions/<fichier>.tar.gz -C . --overwrite` puis `npm install` (si package.json changé) et `npx electron-vite build`.

| v2026-11-04-stepA-baseline | 2026-11-04 | Step A baseline (avant correctifs déploiement Railway) | versions/v2026-11-04-stepA-baseline.tar.gz |

| v2026-11-04-stepA-railway-fixes | 2026-11-04 | Step A: railway.json valides (JSON, start dist/index.cjs) + cloud/api/railway.json, nginx sur $PORT (template envsubst) sans proxy api:8787, VITE_API_URL en build-arg, champ « Cloud server » (Test/Save) dans Settings + AuthGate, override env BRANDINBOLD_CLOUD_API_URL, client cloud reconstruit au changement d'URL (logout si serveur change). Tests: typecheck OK, image web PORT=6123 OK, compose + test-cloud 13/13 PASS | versions/v2026-11-04-stepA-railway-fixes.tar.gz |

| v2026-11-04-stepB-baseline | 2026-11-04 | Step B baseline (avant correctifs sync cloud & logout) | versions/v2026-11-04-stepB-baseline.tar.gz |

| v2026-11-04-stepB-sync-fixes | 2026-11-04 | Step B: sync cloud complet — tombstones/suppressions (profiles/groups/proxies) avec file d'attente offline persistée (cloud_pending_deletes) et résurrection au restore, newer-wins bidirectionnel (profiles/groups/proxies) avec conservation des updatedAt distants, logout complet (purge cloud_refresh_token + file d'attente), marqueurs d'horloge serveur pour les archives de session (anti clock-skew) + upload auto à la fermeture fenêtre navigateur. Tests: typecheck OK, test-cloud 16/16 PASS | versions/v2026-11-04-stepB-sync-fixes.tar.gz |

| v2026-11-04-stepC-baseline | 2026-11-04 | Step C baseline (avant mise à jour finale HANDOFF + régression) | versions/v2026-11-04-stepC-baseline.tar.gz |

| v2026-11-04-stepC-handoff-complete | 2026-11-04 | Step C: BRANDINBOLD_HANDOFF.md mis à jour (TASK 10 100 % complet incl. Étapes 2.4/2.5 + Step A/B, 16/16 tests cloud, arbre fichiers et compteurs corrigés) + suite de régression (typecheck, electron-vite build, test-cloud 16/16 PASS, test-cache-purge PASS) | versions/v2026-11-04-stepC-handoff-complete.tar.gz |
| v2026-11-05-dmg-launch-fix-baseline | 2026-11-05 | Baseline avant correctifs Issue A (DMG macOS signature / Gatekeeper) et Issue B (lancement profil bloqué sur launching en app packagée) | versions/v2026-11-05-dmg-launch-fix-baseline.tar.gz |
| v2026-11-05-dmg-launch-fix | 2026-11-05 | Correctifs Issue A + Issue B : hook `scripts/after-pack.cjs` (`xattr -cr` + `codesign --force --deep --sign -` + vérification stricte), `.0.5_FLAG` préservé dans `engineHome.ts` et `prepare-engine-bundle.mjs`, rafraîchissement `mtime` du `.mmdb` GeoIP existant (évite le re-téléchargement bloquant de 53 Mo au lancement), suppression des appels sous-processus `npx`/`camoufox` absents du `PATH` Finder au profit d'appels directs (`getActivePath`, `ensureCamoufoxInstalled`, lookup FS), correction `pgrep` sans `\ ` et synchronisation immédiate du statut `launching -> launched / Stop` dans l'UI | versions/v2026-11-05-dmg-launch-fix.tar.gz |
| v2026-11-08-step1-baseline | 2026-11-08 | Baseline avant STEP 1 (Account & Cloud connection: items 1, 8, 10) | versions/v2026-11-08-step1-baseline.tar.gz |
| v2026-11-08-step1-account-cloud | 2026-11-08 | STEP 1 complet (items 1, 8, 10) : URL cloud Railway de production par défaut + migration auto du `localhost:8787` initial, activation d'`AuthGate` au démarrage, Sidebar/Settings réactifs (`Manage account` via `shell.openExternal`, Sign In / Sign Out / Sync Now), correctif `BUG-009` (upload partiel jusqu'à `maxProfiles` + `rejectedProfiles` avec badge `local only (plan limit)` sans rejet global 403), `ENABLE_PLAN_LIMITS = true`, API + Web Dashboard username, mot de passe fort (8+, maj, min, chiffre + mot de passe actuel), TOTP 2FA (RFC 6238 QR code + 8 backup codes à usage unique + challenge login Web & Desktop), rate limiting 429 sur auth, `test-cloud.mjs` 29/29 PASS | versions/v2026-11-08-step1-account-cloud.tar.gz |
| v2026-11-08-step2-baseline | 2026-11-08 | Baseline avant STEP 2 (Profile data model: items 6, 7 — Groups & Trash) | versions/v2026-11-08-step2-baseline.tar.gz |
| v2026-11-08-step2-groups-trash | 2026-11-08 | STEP 2 complet (items 6, 7) : état `profileFilter` partagé entre Sidebar et `ProfilesPage`, filtres `All`/`Unassigned`/groupes fonctionnels avec compteurs exacts, modale AntD de création/édition/pin/suppression de groupe dans la Sidebar + sous-menu `Move to Group` et colonne `Group` cliquable, nettoyage de `$.groupId` dans `profiles.json` lors de `deleteGroup`, IPC `profiles:listDeleted` et `profiles:emptyTrash` câblés, persistance de `deletedAt` dans le JSON, page `Trash` complète (Restore, Delete permanently + suppression dossier disque, sélection multiple, Empty Trash, rétention auto-purge 30 jours), `test-step2-groups-trash.mjs` 5/5 PASS | versions/v2026-11-08-step2-groups-trash.tar.gz |
| v2026-11-08-step3-baseline | 2026-11-08 | Baseline avant STEP 3 (Profile actions: items 3, 4, 5 — Bulk Create, CSV Import/Export round-trip, 29-item row menu) | versions/v2026-11-08-step3-baseline.tar.gz |
| v2026-11-08-step3-profile-actions | 2026-11-08 | STEP 3 complet (items 3, 4, 5) : modale `BulkCreateModal` + IPC `profiles:bulkCreate` (1–50 profils, OS, groupe, proxy, tags, empreinte unique épinglée, quota plan), bouton `New profile > Import` câblé sur `ImportModal`, round-trip CSV 72 colonnes (`68 Incogniton + 4 Brandinbold`) 100 % sans perte (`export -> delete -> import -> identique`), validation par ligne + quota plan + `scheduleCloudPush()`, suppression totale des appels `window.prompt` au profit de modales AntD (`Manage tags`, `Add a tag`, `Start with custom arguments`, `Start with a specific URL`, `Add Bookmarks`, `Edit Startup URLs`, `Synchronizer`, actions groupées), transfert de `LaunchSpecialOpts` (`maximized`, `extraArgs`, `openUrlAfter`, `privateWindow`), correctif SQLite `moz_places`/`moz_bookmarks` (sans colonne `guide_enabled` + file `pending-bookmarks.json`), backup/export fonctionnel même avant premier lancement (`profile-metadata.json`), clone avec nouvelle empreinte, règles `Ready`/`Launched` sur les 29 items du menu `⋮`, `test-step3-actions-csv.mjs` 4/4 PASS | versions/v2026-11-08-step3-profile-actions.tar.gz |
| v2026-11-08-step4-baseline | 2026-11-08 | Baseline avant STEP 4 (Session restore: item 2 — local & cloud session recovery) | versions/v2026-11-08-step4-baseline.tar.gz |
| v2026-11-08-step4-session-restore | 2026-11-08 | STEP 4 complet (item 2) : restauration fiable des onglets et sessions en local et via Cloud Sync. Intervalle `browser.sessionstore.interval` réduit de 15s à 1s, suivi live des onglets (`bb-session-tabs.json`) + sauvegarde `bb-last-good.jsonlz4` et décodeur `mozLz4` pour récupérer automatiquement les sessions écrasées par `windows: []` lors de la fermeture fenêtre macOS (`×`) ou dans `recovery.baklz4`, arrêt propre automatique du processus macOS sans fenêtre (`quitOnWindowClose`), suppression de l'onglet `about:blank` parasite injecté par `firefox.launchPersistentContext` au redémarrage, ajout de `sessionstore.jsonlz4`, `sessionCheckpoints.json`, `bb-session-tabs.json` et `webappsstore.sqlite` à `VITAL_FILES` dans `syncEngine.ts`, stub `prefs.js` lors de l'extraction cloud sur une machine fraîche, `test-step4-session-restore.mjs` 4/4 PASS | versions/v2026-11-08-step4-session-restore.tar.gz |




