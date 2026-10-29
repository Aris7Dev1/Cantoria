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

test("le manifest Android ne déclare aucune permission", () => {
  const manifest = read("app/src/main/AndroidManifest.xml");
  assert.ok(!/uses-permission/i.test(manifest),
    "décision PR #33 : aucune permission Android (stockage privé + SAF n'en exigent aucune)");
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
