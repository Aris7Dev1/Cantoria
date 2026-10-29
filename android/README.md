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

## Stockage (issue #56)

Sur Android, le carnet vit dans un **fichier privé** de l'app
(`filesDir/cantoria-library.json`) via le pont (`saveLibrary`/`loadLibrary`),
plus de quota `localStorage` (~5 Mo). Comportement :

- au démarrage, le fichier est prioritaire ; s'il n'existe pas, le carnet
  `localStorage` (état migré depuis une install antérieure) est **migré
  vers le fichier** — sans jamais être vidé (il reste un cache synchronisé) ;
- écriture **atomique** (`.tmp` + `renameTo`) : jamais de carnet à moitié écrit ;
- un contenu illisible part en copie de secours, comme sur desktop ;
- échec d'écriture : alerte persistante + le cache conserve la version.

## Hors périmètre actuel (roadmap #57-#58)

- responsive portrait / cibles 44 px (#55)
- stockage fichier + migration (#56)
- mises à jour via GitHub Releases (#57)
- CI de build APK (#58)
