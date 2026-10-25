---
name: cantoria-verify
description: "Charger cette skill pour vérifier un changement sur Cantoria avant commit ou pull request : lancer npm run check et npm test, interpréter les résultats, et lancer npm run visual quand l'apparence change."
---

# Vérifier un changement sur Cantoria

## Procédure

1. `npm run check` — vérification de syntaxe (`main.js`, `preload.js`, scripts). Doit passer.
2. `npm test` — tests unitaires et de non-régression (`node:test` + jsdom). Doit passer.
3. Si le changement touche l'apparence (CSS, tailles, couleurs, thèmes) : `npm run visual`, puis lire `visual-out/report.md`. Le superviseur relance la mesure de toute façon ; décris dans la PR ce qui change visuellement (tailles, couleurs).

## Règles

- Tout comportement modifié ou corrigé est couvert par un test (AGENTS.md). Si un test échoue, ne l'affaiblis pas pour le faire passer : corrige le code ou le test, ou décris le blocage.
- Ne valide jamais en « lançant l'app » : il n'y a pas d'écran dans le conteneur. Les tests sont la preuve.
- Avant de proposer une pull request : `npm run check` et `npm test` doivent passer.

## Avant une release ou un lancement du runner

- **Audit de l'historique avant un tag** : un fichier commité reste dans l'historique même supprimé du dépôt. Vérifier qu'aucun fichier sensible (contenu sous copyright, secrets, données personnelles) n'y figure :
  ```bash
  git log --all --diff-filter=A --name-only --format='%h %s'
  ```
  En cas de doute, purger avant de taguer (voir la skill `cantoria-release`).
- **Remote `origin` avant `npm run agent`** : le runner fait `git fetch origin` — le dépôt doit avoir un remote nommé `origin` (`git remote add origin <url>` si besoin ; `git remote` est refusé à l'agent, le superviseur le fait).

## Interprétation des résultats

- `npm test` : relève pass / fail / skip. Tout échec est bloquant.
- Les skips sur les captures visuelles réelles (pas de Chromium dans le conteneur) sont connus et non bloquants.
- `npm run visual` produit un rapport avec erreurs et avertissements : un écart par rapport à `visual-baseline/` n'est pas forcément bloquant, mais il doit être décrit dans la PR.
