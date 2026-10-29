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

- moteur `electron` : binaire absent de la sandbox ;
- moteur `chromium` (Playwright) : `headless_shell` téléchargé mais les
  bibliothèques système nécessaires (`libglib2.0`, `libnss3`, …) ne
  sont pas installées et `sudo` est indisponible ;
- `xvfb-run` absent.

Les seuils (`thresholds.json`), le juge et les 3 baselines existantes
n'ont pas été touchés (zones protégées).

## Étape restante (superviseur, conteneur de dev)

```bash
npm run visual -- --themes=vibe            # contrôle sans référence
# relire les captures dans visual-out/, puis :
npm run visual -- --themes=vibe --update-baseline   # adopte la référence vibe
```

La référence `visual-baseline/vibe/` (editor, library, player, settings)
sera alors versionnée et la boucle de non-régression couvrira les 4 thèmes.

## Contrôles statiques déjà vérifiés pour vibe (tests)

- `tests/theme-vibe.test.js` : variables complètes, contrastes exigés,
  taille minimale des accords — passent sur `main` (253 tests verts).
