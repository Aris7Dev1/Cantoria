const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/* Les confirmations passent par la modale HTML asynchrone (issue #46) :
   cliquer le déclencheur, confirmer si la modale s'ouvre, laisser se dérouler
   les promesses, puis reprendre les assertions. */
async function confirmAndFlush(window, trigger) {
  trigger.click();
  const overlay = window.document.querySelector("#confirm-overlay");
  if (overlay.classList.contains("show")) {
    window.document.querySelector("#confirm-ok").click();
  }
  await Promise.resolve();
  await Promise.resolve();
}


const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const EDIT_BACKUP_PREFIX = "cantoria-edit-backup-";

function loadApp(seed = {}) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      for (const [key, value] of Object.entries(seed)) {
        window.localStorage.setItem(key, value);
      }
      window.confirm = function () { return true; };
    },
  });
  return dom.window;
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "Artiste", body: "[Am]Original", speed: 1 }, overrides);
}

function editBackupKeys(window) {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.indexOf(EDIT_BACKUP_PREFIX) === 0) keys.push(k);
  }
  return keys.sort();
}

function openSettings(window) {
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector("#btn-manage-backups").click();
}

test("les paramètres listent les copies de secours d'édition avec titre et bouton Restaurer", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  // produire une copie en modifiant la chanson
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]Nouvelle version";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  openSettings(window);
  const rows = window.document.querySelectorAll("#edit-backup-list .setting-row");
  assert.equal(rows.length, 1, "une copie d'édition listée");
  assert.ok(rows[0].textContent.includes("Test"), "le titre de la chanson apparaît");
  const restoreBtn = rows[0].querySelector("button.backup-edit-restore");
  assert.ok(restoreBtn, "bouton Restaurer présent");
});

test("restaurer une copie d'édition remplace la chanson par l'ancienne version", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]Nouvelle version";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const stored = () => JSON.parse(window.localStorage.getItem(SONGS_KEY));
  assert.equal(stored()[0].body, "[Am]Nouvelle version");

  openSettings(window);
  await confirmAndFlush(window, window.document.querySelector("#edit-backup-list .backup-edit-restore"));
  assert.equal(stored()[0].body, "[Am]Original", "l'ancienne version est restaurée dans le carnet");
  assert.equal(stored()[0].title, "Test");
  // la version remplacée part aussi en copie de secours
  assert.equal(editBackupKeys(window).length, 2, "la version écrasée est conservée en copie");
  const newest = editBackupKeys(window).pop();
  const newestContent = JSON.parse(window.localStorage.getItem(newest));
  assert.equal(newestContent.body, "[Am]Nouvelle version", "la copie la plus récente contient la version écrasée");
});

test("restaurer met à jour le lecteur si la chanson est ouverte", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]Nouvelle version";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(window.document.querySelector("#player-view").classList.contains("active"));

  openSettings(window);
  await confirmAndFlush(window, window.document.querySelector("#edit-backup-list .backup-edit-restore"));
  const stage = window.document.querySelector("#stage-inner").textContent.replace(/\s+/g, "");
  assert.ok(stage.includes("Original"), "le lecteur affiche la version restaurée");
});

test("sans copie d'édition, la section affiche l'absence sans erreur", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openSettings(window);
  const zone = window.document.querySelector("#edit-backup-list");
  assert.match(zone.textContent, /Aucune copie de secours d/);
});

test("une copie dont la chanson d'origine a disparu ne se restaure pas silencieusement", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  // produire une copie, puis supprimer la chanson
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]Nouvelle version";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  const raw = JSON.stringify(song({ id: "ghost", title: "Fantôme", body: "[Am]Fantôme" }));
  const key = EDIT_BACKUP_PREFIX + (Date.now() + 1);
  window.localStorage.setItem(key, raw);

  openSettings(window);
  const buttons = window.document.querySelectorAll("#edit-backup-list .backup-edit-restore");
  buttons[0].click(); // la plus récente est en tête de liste = la copie fantôme
  const toast = window.document.querySelector("#toast").textContent;
  assert.match(toast, /n'existe plus dans le carnet/, "un message clair plutôt qu'une restauration silencieuse");
  const stored = JSON.parse(window.localStorage.getItem(SONGS_KEY));
  assert.equal(stored[0].body, "[Am]Nouvelle version", "le carnet est inchangé");
});
