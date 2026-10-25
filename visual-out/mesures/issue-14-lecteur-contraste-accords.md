# Mesures — issue 14 : contraste des accords sous le seuil (lecteur)

Date : 2026-10-25 · Branche : `agent/issue-14-agent-lecteur-contraste-des-accords-sous`
Scénario : « player » (lecteur en pause, taille de texte par défaut), viewport 1280×820, thèmes spotlight / guitar-case / campfire.
Seuils (`scripts/visual/thresholds.json`, non modifiés) : contraste accords ≥ 7:1 (WCAG 2.x, pire cas retenu parmi les fonds de la scène).

## Changement

`cantoria.html` (CSS uniquement, périmètre : accords du lecteur) :

- Deux nouvelles variables par thème, consommées uniquement par les accords du lecteur :
  `--chord-ink` (`.seg-chord`) et `--chord-standalone-ink` (`.seg-chord.standalone`).
- `.seg-chord` : `color:var(--gold)` → `color:var(--chord-ink, var(--gold))`.
- `.seg-chord.standalone` : hérite → `color:var(--chord-standalone-ink, var(--chord-ink, var(--gold)))`.

| Thème | Variable | Avant | Après |
|---|---|---|---|
| spotlight | `--chord-ink` | `#e2a25c` (via `--gold`) | `#e2a25c` (inchangé) |
| spotlight | `--chord-standalone-ink` | `#e2a25c` (via `--gold`) | `#e9ba86` |
| guitar-case | `--chord-ink` | `#c8964f` (via `--gold`) | `#dbbb8d` |
| guitar-case | `--chord-standalone-ink` | `#c8964f` (via `--gold`) | `#e6d0b1` |
| campfire | `--chord-ink` | `#e6712f` (via `--gold`) | `#ed9869` |
| campfire | `--chord-standalone-ink` | `#e6712f` (via `--gold`) | `#f2b38f` |

Les teintes dorées/orangées de chaque thème sont conservées (même hue, luminance remontée). `--gold` n'est pas modifié : le reste de l'interface (boutons, badges, titres) est inchangé. Les accords restent en gras monospace, distincts des paroles (`--ink-bright`, blanc cassé).

Pourquoi deux variables : `.seg-chord.standalone` siège dans `.line.instrumental` (`opacity:.88`), qui assombrit la couleur effective — il lui faut donc une teinte encore plus claire pour atteindre 7:1.

## Mesures (formule WCAG 2.x, comme `scripts/visual/checks.js`)

Fond de la scène : dégradé radial du `body`, de `--bg-glow` (haut) à `--bg` ; le pire cas est retenu. Pour `.seg-chord.standalone`, la couleur est composée avec le fond à `opacity:.88` avant le calcul.

| Élément | Thème | Avant | Après | Seuil | Statut |
|---|---|---|---|---|---|
| `span.seg-chord` | spotlight | 7,32:1 | 7,32:1 | ≥ 7:1 | OK (déjà conforme) |
| `span.seg-chord` | guitar-case | 5,05:1 | **7,32:1** | ≥ 7:1 | OK |
| `span.seg-chord` | campfire | 5,31:1 | **7,29:1** | ≥ 7:1 | OK |
| `span.seg-chord.standalone` | spotlight | 5,97:1 | **7,32:1** | ≥ 7:1 | OK |
| `span.seg-chord.standalone` | guitar-case | 4,26:1 | **7,29:1** | ≥ 7:1 | OK |
| `span.seg-chord.standalone` | campfire | 4,42:1 | **7,36:1** | ≥ 7:1 | OK |

Les valeurs « avant » reproduisent exactement les erreurs du rapport visuel (`visual-out/report.md`, scénario « player ») : 5,97:1 ×6 (standalone, 3 thèmes), 5,05:1 (guitar-case), 5,31:1 (campfire).

## Mise en page (pas de régression)

Le changement ne touche que des couleurs (`color`) : aucune taille, marge, police ni mise en page n'est modifiée. `npm run visual` confirme : 0 erreur de débordement, 0 erreur de taille de texte sur le scénario « player » (les avertissements restants — tailles de commandes et de libellés d'interface — sont préexistants et hors périmètre).

## Boucle visuelle (`npm run visual`, sans `--update-baseline` ni `--judge`)

Scénario « player », erreurs « contraste » sur les accords :

| Thème | Avant (main) | Après |
|---|---|---|
| spotlight | 1 (`seg-chord.standalone` 5,97:1 ×6) | 0 |
| guitar-case | 2 (`seg-chord` 5,05:1 ×16, `seg-chord.standalone` 4,26:1 ×6) | 0 |
| campfire | 2 (`seg-chord` 5,31:1 ×16, `seg-chord.standalone` 4,42:1 ×6) | 0 |

Total erreurs « contraste » sur `span.seg-chord` / `span.seg-chord.standalone` : **5 → 0**. Rapport complet : 0 erreur, 57 avertissements (tous préexistants, hors périmètre), 0 brouillon.

## Tests

`tests/chords.test.js` : nouveau test « les accords du lecteur ont un contraste ≥ 7:1 pour les trois thèmes » — jsdom ne résout ni `var()` ni les dégradés, le test lit donc la feuille embarquée, résout `--chord-ink` / `--chord-standalone-ink` par thème (avec fallbacks), applique l'opacité `.88` de `.line.instrumental` pour le standalone, calcule le ratio WCAG contre `--bg` et `--bg-glow` (pire cas) et assert ≥ 7:1 pour les 3 thèmes × 2 sélecteurs. Vérifié en régression : avec l'ancienne couleur guitar-case (`#c8964f`), le test échoue à 5,05:1.
