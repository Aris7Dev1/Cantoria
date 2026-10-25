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

- Une tâche = une branche = une pull request. Si le diff risque de dépasser 600 lignes, découpe l'issue en plusieurs tâches.
- Cite les fichiers concernés (`cantoria.html`, `main.js`, `tests/…`).
- Si l'issue touche une zone protégée ou semble contredire `VISION.md`, dis-le explicitement dans l'issue plutôt que de laisser l'agent deviner.
- Relis l'issue avant de poser le label `agent-ok` : poser ce label est l'acte d'autorisation.
