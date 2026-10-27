# Mesures — issue 31 : nouveau thème « Vibe » (identité Mistral, ambiance terminal)

Date : 2026-10-27 · Branche : `agent/issue-31-theme-vibe`
Scénarios : boucle visuelle « library », « editor », « player », « settings » (viewport 1280×820, thèmes spotlight / guitar-case / campfire) + captures manuelles du thème vibe sur les 4 vues (mêmes fixtures, `cantoria-theme=vibe`).
Seuils (`scripts/visual/thresholds.json`, non modifiés) : contraste interface ≥ 4,5:1 (`chrome.minContrast`), lecteur ≥ 7:1 (`stage.minContrast`), commandes ≥ 32 px (`chrome.minTargetPx`), paroles ≥ 20 px / accords ≥ 18 px (`stage.minLyricPx` / `stage.minChordPx`).

## Changement

`cantoria.html` uniquement (+29 lignes) :

- **Bloc `html[data-theme="vibe"]{…}`** : les 16 variables du thème + redéfinition des 3 polices (`--font-display`, `--font-body`, `--font-chord`) en pile monospace système. Aucune police externe (CSP `default-src 'none'` inchangée, zéro réseau).
- **Règles scopées `html[data-theme="vibe"] …`** (15 règles, en fin de feuille de style) : formes carrées et détails « terminal ».
- **4e swatch** dans `.theme-picker` (`data-theme="vibe"`, dégradé `#0d0d0f` / `#ff8a3d`).

Le sélecteur JS est générique (boucle sur `.theme-picker .swatch`, persistance `cantoria-theme`, restauration au chargement) : **aucune modification JS**. Le thème par défaut au reset reste `campfire` (inchangé, testé).

## Palette (16 variables, bloc vibe)

| Variable | Valeur | Rôle |
|---|---|---|
| `--bg` | `#0d0d0f` | fond anthracite très sombre |
| `--bg-panel` | `#141417` | panneaux, cartes, bandeau |
| `--bg-panel-2` | `#1a1a1e` | champs, groupes de commandes |
| `--border` | `#2e2e35` | bordures (légèrement plus marquées) |
| `--ink-dim` | `#6b6b78` | icônes favoris inactifs (sans texte) |
| `--ink-mid` | `#a8a8b3` | texte secondaire |
| `--ink-bright` | `#f4f2ec` | texte principal, paroles |
| `--gold` | `#ff8a3d` | accent orange Mistral (tirant vers le jaune) |
| `--gold-glow` | `rgba(255,138,61,.45)` | lueurs, bordures de badges |
| `--chord-ink` | `#ff9a4d` | accords au-dessus des paroles |
| `--chord-standalone-ink` | `#ffb066` | accords isolés (lignes instrumentales) |
| `--teal` | `#ffd800` | jaune Mistral (libellés de section) |
| `--danger` | `#ff6b4a` | rouge orangé (boutons danger) |
| `--bg-glow` | `#16161b` | halo radial du fond |
| `--primary-grad-light` | `#ffb066` | dégradé des boutons primaires |
| `--primary-ink` | `#1a0d02` | texte sur boutons primaires/actifs |

Polices (les 3 redéfinies dans le bloc vibe, système uniquement) :
`'JetBrains Mono','Cascadia Mono','SFMono-Regular',Consolas,Menlo,monospace` — monospace partout (display, body, accords).

## Contrastes (ratio WCAG calculé en JS pur, `tests/theme-vibe.test.js`)

Luminance relative WCAG 2.x (linéarisation sRGB), valeurs extraites du CSS textuel (jsdom ne résout pas `var()`). Fonds effectifs : `--bg` (pire cas du dégradé radial body) et `--bg-panel` (cartes, bandeau, fenêtre des paramètres).

### Interface (seuil ≥ 4,5:1)

| Élément | Couleur | sur `--bg` | sur `--bg-panel` | sur `--bg-panel-2` |
|---|---|---|---|---|
| `.eyebrow`, `.stepper .val`, `.badge` | `--gold` `#ff8a3d` | **8,28:1** | **7,84:1** | **7,40:1** |
| `.btn.danger` | `--danger` `#ff6b4a` | **6,89:1** | **6,53:1** | — |
| texte secondaire | `--ink-mid` `#a8a8b3` | **8,24:1** | **7,81:1** | — |
| texte principal | `--ink-bright` `#f4f2ec` | **17,34:1** | **16,42:1** | — |
| `.section-label` (opacité .85) | `--teal` `#ffd800` | **10,20:1** (composite) | — | — |
| boutons primaires / actifs | `--primary-ink` `#1a0d02` sur `--gold` | **8,12:1** | sur `--primary-grad-light` : **10,57:1** | — |

