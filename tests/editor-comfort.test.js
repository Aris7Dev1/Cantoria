const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/* Confirmations via la modale HTML asynchrone (issue #46). */
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

    },
  });
  return dom.window;
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]Original", speed: 1 }, overrides);
}

function openEditorOnSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  return window.document.querySelector("#f-body");
}

function editBackupKeys(window) {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.indexOf(EDIT_BACKUP_PREFIX) === 0) keys.push(k);
  }
  return keys;
}

function keydown(window, props) {
  const event = new window.KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true, ctrlKey: true }, props));
  window.document.dispatchEvent(event);
  return event;
}

test("undo/redo : les boutons annulent et rétablissent les modifications du corps", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const body = openEditorOnSong(window);
  const undo = window.document.querySelector("#editor-undo");
  const redo = window.document.querySelector("#editor-redo");
  assert.equal(undo.disabled, true, "rien à annuler à l'ouverture");
  assert.equal(redo.disabled, true, "rien à rétablir à l'ouverture");

  body.value = "[Am]Première modification";
  body.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(undo.disabled, false, "une modification rend l'annulation possible");
  undo.click();
  assert.equal(body.value, "[Am]Original", "l'annulation restaure l'original");
  assert.equal(redo.disabled, false, "le rétablissement devient possible");
  redo.click();
  assert.equal(body.value, "[Am]Première modification", "le rétablissement revient en avant");
});

test("undo/redo : les outils de section poussent aussi l'historique", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const body = openEditorOnSong(window);
  body.value = "Refrain\n[F]Le refrain\n\n[Am]Suite";
  body.dispatchEvent(new window.Event("input", { bubbles: true }));
  body.selectionStart = 0;
  body.selectionEnd = "Refrain".length;
  window.document.querySelector("#mark-chorus").click();
  assert.ok(body.value.indexOf("{soc}") !== -1);
  window.document.querySelector("#editor-undo").click();
  assert.equal(body.value, "Refrain\n[F]Le refrain\n\n[Am]Suite",
    "l'annulation défait aussi le marquage de section");
});

test("sortir de l'éditeur avec des modifications non enregistrées demande confirmation", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const body = openEditorOnSong(window);
  body.value = "[Am]Modifié sans sauvegarder";
  window.document.querySelector("#btn-editor-back").click();
  const overlay = window.document.querySelector("#confirm-overlay");
  assert.ok(overlay.classList.contains("show"), "la confirmation s'affiche");
  window.document.querySelector("#confirm-cancel").click(); // l'utilisateur refuse de quitter
  await Promise.resolve();
  assert.ok(window.document.querySelector("#editor-view").classList.contains("active"),
    "le refus de confirmation garde l'éditeur ouvert");

  window.document.querySelector("#btn-editor-back").click();
  window.document.querySelector("#confirm-ok").click(); // l'utilisateur accepte de perdre
  await Promise.resolve();
  assert.ok(window.document.querySelector("#library-view").classList.contains("active"),
    "l'acceptation quitte l'éditeur");
});

test("sortir de l'éditeur sans modification ne demande rien", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openEditorOnSong(window);
  window.document.querySelector("#btn-editor-back").click();
  assert.ok(!window.document.querySelector("#confirm-overlay").classList.contains("show"),
    "aucune confirmation si rien n'a changé");
  assert.ok(window.document.querySelector("#library-view").classList.contains("active"));
});

test("Ctrl+S enregistre depuis l'éditeur et renvoie au lecteur", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const body = openEditorOnSong(window);
  body.value = "[Am]Sauvegardé au clavier";
  keydown(window, { key: "s" });
  assert.ok(window.document.querySelector("#player-view").classList.contains("active"),
    "Ctrl+S enregistre et renvoie au lecteur");
  const stageText = window.document.querySelector("#stage-inner").textContent.replace(/\s+/g, "");
  assert.ok(stageText.includes("Sauvegardéauclavier"),
    "la version sauvegardée est affichée");
  const stored = JSON.parse(window.localStorage.getItem(SONGS_KEY));
  assert.equal(stored[0].body, "[Am]Sauvegardé au clavier");
});

test("l'écrasement d'une chanson sauvegarde d'abord l'ancienne version en copie de secours", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const body = openEditorOnSong(window);
  body.value = "[Am]Nouvelle version";
  keydown(window, { key: "s" });
  const keys = editBackupKeys(window);
  assert.equal(keys.length, 1, "une copie de secours d'édition existe");
  const backup = JSON.parse(window.localStorage.getItem(keys[0]));
  assert.equal(backup.body, "[Am]Original", "la copie contient l'ancienne version");
  assert.equal(backup.title, "Test");
});

test("les copies de secours d'édition sont bornées à trois", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  for (let round = 0; round < 5; round++) {
    const body = openEditorOnSong(window);
    body.value = "[Am]Version " + round;
    keydown(window, { key: "s" });
    window.document.querySelector("#btn-edit-current").click();
  }
  assert.equal(editBackupKeys(window).length, 3, "seules les 3 plus récentes sont conservées");
});
