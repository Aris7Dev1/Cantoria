# Cantoria — version Electron

Application de bureau locale et hors-ligne basée sur votre `cantoria.html`.

## Inclus

- Windows : installateur NSIS `.exe`, x64 + arm64.
- macOS : `.dmg` + `.zip` pour l’auto-update, Intel + Apple Silicon.
- Linux : `.AppImage` + `.deb`, x64 + arm64.
- Icône de l'application : `.ico`, `.icns`, `.png`.
- Données des chansons conservées localement dans le profil Electron.
- Import/export par boîtes de dialogue natives.
- Sécurité Electron : `contextIsolation`, `sandbox`, `nodeIntegration: false`.
- Auto-update via **GitHub Releases** avec notification intégrée et redémarrage pour installer.
- Workflow GitHub Actions pour construire les trois plateformes et publier une Release.

## Installation locale

```bash
npm install
npm start
```

Vérification JavaScript :

```bash
npm run check
```

## Génération des installateurs

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Les fichiers sont créés dans `dist/`.

> Les builds natifs macOS doivent être générés sur macOS. Le workflow GitHub Actions fourni utilise un runner macOS pour cette cible.

## GitHub Releases et auto-update

Le projet utilise `electron-builder` + `electron-updater` avec le provider **GitHub**. Le build produit les métadonnées nécessaires à l'auto-update et la Release GitHub contient à la fois les installateurs et ces métadonnées. `electron-updater` déclenche ensuite les événements `update-available`, `download-progress` et `update-downloaded` ; Cantoria les transforme en bannière visible dans l'application.

### 1. Créer le dépôt

Créez un dépôt GitHub, par exemple :

```text
https://github.com/Aris7Dev1/Cantoria
```

Le workflow lit automatiquement le dépôt courant via `GITHUB_REPOSITORY` et exécute `npm run prepare:release` avant chaque build. Cela remplace les valeurs d'exemple du `package.json` par le propriétaire et le nom réels du dépôt.

### 2. Publier une version

Pour une version stable :

```bash
git add .
git commit -m "Préparer la version 1.2.0"
git tag v1.2.0
git push origin main --tags
```

Le workflow `.github/workflows/build.yml` :

1. construit Windows, macOS et Linux en parallèle ;
2. génère les fichiers de mise à jour ;
3. récupère les trois builds ;
4. crée ou met à jour la **GitHub Release `v1.2.0`** avec les assets ;
5. génère les notes de version GitHub.

GitHub Actions fournit automatiquement `GITHUB_TOKEN` au workflow avec la permission `contents: write`, ce qui permet à la publication de Release de fonctionner sans stocker de token personnel.

### 3. Côté utilisateur

Une application déjà installée vérifie les nouvelles versions au démarrage puis périodiquement. Avec `autoDownload: true`, le téléchargement se fait en arrière-plan ; la bannière indique la progression, puis propose **Redémarrer** lorsque la version est prête. Les événements de progression et de téléchargement sont fournis par `electron-updater`.

Le prochain démarrage installe également automatiquement une mise à jour déjà téléchargée lorsque la cible le permet. Pour un NSIS par utilisateur, l'installation au prochain lancement est supportée ; certaines cibles nécessitant une élévation peuvent demander l'installation explicitement, ce que le bouton **Redémarrer** prend en charge.

## Important : signature macOS et Windows

Pour macOS, **la signature de code est requise pour que l'auto-update fonctionne**. Le workflow est donc prêt à recevoir les secrets de signature, mais ne peut pas fournir une mise à jour macOS fiable tant que le certificat Developer ID n'est pas configuré.

Pour une distribution publique Windows/macOS, il est également recommandé de signer les binaires afin d'améliorer la vérification de l'éditeur par le système.

Secrets typiques à ajouter plus tard dans `Settings → Secrets and variables → Actions` :

```text
# Windows
WIN_CSC_LINK
WIN_CSC_KEY_PASSWORD

# macOS
MAC_CSC_LINK
MAC_CSC_KEY_PASSWORD
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

Le guide officiel electron-builder documente cette configuration de signature dans GitHub Actions.

## Configuration

`update-config.json` contient uniquement les paramètres de comportement :

```json
{
  "enabled": true,
  "checkIntervalMs": 21600000,
  "autoDownload": true
}
```

Le dépôt GitHub utilisé pour les mises à jour n'est pas stocké comme URL générique dans ce fichier : il est injecté dans `package.json` au moment du build CI via `scripts/prepare-release.js`. `electron-builder` écrit ensuite la configuration du provider dans les métadonnées de l'application packagée.

## Données utilisateur

Les chansons sont conservées dans le stockage local de l'application. Une mise à jour ne supprime pas ces données. La désinstallation conserve également les données utilisateur grâce à `deleteAppDataOnUninstall: false` côté NSIS.
