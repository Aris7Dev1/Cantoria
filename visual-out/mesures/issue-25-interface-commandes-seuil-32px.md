# Mesures — issue 25 : commandes des paramètres et de la bibliothèque sous le seuil de 32 px

Date : 2026-10-27 · Branche : `agent/issue-25-interface-commandes-des-parametres-et-de`
Scénarios : « library » (bibliothèque avec chansons) et « settings » (fenêtre des paramètres ouverte), viewport 1280×820, thèmes spotlight / guitar-case / campfire.
Seuils (`scripts/visual/thresholds.json`, non modifiés) : commandes ≥ 32 px de côté.

## Changement

`cantoria.html` (CSS uniquement, trois règles localisées) :

| Règle | Avant | Après |
|---|---|---|
| `.theme-picker .swatch` | `width:26px;height:26px` | `width:32px;height:32px` (bordures incluses, `box-sizing:border-box` global) |
| `.fav-btn` | `padding:2px` + `.fav-btn svg{width:19px;height:19px}` (23×23 au total) | `padding:4px` + `.fav-btn svg{width:24px;height:24px}` (32×32 au total) |
| `.switch` | `height:26px;border-radius:14px`, knob `20px`, `translateX(18px)` | `height:32px;border-radius:16px`, knob `26px`, `translateX(12px)` |

`button#setting-spotlight` porte la classe `.switch` (ligne 519 du HTML) : couvert par la règle `.switch`, aucune règle propre à ajuster. La largeur 44 px des switches était déjà conforme. `#btn-fav-current` (lecteur) inchangé, déjà conforme.

## Mesures (styles calculés via jsdom, `tests/interface-commands.test.js`)

| Élément | Avant | Après | Seuil | Statut |
|---|---|---|---|---|
| `button.swatch` ×3 (sélecteur de thème, header) | 26×26 px | **32×32 px** | ≥ 32 px | OK |
| `button.fav-btn` (cartes bibliothèque) | 23×23 px | **32×32 px** | ≥ 32 px | OK |
| `button.switch` ×5 (paramètres) | 44×26 px | **44×32 px** | ≥ 32 px | OK |
| `button#setting-spotlight` | 44×26 px | **44×32 px** | ≥ 32 px | OK |
| `.switch .knob` | 20×20 px | **26×26 px** | — | cohérent |

Cohérence du knob : largeur 44 − 2×2 padding − 2×1 bordure = 38 px de piste ; knob 26 px ; translation active 38 − 26 = **12 px** (vérifié dans le test). Le knob reste calé à gauche au repos (padding 2 px) et à droite en position active.

## Structure (inchangée)

Aucune modification du HTML ni du JavaScript : 3 swatchs dans `.theme-picker`, 1 carte avec `button.fav-btn` dans `#song-grid`, 5 `button.switch` dans `#settings-overlay` (dont `#setting-spotlight`). Aucun changement de comportement, de libellé ou de logique.

## Boucle visuelle (`npm run visual`, sans `--update-baseline` ni `--judge`)

Avertissements « taille des commandes » (scènes `library` et `settings`) :

| Thème | Avant (main) | Après |
|---|---|---|
| spotlight / library | 3 (swatchs 26×26) + favoris | 0 |
| spotlight / settings | 1 (`#setting-spotlight` 44×26) + 4 switches 44×26 | 0 |
| guitar-case / library | idem | 0 |
| guitar-case / settings | idem | 0 |
| campfire / library | idem | 0 |
| campfire / settings | idem | 0 |

Total avertissements « taille des commandes » : **21 → 0** sur l'ensemble des scènes (les 21 restants sur `main` concernaient tous ces quatre familles hors lecteur).

Rapport complet après : **0 erreur, 9 avertissements, 0 brouillon**. Les 9 avertissements restants sont tous des avertissements de **contraste**, hors périmètre de cette issue (issue séparée) : `button#btn-settings-reset` (3 thèmes), `div.eyebrow` (3 thèmes), `div#editor-heading` (3 thèmes).

## Ce qui change visuellement

- **Sélecteur de thème (header)** : les trois pastilles passent de 26 à 32 px de diamètre, plus faciles à viser.
- **Cartes de la bibliothèque** : l'étoile favori gagne en taille (19 → 24 px) et en zone cliquable (23 → 32 px).
- **Paramètres** : les cinq switches passent de 26 à 32 px de haut ; le knob, plus grand (20 → 26 px), reste centré dans la piste et la translation active (12 px) le cale exactement à droite.

## Tests

`tests/interface-commands.test.js` (nouveau) : pour chaque famille (`button.swatch` du header, `button.fav-btn` d'une carte, `button.switch` des paramètres, `button#setting-spotlight`), calcul de la hauteur/largeur à partir de `getComputedStyle` (padding + line-height + bordure + contenu enfant, jsdom ne fait pas de mise en page) et assert ≥ 32 px des deux côtés. Un cinquième test vérifie la cohérence du knob (26×26, translation active = largeur − 2×padding − 2×bordure − knob).

`npm run check` et `npm test` : 163 tests, 0 échec.
