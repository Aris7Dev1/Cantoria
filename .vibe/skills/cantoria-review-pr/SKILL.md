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

## 2. Zones protégées

La liste de référence est celle d'AGENTS.md (« Zones interdites sans validation du superviseur ») : vérifier dans le diff qu'aucune n'est touchée sans validation explicite du superviseur.

## 3. Tests et vérifications

- `npm run check` et `npm test` passent (la CI « verify » le contrôle aussi, mais refais-les en local si tu doutes).
- Tout comportement modifié ou corrigé est couvert par un test. Un test affaibli pour passer est un échec, pas une réussite (guides de tests : AGENTS.md « Tests », skill `cantoria-verify`).
- Pour une PR qui touche à l'apparence : un rapport de mesures est présent dans `visual-out/mesures/` et le verdict de `npm run visual` (contrôles déterministes) ne remonte pas d'erreur bloquante.
- **Couches visuelles CI** : sur une PR UI, le **verdict du juge A/B par personas** arrive en commentaire (consultatif — le relire, pas le subir) ; si l'explorateur IA a été lancé, son rapport d'expérience aussi. La **garde anti-suppression** doit être verte : une PR qui supprime des baselines sans justification explicite échoue, et c'est voulu.

## 4. Principes produit

Les principes de VISION.md priment : zéro réseau côté interface (garanti par `tests/no-network.test.js`), données préservées (règle d'or d'AGENTS.md), interface et messages en français. Points opérationnels issus des PR relues :

- **Content-Security-Policy** : chaque ouverture (`img-src`, `font-src`…) est justifiée par un usage réel ; pas d'`eval`/`new Function`/`import()` dynamique (`script-src 'unsafe-inline'` ne les couvre pas) ; les `blob:` URLs (`URL.createObjectURL`, ex. export) ne sont pas restreints par `default-src` mais sont à vérifier manuellement.
- **Import** : aucune chanson existante supprimée ni modifiée, les doublons ignorés (jamais fusionnés ni écrasés) ; le toast reflète le résultat.
- **Validation manuelle** : quand l'UI change, le rapport de mesures de l'agent (`visual-out/mesures/`) et le verdict de `npm run visual` remplacent l'inspection à l'œil ; le superviseur lance l'app hors conteneur uniquement pour la CSP (jsdom ne l'applique pas) et la boîte de dialogue native. **Côté Android : l'émulateur reste le seul juge du vécu réel** (import/export SAF, mise à jour, rotation) — la CI prouve le code, pas le ressenti.

## 5. Verdict

Termine par « Prêt à merger » ou « À corriger », avec la liste des points bloquants s'il y en a.
