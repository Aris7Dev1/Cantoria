# Mesures — issue 19 : encadrer les groupes de commandes du bandeau (boxes avec libellé)

Date : 2026-10-26 · Branche : `agent/issue-19-lecteur-encadrer-les-groupes-de-commande`
Scénario : « player » (lecteur en pause, taille de texte par défaut), viewport 1280×820, thèmes spotlight / guitar-case / campfire.
Seuils (`scripts/visual/thresholds.json`, non modifiés) : commandes ≥ 32 px, texte d'interface ≥ 12 px, contraste interface ≥ 4,5:1.

## Changement

`cantoria.html` (HTML du bandeau + CSS) :

- Nouvelle classe `.ctrl-group` : box avec `background:var(--bg-panel-2)`, `border:1px solid var(--border)`, `border-radius:8px`, `position:relative`, `margin:8px 0 0` (marge haute réservée au libellé), `padding:3px 8px 2px`.
- Nouvelle classe `.ctrl-group-label` : libellé en foreground, `position:absolute; top:-8px; left:6px; padding:0 4px; background:var(--bg-panel)` (le fond coupe la bordure), `font-size:12px`, `color:var(--ink-bright)`, `text-transform:uppercase`.
- Les 3 steppers deviennent `.ctrl-group.stepper` ; les anciens `span.label` internes (« Vitesse », « Transp. », « Texte ») sont remplacés par le libellé de la box. Le label « Décompte » isolé et le `.segmented#countdown-picker` sont enveloppés dans un quatrième `.ctrl-group`.
- Id, classes et événements des boutons inchangés ; aucun changement fonctionnel.

## Mesures (getBoundingClientRect, Chromium via Electron sous Xvfb)

Identique sur les 3 thèmes (le CSS du bandeau ne dépend pas du thème) :

| Élément | Avant | Après | Seuil / limite | Statut |
|---|---|---|---|---|
| Bandeau `#controls` | 1280×62 px | **1280×66,6 px** | ≤ 72 px (issue) | OK |
| Ligne `.ctrl-row` | 1252×44 px | 1252×48,6 px | — | — |
| Box « Vitesse » | — | 138×39 px, bordure 1px solid | — | OK |
| Box « Transpo » | — | 138×39 px, bordure 1px solid | — | OK |
| Box « Texte » | — | 88×39 px, bordure 1px solid | — | OK |
| Box « Décompte » | — | 231,3×40,6 px, bordure 1px solid | — | OK |
| Libellés (4) | 11 px (`span.label`, gris) | **12 px**, `top:-8px` (sur la bordure) | ≥ 12 px | OK |
| Contraste libellés | — | 14,24:1 (spotlight) · 11,91:1 (guitar-case) · 13,54:1 (campfire) | ≥ 4,5:1 | OK |
| Steppers ×6 | 32×32 px | inchangé | ≥ 32 px | OK |
| Boutons décompte ×4 | 67,5 / 37 / 45,3 / 45,3 × 33,6 px | inchangé | ≥ 32 px | OK |
| `#play-toggle` / `#btn-pin-controls` | 44×44 / 40×40 px | inchangé | ≥ 32 px | OK |

Le bandeau tient toujours sur une seule ligne à 1280 px (0 erreur de débordement au contrôle visuel). +4,6 px de hauteur, absorbés dans la limite des 72 px fixée par l'issue.

## Boucle visuelle (`npm run visual`, sans `--update-baseline` ni `--judge`)

**0 erreur, 21 avertissements, 0 brouillon** (contre 0 erreur / 24 avertissements après l'issue 15).

Scénario « player » : **0 avertissement** (contre 1 : le `span.label` à 11 px disparaît, remplacé par les libellés de box à 12 px — les 3 avertissements `span.label` ×3 thèmes disparaissent au total).

Pixels modifiés par rapport à la référence (baseline adoptée avant l'issue 15) : player 1,73 % (spotlight) / 2,65 % (guitar-case) / 1,27 % (campfire) — le changement visuel attendu (boxes + libellés) ; tous les autres scénarios à 0,00 %.

Avertissements restants (21, préexistants, hors périmètre) : commandes de la bibliothèque (swatch 26×26, fav-btn 23×23) et des paramètres (44×26, 30×30, switchs), quelques contrastes limites en settings.

## Tests

`tests/reader-controls.test.js` : nouveau test « structure : les quatre groupes de commandes sont encadrés avec un libellé » — 4 boxes `.ctrl-group` présentes, libellés « Vitesse » / « Transpo » / « Texte » / « Décompte » en `text-transform:uppercase`, `position:absolute`, `font-size` ≥ 12 px (résolution de la cascade `em` → px), bordure visible, contenu attendu par box, et plus aucun `span.label` interne aux steppers ni isolé dans la ligne.

Tests existants « chaque commande du bandeau mesure au moins 32 px de côté » et « les contrôles tiennent sur une seule ligne » : toujours verts. `npm run check` et `npm test` : OK (134 pass, 0 fail, 2 skipped — visuels sans Chromium).

## Note de processus

Le runner a atteint son plafond de coût (3,07 $) en lançant la boucle visuelle ; le travail était terminé et non commité dans le worktree (correction + test). Le superviseur a vérifié (check, test, `npm run visual` : 0 erreur / 21 avertissements), mesuré (script Electron sous Xvfb, ci-dessus), rédigé ce rapport et finalisé les commits, dans l'ordre : correction → `npm run visual` → rapport → commits.