### Lecteur (seuil ≥ 7:1)

| Élément | Couleur | sur `--bg` |
|---|---|---|
| paroles (`.seg-word`) | `--ink-bright` `#f4f2ec` | **17,34:1** |
| accords (`.seg-chord`) | `--chord-ink` `#ff9a4d` | **9,23:1** |
| accords isolés (`.seg-chord.standalone`) | `--chord-standalone-ink` `#ffb066` | **10,77:1** |

L'orange Mistral pur `#ff7000` frôle la limite sur fond noir : `--chord-ink` est éclairci à `#ff9a4d` et `--chord-standalone-ink` à `#ffb066` (recommandation de l'issue). `--danger` reste un rouge orangé (canal R dominant : 255 > 107 > 74, testé).

## Tailles (thème vibe actif, `tests/theme-vibe.test.js` + mesures Electron réelles)

| Élément | Seuil | Mesuré |
|---|---|---|
| swatchs du sélecteur | ≥ 32 px | 32×32 px |
| boutons favoris des cartes | ≥ 32 px | ≥ 32 px (svg 24 px + padding) |
| switches des paramètres | ≥ 32 px | 44×32 px |
| commandes du bandeau (`#play-toggle`, steppers, `#btn-pin-controls`, décompte) | ≥ 32 px | 32–44 px |
| paroles du lecteur | ≥ 20 px | **20 px** (rendu réel) |
| accords au-dessus des paroles | ≥ 18 px | **18 px** (rendu réel) |
| accords isolés | ≥ 18 px | **20 px** (rendu réel) |

Le thème ne déclare aucune taille : les `border-radius`, `box-shadow` et contenus `::before` ne modifient ni les boîtes ni les polices (vérifié en jsdom et sur capture réelle).

## Description du design (thème vibe uniquement)

- **Monospace partout** : titres, libellés, paroles et accords en pile mono système — l'identité « terminal / CLI » demandée.
- **Formes carrées** : `border-radius` réduits (boutons 10→4 px, icônes et lecture 50 %→6 px, cartes/panneaux 10–16→4–6 px, groupes de commandes 8→3 px, badges 6→2 px, champs 10–12→4 px, toast 16→4 px, swatchs 50 %→6 px, switch 16→8 px avec knob carré 2 px).
- **Détail « prompt » sobre** : `>` devant l'eyebrow « Cantoria » (`.eyebrow::before`), et barre verticale orange de 3 px sur la ligne en cours de lecture (`box-shadow:inset 3px 0 0 var(--gold)` sur `.line.focus-line`, mesurée en rendu réel : `rgb(255,138,61) 3px 0px 0px 0px inset`).
- **Sélection** : fond `--gold`, texte `--primary-ink` (scopé au thème).
- **Sobre** (principe 5 de VISION.md) : pas d'animation, pas d'effet gadget — la lisibilité en concert prime.

Mesures de rendu réelles (Electron 1280×820, thème vibe actif) : `--bg` résolu `#0d0d0f`, dégradé body `radial-gradient(rgb(22,22,27) → rgb(13,13,15))`, `.eyebrow` `rgb(255,138,61)` en mono avec `::before` « > », carte `#141417`, accord au-dessus d'une parole `rgb(255,154,77)` 18 px, accord isolé `rgb(255,176,102)` 20 px, parole `rgb(244,242,236)` 20 px, bouton lecture `linear-gradient(rgb(255,176,102), rgb(255,138,61))` texte `rgb(26,13,2)`, rayons mesurés 2/3/6 px selon les composants.

## Ce qui change visuellement

**Pour le thème vibe uniquement** : monospace généralisé, formes carrées, prompt « > », barre de ligne en cours orange, sélection orange. Fond anthracite, accent orange Mistral, jaune pour les sections, rouge orangé pour le danger.

**Pour les trois autres thèmes** : aucun changement de couleur, de police, de forme ni de taille. La seule différence pixel est l'ajout du 4e swatch dans le sélecteur partagé (header de la bibliothèque), demandé par l'issue.

