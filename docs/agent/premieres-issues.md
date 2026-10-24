# Premières issues pour l'agent

À copier dans des issues GitHub (gabarit « Tâche pour l'agent codeur »). Ordre conseillé : **1** valide le pipeline avec un risque minimal, **2** est la vraie tâche utile, **3** demande ta validation manuelle.

---

## Issue 1 · Tests de rendu des accords et de la transposition

**Objectif**
La transposition d'accords et l'analyse du format ChordPro n'ont aucun test. C'est la logique la plus fragile et la plus visible de l'application. On veut un filet de sécurité avant toute évolution.

**Critères d'acceptation**
- [ ] Un fichier `tests/chords.test.js` charge `cantoria.html` dans jsdom (comme `tests/library-recovery.test.js`) avec une bibliothèque préparée dans le `localStorage`.
- [ ] Il vérifie, par le rendu du lecteur : le texte et les accords d'une chanson ChordPro (`[Am]paroles…`) ; une chanson au format « accords sur une ligne, paroles dessous » ; la transposition de +1, +2 et −1 demi-ton ; les accords composés (`Am7`, `F#m`, `Bb`, `C/G`, `Dsus4`).
- [ ] Les cas limites sont couverts : ligne vide, ligne de label (`[Refrain]`), accord inconnu laissé intact.
- [ ] **Aucune modification du code de production**, sauf bug avéré. Si tu en trouves un, décris-le dans le résumé plutôt que de le corriger silencieusement.

**Fichiers concernés** : `cantoria.html` (fonctions de transposition et d'analyse du corps des chansons), `tests/`.

**Hors périmètre** : refactoring, extraction en module, changement du format de stockage.

---

## Issue 2 · Content Security Policy stricte

**Objectif**
`VISION.md` interdit tout accès réseau depuis l'interface. Une CSP le fait respecter par le moteur d'affichage, même si du code futur l'oubliait.

**Critères d'acceptation**
- [ ] Une balise `<meta http-equiv="Content-Security-Policy">` dans `cantoria.html`, de type `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:` (à ajuster uniquement si l'application en a réellement besoin, en justifiant chaque ouverture).
- [ ] Un test vérifie sa présence et l'absence de `connect-src`, `http:` et `https:` dans la politique.
- [ ] Un test vérifie qu'aucune ressource (script, feuille de style, image, police) n'est chargée depuis une URL.
- [ ] Le résumé liste les fonctionnalités à vérifier manuellement par le superviseur (la CSP n'est pas appliquée par jsdom).

**Fichiers concernés** : `cantoria.html`, `tests/no-network.test.js`.

**Hors périmètre** : `main.js`, mise à jour automatique (c'est le processus principal, pas l'interface).

**À valider par le superviseur** : lancer l'application hors conteneur et vérifier qu'import, export, édition, lecteur et bannière de mise à jour fonctionnent encore.
