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
const STORAGE_KEY = "cantoria-songs-v1";
const BACKUP_PREFIX = `${STORAGE_KEY}-corrupted-`;

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

function backupKeys(window) {
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key.startsWith(BACKUP_PREFIX)) keys.push(key);
  }
  return keys.sort();
}

test("une bibliothèque valide ne crée aucune copie de secours", () => {
  const songs = [{ id: "s-1", title: "Test", body: "[Am]la" }];
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(songs) });
  assert.equal(backupKeys(window).length, 0);
  assert.equal(window.localStorage.getItem(STORAGE_KEY), JSON.stringify(songs));
});

test("un JSON illisible est sauvegardé tel quel avant réinitialisation", () => {
  const corrupted = '[{"id":"s-1","title":"Perdu"';
  const window = loadApp({ [STORAGE_KEY]: corrupted });
  const keys = backupKeys(window);
  assert.equal(keys.length, 1);
  assert.equal(window.localStorage.getItem(keys[0]), corrupted);
});

test("un JSON valide mais qui n'est pas un tableau est sauvegardé", () => {
  const unexpected = '{"songs":[{"id":"s-1"}]}';
  const window = loadApp({ [STORAGE_KEY]: unexpected });
  const keys = backupKeys(window);
  assert.equal(keys.length, 1);
  assert.equal(window.localStorage.getItem(keys[0]), unexpected);
});

test("seules les 3 copies de secours les plus récentes sont conservées", () => {
  const seed = {
    [STORAGE_KEY]: "pas du json",
    [`${BACKUP_PREFIX}1000`]: "a",
    [`${BACKUP_PREFIX}2000`]: "b",
    [`${BACKUP_PREFIX}3000`]: "c",
  };
  const window = loadApp(seed);
  const keys = backupKeys(window);
  assert.equal(keys.length, 3);
  assert.ok(!keys.includes(`${BACKUP_PREFIX}1000`), "la plus ancienne doit être supprimée");
  assert.ok(keys.includes(`${BACKUP_PREFIX}3000`));
});

function openSettings(window) {
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector("#btn-manage-backups").click();
}

test("les copies de secours sont listées dans les paramètres", () => {
  const songs = [{ id: "s-1", title: "Actuelle", body: "" }];
  const window = loadApp({
    [STORAGE_KEY]: JSON.stringify(songs),
    [`${BACKUP_PREFIX}1000`]: JSON.stringify([{ id: "s-2", title: "Secours", body: "" }]),
    [`${BACKUP_PREFIX}2000`]: "pas du json",
  });
  openSettings(window);
  const rows = window.document.querySelectorAll("#backup-list .setting-row");
  assert.equal(rows.length, 2);
  const text = window.document.querySelector("#backup-list").textContent;
  assert.ok(text.includes("1 chanson(s)"));
  assert.ok(text.includes("Contenu illisible"));
  assert.ok(text.includes("Restaurer"));
});

test("sans copie de secours, les paramètres affichent un message dédié", () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify([{ id: "s-1", title: "Test", body: "" }]) });
  openSettings(window);
  assert.ok(window.document.querySelector("#backup-list").textContent.includes("Aucune copie de secours"));
});

test("restaurer une copie valide remplace la bibliothèque et conserve l'état actuel", async () => {
  const current = [{ id: "s-1", title: "Actuelle", body: "" }];
  const window = loadApp({
    [STORAGE_KEY]: JSON.stringify(current),
    [`${BACKUP_PREFIX}1000`]: JSON.stringify([{ id: "s-2", title: "Secours", body: "" }]),
  });
  openSettings(window);
  await confirmAndFlush(window, window.document.querySelector("#backup-list .setting-row .backup-restore"));
  const restored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].title, "Secours");
  assert.ok(window.document.querySelector("#song-grid").textContent.includes("Secours"));
  /* Depuis l'issue #46, l'état sain remplacé part sous le préfixe « -replaced- »
     distinct des copies de corruption : le pruning ne peut plus l'évincer. */
  const replacedKeys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key.startsWith(`${STORAGE_KEY}-replaced-`)) replacedKeys.push(key);
  }
  assert.equal(backupKeys(window).length, 1, "la copie de corruption d'origine est préservée");
  assert.equal(replacedKeys.length, 1, "l'état actuel est conservé en copie de secours dédiée");
  const kept = replacedKeys.map((k) => window.localStorage.getItem(k));
  assert.ok(kept.some((raw) => JSON.parse(raw)[0].title === "Actuelle"));
});

test("restaurer une copie illisible ne change rien", () => {
  const current = [{ id: "s-1", title: "Actuelle", body: "" }];
  const window = loadApp({
    [STORAGE_KEY]: JSON.stringify(current),
    [`${BACKUP_PREFIX}1000`]: "pas du json",
  });
  openSettings(window);
  window.document.querySelector("#backup-list .setting-row .backup-restore").click();
  assert.equal(window.localStorage.getItem(STORAGE_KEY), JSON.stringify(current));
  assert.equal(backupKeys(window).length, 1);
  assert.ok(window.document.querySelector("#toast").classList.contains("show"));
});

test("annuler la restauration ne change rien", async () => {
  const current = [{ id: "s-1", title: "Actuelle", body: "" }];
  const window = loadApp({
    [STORAGE_KEY]: JSON.stringify(current),
    [`${BACKUP_PREFIX}1000`]: JSON.stringify([{ id: "s-2", title: "Secours", body: "" }]),
  });
  openSettings(window);
  window.document.querySelector("#backup-list .setting-row .backup-restore").click();
  const overlay = window.document.querySelector("#confirm-overlay");
  assert.ok(overlay.classList.contains("show"), "la confirmation s'affiche avant toute restauration");
  window.document.querySelector("#confirm-cancel").click();
  await Promise.resolve();
  assert.equal(window.localStorage.getItem(STORAGE_KEY), JSON.stringify(current));
  assert.equal(backupKeys(window).length, 1);
});
