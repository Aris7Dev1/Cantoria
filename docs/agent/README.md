# Agent codeur : de l'issue à la pull request

Une issue **approuvée** devient une branche vérifiée puis une pull request. L'agent code ; toi seul fusionnes.

```
Issue GitHub (créée par toi, label agent-ok)
   │  npm run agent -- <numéro>
   ▼
Runner (scripts/agent/run-issue.js)
   1. contrôle l'issue : ouverte, label agent-ok, créée par toi
   2. crée un worktree isolé (~/agent-worktrees/issue-N) depuis origin/main
   3. lance Mistral Vibe en mode non interactif (config isolée, environnement purgé), avec plafonds de tours, de coût et de durée
   4. refait lui-même npm run check et npm test (il ne croit pas l'agent sur parole)
   5. refuse si un fichier protégé est touché ou si le diff dépasse 600 lignes
   6. pousse la branche et ouvre la pull request (brouillon si avertissement)
   ▼
CI GitHub (job « verify ») ──▶ ta relecture ──▶ ton merge
```

## Mise en place (une seule fois)

### 1. Authentification GitHub dans le conteneur

Crée un **jeton fine-grained** limité à ce seul dépôt (GitHub → Settings → Developer settings → Fine-grained tokens), avec :
`Contents: Read and write` · `Pull requests: Read and write` · `Issues: Read` · `Metadata: Read`. Durée courte (30 à 90 jours).

```bash
gh auth login --with-token      # colle le jeton, puis Entrée et Ctrl+D
gh auth setup-git               # permet à git push d'utiliser ce jeton
```

Le jeton vit dans le conteneur : tout ce qui s'y exécute peut l'utiliser. C'est pourquoi sa portée est minimale et pourquoi l'étape 3 est indispensable.

### 2. Le label d'approbation

```bash
gh label create agent-ok --color 0E8A16 --description "Tâche approuvée pour l'agent codeur"
```

Poser ce label est ton acte d'autorisation. Le runner refuse aussi les issues créées par un autre compte que le tien : le texte d'une issue devient une instruction pour l'agent.

### 3. Protéger `main` (ne pas sauter cette étape)

GitHub → Settings → Rules → Rulesets → New branch ruleset :

- Target : `main` · Enforcement : **Active**
- **Bypass list : vide** (y compris toi : le jeton de l'agent est le tien, il contournerait aussi)
- Règles : *Restrict deletions* · *Block force pushes* · *Require a pull request before merging* (0 approbation requise, tu ne peux pas approuver ta propre PR) · *Require status checks to pass* avec le check `verify`

Tu fusionneras via le bouton de la PR, jamais par un push direct.

### 4. Optionnel mais recommandé : un verrou de dépendances

Sans `package-lock.json`, `npm install` résout les versions à chaque fois. Génère-le une fois (`npm install --package-lock-only`) et commite-le. Si tu ne le fais pas, retire `cache: npm` de `.github/workflows/build.yml` (cette option exige un lockfile).

## Utilisation

```bash
# 1. Crée l'issue avec le gabarit « Tâche pour l'agent codeur », puis pose le label agent-ok
# 2. Simulation : affiche le prompt et la commande, ne crée rien
npm run agent -- 12 --dry-run
# 3. Exécution réelle
npm run agent -- 12
```

Options : `--dry-run` · `--no-pr` (pousse la branche sans ouvrir la PR) · `--base=main` · `--timeout-min=30` · `--budget-usd=3` · `--max-turns=60`.

Variables d'environnement : `AGENT_REQUIRED_LABEL` (agent-ok) · `AGENT_MAX_DIFF_LINES` (600) · `AGENT_TIMEOUT_MIN` (30) · `AGENT_BUDGET_USD` (3) · `AGENT_MAX_TURNS` (60) · `AGENT_VIBE_CMD` (vibe) · `AGENT_VIBE_CONFIG` (par défaut `.devcontainer/vibe/config.toml`) · `AGENT_PASSTHROUGH_ENV` (variables à transmettre à l'agent, à utiliser avec prudence) · `AGENT_WORKTREES_DIR` · `AGENT_LOGS_DIR` (`~/agent-logs`) · `AGENT_ALLOW_OTHER_AUTHORS=1` (à éviter).

