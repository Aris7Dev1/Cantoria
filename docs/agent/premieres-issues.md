# Premières issues pour l'agent

À copier dans des issues GitHub (gabarit « Tâche pour l'agent codeur »). Ordre conseillé : **1** valide le pipeline avec un risque minimal, **2** est la vraie tâche utile, **3** demande ta validation manuelle.

---

## Issue 1 · Tests de rendu des accords et de la transposition

**Objectif**
La transposition d'accords et l'analyse du format ChordPro n'ont aucun test. C'est la logique la plus fragile et la plus visible de l'application. On veut un filet de sécurité avant toute évolution.

**Critères d'acceptation**
- [ ] Un fichier `tests/chords.test.js` charge `carnet-de-chant-v4.html` dans jsdom (comme `tests/library-recovery.test.js`) avec une bibliothèque préparée dans le `localStorage`.
- [ ] Il vérifie, par le rendu du lecteur : le texte et les accords d'une chanson ChordPro (`[Am]paroles…`) ; une chanson au format « accords sur une ligne, paroles dessous » ; la transposition de +1, +2 et −1 demi-ton ; les accords composés (`Am7`, `F#m`, `Bb`, `C/G`, `Dsus4`).
- [ ] Les cas limites sont couverts : ligne vide, ligne de label (`[Refrain]`), accord inconnu laissé intact.
- [ ] **Aucune modification du code de production**, sauf bug avéré. Si tu en trouves un, décris-le dans le résumé plutôt que de le corriger silencieusement.

**Fichiers concernés** : `carnet-de-chant-v4.html` (fonctions de transposition et d'analyse du corps des chansons), `tests/`.

**Hors périmètre** : refactoring, extraction en module, changement du format de stockage.

---

## Issue 2 · Récupération des copies de secours de la bibliothèque

**Objectif**
Quand le carnet local est illisible, `loadSongs` conserve une copie brute (clé `carnet-de-chant-songs-v1-corrupted-<horodatage>`, 3 conservées), mais l'utilisateur ne peut pas la récupérer depuis l'interface. Ajouter cette récupération.

**Critères d'acceptation**
- [ ] Dans les réglages, une section « Copies de secours » liste les copies existantes (date lisible, taille) ; elle est masquée ou affiche un message neutre quand il n'y en a pas.
- [ ] Pour chaque copie : **Exporter** (fichier JSON brut via `carnetDesktop.saveJson` quand disponible, sinon le mécanisme d'export existant) et **Restaurer**.
- [ ] **Restaurer** demande une confirmation, tente de lire la copie, la valide (tableau de chansons) et **sauvegarde d'abord la bibliothèque actuelle** sous une nouvelle copie de secours avant de la remplacer. Une copie illisible n'écrase jamais rien et affiche un message clair.
- [ ] Aucune URL externe, textes en français, style cohérent avec les réglages existants.
- [ ] Tests jsdom : liste des copies, restauration réussie, restauration d'une copie invalide (la bibliothèque reste intacte), sauvegarde préalable de l'état courant.

**Fichiers concernés** : `carnet-de-chant-v4.html`, `tests/`.

**Hors périmètre** : migration vers un autre stockage, changement du format des chansons, modification de `main.js` ou `preload.js`.

---

## Issue 3 · Content Security Policy stricte

**Objectif**
`VISION.md` interdit tout accès réseau depuis l'interface. Une CSP le fait respecter par le moteur d'affichage, même si du code futur l'oubliait.

**Critères d'acceptation**
- [ ] Une balise `<meta http-equiv="Content-Security-Policy">` dans `carnet-de-chant-v4.html`, de type `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:` (à ajuster uniquement si l'application en a réellement besoin, en justifiant chaque ouverture).
- [ ] Un test vérifie sa présence et l'absence de `connect-src`, `http:` et `https:` dans la politique.
- [ ] Un test vérifie qu'aucune ressource (script, feuille de style, image, police) n'est chargée depuis une URL.
- [ ] Le résumé liste les fonctionnalités à vérifier manuellement par le superviseur (la CSP n'est pas appliquée par jsdom).

**Fichiers concernés** : `carnet-de-chant-v4.html`, `tests/no-network.test.js`.

**Hors périmètre** : `main.js`, mise à jour automatique (c'est le processus principal, pas l'interface).

**À valider par le superviseur** : lancer l'application hors conteneur et vérifier qu'import, export, édition, lecteur et bannière de mise à jour fonctionnent encore.
