---
name: cantoria-ui-feature
description: "Charger cette skill pour ajouter une préférence ou une commande d'interface dans Cantoria (réglage global, contrôle local dans le lecteur, synchronisation, tests jsdom) selon le pattern « défaut global + ajustement local »."
---

# Ajouter une préférence ou une commande d'interface

## Le pattern de référence : « défaut global + ajustement local »

Cantoria sépare le **moment de configuration** (rare, réfléchi → modale Paramètres)
du **moment d'usage** (en concert, un geste → contrôle dans le lecteur). Ce
pattern est déjà validé par `defaultFontScale` (A−/A+), `defaultCountdown`
(picker du lecteur) et `chordsVisible` (bouton œil). Pour toute nouvelle
préférence, reproduire ce schéma :

1. **Valeur par défaut** : propriété dans `appSettings` + contrôle dans la
   modale Paramètres (`.switch`, `.stepper` ou `.segmented` existants).
2. **Contrôle local** : bouton/stepper/picker dans le lecteur, utilisable au
   tactile (cible ≥ 32 px, `aria-pressed`/`aria-label` synchronisés).
3. **Synchronisation dans les deux sens** (voir « Points d'oubli » ci-dessous).
4. **Persistance** : `saveSettings()` à chaque changement.

## Points d'oubli (bugs réellement survenus — à vérifier systématiquement)

- **Copie du défaut à l'ouverture** : `openPlayer()` doit recopier
  `appSettings.<cle> || <defaut>` dans l'état local du lecteur. Oubli = la
  préférence ne s'applique qu'après redémarrage (bug du décompte, PR #32).
- **Mise à jour de l'état local quand le réglage global change** : le
  contrôle de la modale Paramètres doit aussi écrire l'état local et
  re-rendre le lecteur si une chanson est ouverte (sinon : « la prise en
  effet se fait seulement après réouverture »).
- **Réinitialisation des paramètres** : `#btn-settings-reset` réassigne
  `appSettings` en dur — ajouter la nouvelle propriété au bloc de reset,
  remettre l'état local, et re-rendre le lecteur ouvert (le reset n'appelait
  pas `renderPlayer()`, corrigé avec les accords visibles).
- **Re-rendus ultérieurs** : toute action qui re-rend le lecteur
  (transposition, vitesse, taille) doit respecter l'état courant. Un état
  « caché » ne doit pas réapparaître après re-rendu (cas `chordsVisible`).
- **Chargement initial** : `loadSettings()` doit gérer l'absence de la clé
  (préférence absente = valeur par défaut, jamais `undefined`).

## Structure de données unique (source de vérité)

Pour tout contenu affiché à plusieurs endroits (aide, libellés, listes),
définir **une** structure JS et rendre les vues depuis elle — pattern
`SHORTCUTS` de la modale d'aide : la modale est rendue par `renderHelp()`,
et les tests vérifient la cohérence entre la structure, l'affichage et les
info-bulles. Ne jamais dupliquer une liste en dur à deux endroits.

## Style et intégration

- Réutiliser les composants existants : `.modal-overlay`/`.modal-panel`
  (rythme `gap: 18px` du panneau), `.switch`, `.stepper`, `.segmented`,
  `.badge`, `.kbd`. Pas de nouvelle dépendance CSS.
- Les variables de couleurs sont celles du thème (`var(--ink-*)`,
  `var(--bg-panel)`…) : le rendu suit automatiquement le thème actif.
- Fermeture des modales : bouton, clic hors panneau, `Échap` (les deux
  modales se ferment par `Échap`).
- Zone qui disparaît quand vide : `:empty` (pas de bandeau résiduel).
- **Texte HTML statique** : caractères typographiques français en clair
  (« œil »), jamais d'échappement `\u00a0` (valable en JS, pas en HTML).
  Relecture avant commit : `grep '\\u00' cantoria.html`.

## Tests (obligatoire avant PR)

- Un fichier `tests/<fonctionnalite>.test.js` sur le modèle de
  `tests/chords-visibility.test.js` / `tests/settings-countdown.test.js`.
- Couvrir au minimum : valeur par défaut à l'ouverture, changement depuis le
  contrôle local (+ persistance dans `cantoria-settings`), changement depuis
  le réglage global (y compris chanson déjà ouverte), effet de la
  réinitialisation des paramètres, et un re-rendu qui ne fait pas réapparaître
  un état caché.
- `npm run check` puis `npm test` complets doivent passer (skill
  `cantoria-verify`).
