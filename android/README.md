# Cantoria — coquille Android (WebView)

Application Android minimale (décisions PR #33 : option B « WebView native »)
affichant `cantoria.html` — le même fichier que le desktop, embarqué dans les
assets au build, **sans modification**.

## Build et installation

```bash
npm run android:install        # copie cantoria.html vers les assets + gradlew installDebug
```

Prérequis : un JDK 17 (Android Studio en embarque un — définis `JAVA_HOME`
vers lui si `java` n'est pas dans ton PATH), le SDK Android 34, et un
émulateur API 26+ ou un appareil connecté (`adb devices`). Le wrapper Gradle
(`gradlew` / `gradlew.bat`) est versionné dans le dépôt : au premier lancement,
il télécharge Gradle 8.7 automatiquement, rien à installer.

## Tester le rendu (équivalent du test desktop)

1. **Inspection DOM** : sur un build debug, la WebView est inspectable.
   Ouvre Chrome/Edge sur ton PC → `chrome://inspect` → clique sur « Cantoria ».
   Tu retrouves l'inspecteur (DOM, console, réseau) exactement comme sur le
   desktop avec `--remote-debugging-port=9222`.
2. **Captures d'écran** :
   ```bash
   scripts/android/screenshot.sh ma-capture    # → visual-out/android/ma-capture.png
   ```
3. **ChromeOS** : l'APK Android s'installe sur Chromebook (ARC). Teste en
   fenêtre redimensionnée pour le mode tablette.

## Architecture

- `MainActivity.kt` : WebView plein écran, sécurité §4.5 (`allowFileAccess`
  false, pas de contenu externe, zéro permission), rotation sans rechargement,
  debugging `chrome://inspect` **en debug uniquement**.
- `CantoriaBridge.kt` : pont JS exposé sous `window.cantoriaAndroid` —
  équivalent `preload.js` du desktop (import/export SAF, sauvegarde quotidienne
  dans `filesDir/backups` rétention 30 j, maintien de l'écran pendant le
  défilement, version). Chaque méthode valide ses entrées, taille max 20 Mo.
- `assets/android-shim.js` : adaptateur `cantoriaAndroid` → `window.carnetDesktop`
  (le contrat attendu par l'interface), injecté à chaque chargement de page.
  `cantoria.html` ne sait pas qu'il tourne sur Android.

## Mises à jour (issue #57)

Vérification au démarrage via **GitHub Releases** (décision PR #33 :
sideload, pas de Play Store) — équivalent d'`electron-updater` desktop :

- le **processus natif** (`UpdateChecker.kt`) interroge la dernière
  release GitHub — seule exception réseau, la WebView reste à zéro
  appel (permission INTERNET justifiée dans le manifest) ;
- une version plus récente (semver numérique : 1.2.10 > 1.2.9) est
  notifiée à l'interface par `CustomEvent` → bandeau in-app, jamais de
  téléchargement forcé ;
- hors ligne : **silencieux** (aucun bandeau, aucun crash) ;
- l'installation reste un geste utilisateur (téléchargement de l'APK
  depuis la release GitHub, « sources inconnues ») — le téléchargement
  automatique + intent d'installation arrivent avec l'issue #58 (CI de
  release).

## Distribution (issue #58)

- **Sur chaque PR** : le job `android` de la CI construit l'APK debug et
  exécute les tests Kotlin — un `android/` cassé bloque le merge.
- **Sur chaque tag `v*.*.*`** : `build.yml` construit l'APK **release**
  (signé debug à défaut de keystore — décision superviseur « pas pour
  l'instant »), le nomme `cantoria-<version>-android.apk` (version lue
  dans `package.json`) et l'attache à la GitHub Release aux côtés des
  installers desktop.
- **Installation utilisateur (sideload)** : télécharger l'APK depuis la
  release → ouvrir → autoriser « sources inconnues » → installer par-dessus
  l'app existante (les chansons sont conservées : stockage privé + cache).
- L'app installée détecte les nouvelles versions au démarrage (issue #57)
  et propose de télécharger le nouvel APK.

## Hors périmètre actuel

- responsive portrait / cibles 44 px (#55)
- stockage fichier + migration (#56)
- mises à jour via GitHub Releases (#57)
- CI de build APK (#58)
