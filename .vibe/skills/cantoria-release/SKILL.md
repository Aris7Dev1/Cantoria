---
name: cantoria-release
description: "Charger cette skill pour préparer et publier une release Cantoria : bump de version, tag annoté, push, audit de l'historique et suivi de la CI."
---

# Publier une release Cantoria

Le workflow `.github/workflows/build.yml` se déclenche sur les tags `v*.*.*`. **Sans tag, pas de release.** La procédure complète et ses pièges : `docs/procedure-release.md` — cette skill en est le résumé opératoire.

**La release est multi-plateforme depuis la v1.4.0** : Windows, macOS, Linux **et l'APK Android** (`cantoria-<version>-android.apk`, joint à la même release GitHub).

## Procédure

1. **Vérifier** : `npm run check` et `npm test` passent sur `main`.
2. **Auditer l'historique** (leçon apprise : un fichier commité reste dans l'historique même supprimé du dépôt) :
   ```bash
   git log --all --diff-filter=A --name-only --format='%h %s'
   ```
   Aucun fichier sensible (contenu sous copyright, secrets, données personnelles) ne doit y figurer. En cas de doute, purger **avant** de taguer (voir « Purger un fichier de l'historique »).
3. **Bumper la version** dans `package.json` (décision du superviseur — zone protégée) : source de vérité UNIQUE — desktop, Android (`versionName` + `versionCode` par segments : `1.4.0` → `10400`) et nom d'APK en dérivent. Régénérer le lock (`npm install --package-lock-only`).
4. **Commiter** : `git commit -m "Cantoria X.Y.Z — <résumé>"`.
5. **Taguer** (annoté — le pattern `v*.*.*` du workflow doit matcher) :
   ```bash
   git tag -a vX.Y.Z -m "Cantoria X.Y.Z — <résumé>"
   ```
6. **Pousser** :
   ```bash
   git push <remote> main
   git push <remote> vX.Y.Z
   ```
   Le push du tag déclenche la CI : check + tests, builds Windows/macOS/Linux, publication de la release GitHub (artifacts + notes auto-générées).
7. **Suivre** : onglet Actions du dépôt (15–20 min), puis onglet Releases. Les 4 artefacts doivent être présents (`.exe`, `.dmg`, `.AppImage`/`.deb`, `.apk`).

**Pièges connus** (détails dans `docs/procedure-release.md`) :
- **Quota d'artefacts GitHub** (plan free) : si un run échoue sur `Artifact storage quota has been hit`, purger les artefacts et attendre le recalcul (6–12 h).
- **Tag existant non publié** (run précédent échoué avant publication) : déplacer le tag sur `main` avec un push forcé du tag — acceptable UNIQUEMENT si aucune release n'a été publiée avec ce tag.
- **Post-release** : installer l'APK sur un émulateur avec une version antérieure — l'UpdateChecker doit proposer la mise à jour et les chansons doivent survivre.

## Purger un fichier de l'historique (fichier sensible commité par erreur)

```bash
git clone --mirror <url-du-dépôt> /tmp/<dépôt>-mirror
cd /tmp/<dépôt>-mirror
git filter-repo --path "<chemin-du-fichier>" --invert-paths
# Désactiver temporairement la règle « Block force pushes » sur main
# (GitHub → Settings → Rules), puis :
git push --force origin main
# Réactiver la règle. Contacter le support GitHub pour purger les vues en cache du blob.
```

Les tags antérieurs au fichier restent valides (leurs commits ne le contiennent pas). La release publiée (artifacts + notes) n'est pas touchée si le fichier a été ajouté après le dernier tag.

## Règles

- Ne jamais taguer sans audit de l'historique.
- Ne jamais commiter le résultat de `npm run prepare:release` (il réécrit `package.json` pour la CI).
- La version et les sections `build`/`publish`/`appId` de `package.json` sont réservées au superviseur.
- `workflow_dispatch` (lancement manuel) publie une release sans versionnage propre : préférer le tag.
