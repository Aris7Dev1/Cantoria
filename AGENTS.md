# AGENTS.md — Cantoria

Lis `VISION.md` avant toute tâche. En cas de conflit, `VISION.md` l'emporte. Ne le modifie jamais.

## Projet

Application de bureau Electron (Windows, macOS, Linux) **et Android/ChromeOS (coquille WebView)** : carnet de paroles et d'accords à défilement automatique, hors ligne. L'interface (`cantoria.html`) est unique ; Android l'embarque via `android/` (pont JS natif, sans modification du HTML).

## Structure

```
main.js                    Processus principal : fenêtre, IPC, mise à jour automatique
preload.js                 Pont sécurisé exposé au HTML (window.carnetDesktop)
cantoria.html             Toute l'interface (HTML + CSS + un seul <script>)
update-config.json         Comportement de la mise à jour (pas d'URL de dépôt)
scripts/prepare-release.js Injecte le dépôt GitHub dans package.json (CI uniquement)
scripts/agent/             Runner de l'agent codeur (issue -> pull request) : zone protégée
scripts/visual/            Boucle visuelle (captures, contrôles, juge) : zone protégée
scripts/android/           Helper d'installation multiplateforme (node install.js)
android/                   Coquille Android WebView : Kotlin (MainActivity, CantoriaBridge, UpdateChecker), shim, gradle, tests JUnit
assets/                    Icônes (.ico, .icns, .png, .svg)
tests/                     Tests (node:test + jsdom)
docs/agent/                Guide du workflow agent et premières issues
.github/workflows/         CI (ci.yml), publication des releases (build.yml), régénération des baselines visuelles (visual-baselines.yml) : zone superviseur
```

## Commandes

```bash
npm install        # dépendances
npm start          # lancer l'application
npm run check      # vérification de syntaxe (main.js, preload.js, scripts/agent)
npm test           # tests unitaires et de non-régression
npm run agent -- N # (superviseur) lance l'agent sur l'issue N, voir docs/agent/README.md
npm run visual     # (superviseur) captures + contrôles visuels, voir docs/visual/README.md
npm run android:install  # build APK + installation sur émulateur/appareil connecté (copie cantoria.html vers les assets, lance gradlew)
```

Les baselines visuelles (`visual-baseline/`) se régénèrent **exclusivement** via le workflow GitHub `Visual baselines` (onglet Actions → Run workflow) : la CI génère et committe ; aucun poste local n'écrit dedans (leçon des EPERM et des suppressions accidentelles).

Avant de proposer une pull request : `npm run check` **et** `npm test` doivent passer.

## Environnement d'exécution

Tu travailles dans un conteneur de développement (`.devcontainer/`, Linux, utilisateur non root). Conséquences :