## Système agentique Vibe (`.vibe/`)

Le dossier `.vibe/` du dépôt complète le runner pour **tes sessions interactives** (`vibe` lancé dans `/workspaces/cantoria`, dossier de confiance). Il est versionné : toute modification passe par toi, comme le reste des zones protégées.

```
.vibe/
├── skills/
│   ├── cantoria-verify/       → /cantoria-verify : check + test + visual avant PR
│   ├── cantoria-review-pr/    → /cantoria-review-pr : grille de relecture avant merge
│   └── cantoria-new-issue/    → /cantoria-new-issue : gabarit d'issue actionnable
├── agents/
│   └── reviewer.toml          → vibe --agent reviewer : relecture de PR en lecture seule
├── hooks.toml                 → garde-fous des sessions interactives
└── hooks/
    ├── guard-bash.js          → pre_tool bash : refuse git push, reset --hard, rm -r, gh pr merge…
    └── warn-protected.js      → post_tool write/edit : rappelle les zones protégées
```

- **Skills.** Le modèle les charge à la demande (ou via `/nom-de-la-skill`) quand la tâche correspond à leur description. Le superviseur peut aussi les invoquer explicitement.
- **Hooks.** `guard-bash` bloque les commandes destructives ou irréversibles avant exécution (décision `deny`), en complément de la liste noire de `.devcontainer/vibe/config.toml` — c'est la couche versionnée du dépôt, utile si une session tourne avec une configuration plus permissive. `warn-protected` ajoute un rappel après l'écriture d'un fichier d'une zone protégée (avertissement, pas de blocage).
- **Agent `reviewer`.** Un profil que tu choisis délibérément (`vibe --agent reviewer « Relis la PR #N »`) : lecture seule, il refait `npm run check` et `npm test` lui-même et termine par un verdict « Prêt à merger » / « À corriger ».
- **Subagents.** `enable_subagents` est activé dans la configuration Vibe du conteneur (`~/.vibe/config.toml`) : le modèle peut déléguer à `explore`, le subagent read-only intégré (grep, lecture, skills). Un subagent personnalisé se déclare avec `agent_type = "subagent"` dans `.vibe/agents/` — à n'ajouter que si un besoin récurrent apparaît.

**Ce qui ne s'applique pas au runner.** Le runner isole volontairement ses sessions (VIBE_HOME dédié, worktree non approuvé) : `.vibe/` du dépôt, `AGENTS.md` et les hooks ne s'y chargent pas. La protection des sessions autonomes vient de `.devcontainer/vibe/config.toml` (liste blanche / noire), de la politique du runner (fichiers protégés, plafond de 600 lignes, `check` + `test` refaits) et de la CI. C'est volontaire : un dépôt compromis ne doit pas pouvoir modifier les garde-fous de l'agent. Si tu veux que les sessions du runner puissent spawner des subagents, il faut passer `enable_subagents = true` dans `.devcontainer/vibe/config.toml` (ta décision, zone protégée).

**L'orchestration, en résumé.** Vibe n'a pas d'orchestrateur multi-agents intégré : l'orchestration de Cantoria, c'est le runner (entrée, isolation, politique) → la CI (porte « verify ») → **ton merge**, seule validation humaine. Les skills, hooks et profils ci-dessus outillent ton poste de superviseur.

## Codes de sortie

| Code | Signification | Que faire |
|---|---|---|
| 0 | PR ouverte (ou branche poussée avec `--no-pr`) | Relire la PR |
| 1 | Prérequis non remplis (label, auteur, authentification, branche existante…) | Lire le message |
| 2 | L'agent n'a pas terminé (plafond de tours, de coût ou de durée, panne de la passerelle ou du modèle, refus) ou n'a rien commité | Voir le journal indiqué, affiner l'issue |
| 3 | `check` ou `test` en échec sur le travail de l'agent | Rien n'est poussé ; inspecter le worktree |
| 4 | Politique violée (fichier protégé, diff trop gros) | Rien n'est poussé ; découper l'issue |

