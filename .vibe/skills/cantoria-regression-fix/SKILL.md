---
name: cantoria-regression-fix
description: "Charger cette skill pour corriger un bug de comportement signalé par l'utilisateur dans Cantoria : reproduire, localiser la cause démontrée, corriger, écrire les tests de non-régression, livrer par pull request."
---

# Corriger un bug de comportement signalé par l'utilisateur

## 1. Reproduire et localiser

- Reprendre **exactement** le cheminement décrit par l'utilisateur (« je
  définis X depuis les réglages, l'effet ne se fait qu'après réouverture »)
  et le traduire en points de code : où la valeur est écrite, où elle est
  lue. Un bug « ne prend effet qu'après redémarrage » signifie presque
  toujours que deux variables existent (valeur persistée ≠ valeur active)
  et qu'elles ne sont synchronisées qu'au chargement.
- Chercher toutes les occurrences de l'état concerné
  (`grep -n "<variable>" cantoria.html`) avant de conclure : dans le
  décompte, `selectedCountdown` apparaissait à 8 endrois, dont 2
  responsables.

## 2. Corriger la cause démontrée, pas un symptôme

- Identifier le mécanisme précis et l'énoncer dans la PR (ex. PR #32 :
  « `selectedCountdown` n'était copiée depuis `appSettings.defaultCountdown`
  qu'au chargement de la page ; le sélecteur des réglages mettait à jour
  `appSettings` mais pas la valeur du lecteur »).
- Corriger **tous** les sens de synchronisation concernés, pas seulement
  celui qui correspond à la plainte : pour le décompte, à la fois le
  sélecteur des réglages (chanson déjà ouverte) et `openPlayer()`
  (réouverture d'une chanson, conforme à la description du réglage).
- La correction doit être conforme au comportement **documenté** de l'app
  (« Proposé à l'ouverture de chaque chanson ») ; si la doc et l'intention
  divergent, c'est au superviseur de trancher, pas au correctif d'inventer.

## 3. Test de non-régression (avant le commit)

- Un nouveau fichier `tests/<sujet>.test.js`, sur le squelette jsdom commun
  (`loadApp` avec `localStorage` pré-rempli, `window.confirm` stubbé).
- Écrire d'abord le test qui **échoue** sur le bug (reproduit la plainte),
  puis les cas limites que la correction peut casser :
  - l'état survit-il à une autre action qui re-rend la vue ?
  - le reset des paramètres restaure-t-il le défaut ?
  - la valeur persistée est-elle relue correctement au chargement ?
- Ne jamais affaiblir un test existant pour faire passer une correction.

## 4. Livrer

- Branche `vibe/<sujet>-<jeton>` (jamais `main`), commit en français, un
  commit = un sujet.
- **Une branche mergée est close** (leçons des merges #63/#68 : deux
  correctifs poussés sur des branches déjà mergées n'ont jamais atteint
  `main` et ont créé des bugs silencieux) : un correctif post-merge part
  d'une NOUVELLE branche depuis `main`, après avoir vérifié
  `git merge-base --is-ancestor <commit> origin/main`.
- `npm run check` + `npm test` complets avant la PR (skill `cantoria-verify`).
- Corps de la PR : reproduction → cause démontrée → correction → tests
  (voir PR #32 comme exemple).
- Le superviseur valide dans l'app réelle avant le merge ; ses retours
  d'expérience (ex. échappement `\u00a0` trouvé à la relecture, corrigé par
  commit de suivi sur la même branche) sont à traiter sur la même PR.
