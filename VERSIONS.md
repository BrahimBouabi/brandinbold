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

## Rollback
`tar -xzf versions/<fichier>.tar.gz -C . --overwrite` puis `npm install` (si package.json changé) et `npx electron-vite build`.
