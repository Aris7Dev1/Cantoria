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
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la la la", speed: 1 }, overrides);
}

function keydown(window, key) {
  window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

test("les paramètres n'affichent qu'une ligne résumé pour les copies de secours", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-settings-open").click();
  assert.ok(window.document.querySelector("#btn-manage-backups"), "bouton Gérer… en surface");
  assert.ok(!window.document.querySelector("#backups-subview").classList.contains("show"),
    "le sous-menu n'est pas ouvert par défaut");
  assert.match(window.document.querySelector("#backups-summary").textContent,
    /Aucune version conservée/, "le résumé indique l'absence de copies");
});

test("Gérer… ouvre le sous-menu avec les deux sections, retour et Échap fonctionnent", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector("#btn-manage-backups").click();
  const subview = window.document.querySelector("#backups-subview");
  assert.ok(subview.classList.contains("show"), "le sous-menu s'ouvre");
  assert.ok(window.document.querySelector("#backup-list"), "section Carnet présente");
  assert.ok(window.document.querySelector("#edit-backup-list"), "section Chansons modifiées présente");

  keydown(window, "Escape");
  assert.ok(!subview.classList.contains("show"), "Échap revient aux paramètres");
  assert.ok(window.document.querySelector("#settings-overlay").classList.contains("show"),
    "Échap ne ferme pas la modale entière depuis le sous-menu");

  window.document.querySelector("#btn-manage-backups").click();
  window.document.querySelector("#btn-backups-back").click();
  assert.ok(!subview.classList.contains("show"), "le bouton retour ferme le sous-menu");
});

test("le résumé compte les copies des deux types", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  // une copie d'édition via une modification
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]V2";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  // une copie de carnet manuelle
  window.localStorage.setItem("cantoria-songs-v1-corrupted-1", JSON.stringify([]));

  window.document.querySelector("#btn-settings-open").click();
  assert.match(window.document.querySelector("#backups-summary").textContent,
    /2 versions conservées/, "le résumé additionne carnet + édition");
});

test("une restauration depuis le sous-menu rafraîchit le résumé au retour", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  window.document.querySelector("#f-body").value = "[Am]V2";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector("#btn-manage-backups").click();
  await confirmAndFlush(window, window.document.querySelector("#edit-backup-list .backup-edit-restore"));
  window.document.querySelector("#btn-backups-back").click();
  assert.match(window.document.querySelector("#backups-summary").textContent,
    /2 versions conservées/, "le résumé est à jour : la version restaurée remplace la chanson, la version écrasée devient une copie (jamais de perte)");
});
