---
name: cantoria-run-issue
description: "Charger cette skill pour lancer l'agent codeur sur une issue GitHub approuvée : vérifier les prérequis, simuler avec --dry-run, lancer l'exécution, puis suivre la pull request."
---

# Lancer l'agent codeur sur une issue

Le runner (`npm run agent -- N`) transforme une issue approuvée en branche vérifiée puis en pull request. Guide complet : `docs/agent/README.md`.

## Prérequis (à vérifier avant)

- **L'issue est ouverte**, porte le label `agent-ok` et a été créée par le superviseur (le runner vérifie l'auteur).
- **Attention à la numérotation** : issues et pull requests partagent les numéros sur GitHub. Vérifier que `N` est bien une issue — le runner refuse une PR (« L'issue n'est pas ouverte (MERGED) »).
- **Authentification** : `gh auth login --with-token` puis `gh auth setup-git` dans le conteneur (jeton fine-grained limité au dépôt).
- **Remote `origin`** : le runner fait `git fetch origin` — le dépôt doit avoir un remote nommé `origin` (`git remote add origin <url>` si besoin ; `git remote` est refusé à l'agent, le superviseur le fait).
- **Protection de `main`** : ruleset actif (block force pushes, PR requise, check `verify`).

## Procédure

1. **Simuler** : `npm run agent -- N --dry-run` — affiche le prompt et la commande, ne crée rien. Relire le prompt avant de continuer.
2. **Lancer** : `npm run agent -- N` — l'agent travaille dans un worktree isolé (`~/agent-worktrees/issue-N`), avec plafonds (60 tours, 3 $, 30 min par défaut).
3. **Une tâche à la fois** : le runner ne gère pas le parallélisme. Ne lance pas deux runners en même temps.
4. **Modèle** : `large-4` par défaut (fiable pour les tâches autonomes à contraintes strictes). Un modèle plus léger (ex. `mistral-medium-3-5`) se réserve aux tâches courtes et mécaniques, via `AGENT_VIBE_CMD="vibe --model <alias>"`.
5. **Suivre** : le runner refait `npm run check` et `npm test` lui-même, pousse la branche et ouvre la PR. Surveiller le log de lancement.
6. **Après la PR** : relire (skill `cantoria-review-pr`), merger via le bouton GitHub (jamais par push direct), supprimer la branche, nettoyer le worktree et la branche locale :
   ```bash
   git worktree remove ~/agent-worktrees/issue-N
   git branch -d agent/issue-N-…
   git fetch --prune origin
   ```

## Codes de sortie

| Code | Signification |
|---|---|
| 0 | PR ouverte (ou branche poussée avec `--no-pr`) |
| 1 | Prérequis non remplis (label, auteur, authentification, branche existante…) |
| 2 | L'agent n'a pas terminé ; rien n'est poussé |
| 3 | `check` ou `test` en échec sur le travail de l'agent |
| 4 | Politique violée (fichier protégé, diff > 600 lignes) |

## Règles

- Poser le label `agent-ok` est l'acte d'autorisation du superviseur — ne jamais le poser à la légère.
- Le texte de l'issue devient une instruction pour l'agent : le rédiger avec la skill `cantoria-new-issue`.
- En cas d'échec, le worktree est conservé pour inspection ; les logs sont dans `~/agent-logs/issue-N-<date>/` (peuvent contenir des extraits de code — ne pas les partager sans les avoir relus).