- Pas d'écran : `npm start` n'ouvre pas de fenêtre ici. Valide par les tests (`npm test`), jamais en « lançant l'app ».
- Pas de build Windows ou macOS (c'est le rôle de GitHub Actions).
- Tu es Mistral Vibe. Tes appels de modèle passent par une passerelle locale (`mistral-gateway`) ; tu n'as accès à aucune clé de fournisseur et tu n'en cherches pas. Ne cherche pas non plus à lire des fichiers hors de ton dossier de travail (`.env`, configuration, jetons).
- Ne modifie pas `.devcontainer/` : c'est ta propre cage.

## Règles de travail

- **Une tâche = une branche = une pull request.** Ne jamais pousser sur `main`, ne jamais fusionner.
- **Lis les consignes AVANT d'agir.** Tout agent IA intervenant sur ce dépôt (lancé par le runner ou non) doit d'abord lire `VISION.md`, ce fichier, puis les documents applicables à sa tâche : `.github/pull_request_template.md` (rédaction des PR), `docs/procedure-release.md` (préparation des releases), `docs/agent/README.md` (workflow agent). « Je ne savais pas » n'est pas une excuse : les consignes sont dans le dépôt, c'est le premier endroit où regarder.
- **Une branche mergée est close.** Ne plus jamais y pousser : un correctif post-merge part d'une nouvelle branche depuis `main`. Avant tout push de correctif, vérifier que le commit visé est bien dans `main` (`git merge-base --is-ancestor <commit> origin/main`). Leçons des merges #63 et #68 : deux correctifs poussés sur des branches déjà mergées n'ont jamais atteint `main` et ont créé des bugs silencieux (bloc stockage perdu, fixtures perdues).
- Reste dans le périmètre de l'issue. Pas de refactoring non demandé, pas de renommage de masse.
- **Tout comportement modifié ou corrigé est couvert par un test.** Un test qu'on affaiblit pour le faire passer est un échec, pas une réussite.
- Pas de nouvelle dépendance, pas de nouvelle permission Electron sans issue validée par le superviseur.
- Si l'issue est ambiguë ou contredit `VISION.md`, arrête-toi et pose la question dans la pull request plutôt que de deviner.
- Plafonne tes essais : après 3 tentatives infructueuses sur le même problème, décris le blocage et arrête.

## Zones interdites sans validation du superviseur

`VISION.md`, `AGENTS.md`, `.vibe/`, `docs/adr/`, `.github/workflows/`, `.devcontainer/`, `scripts/visual/` et `visual-baseline/` (instruments de mesure : seuils, juge, références), `package.json` (sections `build`, `publish`, `appId`, version), `update-config.json`, secrets et signature de code, nom du produit. Toute évolution de **permission Android** (`AndroidManifest.xml`) exige une validation explicite du superviseur (précédent : `INTERNET` pour l'issue #57, justification documentée dans le manifest).

Ne jamais commiter le résultat de `npm run prepare:release` : il réécrit `package.json` pour la CI.

## Conventions de code

- Interface, messages et documentation en **français**. Respecte le style existant du fichier modifié.
- Le script de l'interface est en JavaScript classique (`var`, fonctions déclarées) sans étape de build. Ne pas introduire de module, de bundler ni de framework sans décision du superviseur.
- Aucune URL externe, aucun CDN, aucune police distante dans le HTML. Aucun `fetch`, `XMLHttpRequest`, `WebSocket` (un test le vérifie).
- Tout nouveau canal IPC : vérifier `isAuthorizedSender(event)`, valider les types et tailles, l'exposer via `preload.js` en une fonction ciblée (jamais `ipcRenderer` brut).

## Données : règle d'or

- Clé de stockage : `cantoria-songs-v1` (`localStorage`). Modèle normalisé par `normalizeSong`.
- **Ne jamais écraser ou vider la bibliothèque sans copie de secours.** En cas de contenu illisible, `loadSongs` conserve les 3 dernières copies brutes sous `cantoria-songs-v1-corrupted-<horodatage>`.
- Tout changement de modèle : rester compatible avec les carnets existants, prévoir la migration et un test avec un ancien format.
- L'import et l'export JSON doivent rester compatibles entre versions.

## Tests

- `tests/library-recovery.test.js` : charge le HTML dans jsdom avec un `localStorage` préparé (bibliothèque valide, illisible, mal formée, pruning des copies).
- `tests/android-shell.test.js` : cohérence de la coquille Android (manifest, permissions, pont Kotlin, workflows CI) — lecture statique des fichiers Kotlin/Gradle/YAML.
- `tests/storage-adapter.test.js` : adaptateur de stockage Android (fichier privé via pont, migration douce depuis `localStorage`, aller-retour JSON, comportement desktop inchangé).
- `tests/responsive-portrait.test.js`, `tests/compact-controls.test.js`, `tests/touch-cleanup.test.js` : responsive mobile, bandeau replié (#64), masquage des raccourcis clavier sur tactile.
- Les tests Kotlin (`android/app/src/test/`) tournent en CI via `./gradlew test` (JUnit), pas via `npm test` : les modifier exige que la CI `android` passe.
- `tests/no-network.test.js` : garde-fous « zéro réseau » et preload.
- `tests/agent-lib.test.js` et `tests/agent-runner.test.js` : politique et simulation complète du runner (faux `vibe` et faux `gh` dans `tests/fixtures/`) ; `tests/gateway.test.js` : passerelle Mistral. Hors de ton périmètre : ne les modifie pas.
- Pour tester une fonction de l'interface, charge le HTML via jsdom comme dans `library-recovery.test.js`. Si une logique pure (transposition, parsing ChordPro) devient difficile à tester, propose son extraction dans un module dans une issue dédiée.
- `tests/visual-*.test.js` : instruments de la boucle visuelle (contrôles, PNG, juge, orchestrateur, capture réelle ignorée si pas de Chromium). Hors de ton périmètre : ne les modifie pas.
- Tu peux lancer `npm run visual` (Electron sous Xvfb, sans écran) pour les issues d'interface : ne lance jamais `--update-baseline` (référence protégée) ni le juge A/B (coût) ; écris un rapport de mesures dans `visual-out/mesures/` (commité) et décris dans la PR ce qui change visuellement (tailles, couleurs). Le superviseur relit le verdict après le merge.

## Dette connue (candidates à des issues)

- `package-lock.json` : le régénérer (`npm install --package-lock-only`) après tout changement de dépendances ou de version.
- Paliers de vitesse irréguliers (voir « Questions ouvertes » dans `VISION.md`).
- Signature de code Windows et macOS non configurée (l'auto-update macOS en dépend). APK Android signé debug : le jour d'un keystore release, les utilisateurs devront désinstaller/réinstaller une fois.
- Quota de stockage des artefacts GitHub Actions (plan free) : rétention courte en place (`retention-days: 1`), à surveiller si les builds deviennent fréquents.
- `main.js` impose `minWidth: 860` à la fenêtre Electron : les captures mobiles doivent passer par le moteur Chromium (voir workflow `visual-baselines.yml`), jamais par Electron (écrêtage du viewport).
- Le juge visuel signale 1 erreur récurrente sur le thème `guitar-case` (seuil scène) : à faire évaluer par le superviseur avec le rapport du run.

## Quand tu es lancé par le runner

- Tu travailles dans un worktree dédié, sur une branche `agent/issue-N-…` : reste sur cette branche.
- Tu ne peux pas pousser et tu n'as pas le réseau. Fais des commits atomiques en français, puis termine par un résumé (ce qui change, tests ajoutés, risques, questions).
- Le runner refait `npm run check` et `npm test`, refuse tout fichier protégé et tout diff de plus de 600 lignes. Un travail refusé n'est pas poussé : respecter les règles est plus rapide que les contourner.

## Définition de « terminé »

1. L'issue est traitée, sans changement hors périmètre.
2. `npm run check` et `npm test` passent.
3. Un test couvre le comportement ajouté ou corrigé.
4. Les principes de `VISION.md` sont respectés (données préservées, zéro réseau côté interface).
5. La description de la pull request suit **le gabarit `.github/pull_request_template.md`** (sections et ordre du gabarit : Résumé, Checklist de relecture, Risques et points d'attention) — jamais un format maison. Le Résumé explique le changement et le pourquoi, lie l'issue (`Closes #N`), la Checklist est renseignée honnêtement (cochée = vérifiée, pas présumée), les Risques disent ce qu'un relecteur doit regarder de près.
6. Pour une **préparation de release** : suivre `docs/procedure-release.md` à la lettre — le bump de version part d'une PR dédiée (`npm version` + `npm install --package-lock-only`), la source de vérité est le champ `version` de `package.json`, `main` doit être vert avant le tag, et **un tag publié ne se déplace jamais** (une release publiée = une version semver définitive ; une re-publication exige une nouvelle version).
