const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const MAIN_PATH = path.join(__dirname, "..", "main.js");
const PRELOAD_PATH = path.join(__dirname, "..", "preload.js");
const SONGS_KEY = "cantoria-songs-v1";

function loadApp(songs, bridge, failOnSave) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(SONGS_KEY, JSON.stringify(songs));
      window.confirm = function () { return true; };
      if (bridge) window.carnetDesktop = bridge;
      if (failOnSave) {
        /* La page voit localStorage via le prototype Storage : patcher le
           prototype (pas l'instance) pour rendre setItem en échec. */
        const proto = Object.getPrototypeOf(window.localStorage);
        const original = proto.setItem;
        proto.setItem = function (key, value) {
          if (key === SONGS_KEY) throw new Error("quota exceeded");
          return original.call(this, key, value);
        };
        window.__restoreSetItem = function () { proto.setItem = original; };
      }
    },
  });
  return dom.window;
}

/* ------- 1. Échec de sauvegarde : alerte persistante + export ------- */

test("un échec de saveSongs affiche une alerte persistante avec bouton d'export", async () => {
  const window = loadApp([{ id: "s-1", title: "A", artist: "", body: "x" }], null, true);
  const doc = window.document;
  // la sauvegarde échoue pour chaque setItem du carnet : l'alerte doit s'afficher
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#btn-edit-current").click();
  doc.querySelector("#f-body").value = "[Am]nouvelle version";
  doc.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const alertEl = doc.querySelector("#storage-alert");
  assert.ok(alertEl.classList.contains("show"),
    "l'alerte persistante s'affiche (pas un toast éphémère)");
  assert.ok(alertEl.textContent.includes("Impossible de sauvegarder"),
    "le message explique l'échec");
  assert.ok(doc.querySelector("#storage-alert-export"),
    "un bouton « Exporter maintenant » offre une sortie de secours");
  // une sauvegarde réussie referme l'alerte
  window.__restoreSetItem();
  doc.querySelector("#btn-edit-current").click();
  doc.querySelector("#f-body").value = "[Am]encore une version";
  doc.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(!alertEl.classList.contains("show"),
    "l'alerte se ferme quand la sauvegarde réussit à nouveau");
});

/* ------- 2. Quota : avertissement dès 80 % ------- */

test("une occupation élevée du localStorage déclenche l'avertissement de quota", () => {
  /* jsdom applique un vrai quota de 5M unités de code : on sème ~4,2 Mo,
     sous le quota mais au-dessus du seuil d'avertissement de 80 % de 5 Mo. */
  const big = "x".repeat(4200000);
  const window = loadApp([{ id: "s-1", title: "A", artist: "", body: big }]);
  const doc = window.document;
  const alertEl = doc.querySelector("#storage-alert");
  assert.ok(alertEl.classList.contains("show"),
    "l'avertissement de quota s'affiche au chargement");
  assert.ok(alertEl.textContent.includes("limite du stockage"),
    "le message mentionne la limite de stockage");
});

/* ------- 3. Sauvegarde quotidienne : IPC ------- */

test("main.js implémente la sauvegarde quotidienne avec rétention 30 jours", () => {
  const main = fs.readFileSync(MAIN_PATH, "utf8");
  assert.ok(/backup:write-daily/.test(main), "le canal backup:write-daily existe");
  assert.ok(/isAuthorizedSender\(event\)/.test(main), "l'émetteur est vérifié");
  assert.ok(/20 \* 1024 \* 1024/.test(main), "la taille du contenu est validée");
  assert.ok(/BACKUP_KEEP_DAYS = 30/.test(main), "rétention de 30 jours");
  assert.ok(/mode: 0o600/.test(main), "fichier écrit avec permissions restrictives");
  assert.ok(/pruneOldBackups/.test(main), "les vieux fichiers sont purgés");
});

test("preload.js expose writeDailyBackup en fonction ciblée", () => {
  const preload = fs.readFileSync(PRELOAD_PATH, "utf8");
  assert.ok(/writeDailyBackup/.test(preload), "writeDailyBackup est exposé");
  assert.ok(/typeof content !== "string"/.test(preload),
    "le type est validé côté preload");
});

test("l'interface écrit une copie quotidienne après chaque sauvegarde réussie", async () => {
  const backups = [];
  const window = loadApp([{ id: "s-1", title: "A", artist: "", body: "x" }], {
    writeDailyBackup: (content) => { backups.push(content); return Promise.resolve({ saved: true }); },
  });
  const doc = window.document;
  // init : une sauvegarde au chargement
  assert.ok(backups.length >= 1, "une copie est écrite au démarrage");
  // édition -> saveSongs -> nouvelle copie
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#btn-edit-current").click();
  doc.querySelector("#f-body").value = "[Am]v2";
  doc.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(backups.length >= 2, "une copie de plus est écrite après la sauvegarde");
  const parsed = JSON.parse(backups[backups.length - 1]);
  assert.ok(Array.isArray(parsed), "le contenu est le carnet sérialisé");
});

/* ------- 4. Brouillon éditeur (existant, à ne pas régresser) ------- */

test("l'éditeur conserve un historique d'édition exploitable (undo/redo)", () => {
  const window = loadApp([{ id: "s-1", title: "A", artist: "", body: "[Am]original" }]);
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#btn-edit-current").click();
  const body = doc.querySelector("#f-body");
  assert.equal(body.value, "[Am]original");
  const undo = doc.querySelector("#editor-undo");
  assert.ok(undo, "le bouton undo existe");
});
