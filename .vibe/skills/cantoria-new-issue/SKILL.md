---
name: cantoria-new-issue
description: "Charger cette skill pour rédiger une issue actionnable pour le runner agent de Cantoria : contexte, périmètre précis, critères d'acceptation, tests attendus, zones protégées concernées."
---
# Rédiger une issue pour le runner agent

Le runner (`npm run agent -- N`) n'exécute que les issues ouvertes, créées par le superviseur, portant le label `agent-ok`. Le texte de l'issue devient une instruction pour l'agent : sois précis.

## Gabarit

```markdown
## Contexte

Pourquoi ce changement (vision produit, dette connue, bug constaté).

## Périmètre

Ce qui est inclus. Ce qui est explicitement hors périmètre.

## Critères d'acceptation

- [ ] comportement attendu 1
- [ ] comportement attendu 2

## Tests

Quel test couvre le changement (fichier existant ou nouveau dans `tests/`).

## Zones protégées concernées

Aucune, ou lesquelles (avec validation du superviseur).
```

## Règles

- L'issue est créée par le superviseur (le runner vérifie l'auteur) ; poser le label `agent-ok` est l'acte d'autorisation — relire l'issue avant de le poser.
- Citer les fichiers concernés (`cantoria.html`, `main.js`, `tests/…`). Si l'issue touche une zone protégée ou semble contredire `VISION.md`, l'écrire explicitement dans l'issue plutôt que de laisser l'agent deviner.
- Si le diff risque de dépasser 600 lignes (politique du runner), découper en plusieurs tâches.
- **Issue d'interface** : demander à l'agent de lancer `npm run visual` (jamais `--update-baseline` ni `--judge`), d'écrire un rapport de mesures dans `visual-out/mesures/issue-<N>-<slug>.md` (styles calculés via jsdom, structure, ce qui change visuellement) et de couvrir les assertions de style par des tests.
- **Une règle = une source** : pour toute règle transverse (pattern de tests jsdom, règle d'or des données, zones protégées, procédures), renvoyer à sa source canonique (`AGENTS.md`, `VISION.md`, `docs/…`) plutôt que la recopier ; si la règle doit évoluer, la corriger dans sa source — jamais dans l'issue.
