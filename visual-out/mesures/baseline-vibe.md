# Mesures — baseline du thème vibe (issue #47)

Date : 2026 (session audit)

## État

- `scripts/visual/fixtures.js` : le thème `vibe` est ajouté à `THEMES`.
  Le workflow visuel (`npm run visual -- --themes=vibe`) le prend
  désormais en charge pour la capture, les contrôles déterministes
  (tailles de texte, contraste, cibles tactiles, débordements) et la
  comparaison à la référence.
- `visual-baseline/vibe/` : **référence non encore générée** (voir blocage).

## Blocage environnement de cette session

La génération des PNG de référence exige une capture réelle :

- moteur `electron` : `node_modules/electron/dist/` ne contient que le
  binaire Windows (`electron.exe`) — lancement impossible sous Linux
  (`Process failed to launch!`) ;
- moteur `chromium` (Playwright) : le `headless_shell` n'était pas
  téléchargé. Corrigé dans cette session :
  `npx playwright-core install chromium-headless-shell` (les
  bibliothèques système requises sont bien présentes ici).

Les seuils (`thresholds.json`), le juge et les 3 baselines existantes
n'ont pas été touchés (zones protégées). **`--update-baseline` n'a pas
été lancé** : la référence `visual-baseline/` est protégée, réservée au
superviseur.

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

## Étape restante (superviseur, conteneur de dev)

```bash
npm run visual -- --themes=vibe            # contrôle sans référence
# relire les captures dans visual-out/, puis :
npm run visual -- --themes=vibe --update-baseline   # adopte la référence vibe
```

La référence `visual-baseline/vibe/` (editor, library, player, settings)
sera alors versionnée et la boucle de non-régression couvrira les 4 thèmes.
Note : dans ce conteneur, seul le moteur `chromium` fonctionne (le
moteur `electron` exige le binaire Linux d'Electron) ; la référence
existante ayant été générée avec le moteur `electron`, générer la
référence vibe en `chromium` créerait un écart systématique de moteur —
à décider par le superviseur (générer les 4 thèmes dans le même moteur,
ou réserver `--update-baseline` au conteneur de dev complet).

## Contrôles statiques déjà vérifiés pour vibe (tests)

- `tests/theme-vibe.test.js` : variables complètes, contrastes exigés,
  taille minimale des accords — passent sur `main` (253 tests verts).
