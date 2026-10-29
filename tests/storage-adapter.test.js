const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const BACKUP_PREFIX = "cantoria-songs-v1-corrupted-";

const song = (over = {}) => Object.assign({
  id: "s-1", title: "Vivre ou survivre", artist: "Daniel Balavoine",
  body: "[Am]paroles [G]ici", speed: 1,
}, over);

/* Pont factice équivalent au CantoriaBridge Android (issue #56) :
   le carnet vit dans un "fichier" (chaîne en mémoire). */
function makeFileBridge(initial) {
  const state = { file: initial === undefined ? "" : initial, saves: 0, loads: 0, fail: false };
  return {
    state,
    carnetDesktop: {
      platform: "android",
      isElectron: false,
      saveLibrary: (json) => {
        if (state.fail) return Promise.resolve({ saved: false });
        state.file = json;
        state.saves++;
        return Promise.resolve({ saved: true });
      },
      loadLibrary: () => {
        state.loads++;
        return Promise.resolve(state.file);
      },
    },
  };
}

function loadApp(seed = {}, bridge) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
      window.confirm = () => true;
      if (bridge) window.carnetDesktop = bridge;
    },
  });
  return dom.window;
}

const tick = () => new Promise((r) => setTimeout(r, 60));

/* ------- Migration douce depuis localStorage (cœur de l'issue #56) ------- */

test("un carnet localStorage existant est migré vers le fichier au démarrage, sans perte ni purge", async () => {
  const bridge = makeFileBridge(); // fichier vide : premier lancement
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, bridge.carnetDesktop);
  await tick();
  const doc = window.document;
  // bibliothèque rendue depuis localStorage
  assert.ok(doc.querySelector(".song-card"), "la chanson migrée s'affiche");
  // le fichier a reçu le carnet
  assert.ok(bridge.state.file.includes("Vivre ou survivre"),
    "le carnet a été copié vers le fichier privé");
  // localStorage n'est JAMAIS vidé (principe n°1)
  assert.ok(window.localStorage.getItem(SONGS_KEY).includes("Vivre ou survivre"),
    "localStorage reste intact après la migration (cache conservé)");
  assert.ok(doc.querySelector("#toast").textContent.includes("migré") ||
    bridge.state.saves >= 1, "la migration est signalée");
});

test("le fichier est prioritaire sur localStorage au démarrage", async () => {
  const newer = JSON.stringify([song({ id: "s-2", title: "Version fichier" })]);
  const older = JSON.stringify([song({ id: "s-1", title: "Version localStorage" })]);
  const bridge = makeFileBridge(newer);
  const window = loadApp({ [SONGS_KEY]: older }, bridge.carnetDesktop);
  await tick();
  assert.ok(window.document.querySelector("#song-grid").textContent.includes("Version fichier"),
    "le fichier (plus récent) gagne");
  assert.ok(!window.document.querySelector("#song-grid").textContent.includes("Version localStorage"),
    "localStorage n'écrase pas le fichier");
});

test("sans pont, le comportement desktop est inchangé", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  await tick();
  assert.ok(window.document.querySelector(".song-card"), "chargement localStorage classique");
  // une édition écrit toujours dans localStorage
  window.document.querySelector(".song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]v2";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(window.localStorage.getItem(SONGS_KEY).includes("[Am]v2"),
    "sauvegarde localStorage inchangée sans pont");
});

test("l'édition passe par le fichier quand le pont est présent (localStorage = cache)", async () => {
  const bridge = makeFileBridge(JSON.stringify([song()]));
  const window = loadApp({}, bridge.carnetDesktop);
  await tick();
  window.document.querySelector(".song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]version fichier";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  assert.ok(bridge.state.file.includes("[Am]version fichier"),
    "l'édition est écrite dans le fichier privé");
  assert.ok(window.localStorage.getItem(SONGS_KEY).includes("[Am]version fichier"),
    "localStorage reste synchronisé (cache)");
});

test("un fichier illisible part en copie de secours, localStorage reprend la main", async () => {
  const bridge = makeFileBridge("pas du json");
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, bridge.carnetDesktop);
  await tick();
  // la chanson localStorage s'affiche malgré le fichier corrompu
  assert.ok(window.document.querySelector(".song-card"),
    "localStorage sauve la mise quand le fichier est illisible");
  // le fichier corrompu a été conservé en copie de secours
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k);
  }
  assert.ok(keys.some((k) => window.localStorage.getItem(k) === "pas du json"),
    "le contenu illisible du fichier est conservé en copie de secours");
});

test("échec d'écriture fichier : alerte persistante, pas de perte silencieuse", async () => {
  const bridge = makeFileBridge(JSON.stringify([song()]));
  const window = loadApp({}, bridge.carnetDesktop);
  await tick();
  bridge.state.fail = true;
  window.document.querySelector(".song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]v3";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  const alertEl = window.document.querySelector("#storage-alert");
  assert.ok(alertEl.classList.contains("show"),
    "l'alerte persistante s'affiche quand le fichier refuse l'écriture");
  // localStorage conserve quand même la version (cache) : pas de perte
  assert.ok(window.localStorage.getItem(SONGS_KEY).includes("[Am]v3"),
    "le cache localStorage conserve la version malgré l'échec fichier");
});

/* ------- Aller-retour JSON (critère #56) ------- */

test("aller-retour : carnet migré puis réexporté identique", async () => {
  const original = [song(), song({ id: "s-2", title: "La corrida", artist: "Francis Cabrel", body: "[G]autre [D]chanson" })];
  const bridge = makeFileBridge();
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(original) }, bridge.carnetDesktop);
  await tick();
  // le fichier contient exactement le carnet (re-parse et compare)
  const roundTrip = JSON.parse(bridge.state.file);
  assert.equal(roundTrip.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.equal(roundTrip[i].title, original[i].title);
    assert.equal(roundTrip[i].artist, original[i].artist);
    assert.equal(roundTrip[i].body, original[i].body);
  }
});

/* ------- Cohérence du pont Kotlin et du shim (statique) ------- */

test("CantoriaBridge expose saveLibrary/loadLibrary avec garde de taille", () => {
  const bridge = fs.readFileSync(path.join(__dirname, "..", "android/app/src/main/java/fr/cantoria/app/CantoriaBridge.kt"), "utf8");
  assert.ok(/@JavascriptInterface\s*\n\s*fun saveLibrary\(json: String\): Boolean/.test(bridge),
    "saveLibrary exposé au pont");
  assert.ok(/fun loadLibrary\(\): String/.test(bridge), "loadLibrary exposé au pont");
  assert.ok(/MAX_TRANSFER_BYTES\) return false/.test(bridge), "garde de taille avant écriture");
  assert.ok(/\.tmp/.test(bridge) && /renameTo/.test(bridge),
    "écriture atomique (tmp + rename) : jamais de carnet à moitié écrit");
});

test("le shim expose saveLibrary/loadLibrary dans carnetDesktop", () => {
  const shim = fs.readFileSync(path.join(__dirname, "..", "android/app/src/main/assets/android-shim.js"), "utf8");
  assert.ok(/saveLibrary: function/.test(shim), "saveLibrary dans le contrat carnetDesktop");
  assert.ok(/loadLibrary: function/.test(shim), "loadLibrary dans le contrat");
  assert.ok(/typeof content !== "string"/.test(shim), "validation du type côté shim");
});
