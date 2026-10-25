# Mesures — issue 13 : taille du texte sous le seuil (accords et paroles)

Date : 2026-10-25 · Branche : `agent/issue-13-agent-lecteur-taille-du-texte-sous-le-se`
Scénario : « player » (lecteur en pause, taille de texte par défaut), viewport 1280×820, thèmes spotlight / guitar-case / campfire.
Seuils (`scripts/visual/thresholds.json`, non modifiés) : accords ≥ 18 px, paroles ≥ 20 px.

## Changement

`cantoria.html` (CSS du lecteur uniquement) :

| Règle | Avant | Après | Effet (base 16 px) |
|---|---|---|---|
| `.line` | `font-size:1.18em` | `font-size:1.25em` | 18,88 px → 20 px |
| `.seg-chord` | `font-size:.78em` | `font-size:.9em` | 14,73 px → 18 px |
| `.seg-word` | hérite `.line` | inchangé | 18,88 px → 20 px |
| `.seg-chord.standalone` | `font-size:1em` | inchangé | 18,88 px → 20 px |

Les tailles restent en `em` : le réglage A−/A+ (`#stage-inner` en em) et la transposition sont inchangés.

## Mesures (getComputedStyle, Chromium via Electron sous Xvfb)

| Élément | Occurrences | Avant | Après | Seuil | Statut |
|---|---|---|---|---|---|
| `span.seg-word` (paroles) | 37 | 18,88 px | **20 px** | ≥ 20 px | OK |
| `span.seg-chord` (accords) | 37 | 14,7264 px | **18 px** | ≥ 18 px | OK |
| `span.seg-chord.standalone` (accords isolés) | 6 | 18,88 px | **20 px** | ≥ 18 px | OK |
| `.line` (référence) | — | 18,88 px | 20 px | — | — |

Identique sur les 3 thèmes (les tailles ne dépendent pas du thème).

## Mise en page (pas de régression)

| Contrôle | Avant | Après |
|---|---|---|
| Éléments du stage dépassant le stage (droite/gauche) | 0 | 0 |
| Scroll horizontal de la page | 0 px | 0 px |
| Hauteur de défilement du stage (`scrollHeight`) | 970 px | 1016 px |
| Hauteur visible du stage (`clientHeight`) | 640 px | 640 px |

Le contenu défile toujours verticalement (1016 > 640) ; les lignes passent à la ligne via `flex-wrap` (`white-space:nowrap` conservé sur `.seg-word` : pas de coupure de mot). +4,7 % de hauteur de contenu, absorbé par le défilement.

## Boucle visuelle (`npm run visual`, sans `--update-baseline` ni `--judge`)

Scénario « player », erreurs « taille de texte » :

| Thème | Avant (main) | Après |
|---|---|---|
| spotlight | 2 (`seg-chord` 14,7 px ×16, `seg-word` 18,9 px ×37) | 0 |
| guitar-case | 3 (+ contraste `seg-chord` 5,05:1 ×16) | 0 |
| campfire | 3 (+ contraste `seg-chord` 5,31:1 ×16) | 0 |

Total erreurs « taille de texte » sur `span.seg-chord` / `span.seg-word` : **6 → 0**.

Erreurs restantes dans « player » (5, inchangées, **hors périmètre** de l'issue 13) : contraste des accords `span.seg-chord.standalone` (5,97:1 / 4,26:1 / 4,42:1) et `span.seg-chord` (5,05:1 / 5,31:1) sous le minimum 7:1 — préexistantes sur `main`, à traiter dans une issue dédiée (contraste, pas taille).

## Tests

`tests/chords.test.js` : nouveau test « à la taille par défaut, les accords mesurent ≥ 18 px et les paroles ≥ 20 px dans le lecteur » — résolution de la cascade `em` → px via `getComputedStyle` (jsdom ne résout pas les px), assertions ≥ 18 px / ≥ 20 px, plus vérification que A−/A+ continue de faire varier `#stage-inner` par paliers de 0,15 em avec les seuils toujours atteints après A+.