## Boucle visuelle (`npm run visual`, sans `--update-baseline` ni `--judge`)

**0 erreur, 0 avertissement, 0 brouillon** sur les 12 scènes (3 thèmes × 4 scénarios) — identique à l'exécution de référence sur `main` avant le changement.

### Diff propre → modifié (même machine, captures de contrôle sauvegardées avant le changement)

| Scène | Pixels modifiés | Zone |
|---|---|---|
| spotlight / library | 3 060 px (0,29 %) | header, x[1055..1209] y[32..63] |
| spotlight / editor | **0 px (0,00 %)** | — |
| spotlight / player | **0 px (0,00 %)** | — |
| spotlight / settings | 2 086 px (0,20 %) | header, x[1055..1209] y[32..63] (derrière la fenêtre) |
| guitar-case / library | 3 109 px (0,30 %) | idem |
| guitar-case / editor | **0 px (0,00 %)** | — |
| guitar-case / player | **0 px (0,00 %)** | — |
| guitar-case / settings | 1 732 px (0,17 %) | idem |
| campfire / library | 3 270 px (0,31 %) | idem |
| campfire / editor | **0 px (0,00 %)** | — |
| campfire / player | **0 px (0,00 %)** | — |
| campfire / settings | 1 783 px (0,17 %) | idem |

Toutes les différences des thèmes existants sont confinées à la rangée du sélecteur de thème (nouveau swatch + décalage de 41 px du bouton des paramètres) : **les scènes editor et player sont pixel-identiques**, et aucune règle de design ne s'applique hors du thème vibe.

### Diff vs `visual-baseline/` (référence non modifiée, zone protégée)

| Scène | Avant le changement (main) | Après le changement |
|---|---|---|
| spotlight / library | 0,80 % | 0,91 % |
| spotlight / editor | 0,07 % | 0,07 % |
| spotlight / player | 0,00 % | 0,00 % |
| spotlight / settings | 2,03 % | 2,10 % |
| guitar-case / library | 0,78 % | 0,90 % |
| guitar-case / editor | 0,06 % | 0,06 % |
| guitar-case / player | 0,00 % | 0,00 % |
| guitar-case / settings | 1,98 % | 2,06 % |
| campfire / library | 0,81 % | 0,93 % |
| campfire / editor | 0,07 % | 0,07 % |
| campfire / player | 0,00 % | 0,00 % |
| campfire / settings | 2,01 % | 2,08 % |

**À noter pour le superviseur** : la référence `visual-baseline/` est déjà décalée de ~0,8 % (library) et ~2,0 % (settings) par rapport à `main` **avant** ce changement (les issues 25 et 27 ont modifié tailles et contrastes sans mise à jour de la référence, interdite depuis une branche). Le thème vibe ajoute ~0,1 % (library) et ~0,07 % (settings) : le seul delta attribuable à cette issue est le 4e swatch. Le critère « 0,00 % de pixels modifiés sur les 12 scènes » de l'issue n'est donc pas atteignable en l'état de la référence — ni avant ni après ce changement ; le critère opérationnel retenu (0 erreur / 0 avertissement / 0 brouillon) est rempli.

## Tests

`tests/theme-vibe.test.js` (nouveau, 8 tests) : sélecteur (4 swatchs, clic applique `data-theme="vibe"` + persistance + activation, restauration au chargement, reset → campfire), variables (16 définies, hex pour les contrôles de contraste, 3 polices monospace), contrastes WCAG (interface ≥ 4,5:1, lecteur ≥ 7:1, `--danger` rouge), tailles (commandes ≥ 32 px, paroles ≥ 20 px / accords ≥ 18 px avec vibe actif), zéro réseau (aucun `url(`, `http`, `@import`, `@font-face` dans les règles vibe).

`npm run check` et `npm test` : 183 tests, 0 échec (2 skips préexistants : capture réelle sans Chromium).

## Observation hors périmètre (préexistante)

Au rechargement avec un thème persisté autre que campfire, le swatch campfire garde sa classe `active` codée en dur dans le HTML et le swatch du thème restauré s'y ajoute : deux swatchs cerclés. Ce comportement existe pour spotlight et guitar-case depuis l'origine (le JS du sélecteur n'enlève jamais la classe) ; il n'est pas modifié par cette issue. À traiter dans une issue dédiée si le superviseur le souhaite.
