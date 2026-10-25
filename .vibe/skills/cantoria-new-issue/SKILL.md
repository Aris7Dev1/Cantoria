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
- **L'issue est créée par le superviseur** (le runner vérifie l'auteur) : ne demande pas à l'agent de la créer.
- **Numérotation partagée** : issues et pull requests portent les mêmes numéros sur GitHub. Avant de lancer `npm run agent -- N`, vérifier que `N` est bien une issue ouverte (le runner refuse une PR).
- **Tests jsdom** : tout comportement d'interface est couvert par un test chargeant `cantoria.html` dans jsdom (comme `tests/library-recovery.test.js`), y compris le flux réel (événements, `FileReader`, toast).
- **Issue d'interface** : si l'issue touche à l'apparence (CSS, tailles, couleurs, mise en page), demande à l'agent de lancer `npm run visual` (jamais `--update-baseline` ni `--judge`), d'écrire un rapport de mesures dans `visual-out/mesures/issue-<N>-<slug>.md` (styles calculés via jsdom, structure, ce qui change visuellement) et de couvrir les assertions de style par des tests.
- **Règle d'or des données** : la bibliothèque de l'utilisateur est son bien — une issue ne doit jamais conduire à supprimer ou écraser une chanson existante sans copie de secours.
