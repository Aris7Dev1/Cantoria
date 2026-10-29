# Mesures — baseline du thème vibe (issue #47)

Date : 2026 (session audit)

## État

- `scripts/visual/fixtures.js` : le thème `vibe` est ajouté à `THEMES`.
  Le workflow visuel (`npm run visual -- --themes=vibe`) le prend
  désormais en charge pour la capture, les contrôles déterministes
  (tailles de texte, contraste, cibles tactiles, débordements) et la
  comparaison à la référence.
- `visual-baseline/vibe/` : **référence générée et versionnée** (voir
  « Référence adoptée » ci-dessous) — la boucle de non-régression couvre
  désormais les 4 thèmes.

## Blocage environnement rencontré, puis levé

- moteur `electron` : `node_modules/electron/dist/` ne contenait que le
  binaire Windows (`electron.exe`, `path.txt` = `electron.exe`) —
  lancement impossible sous Linux (`Process failed to launch!`).
  **Corrigé** : `node node_modules/electron/install.js` a téléchargé le
  binaire Linux (`dist/electron`, Electron 44.4.3, `path.txt` = `electron`).
- moteur `chromium` (Playwright) : `headless_shell` téléchargé via
  `npx playwright-core install chromium-headless-shell` (moteur de
  secours fonctionnel).

Les seuils (`thresholds.json`), le juge et les 3 baselines existantes
n'ont pas été touchés.

## Exécution de cette session (moteur chromium, sans référence)

```bash
npm run visual -- --themes=vibe,campfire --engine=chromium
```

Résultat : **0 erreur, 9 avertissements par thème**, profil identique
pour `vibe` et `campfire` (contrôle) :

| Scène | vibe | campfire |
|---|---|---|
| library | 0 erreur, 0 avert. | 0 erreur, 0 avert. |
| editor | 0 erreur, 6 avert. | 0 erreur, 6 avert. |
| player | 0 erreur, 3 avert. | 0 erreur, 3 avert. |
| settings | 0 erreur, 0 avert. | 0 erreur, 0 avert. |

Les 9 avertissements sont **indépendants du thème** (présents aussi sur
campfire) : boutons de marquage de l'éditeur à 29 px de haut
(`#mark-verse`, `#mark-chorus`, `#mark-bridge`, `#structure-labels`,
`#editor-undo`, `#editor-redo`), libellé de section du lecteur à 11 px
et boutons `#section-prev`/`#section-next` à 20×17 px. Ce ne sont pas
des régressions du thème vibe.

Sanity check pixel (diff `visual-out/current/vibe` vs `campfire`, même
exécution) : 99,70 % (library), 99,80 % (editor), 99,65 % (player),
29,70 % (settings) — le thème vibe est bien appliqué partout (fond
anthracite + accent orange sur toute la surface ; la fenêtre des
paramètres n'occupant qu'une partie de la scène explique les 29,70 %).

Captures : `visual-out/current/vibe/{library,editor,player,settings}.png`.
Aucune comparaison à une référence (pas de `visual-baseline/vibe/`), donc
aucun juge A/B. Attention : `scripts/visual/run.js` vide `visual-out/`
à chaque exécution (`rmSync` ligne 134), y compris `mesures/` — ce
rapport a été réécrit après la dernière exécution.

## Référence adoptée (superviseur, 2026-10-29)

```bash
npm run visual -- --themes=vibe --update-baseline   # moteur electron, après réparation du binaire Linux
npm run visual -- --themes=vibe                     # vérification : 0,00 % de pixels modifiés sur les 4 scènes
```

- `visual-baseline/vibe/{library,editor,player,settings}.png` créés
  (référence générée avec le **moteur electron**, comme les 3 autres
  thèmes — aucune incohérence de moteur).
- Rejeu sans `--update-baseline` : **0 erreur, 9 avertissements,
  0,00 % de pixels modifiés** sur les 4 scènes vibe. La boucle de
  non-régression couvre désormais les 4 thèmes.
- Les 9 avertissements restent ceux, indépendants du thème, déjà
  constatés (boutons de marquage de l'éditeur à 29 px, libellé de
  section à 11 px, `#section-prev/next` à 20×17 px).
- Les 3 autres baselines (`spotlight`, `guitar-case`, `campfire`) sont
  inchangées (`--themes=vibe` ne touche que `visual-baseline/vibe/`).

## Contrôles statiques déjà vérifiés pour vibe (tests)

- `tests/theme-vibe.test.js` : variables complètes, contrastes exigés,
  taille minimale des accords — passent sur `main` (253 tests verts).
