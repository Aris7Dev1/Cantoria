#!/usr/bin/env node
/*
 * Installation debug de Cantoria sur Android (issue #54) — multiplateforme.
 *   1. copie cantoria.html vers les assets (source de vérité unique) ;
 *   2. lance gradlew installDebug (gradlew.bat sous Windows).
 * Prérequis : SDK Android (ANDROID_HOME ou local.properties), un émulateur
 * ou appareil connecté (adb devices).
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const src = path.join(root, "cantoria.html");
const dest = path.join(root, "android", "app", "src", "main", "assets", "cantoria.html");

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("cantoria.html copié vers les assets Android");

const androidDir = path.join(root, "android");
const isWindows = process.platform === "win32";
const gradlew = isWindows ? "gradlew.bat" : "./gradlew";
const gradlewPath = path.join(androidDir, gradlew);

if (!fs.existsSync(gradlewPath)) {
  console.error("Wrapper Gradle introuvable (" + gradlew + ") — le dépôt devrait le contenir.");
  process.exit(1);
}

const result = spawnSync(gradlew, ["installDebug"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: isWindows,
});

process.exit(result.status === null ? 1 : result.status);
