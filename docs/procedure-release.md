# Procédure de release — Cantoria

> Connaissance tirée de la préparation et de la sortie de la v1.4.0 (première
> release multi-plateforme). À suivre pour chaque version publique.

## Prérequis (une fois par release)

1. **Version** : le champ `"version"` de `package.json` est LA source de vérité —
   desktop (electron-builder), Android (`versionName` + `versionCode` calculé par
   segments : `1.4.0` → `10400`) et nom de l'APK en dérivent. Bumper via une PR
   dédiée (`npm version minor` + `npm install --package-lock-only` pour le lock).
2. **`main` doit être vert** : `npm run check`, `npm test`, et les jobs CI
   `verify` + `android` au vert sur le dernier commit.
3. **Quota d'artefacts GitHub Actions** (plan free) : si un run récent a échoué
   sur `Artifact storage quota has been hit`, attendre le recalcul (6–12 h) ou
   purger les artefacts existants (Settings ou `gh api -X DELETE`).
   La rétention est courte (`retention-days: 1`) mais les échecs laissent des
   artefacts orphelins.
4. **Baselines visuelles à jour** : si l'UI a changé depuis la dernière release,
   run du workflow `Visual baselines` (voir ci-dessous).

## Le geste de release (3 commandes)

```bash
git checkout main && git pull
git tag v<version> main          # ex. v1.4.0 — crée le tag sur le main actuel
git push origin v<version>      # déclenche build.yml (on: push: tags: v*.*.*)
```

**Cas particulier d'un tag existant jamais publié** (run précédent échoué avant
publication — personne n'a rien téléchargé) :

```bash
git tag -f v<version> main
git push origin v<version> --force
```

Le `--force` sur un tag n'est acceptable QUE dans ce cas. Si une release a déjà
 été publiée avec ce tag, il faut une nouvelle version (semver), jamais déplacer le tag.

## Ce que fait le workflow `build.yml`

1. Matrice desktop (Windows/macOS/Linux) : `npm run dist:*` → installateurs.
2. Job Android : restauration du keystore release depuis les secrets
   (`ANDROID_KEYSTORE` en base64, + mots de passe/alias) puis `assembleRelease`
   signé release → APK renommé `cantoria-<version>-android.apk`.
   Sans secrets keystore, repli sur la signature debug avec avertissement.
3. Job `release` (attend `[build, android]`) : publie la GitHub Release avec les
   4 artefacts et les **notes auto-générées** (`generate_release_notes: true`).

Durée typique : 15–20 minutes.

## Vérifications post-release (checklist)

- [ ] La release GitHub contient bien **4 artefacts** : `.exe`, `.dmg`, `.AppImage`/`.deb`, `.apk`.
- [ ] L'APK s'appelle `cantoria-<version>-android.apk`.
- [ ] **Test sideload de bout en bout** : installer l'APK sur un émulateur/appareil
      où une version antérieure est déjà installée — l'app doit proposer la mise à
      jour au démarrage (`UpdateChecker` : la nouvelle version > l'ancienne), et
      l'installation par-dessus doit conserver les chansons (stockage privé + cache).
- [ ] Le README pointe vers la release (badges, section Téléchargements).
- [ ] Les chansons de test d'une install existante survivent à la mise à jour.

## Pièges rencontrés et leurs parades (v1.4.0)

| Piège | Parade |
|---|---|
| Tag poussé avant que `main` contienne tout | Vérifier `git log origin/main` avant le tag ; en cas de tag précoce non publié : `-f` + `--force` (ci-dessus) |
| Quota d'artefacts saturé → uploads échouent | Purge + attente du recalcul (6–12 h) ; rétention courte déjà en place |
| `npm ci` sans le binaire Electron en CI | Pas « Garantir le binaire » dans les workflows concernés |
| Un `git add visual-baseline` après un run visuel échoué commet des SUPPRESSIONS | Ne jamais committer les baselines à la main : uniquement via le workflow CI |

## Régénérer les baselines visuelles (au besoin)

GitHub → onglet **Actions** → **Visual baselines** → **Run workflow** :
- champ `scenarios` vide = tous les scénarios ;
- `player-portrait` = ciblé ;
- la CI committe les nouvelles références sur `main` (bot), le poste local
  n'écrit jamais dans `visual-baseline/`.

Règle : les baselines ne bougent qu'après un changement UI **validé** — jamais
pour « faire passer » un contrôle.