En cas d'échec, le worktree est conservé. Nettoyage : `git worktree remove --force ~/agent-worktrees/issue-N && git branch -D agent/issue-N-…`.

## Ce que l'agent peut et ne peut pas faire

- **Peut** : lire, écrire et éditer des fichiers dans son worktree ; lancer `npm run check`, `npm test`, `node --test`, `node --check` ; `git add`, `git commit`, `git status`, `git diff`, `git log`, `echo`.
- **Ne peut pas** (refusé par Vibe, vérifié avec la version 2.26.1) : `git push`, `curl`, `wget`, `npm install`, redirections `>`, substitutions `$(…)`, lecture ou écriture de fichiers hors de son dossier de travail, y compris via l'outil `run_typescript` de Vibe. Dans un enchaînement (`&&`, `;`, `|`), chaque commande est contrôlée séparément.
- **Ne doit pas modifier** (vérifié par le runner) : `VISION.md`, `AGENTS.md`, `.vibe/`, `docs/adr/`, `scripts/agent/`, `.github/`, `.devcontainer/`, `scripts/visual/`, `visual-baseline/`, `package.json`, `package-lock.json`, `update-config.json`.
- **Ce qui l'isole** : un environnement purgé (ni jeton GitHub, ni variables de ton shell), une clé Mistral factice, une configuration Vibe copiée dans un dossier propre à chaque exécution, et un `.devcontainer/.env` masqué dans le conteneur.

### La liste blanche n'est pas un bac à sable
`npm test` et `node --test` exécutent du JavaScript que l'agent écrit lui-même : un test peut lire n'importe quel fichier lisible par l'utilisateur du conteneur (démontré avec le vrai Vibe) et le conteneur a accès à Internet. La vraie protection, c'est donc **ce qui n'est pas dans le conteneur** : la clé Mistral (masquée, voir `.devcontainer/README.md`). Reste exposé : le jeton GitHub s'il est stocké dans le conteneur (`gh auth login`). D'où le jeton limité à ce seul dépôt, la protection de `main` et ta relecture de chaque PR. Une restriction des sorties réseau est la prochaine étape logique.

## Limites à connaître

- **Plafonds.** `--max-turns` (60), `--max-price` (3 $) et `--time-limit` (30 min) sont passés à Vibe. Le coût est calculé avec les prix de `.devcontainer/vibe/config.toml` : vérifie-les, ils viennent d'un article tiers. Quand un plafond est atteint, **le travail partiel n'est jamais poussé** (code 2) ; il reste dans le worktree. Suis aussi la consommation sur ta console Mistral.
- **La qualité dépend du modèle.** Commence par une tâche courte (voir `premieres-issues.md`) et lis le journal d'une exécution complète avant d'en enchaîner d'autres.
- **Pas de validation visuelle par l'agent.** Il n'a pas d'écran : tout comportement d'interface doit être couvert par des tests jsdom. La mesure visuelle (`npm run visual`, voir `docs/visual/README.md`) est lancée par toi sur la branche de la PR ; elle ne fait pas partie du runner.
- **Instructions du projet (`AGENTS.md`).** Vibe charge `AGENTS.md` tout seul en session interactive, une fois le dossier approuvé. Le runner, lui, lance Vibe sans `--trust` (volontairement : un dossier de confiance charge aussi la configuration et les compétences du projet, que l'agent pourrait modifier) : `AGENTS.md` n'est alors pas chargé automatiquement, et c'est le prompt du runner qui ordonne à l'agent de lire `VISION.md` puis `AGENTS.md`.
- **Une tâche à la fois.** Le runner ne gère pas encore le parallélisme.
- **Injection de prompt.** Le contenu de l'issue et du code lu par l'agent peut tenter de le détourner. Les protections limitent les dégâts mais ne les rendent pas impossibles : relis chaque PR.

## Journaux

Chaque exécution crée un dossier `~/agent-logs/issue-N-<date>-xxxxxx/` (droits 700) : `prompt.md`, `run.json` (sortie, erreurs, code retour), `out/export.json` (issue de l'exécution, coût, nombre d'appels, configuration effective) et `out/session/` (journal complet de la session Vibe). Ils peuvent contenir des extraits du code ; ne les partage pas sans les avoir relus.
