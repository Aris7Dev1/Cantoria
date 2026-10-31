---
name: cantoria-ci-failure
description: "Charger cette skill pour diagnostiquer un échec de la CI GitHub de Cantoria : chaque piège rencontré (SDK, Electron, X server, Chromium, quota d'artefacts, sémantique des inputs) avec son symptôme exact et sa parade."
---

# Diagnostiquer un échec CI

Chaque entrée : le symptôme exact vu dans le log, la cause, la parade. (Pièges vécus pendant le cycle Android #54-#78.)

| Symptôme dans le log | Cause | Parade |
|---|---|---|
| `sdkmanager… Failed to find package 'tools'` | `android-actions/setup-android` cassé sur runners récents | **Ne pas utiliser l'action** : le SDK est préinstallé sur `ubuntu-latest` |
| `spawn …/electron ENOENT` | `npm ci` (avec cache) restaure le paquet **sans son binaire** (postinstall sauté) | Pas « Garantir le binaire » : `node node_modules/electron/install.js` si absent + `test -x` en garde |
| `Missing X server or $DISPLAY` | Electron exige un serveur X, les runners sont headless | Enrober dans `xvfb-run -a` (comme le script npm local) |
| `Executable doesn't exist …/headless_shell` | Playwright ne télécharge son navigateur **que sur demande** | `npx playwright-core install chromium-headless-shell` avant le pas |
| `Artifact storage quota has been hit` | Quota de stockage des artefacts (plan free) saturé | Purger les artefacts + attendre le recalcul (6–12 h) ; **préférer les commentaires de PR aux artefacts** pour les rapports ; rétention courte (`retention-days: 1`) sur les builds nécessaires |
| `./gradlew: Syntax error: Unterminated quoted string` | Wrapper tapé main / écriture bash≠dash | Valider avec `bash -n` **et** `dash -n** (le `/bin/sh` des runners est dash) ; ne jamais retaper un wrapper officiel à la main |
| `Only one companion object is allowed` | Empilement de branches : deux companions dans une classe Kotlin | Fusionner ; test « exactement un companion » |
| RuntimeException Looper dans tests JUnit | Classe Android framework au constructeur (`Handler(Looper.getMainLooper())`) | Création **paresseuse** (au premier usage), constructeur pur |
| `'onPageStarted' overrides nothing` | Signature Android incomplète (premier paramètre `view: WebView` omis) | Vérifier la signature exacte contre l'API docs |
| Un re-run rejoue l'ANCIEN workflow | Le re-run utilise le workflow du commit d'origine | **Nouveau run** (Run workflow) après un fix — jamais re-run pour tester un correctif |
| `nothing to commit` sur un fix poussé | Correctif poussé sur une branche **déjà mergée** (le merge ne l'a pas emmené) | Vérifier `git merge-base --is-ancestor <commit> origin/main` ; correctif = nouvelle branche depuis main |
| `AAPT: resource mipmap/ic_launcher not found` | Manifest référence des icônes inexistantes | Générer les mipmaps (5 densités, mdpi→xxxhdpi) depuis `assets/icon.png` |

## Règles de diagnostic

1. **Lire le log complet** : la première `##[error]` fait foi, pas la dernière.
2. **Identifier l'étape** : échec d'environnement (setup/binaire) ≠ échec de code (assert/tests).
3. **Vérifier ce qui est réellement dans `main`** (`git log origin/main`) avant de conclure qu'un fix « n'est pas passé » — le merge peut être antérieur au push du fix.
4. Chaque correction de workflow : YAML validé (`python3 -c "import yaml; …"`), et **un nouveau run** pour la tester.
