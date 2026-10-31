# Limites de la sandbox de l'agent — et leurs conséquences d'architecture

> Capitalisation des constats faits pendant le cycle Android/ChromeOS (#54 → #75).
> Ce document explique **pourquoi** certaines tâches sont écrites par l'agent
> mais exécutées par la CI, et quelles vérifications sont possibles depuis la
> sandbox. Il sert de référence aux agents futurs et au superviseur.

## Les trois limites structurelles

### 1. Réseau sortant bloqué

La sandbox de l'agent n'a **aucun accès réseau sortant** : `curl` est refusé,
les téléchargements (binaires, paquets) échouent. Vérifié empiriquement
(téléchargement Chromium pour la boucle visuelle, appel API Mistral).

**Conséquences** :
- l'agent **ne peut pas** exécuter le juge A/B ni l'explorateur IA : ils appellent
  l'API Mistral ;
- l'agent **ne peut pas** installer des dépendances système ou des binaires
  téléchargés (Chromium, Electron) ;
- le juge en **conteneur de dev** passe par la passerelle locale
  (`mistral-gateway`) — l'URL `api.mistral.ai` est interdite dans
  `scripts/visual/` **sauf dans `judge-ci.js`** (orchestrateur CI uniquement,
  clé `secrets.MISTRAL_API_KEY`) — vérifié par `tests/devcontainer-security.test.js`.

### 2. Pas d'environnement graphique ni de privilèges

- Pas de serveur X : Electron ne se lance pas (`Missing X server`) ;
- Chromium non installable (réseau bloqué + dépendances système via
  `apt-get` en root, or l'agent est un utilisateur non root sans sudo) ;
- `npm start` n'ouvre aucune fenêtre : la validation se fait par les tests,
  jamais en « lançant l'app » (règle AGENTS.md).

**Conséquences** : l'agent ne peut **ni capturer des captures d'écran, ni
simuler l'app**. Tout ce qui touche au rendu réel (baselines, juge A/B,
explorateur) est exécuté par la CI (workflows `visual-baselines.yml`,
`visual-judge.yml`) ou par le superviseur (émulateur Android Studio).

### 3. Aucun secret ne transite par l'agent

Même si le réseau était ouvert, l'agent **ne doit jamais** manipuler de clé
API : la clé Mistral du superviseur vit dans les secrets GitHub
(`Settings → Secrets and variables → Actions`), est consommée uniquement
par la CI, et n'apparaît ni dans le code ni dans les logs (GitHub la masque).

**Conséquence** : les coûts API sont engagés par la CI, plafonnés dans le code
(`JUDGE_MAX_CALLS`, défaut 10 par run), traçables dans le log du run —
auditables par le superviseur. L'agent qui écrit le code ne tient pas la caisse.

## Le partage des rôles qui en découle

| Rôle | Où | Pourquoi |
|---|---|---|
| **Écrire** le code (app, tests, workflows, instruments) | Sandbox de l'agent | C'est son métier : lecture/écriture de fichiers, git, raisonnement |
| **Exécuter** le rendu (captures, baselines, juge, explorateur) | CI GitHub (runners avec réseau, Chromium, secrets) | Seul endroit avec les capacités d'exécution |
| **Tester l'usage réel** (fluide, tactile, ressenti) | Émulateur du superviseur | Simulé ≠ ressenti ; l'œil humain reste le juge de paix |
| **Valider** (merge, release) | Superviseur (GitHub mobile / web) | Décision humaine, informée par les 3 couches |

## Pièges rencontrés liés à ces limites (et leurs leçons)

1. **Baselines mobiles à 860px** : la première génération en CI locale
   (devcontainer) passait par Electron, dont la fenêtre est écrêtée à
   `minWidth: 860` — les captures mobiles n'ont jamais fait 412px de large.
   Leçon : le moteur de capture doit correspondre à la cible
   (Chromium pour le mobile, Electron pour le desktop).
2. **Échec `npm ci` sans binaire Electron en CI** : le postinstall d'Electron
   peut être sauté — toujours un pas « Garantir le binaire » avant de lancer.
3. **Échec Chromium headless en CI** : Playwright ne télécharge son navigateur
   que sur demande (`npx playwright-core install chromium-headless-shell`).
4. **Le `test` réseau du juge local** : l'URL Mistral dans un script du
   conteneur de dev casse `tests/devcontainer-security.test.js` — la passerelle
   locale est la seule voie en dev, l'URL n'existe que dans le workflow CI.

## Ce que l'agent PEUT faire depuis sa sandbox (et fait)

- toute l'écriture et la relecture de code, multi-langages (JS, Kotlin, Groovy,
  YAML, CSS, shell) ;
- `npm run check` et `npm test` (330 tests : jsdom simule le DOM et le
  `localStorage`, les tests lisent le Kotlin/Gradle/YAML statiquement) ;
- git complet : branches, commits, push, PR, restauration d'historique ;
- l'analyse des échecs CI **à partir des logs que le superviseur fournit** ;
- la simulation logique (par exemple le calcul `versionCode`, le comportement
  `loadSettings` avec les fixtures) sans exécuter le rendu.

## Règle pratique pour l'agent

Avant de proposer une tâche : se demander « est-ce de l'écriture ou de
l'exécution ? ». Si c'est de l'exécution (rendu, API, réseau, installation
système), le livrable de l'agent est le **code + workflow** qui l'exécutera
en CI, jamais une tentative locale vouée à l'échec — et le test qui vérifie
que le workflow existe et respecte les garde-fous.
