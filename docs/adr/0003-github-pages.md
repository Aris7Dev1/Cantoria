# ADR 0003 — Publication GitHub Pages : volet A seul (deck de présentation)

- **Statut** : proposé (PR de l'issue #98), en attente de validation superviseur au merge
- **Date** : 2026-10-31
- **Décideurs** : superviseur (Dorian), implémentation agent

## Contexte

Au passage public du dépôt, GitHub Pages permet d'héberger un site statique
à `https://aris7dev1.github.io/Cantoria/`. Cantoria possède déjà l'artefact
idéal : le deck HTML autonome `docs/presentation/` (PR #89). L'interface
`cantoria.html` est elle-même autonome (zéro dépendance, zéro réseau), ce qui
ouvrait la question d'une « démo vivante » (volet B de l'issue #98).

## Décision

**Volet A seul dans cette PR** : publier uniquement `docs/presentation/` via un
workflow dédié `.github/workflows/pages.yml`.

Règles retenues :

1. **Permissions explicites et minimales** : `contents: read`, `pages: write`,
   `id-token: write` (les deux derniers sont imposés par `actions/deploy-pages`
   pour l'authentification OIDC). **Aucun secret**, aucun `pull_request_target`,
   déclenchement uniquement sur `push` vers `main`, tags `v*.*.*` et
   `workflow_dispatch` manuel. Toutes les actions sont épinglées par SHA.
2. **Périmètre publié strictement limité à `docs/presentation/`** : l'artefact
   uploadé est ce dossier seul. `cantoria.html` n'est **pas** publié.
3. **Le volet B (démo vivante de l'interface) est reporté** : servir
   `cantoria.html` en ligne demanderait une décision explicite séparée (bandeau
   « démo navigateur », gestion des attentes sur les fonctions Electron absentes,
   et vérification qu'aucun manifest/service worker n'est réintroduit — la piste
   PWA reste abandonnée per VISION.md). Ce n'est pas tranché ici.
4. **Activation côté superviseur** : Settings → Pages → Source : « GitHub Actions »
   (hors de portée agent), puis le site est servi en HTTPS automatiquement.
5. **README** : lien vers le site ajouté à côté des captures, après activation.

## Conséquences

- Le deck (8 diapos, bannières, logo) est consultable en ligne sans quitter
  GitHub, utile pour le passage public.
- Aucun code applicatif n'est exposé ; aucune donnée utilisateur n'est embarquée
  (le deck est statique, généré dans le dépôt).
- Coût : un job Actions supplémentaire par push sur `main` (~1 min).

## Alternatives envisagées

- **Volet A + B dès maintenant** : rejeté pour l'instant (démo vivante = surface de
  confusion et de questions de support ; décision reportée, à rouvrir par issue dédiée).
- **Publier depuis la branche `gh-pages`** : rejeté (préféré : source = GitHub
  Actions, pas de branche dédiée, conforme aux workflows existants).
- **Hébergement externe** : rejeté (hors-ligne/local d'abord ; GitHub Pages est le
  seul canal acceptable, gratuit pour un dépôt public).
