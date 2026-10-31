---
name: cantoria-android-change
description: "Charger cette skill pour toute modification côté Android de Cantoria (coquille Kotlin, pont, shim, manifest, gradle, icônes) : contrats du pont carnetDesktop, pièges WebView (CSP, DOM storage, minWidth), CI android, tests."
---

# Modifier la coquille Android

L'interface (`cantoria.html`) est **unique** — Android l'embarque via `android/` (décisions PR #33, roadmap #54-#58). Le pont JS `window.carnetDesktop` a le même contrat que `preload.js` desktop, adapté par le shim (`android/app/src/main/assets/android-shim.js`).

## Les contrats et leurs pièges vécus

- **CSP de cantoria.html** (`script-src 'unsafe-inline'`) **bloque toute balise `<script src>`** : le shim est injecté par **contenu** via `evaluateJavascript` dans `onPageStarted` (jamais par `src`, jamais par `document.head` qui n'existe pas encore — bug d'import #63).
- **`localStorage` est null en WebView** tant que `setDomStorageEnabled(true)` n'est pas posé — crash « Cannot read properties of null » (bug #63).
- **DOM storage + SAF** ne nécessitent aucune permission ; **toute permission Android** (`AndroidManifest.xml`) exige validation superviseur explicite (précédent : `INTERNET` pour #57, justification dans le manifest).
- **Écriture atomique** du fichier bibliothèque : `.tmp` + `renameTo` (jamais de carnet à moitié écrit — `CantoriaBridge.saveLibrary`).
- **Événements natifs** : le Kotlin notifie la WebView par `CustomEvent` (ex. `android-update-available`), le shim les traduit en callbacks `carnetDesktop` — le HTML reste sans modification.
- **Interactions système (SAF)** : état `"pending"` jamais consommé au polling (bug d'import silencieux #63) ; champs partagés UI/pont JS : `@Volatile`.
- **Signature** : APK signé debug (pas de keystore) — documenté en dette ; le jour d'un keystore release, les utilisateurs désinstalleront/réinstalleront une fois.

## Vérifier côté Android

- Tests jsdom statiques (`tests/android-shell.test.js`, `storage-adapter.test.js`) : lisent Kotlin/Gradle/YAML — couvrent manifest, permissions, pont, workflows.
- **JUnit** (`android/app/src/test/`) : tournent en CI via `./gradlew test`, PAS via `npm test` (leçon : `Handler(Looper…)` au constructeur casse les tests JVM — création paresseuse).
- La CI `android` (job de `ci.yml`) compile + teste + construit l'APK sur chaque PR : c'est elle qui prouve.
- Émulateur du superviseur : le test d'usage réel (import/export, mise à jour, rotation) — seul environnement qui voit CSP et DOM storage réels.

## Commandes

```bash
npm run android:install   # copie cantoria.html aux assets + gradlew installDebug
```

## Après un changement de pont

Toujours vérifier que `chrome://inspect` reste propre (Console sans erreur CSP), que `window.carnetDesktop` répond, et que l'aller-retour import→persistance→reboot fonctionne sur émulateur.
