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
- Pour un comportement d'interface, le test charge `cantoria.html` dans jsdom (comme `tests/library-recovery.test.js`) et couvre le flux réel (événements, `FileReader`, toast affiché).

## 4. Principes produit (VISION.md)

- **Hors ligne** : aucun `fetch`, `XMLHttpRequest` ou `WebSocket` dans l'interface, aucune URL externe, aucun CDN, aucune police distante dans le HTML (`tests/no-network.test.js` le vérifie).
- **Données préservées** : clé de stockage `cantoria-songs-v1`, copies de secours en cas de contenu illisible, compatibilité import/export JSON entre versions, migration prévue pour tout changement de modèle.
- **Français** : interface, messages, tests et commits.

## 5. Points de contrôle spécifiques (leçons des PR relues)

- **Content-Security-Policy** : chaque ouverture (`img-src`, `font-src`…) est justifiée par un usage réel ; pas d'`eval`/`new Function`/`import()` dynamique (`script-src 'unsafe-inline'` ne les couvre pas) ; les `blob:` URLs (`URL.createObjectURL`, ex. export) ne sont pas restreints par `default-src` mais sont à vérifier manuellement.
- **Import** : la règle d'or — aucune chanson existante supprimée ni modifiée, les doublons ignorés (jamais fusionnés ni écrasés) ; le toast reflète le résultat.
- **Validation manuelle** : quand l'UI change (rendu, toast, CSP), le superviseur lance l'app hors conteneur — jsdom n'applique pas la CSP et ne voit pas le rendu réel.

## 6. Verdict

Termine par « Prêt à merger » ou « À corriger », avec la liste des points bloquants s'il y en a.
