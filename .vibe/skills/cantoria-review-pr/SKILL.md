---
name: cantoria-review-pr
description: "Charger cette skill pour relire une pull request Cantoria avant de la merger sur main : périmètre de l'issue, zones protégées, couverture de tests, zéro réseau, préservation des données."
---

# Relire une pull request Cantoria

Le merge sur `main` est la seule validation humaine du système agentique : cette relecture est le dernier filet. Ne merge pas une PR qui ne passe pas cette grille ; laisse plutôt un commentaire demandant la correction.

## 1. Périmètre

- La PR traite exactement l'issue référencée, sans changement hors périmètre (pas de refactoring non demandé, pas de renommage de masse).
- Le diff tient en moins de 600 lignes (politique du runner).
- Les commits sont en français et un commit = un sujet.

## 2. Zones protégées (modification interdite sans validation du superviseur)

`VISION.md` · `AGENTS.md` · `.vibe/` · `docs/adr/` · `.github/workflows/` · `.devcontainer/` · `scripts/agent/` · `scripts/visual/` · `visual-baseline/` · `package.json` (sections `build`, `publish`, `appId`, version) · `package-lock.json` · `update-config.json` · secrets et signature de code · nom du produit.

## 3. Tests et vérifications

- `npm run check` et `npm test` passent (la CI « verify » le contrôle aussi, mais refais-les en local si tu doutes).
- Tout comportement modifié ou corrigé est couvert par un test. Un test affaibli pour passer est un échec, pas une réussite.

## 4. Principes produit (VISION.md)

- **Hors ligne** : aucun `fetch`, `XMLHttpRequest` ou `WebSocket` dans l'interface, aucune URL externe, aucun CDN, aucune police distante dans le HTML (`tests/no-network.test.js` le vérifie).
- **Données préservées** : clé de stockage `cantoria-songs-v1`, copies de secours en cas de contenu illisible, compatibilité import/export JSON entre versions, migration prévue pour tout changement de modèle.
- **Français** : interface, messages, tests et commits.

## 5. Verdict

Termine par « Prêt à merger » ou « À corriger », avec la liste des points bloquants s'il y en a.
