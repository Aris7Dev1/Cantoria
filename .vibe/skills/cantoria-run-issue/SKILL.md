---
name: cantoria-run-issue
description: "Charger cette skill pour lancer l'agent codeur sur une issue GitHub approuvée : vérifier les prérequis, simuler avec --dry-run, lancer l'exécution, puis suivre la pull request."
---
# Lancer l'agent codeur sur une issue

Le runner (`npm run agent -- N`) transforme une issue approuvée en branche vérifiée puis en pull request. Mise en place complète (authentification `gh`, label `agent-ok`, protection de `main`, variables, journaux) : `docs/agent/README.md`.

## Prérequis

- **L'issue est ouverte**, porte le label `agent-ok` et a été créée par le superviseur (le runner vérifie l'auteur).
- **Numérotation partagée** : issues et PR portent les mêmes numéros — vérifier que `N` est bien une issue (le runner refuse une PR).
- Le dépôt a un remote `origin` (le runner fait `git fetch origin` ; `git remote` est refusé à l'agent, le superviseur le fait).

## Procédure

1. Rédiger l'issue avec la skill `cantoria-new-issue` si besoin.
2. **Simuler** : `npm run agent -- N --dry-run` — affiche le prompt et la commande, ne crée rien. Relire le prompt avant de continuer.
3. **Lancer** : `npm run agent -- N` — une tâche à la fois (pas de parallélisme). Plafonds par défaut : 60 tours, 3 $, 30 min.
4. **Suivre** : le runner refait `npm run check` et `npm run test` lui-même, pousse la branche et ouvre la PR.
5. **Après la PR** : relire (skill `cantoria-review-pr`), merger via le bouton GitHub (jamais par push direct), puis nettoyer :
   ```bash
   git worktree remove ~/agent-worktrees/issue-N
   git branch -d agent/issue-N-…
   git fetch --prune origin
   ```
   En cas d'échec, le worktree est conservé pour inspection ; les logs sont dans `~/agent-logs/issue-N-<date>/` (peuvent contenir des extraits de code — ne pas les partager sans les avoir relus).

## Codes de sortie

| Code | Signification |
|---|---|
| 0 | PR ouverte (ou branche poussée avec `--no-pr`) |
| 1 | Prérequis non remplis (label, auteur, authentification, branche existante…) |
| 2 | L'agent n'a pas terminé ; rien n'est poussé |
| 3 | `check` ou `test` en échec sur le travail de l'agent ; rien n'est poussé |
| 4 | Politique violée (fichier protégé, diff > 600 lignes) |

Poser le label `agent-ok` est l'acte d'autorisation du superviseur — ne jamais le poser à la légère. Modèle par défaut : `large-4` ; un modèle plus léger via `AGENT_VIBE_CMD` (voir `docs/agent/README.md`).
