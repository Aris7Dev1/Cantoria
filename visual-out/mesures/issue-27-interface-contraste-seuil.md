# Mesures — issue 27 : contraste des libellés et des boutons danger sous le seuil de 4,5:1

Date : 2026-10-27 · Branche : `agent/issue-27-interface-contraste-des-libelles-et-des`
Scénarios : « library », « editor », « settings » (fenêtre des paramètres ouverte), viewport 1280×820, thèmes spotlight / guitar-case / campfire.
Seuils (`scripts/visual/thresholds.json`, non modifiés) : contraste interface ≥ 4,5:1 (`chrome.minContrast`).

## Changement

`cantoria.html` (CSS uniquement, deux familles de règles) :

| Règle | Avant | Après |
|---|---|---|
| `.eyebrow` | `color:var(--gold); opacity:.85;` | `color:var(--gold);` (opacité supprimée) |
| `--danger` spotlight | `#c76a5f` | `#d4796e` |
| `--danger` guitar-case | `#9a4331` | `#c97a6b` |
| `--danger` campfire | `#b23f2b` | `#d96a52` |

Pas de variable `--gold-ink` introduite : le gold plein (opacité 1) atteint déjà ≥ 5,5:1 sur `--bg` et `--bg-panel` pour les trois thèmes, `--gold` lui-même est donc inchangé (il sert aussi aux accords, badges, bordures et effets lumineux). `--danger` n'est consommé que par `.btn.danger` (vérifié : une seule règle), le changement est sans risque ailleurs. Les trois nouvelles valeurs de `--danger` restent des rouges (canal R dominant, vérifié dans le test).

Fonds effectifs retenus pour le calcul : `--bg` pour le header et l'éditeur (le dégradé radial du body part de `--bg-glow`, plus clair, vers `--bg` : le pire cas est `--bg`) ; `--bg-panel` pour le panneau des paramètres (`.modal-panel{background:var(--bg-panel)}`), qui accueille l'eyebrow « Paramètres » et `#btn-settings-reset`. `#btn-delete` (éditeur) est sur `--bg`.

## Mesures (ratio WCAG calculé en JS pur, `tests/interface-contrast.test.js`)

Luminance relative WCAG 2.x (linéarisation sRGB) et ratio `(Lclair + 0,05) / (Lfoncé + 0,05)`, extraits du CSS textuel de `cantoria.html` par regex (jsdom ne résout pas `var()`).

### `.eyebrow` (header « Cantoria », éditeur `#editor-heading`, paramètres « Paramètres »)

| Thème | Avant (gold à 85 % d'opacité) | Après (gold plein) sur `--bg` | Après sur `--bg-panel` | Seuil |
|---|---|---|---|---|
| spotlight | 4,08:1 | **8,23:1** | **7,57:1** | ≥ 4,5:1 |
| guitar-case | 4,40:1 | **6,01:1** | **5,52:1** | ≥ 4,5:1 |
| campfire | 4,22–4,46:1 | **5,99:1** | **5,70:1** | ≥ 4,5:1 |

### `.btn.danger` (`#btn-settings-reset` sur `--bg-panel`, `#btn-delete` sur `--bg`)

| Thème | Avant | Après sur `--bg` | Après sur `--bg-panel` | Seuil |
|---|---|---|---|---|
| spotlight | 4,48:1 | **5,82:1** | **5,36:1** | ≥ 4,5:1 |
| guitar-case | 2,24:1 | **4,91:1** | **4,51:1** | ≥ 4,5:1 |
| campfire | 3,07:1 | **5,43:1** | **5,17:1** | ≥ 4,5:1 |

## Structure (inchangée)

Aucune modification du HTML ni du JavaScript : trois `div.eyebrow` (header ligne 376, éditeur `#editor-heading` ligne 418, paramètres ligne 508), deux `.btn.danger` (`#btn-delete` ligne 445, `#btn-settings-reset` ligne 586). Aucun changement de comportement, de libellé ou de logique.

## Boucle visuelle (`npm run visual`, sans `--update-baseline` ni `--judge`)

Avertissements « contraste » (9 sur `main` : `div.eyebrow` ×3 thèmes, `div#editor-heading` ×3 thèmes, `button#btn-settings-reset` ×3 thèmes) :

| Scène | Avant (main) | Après |
|---|---|---|
| spotlight / library, editor, settings | 3 avertissements | 0 |
| guitar-case / library, editor, settings | 3 avertissements | 0 |
| campfire / library, editor, settings | 3 avertissements | 0 |

Rapport complet après : **0 erreur, 0 avertissement, 0 brouillon** sur les 12 scènes (les 9 avertissements de contraste disparaissent ; total 9 → 0).

Comparaison pixel à pixel avec `visual-baseline/` (attendu : les pixels des libellés et des boutons danger changent de couleur, la baseline n'est pas modifiée) :

| Scène | Pixels modifiés |
|---|---|
| spotlight / library | 0,80 % |
| spotlight / editor | 0,07 % |
| spotlight / settings | 2,03 % |
| guitar-case / library | 0,78 % |
| guitar-case / editor | 0,06 % |
| guitar-case / settings | 1,98 % |
| campfire / library | 0,81 % |
| campfire / editor | 0,07 % |
| campfire / settings | 2,01 % |

(Les scènes « player » restent à 0,00 % : le lecteur a son propre seuil de 7:1, hors périmètre.)

## Ce qui change visuellement

- **Libellés eyebrow** (« Cantoria », « Nouvelle chanson », « Paramètres ») : légèrement plus lumineux (opacité 0,85 → 1), lisibles sans effort sur les trois thèmes.
- **Boutons danger** (« Réinitialiser les paramètres », « Supprimer ») : rouge toujours identifiable comme danger, nettement plus lisible sur guitar-case (2,24 → 4,51:1) et campfire (3,07 → 5,17:1), légèrement plus lumineux sur spotlight.
- **Identité des thèmes préservée** : seules les luminosités des couleurs de texte concernées sont ajustées ; les teintes (or, rouge orangé du feu de camp, rouge terreux de l'étui) et les fonds sont inchangés.

## Tests

`tests/interface-contrast.test.js` (nouveau) : parse le CSS textuel de `cantoria.html` par regex, extrait `--gold`, `--danger`, `--bg` et `--bg-panel` pour chaque thème, calcule le ratio WCAG en JavaScript pur et assert ≥ 4,5:1 strict pour `.eyebrow` et `.btn.danger` sur `--bg` et `--bg-panel` sur les trois thèmes. Vérifie aussi que `.eyebrow` ne déclare plus d'opacité et que `--danger` reste une teinte rouge (canal R dominant).

`npm run check` et `npm test` : 166 tests, 0 échec.
