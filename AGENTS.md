# AGENTS.md — Cantoria

Lis `VISION.md` avant toute tâche. En cas de conflit, `VISION.md` l'emporte. Ne le modifie jamais.

## Projet

Application de bureau Electron (Windows, macOS, Linux) : carnet de paroles et d'accords à défilement automatique, hors ligne.

## Structure

```
main.js                    Processus principal : fenêtre, IPC, mise à jour automatique
preload.js                 Pont sécurisé exposé au HTML (window.carnetDesktop)
cantoria.html             Toute l'interface (HTML + CSS + un seul <script>)
update-config.json         Comportement de la mise à jour (pas d'URL de dépôt)
scripts/prepare-release.js Injecte le dépôt GitHub dans package.json (CI uniquement)
scripts/agent/             Runner de l'agent codeur (issue -> pull request) : zone protégée
scripts/visual/            Boucle visuelle (captures, contrôles, juge) : zone protégée
assets/                    Icônes (.ico, .icns, .png, .svg)
tests/                     Tests (node:test + jsdom)
docs/agent/                Guide du workflow agent et premières issues
.github/workflows/         CI (ci.yml) et publication des releases (build.yml)
```

## Commandes

```bash
npm install        # dépendances
npm start          # lancer l'application
npm run check      # vérification de syntaxe (main.js, preload.js, scripts/agent)
npm test           # tests unitaires et de non-régression
npm run agent -- N # (superviseur) lance l'agent sur l'issue N, voir docs/agent/README.md
npm run visual     # (superviseur) captures + contrôles visuels, voir docs/visual/README.md
```

Avant de proposer une pull request : `npm run check` **et** `npm test` doivent passer.

## Environnement d'exécution

Tu travailles dans un conteneur de développement (`.devcontainer/`, Linux, utilisateur non root). Conséquences :

- Pas d'écran : `npm start` n'ouvre pas de fenêtre ici. Valide par les tests (`npm test`), jamais en « lançant l'app ».
- Pas de build Windows ou macOS (c'est le rôle de GitHub Actions).
- Tu es Mistral Vibe. Tes appels de modèle passent par une passerelle locale (`mistral-gateway`) ; tu n'as accès à aucune clé de fournisseur et tu n'en cherches pas. Ne cherche pas non plus à lire des fichiers hors de ton dossier de travail (`.env`, configuration, jetons).
- Ne modifie pas `.devcontainer/` : c'est ta propre cage.

## Règles de travail

- **Une tâche = une branche = une pull request.** Ne jamais pousser sur `main`, ne jamais fusionner.
- Reste dans le périmètre de l'issue. Pas de refactoring non demandé, pas de renommage de masse.
- **Tout comportement modifié ou corrigé est couvert par un test.** Un test qu'on affaiblit pour le faire passer est un échec, pas une réussite.
- Pas de nouvelle dépendance, pas de nouvelle permission Electron sans issue validée par le superviseur.
- Si l'issue est ambiguë ou contredit `VISION.md`, arrête-toi et pose la question dans la pull request plutôt que de deviner.
- Plafonne tes essais : après 3 tentatives infructueuses sur le même problème, décris le blocage et arrête.

## Zones interdites sans validation du superviseur

`VISION.md`, `AGENTS.md`, `.vibe/`, `docs/adr/`, `.github/workflows/`, `.devcontainer/`, `scripts/visual/` et `visual-baseline/` (instruments de mesure : seuils, juge, références), `package.json` (sections `build`, `publish`, `appId`, version), `update-config.json`, secrets et signature de code, nom du produit.

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
- `tests/no-network.test.js` : garde-fous « zéro réseau » et preload.
- `tests/agent-lib.test.js` et `tests/agent-runner.test.js` : politique et simulation complète du runner (faux `vibe` et faux `gh` dans `tests/fixtures/`) ; `tests/gateway.test.js` : passerelle Mistral. Hors de ton périmètre : ne les modifie pas.
- Pour tester une fonction de l'interface, charge le HTML via jsdom comme dans `library-recovery.test.js`. Si une logique pure (transposition, parsing ChordPro) devient difficile à tester, propose son extraction dans un module dans une issue dédiée.
- `tests/visual-*.test.js` : instruments de la boucle visuelle (contrôles, PNG, juge, orchestrateur, capture réelle ignorée si pas de Chromium). Hors de ton périmètre : ne les modifie pas.
- Tu ne peux pas lancer `npm run visual` (pas d'Electron utilisable sans écran dans ton environnement restreint) : si une issue touche à l'apparence, le superviseur relancera la mesure ; décris dans la PR ce qui devrait changer visuellement (tailles, couleurs).

## Dette connue (candidates à des issues)

- Pas de CSP dans le HTML.
- Aucun moyen dans l'interface de récupérer une copie de secours (accessible seulement via le stockage local).
- Pas de `package-lock.json` : le CI utilise `npm install`.
- Logique de transposition et de parsing ChordPro sans test dédié.
- Paliers de vitesse irréguliers (voir « Questions ouvertes » dans `VISION.md`).
- Signature de code Windows et macOS non configurée (l'auto-update macOS en dépend).

## Quand tu es lancé par le runner

- Tu travailles dans un worktree dédié, sur une branche `agent/issue-N-…` : reste sur cette branche.
- Tu ne peux pas pousser et tu n'as pas le réseau. Fais des commits atomiques en français, puis termine par un résumé (ce qui change, tests ajoutés, risques, questions).
- Le runner refait `npm run check` et `npm test`, refuse tout fichier protégé et tout diff de plus de 600 lignes. Un travail refusé n'est pas poussé : respecter les règles est plus rapide que les contourner.

## Définition de « terminé »

1. L'issue est traitée, sans changement hors périmètre.
2. `npm run check` et `npm test` passent.
3. Un test couvre le comportement ajouté ou corrigé.
4. Les principes de `VISION.md` sont respectés (données préservées, zéro réseau côté interface).
5. La description de la pull request explique le changement, les tests ajoutés et les risques.
