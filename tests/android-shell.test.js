const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const ANDROID = path.join(ROOT, "android");
const PRELOAD = fs.readFileSync(path.join(ROOT, "preload.js"), "utf8");

function read(p) {
  return fs.readFileSync(path.join(ANDROID, p), "utf8");
}

/* Contrat : le shim Android doit exposer exactement les mêmes méthodes que
   preload.js (window.carnetDesktop), pour que cantoria.html — non modifié —
   se comporte à l'identique sur les deux plateformes. */
function exposedMethodNames(source) {
  const m = /exposeInMainWorld\("carnetDesktop",\s*Object\.freeze\(\{([\s\S]*?)\}\)\)/.exec(source);
  assert.ok(m, "l'objet gelé carnetDesktop doit être trouvé");
  return new Set([...m[1].matchAll(/^\s*([A-Za-z_$][\w$]*):/gm)].map((x) => x[1]));
}

function shimMethodNames(source) {
  const m = /window\.carnetDesktop = Object\.freeze\(\{([\s\S]*)\}\);\s*\}\)\(\);/.exec(source);
  assert.ok(m, "l'objet gelé carnetDesktop du shim doit être trouvé");
  return new Set([...m[1].matchAll(/^\s*([A-Za-z_$][\w$]*):/gm)].map((x) => x[1]));
}

test("le shim Android expose le même contrat carnetDesktop que preload.js", () => {
  const shim = read("app/src/main/assets/android-shim.js");
  const desktop = exposedMethodNames(PRELOAD);
  const android = shimMethodNames(shim);
  for (const name of desktop) {
    assert.ok(android.has(name), `méthode absente du shim Android : ${name}`);
  }
});

test("le pont natif Kotlin couvre les méthodes critiques du shim", () => {
  const bridge = read("app/src/main/java/fr/cantoria/app/CantoriaBridge.kt");
  ["platform", "getAppVersion", "setScrolling", "writeDailyBackup", "openDocument",
   "takeOpenedDocument", "saveJson"].forEach((name) => {
    assert.ok(new RegExp(`@JavascriptInterface[\\s\\S]*?fun ${name}\\(`).test(bridge),
      `le pont Kotlin doit exposer ${name}`);
  });
});

test("le manifest Android ne déclare que la permission INTERNET justifiée", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  const perms = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"\s*\/>/g)].map((m) => m[1]);
  assert.deepEqual(perms, ["android.permission.INTERNET"],
    "seule INTERNET (UpdateChecker, issue #57) : le stockage privé + SAF n'exigent rien");
  assert.ok(/exception r\u00e9seau de VISION/.test(manifest),
    "la permission est justifiée par l'exception réseau de VISION");
});

test("la sécurité WebView suit §4.5 du document Android", () => {
  const main = read("app/src/main/java/fr/cantoria/app/MainActivity.kt");
  assert.ok(/allowFileAccess = false/.test(main), "allowFileAccess désactivé");
  assert.ok(/allowContentAccess = false/.test(main), "allowContentAccess désactivé");
  assert.ok(/allowUniversalAccessFromFileURLs = false/.test(main),
    "pas d'accès universel depuis file:// (§4.5)");
  assert.ok(/MIXED_CONTENT_NEVER_ALLOW/.test(main), "contenu mixte interdit");
  assert.ok(!/setAllowFileAccessFromFileURLs\s*=\s*true/.test(main));
});

test("le debugging WebView est réservé au mode debuggable", () => {
  const main = read("app/src/main/java/fr/cantoria/app/MainActivity.kt");
  const m = /isDebuggable[\s\S]{0,200}WebView\.setWebContentsDebuggingEnabled\(true\)/.exec(main);
  assert.ok(m, "setWebContentsDebuggingEnabled doit être gardé par FLAG_DEBUGGABLE du manifest");
  assert.ok(/FLAG_DEBUGGABLE/.test(main), "le garde lit le flag du manifest (pas BuildConfig)");
});

test("la rotation ne recharge pas la WebView (configChanges)", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.ok(/android:configChanges="[^"]*orientation[^"]*"/.test(manifest),
    "orientation gérée sans recréation d'activité");
  assert.ok(/screenSize/.test(manifest), "screenSize inclus dans configChanges");
});

test("cantoria.html n'est pas dupliqué à la main : copié au build", () => {
  const gradle = read("app/build.gradle");
  assert.ok(/from rootProject\.file\('\.\.\/cantoria\.html'\)/.test(gradle),
    "le build copie cantoria.html depuis la racine (source de vérité unique)");
  /* On vérifie l'état VERSIONNÉ (git ls-files), pas la présence physique :
     un poste de dev qui a déjà lancé android:install possède la copie de build
     sur son disque — c'est normal, elle ne doit juste pas être commitée. */
  const listed = spawnSync("git", ["ls-files", "android/app/src/main/assets/cantoria.html"],
    { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  assert.equal(listed, "",
    "cantoria.html ne doit pas être versionné dans les assets (copie au build uniquement)");
});

test("l'icône launcher existe aux 5 densités Android", () => {
  for (const dpi of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const p = path.join(ANDROID, "app/src/main/res", `mipmap-${dpi}`, "ic_launcher.png");
    assert.ok(fs.existsSync(p), `ic_launcher.png manquante en mipmap-${dpi}`);
    assert.ok(fs.statSync(p).size > 100, `ic_launcher-${dpi} semble vide`);
  }
});

test("la version Gradle est pilotée par package.json", () => {
  const gradle = read("app/build.gradle");
  assert.ok(/package\.json/.test(gradle), "versionName/versionCode lus depuis package.json");
});

test("le script de capture adb existe et écrit dans visual-out/android", () => {
  const script = fs.readFileSync(path.join(ROOT, "scripts/android/screenshot.sh"), "utf8");
  assert.ok(/screencap/.test(script), "capture via adb screencap");
  assert.ok(/visual-out\/android/.test(script), "sortie dans visual-out/android/");
});

test("le pont Kotlin valide les tailles (20 Mo) avant toute écriture", () => {
  const bridge = read("app/src/main/java/fr/cantoria/app/CantoriaBridge.kt");
  assert.ok(/MAX_TRANSFER_BYTES/.test(bridge), "constante de taille max définie");
  const saveGuard = /fun saveJson\(json: String\): Boolean \{\s*if \(json\.toByteArray[\s\S]*?MAX_TRANSFER_BYTES\) return false/.exec(bridge);
  assert.ok(saveGuard, "saveJson vérifie la taille avant d'ouvrir le sélecteur");
  const backupGuard = /fun writeDailyBackup\(json: String\): Boolean \{\s*if \(json\.toByteArray[\s\S]*?MAX_TRANSFER_BYTES\) return false/.exec(bridge);
  assert.ok(backupGuard, "writeDailyBackup vérifie la taille avant d'écrire");
});

/* Issue #57 : mises à jour sideload GitHub Releases — cohérence du
   dispositif natif + WebView à zéro réseau. */
test("le UpdateChecker existe et respecte la discipline réseau", () => {
  const checker = read("app/src/main/java/fr/cantoria/app/UpdateChecker.kt");
  assert.ok(/api\.github\.com/.test(checker), "interroge GitHub Releases");
  assert.ok(/catch \(e: Exception\)/.test(checker) && /onError/.test(checker),
    "hors ligne : silencieux, jamais bloquant");
  assert.ok(/MAX_JSON_BYTES/.test(checker), "taille de réponse bornée (metadata uniquement)");
});

test("la permission INTERNET est déclarée et justifiée (exception réseau unique VISION)", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  const m = /<uses-permission android:name="android.permission.INTERNET" \//.exec(manifest);
  assert.ok(m, "permission INTERNET déclarée (UpdateChecker uniquement)");
  assert.ok(/EXCLUSIVEMENT au UpdateChecker/.test(manifest) || /exclusivement au UpdateChecker/.test(manifest),
    "justification documentée dans le manifest");
});

test("la WebView reste à zéro appel réseau (pas de fetch dans le HTML ni le shim)", () => {
  const html = fs.readFileSync(path.join(ROOT, "cantoria.html"), "utf8");
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  assert.ok(!/\bfetch\s*\(/.test(script) && !/XMLHttpRequest/.test(script),
    "cantoria.html : aucun appel réseau (garantie existante)");
  const shim = read("app/src/main/assets/android-shim.js");
  assert.ok(!/\bfetch\s*\(/.test(shim) && !/XMLHttpRequest/.test(shim),
    "shim : aucun appel réseau — le natif notifie par CustomEvent");
});

test("le test semver Kotlin couvre les cas limites (1.2.10 > 1.2.9)", () => {
  const test = read("app/src/test/java/fr/cantoria/app/UpdateCheckerTest.kt");
  assert.ok(/1\.2\.10/.test(test) && /1\.2\.9/.test(test),
    "le cas numériquement correct est testé (pas lexicographique)");
  assert.ok(/junit/.test(read("app/build.gradle")), "JUnit branché dans Gradle");
});

/* Issue #58 : CI de build APK + attachement aux releases. */
test("la CI construit l'APK Android sur chaque PR", () => {
  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.ok(/android:/.test(ci), "job android présent dans ci.yml");
  assert.ok(/assembleDebug testDebugUnitTest/.test(ci),
    "build debug + tests Kotlin à chaque PR");
});

test("la release attache l'APK nommé d'après la version de package.json", () => {
  const build = fs.readFileSync(path.join(ROOT, ".github/workflows/build.yml"), "utf8");
  assert.ok(/Build Android APK/.test(build), "job de build APK dans build.yml");
  assert.ok(/cantoria-\$\{VERSION\}-android\.apk/.test(build),
    "nommage cantoria-<version>-android.apk");
  assert.ok(/needs: \[build, android\]/.test(build),
    "la release attend l'APK Android en même temps que le desktop");
  assert.ok(/assembleRelease/.test(build), "APK release (signé debug faute de keystore)");
});

/* Signature release de l'APK (keystore superviseur) : le keystore vient des
   secrets CI ou d'un fichier local, JAMAIS du dépôt, et le repli debug reste
   explicite. */
test("le build release signe avec un keystore externe, jamais committé", () => {
  const gradle = read("app/build.gradle");
  assert.ok(/signingConfigs\s*\{\s*release\s*\{/.test(gradle), "signingConfig release déclaré");
  assert.ok(/keystoreFile/.test(gradle) && /signingConfig signingConfigs\.release/.test(gradle),
    "le release utilise le signingConfig release quand un keystore est trouvé");
  assert.ok(/AVERTISSEMENT[\s\S]*signingConfig signingConfigs\.debug/.test(gradle),
    "sans keystore, repli explicite sur la clé debug avec avertissement");
  assert.ok(!/storePassword\s+["'][^"']+["']/.test(gradle),
    "aucun mot de passe en clair dans le build.gradle (env/property uniquement)");
  const gitignore = fs.readFileSync(path.join(ROOT, "android", ".gitignore"), "utf8");
  assert.ok(/\*\.jks/.test(gitignore) && /\*\.keystore/.test(gitignore),
    "*.jks et *.keystore gitignorés : aucun keystore dans le dépôt");
});

test("la CI restaure le keystore depuis les secrets avant assembleRelease", () => {
  const build = fs.readFileSync(path.join(ROOT, ".github/workflows/build.yml"), "utf8");
  assert.ok(/secrets\.ANDROID_KEYSTORE/.test(build), "secret ANDROID_KEYSTORE (base64) utilisé");
  assert.ok(/base64 -d > app\/build\/keystore\/cantoria-release\.jks/.test(build),
    "keystore restauré dans app/build (gitignoré), jamais à la racine du dépôt");
  assert.ok(/ANDROID_KEYSTORE_PASSWORD: \$\{\{ secrets\.ANDROID_KEYSTORE_PASSWORD/.test(build) &&
            /ANDROID_KEY_ALIAS: \$\{\{ secrets\.ANDROID_KEY_ALIAS/.test(build) &&
            /ANDROID_KEY_PASSWORD: \$\{\{ secrets\.ANDROID_KEY_PASSWORD/.test(build),
    "mots de passe/alias passés au job Gradle via env depuis les secrets");
  const restoreIdx = build.indexOf("Restore release keystore");
  const gradleIdx = build.indexOf("assembleRelease");
  assert.ok(restoreIdx !== -1 && gradleIdx !== -1 && restoreIdx < gradleIdx,
    "la restauration du keystore précède assembleRelease");
});

/* Régression du crash de compilation Kotlin en CI : un seul companion
   object par classe (le double héritait des empilements de branches). */
test("MainActivity ne déclare qu'un seul companion object", () => {
  const main = read("app/src/main/java/fr/cantoria/app/MainActivity.kt");
  const count = (main.match(/companion object \{/g) || []).length;
  assert.equal(count, 1, "un seul companion object autorisé en Kotlin");
  assert.ok(/const val GITHUB_OWNER/.test(main), "les constantes GitHub sont dans le companion");
});

/* Régression du crash des tests JUnit : le constructeur d'UpdateChecker ne
   doit toucher aucune classe Android framework (Looper/Handler) — sinon
   RuntimeException en test JVM local. */
test("UpdateChecker reste constructible en JVM pure (Handler paresseux)", () => {
  const checker = read("app/src/main/java/fr/cantoria/app/UpdateChecker.kt");
  const ctor = /class UpdateChecker\([\s\S]*?\)\s*\{([\s\S]*?)\n    companion object/.exec(checker);
  assert.ok(ctor, "corps du constructeur trouvé");
  assert.ok(!/Handler\(/.test(ctor[1].split("fun handler()")[0].split("private fun")[0]),
    "aucun Handler créé au niveau du champ/construction — uniquement via handler()");
  assert.ok(/fun handler\(\): Handler \{/.test(checker), "création paresseuse par handler()");
});

/* Régression du versionCode : la concaténation simple des chiffres
   (1.4.0 -> 140) cassait la croissance entre releases et restait sous
   l'ancien fallback 10300. Formule : segments paddés sur 2 chiffres. */
test("le versionCode Android est calculé par segments paddés (croissant)", () => {
  const gradle = read("app/build.gradle");
  assert.ok(/code = code \* 100 \+/.test(gradle),
    "formule par segments (×100 par segment) présente");
  assert.ok(!/replaceAll\('\[\^0-9\]', ''\)/.test(gradle),
    "l'ancienne concaténation simple est retirée");
});

/* CI visuelle (décision superviseur, vague 1 full-cloud) : le workflow
   de régénération des baselines existe et ne committe QUE sur dispatch. */test("le workflow visual-baselines existe et protège les références", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/visual-baselines.yml"), "utf8");
  assert.ok(/workflow_dispatch/.test(wf), "déclenchement manuel (jamais automatique)");
  assert.ok(/Committer les baselines \(dispatch uniquement\)/.test(wf),
    "le commit des baselines est réservé au dispatch explicite");
  assert.ok(/if: github.event_name == 'workflow_dispatch'/.test(wf),
    "garde if sur le commit");
  assert.ok(/Garde anti-suppression/.test(wf),
    "garde anti-suppression sur les PR (piège EPERM)");
});

/* Régression de la baseline irréaliste (retour test #64) : les fixtures
   visuelles doivent répliquer les défauts de l'app, sinon le réglage
   seedé écrase controlsCompactMobile par undefined et la capture mobile
   montre un état que l'app réelle n'a jamais. */
test("les fixtures visuelles répliquent les réglages par défaut (bandeau replié)", () => {
  const fixtures = fs.readFileSync(path.join(ROOT, "scripts/visual/fixtures.js"), "utf8");
  assert.ok(/controlsCompactMobile: true/.test(fixtures),
    "controlsCompactMobile seedé à true (défaut de l'app)");
  assert.ok(/controlsPinned: true/.test(fixtures), "controlsPinned seedé à true");
});

/* Issue #75 : le workflow du juge A/B existe, ne bloque jamais, et
   consomme la clé depuis les secrets (jamais en clair). */
test("le workflow visual-judge existe et poste un verdict consultatif", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/visual-judge.yml"), "utf8");
  assert.ok(/paths:/.test(wf) && /cantoria\.html/.test(wf), "déclenché sur les PR UI uniquement");
  assert.ok(/secrets\.MISTRAL_API_KEY/.test(wf), "clé via les secrets GitHub");
  assert.ok(/pr comment/.test(wf), "verdict posté en commentaire de PR");
  assert.ok(/\|\| true/.test(wf) || /consultatif/.test(wf), "le juge ne fait jamais échouer la PR");
});
