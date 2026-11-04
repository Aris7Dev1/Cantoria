const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/* Setlists (issue #92) : modèle de données, persistance rétrocompatible,
   gestion (créer/éditer/dupliquer/supprimer), réglages propres par entrée et
   lecture enchaînée. */

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const SETLISTS_KEY = "cantoria-setlists-v1";
const SETTINGS_KEY = "cantoria-settings";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Alpha", artist: "A", key: "G", capo: "", body: "[G]la la", speed: 1 }, overrides);
}

function twoSongs() {
  return [song(), song({ id: "s-2", title: "Beta", artist: "B", key: "D", body: "[D]mi mi", speed: 1.25 })];
}

function storedSetlists(window) {
  return JSON.parse(window.localStorage.getItem(SETLISTS_KEY) || "[]");
}

function openSetlistsView(window) {
  window.document.querySelector("#btn-setlists").click();
}

function openNewSetlistEditor(window) {
  openSetlistsView(window);
  window.document.querySelector("#btn-setlist-new").click();
}

/* Issue #136 : ajout via la recherche filtrante (champ vidé = toutes les chansons). */
function addSongById(window, songId) {
  const doc = window.document;
  const search = doc.querySelector("#setlist-song-search");
  search.value = "";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  doc.querySelector('#setlist-song-results [data-song-id="' + songId + '"]').click();
}

function importFile(window, name, content) {
  const file = new window.File([content], name, { type: "application/json" });
  const input = window.document.querySelector("#import-input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  return new Promise((resolve) => {
    const check = () => {
      if (window.document.querySelector("#toast").classList.contains("show")) return resolve();
      setTimeout(check, 10);
    };
    setTimeout(check, 10);
  });
}

test("un ancien carnet (tableau simple) charge sans setlists et reste intact", () => {
  const songs = twoSongs();
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(songs) });
  assert.deepEqual(storedSetlists(window), []);
  const stored = JSON.parse(window.localStorage.getItem(SONGS_KEY));
  assert.equal(stored.length, 2, "les chansons sont préservées telles quelles");
  assert.ok(Array.isArray(stored), "le format du carnet reste un tableau (rétrocompatible)");
});

test("créer une setlist : nom, ajout de chansons, persistance sous sa propre clé", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  window.document.querySelector("#setlist-name").value = "Concert";
  addSongById(window, "s-2");
  addSongById(window, "s-1");
  window.document.querySelector("#btn-setlist-save").click();

  const setlists = storedSetlists(window);
  assert.equal(setlists.length, 1);
  assert.equal(setlists[0].name, "Concert");
  assert.deepEqual(setlists[0].entries.map((e) => e.songId), ["s-2", "s-1"]);
  // les réglages par défaut viennent de la chanson
  assert.equal(setlists[0].entries[0].key, "D");
  assert.equal(setlists[0].entries[0].speed, 1.25);
  // le carnet de chansons n'a pas changé de format
  assert.ok(Array.isArray(JSON.parse(window.localStorage.getItem(SONGS_KEY))));
});

test("les réglages propres à une entrée sont modifiables et persistés", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  window.document.querySelector("#setlist-name").value = "Solo";
  addSongById(window, "s-1");
  const row = window.document.querySelector(".sl-entry");
  const keyInput = row.querySelector(".sl-key");
  keyInput.value = "A";
  keyInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  const capoInput = row.querySelector(".sl-capo");
  capoInput.value = "3";
  capoInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  const speedSel = row.querySelector(".sl-speed");
  speedSel.value = "1.5";
  speedSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  window.document.querySelector("#btn-setlist-save").click();

  const entry = storedSetlists(window)[0].entries[0];
  assert.equal(entry.key, "A");
  assert.equal(entry.capo, "3");
  assert.equal(entry.speed, 1.5);
});

test("réordonner par glisser-déposer (drop) change l'ordre persisté", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  window.document.querySelector("#setlist-name").value = "Ordre";
  addSongById(window, "s-1");
  addSongById(window, "s-2");
  window.document.querySelector("#btn-setlist-save").click();

  // réouvre l'éditeur et déplace la 2e entrée en 1re position via drop
  openSetlistsView(window);
  window.document.querySelector(".setlist-card .sl-edit").click();
  const rows = window.document.querySelectorAll("#setlist-entries .sl-entry");
  assert.equal(rows.length, 2);
  const data = { getData: () => "1", setData: () => {}, effectAllowed: "", dropEffect: "" };
  const dropEvent = new window.Event("drop", { bubbles: true, cancelable: true });
  dropEvent.dataTransfer = data;
  rows[0].dispatchEvent(dropEvent);
  window.document.querySelector("#btn-setlist-save").click();
  assert.deepEqual(storedSetlists(window)[0].entries.map((e) => e.songId), ["s-2", "s-1"]);
});

test("supprimer une setlist demande confirmation et conserve les chansons", async () => {
  const seed = { [SONGS_KEY]: JSON.stringify(twoSongs()) };
  const window = loadApp(seed);
  openNewSetlistEditor(window);
  window.document.querySelector("#setlist-name").value = "Temp";
  window.document.querySelector("#btn-setlist-save").click();
  assert.equal(storedSetlists(window).length, 1);

  openSetlistsView(window);
  window.document.querySelector(".setlist-card .sl-del").click();
  await sleep(10);
  // la modale de confirmation HTML est ouverte : on confirme
  const overlay = window.document.querySelector("#confirm-overlay");
  assert.ok(overlay.classList.contains("show"), "confirmation demandée");
  window.document.querySelector("#confirm-ok").click();
  await sleep(10);
  assert.equal(storedSetlists(window).length, 0);
  assert.equal(JSON.parse(window.localStorage.getItem(SONGS_KEY)).length, 2, "chansons intactes");
});

test("dupliquer une setlist crée une copie avec un nouvel id", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  window.document.querySelector("#setlist-name").value = "Base";
  addSongById(window, "s-1");
  window.document.querySelector("#btn-setlist-save").click();

  openSetlistsView(window);
  window.document.querySelector(".setlist-card .sl-dup").click();
  const setlists = storedSetlists(window);
  assert.equal(setlists.length, 2);
  assert.notEqual(setlists[0].id, setlists[1].id);
  assert.deepEqual(setlists[1].entries.map((e) => e.songId), setlists[0].entries.map((e) => e.songId));
});

test("export JSON inclut les setlists (schemaVersion 2) et reste lisible", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  window.document.querySelector("#setlist-name").value = "Export";
  window.document.querySelector("#btn-setlist-save").click();

  // intercepte le payload exporté via le fallback navigateur (Blob)
  let exported = null;
  window.URL.createObjectURL = (blob) => { blob.text().then((t) => { exported = t; }); return "blob:mock"; };
  window.URL.revokeObjectURL = () => {};
  window.document.querySelector("#btn-export").click();
  await sleep(20);
  const payload = JSON.parse(exported);
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.songs.length, 2);
  assert.equal(payload.setlists.length, 1);
  assert.equal(payload.setlists[0].name, "Export");
});

test("import d'un ancien export (tableau) reste accepté, sans setlists", async () => {
  const window = loadApp();
  await importFile(window, "vieux-carnet.json", JSON.stringify(twoSongs()));
  assert.equal(JSON.parse(window.localStorage.getItem(SONGS_KEY)).length, 2);
  assert.deepEqual(storedSetlists(window), []);
});

test("import d'un export v2 importe chansons + setlists sans écraser", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const payload = {
    schemaVersion: 2,
    exported: new Date().toISOString(),
    songs: [song({ id: "s-2", title: "Beta", key: "D", body: "[D]mi" })],
    setlists: [{ id: "sl-1", name: "Importée", entries: [{ songId: "s-2", key: "E", capo: "2", speed: 1.5 }], addedAt: 1 }],
  };
  await importFile(window, "carnet.json", JSON.stringify(payload));
  assert.equal(JSON.parse(window.localStorage.getItem(SONGS_KEY)).length, 2);
  const setlists = storedSetlists(window);
  assert.equal(setlists.length, 1);
  assert.equal(setlists[0].id, "sl-1");
  assert.equal(setlists[0].entries[0].key, "E");

  // réimport du même fichier : doublons ignorés, setlist non écrasée
  await importFile(window, "carnet.json", JSON.stringify(payload));
  assert.equal(storedSetlists(window).length, 1, "pas de doublon de setlist");
});

test("lecture enchaînée : fin de chanson passe à l'entrée suivante avec ses réglages", async () => {
  const songs = twoSongs();
  const setlists = [{
    id: "sl-9", name: "Chaîne", addedAt: 1,
    entries: [
      { songId: "s-1", key: "A", capo: "2", speed: 1.5 },
      { songId: "s-2", key: "", capo: "", speed: null },
    ],
  }];
  const settings = { setlistConfirmNext: false };
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify(songs),
    [SETLISTS_KEY]: JSON.stringify(setlists),
    [SETTINGS_KEY]: JSON.stringify(settings),
  });

  openSetlistsView(window);
  window.document.querySelector(".setlist-card .sl-play").click();
  await sleep(10);
  // première chanson ouverte avec les réglages de l'entrée 0 (s-1 en G -> A = +2)
  assert.equal(window.document.querySelector("#p-title").textContent, "Alpha");
  assert.equal(window.document.querySelector("#tr-val").textContent, "+2");
  assert.equal(window.document.querySelector("#speed-val").textContent, "×1,5");
  assert.ok(window.document.querySelector("#p-sub").textContent.includes("Capo 2"));

  // simule la fin de chanson : position de défilement au maximum
  const stage = window.document.querySelector("#stage");
  Object.defineProperty(stage, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(stage, "clientHeight", { value: 500, configurable: true });
  Object.defineProperty(stage, "scrollTop", { value: 0, writable: true, configurable: true });
  window.document.querySelector("#play-toggle").click(); // lance le défilement
  await sleep(30);
  stage.scrollTop = 499.6; // force la position proche du max
  stage.dispatchEvent(new window.Event("scroll"));
  // laisse le RAF atteindre la fin
  await new Promise((resolve) => {
    const check = () => {
      if (window.document.querySelector("#p-title").textContent === "Beta") return resolve();
      setTimeout(check, 10);
    };
    setTimeout(check, 10);
  });
  await sleep(20);
  assert.equal(window.document.querySelector("#p-title").textContent, "Beta", "chaînage vers la 2e chanson");
  // entrée 1 sans réglages propres : retour aux réglages de la chanson (D, ×1,25, pas de capo)
  assert.equal(window.document.querySelector("#tr-val").textContent, "0");
  assert.equal(window.document.querySelector("#speed-val").textContent, "×1,25");
  assert.ok(!window.document.querySelector("#p-sub").textContent.includes("Capo 2"));
});

test("avec confirmation activée, la modale bloque le chaînage tant qu'elle n'est pas validée", async () => {
  const songs = twoSongs();
  const setlists = [{
    id: "sl-10", name: "Conf", addedAt: 1,
    entries: [{ songId: "s-1", key: "", capo: "", speed: null }, { songId: "s-2", key: "", capo: "", speed: null }],
  }];
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify(songs),
    [SETLISTS_KEY]: JSON.stringify(setlists),
    [SETTINGS_KEY]: JSON.stringify({ setlistConfirmNext: true }),
  });
  openSetlistsView(window);
  window.document.querySelector(".setlist-card .sl-play").click();
  await sleep(10);
  assert.equal(window.document.querySelector("#p-title").textContent, "Alpha");

  const stage = window.document.querySelector("#stage");
  Object.defineProperty(stage, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(stage, "clientHeight", { value: 500, configurable: true });
  Object.defineProperty(stage, "scrollTop", { value: 0, writable: true, configurable: true });
  window.document.querySelector("#play-toggle").click();
  await sleep(30);
  stage.scrollTop = 499.6;
  stage.dispatchEvent(new window.Event("scroll"));
  await sleep(120);
  const overlay = window.document.querySelector("#confirm-overlay");
  assert.ok(overlay.classList.contains("show"), "confirmation affichée");
  assert.equal(window.document.querySelector("#p-title").textContent, "Alpha", "pas de chaînage sans confirmation");
  window.document.querySelector("#confirm-ok").click();
  await sleep(30);
  assert.equal(window.document.querySelector("#p-title").textContent, "Beta", "chaînage après confirmation");
});

/* Issue #136 : recherche filtrante dans l'editeur de setlist (remplace le <select>). */

test("issue #136 : la recherche filtre par titre/artiste, insensible a la casse et aux accents", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song(), song({ id: "s-2", title: "Bête", artist: "Éléonore", key: "D", body: "[D]x", speed: 1 })]) });
  openNewSetlistEditor(window);
  const doc = window.document;
  const search = doc.querySelector("#setlist-song-search");
  const results = () => [...doc.querySelectorAll("#setlist-song-results .setlist-result")].map((b) => b.getAttribute("data-song-id"));
  search.value = "ALP";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(results(), ["s-1"], "casse ignoree");
  search.value = "élé";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(results(), ["s-2"], "artiste matche avec accents");
  search.value = "bete";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(results(), ["s-2"], "titre accentue matche sans accent");
});

test("issue #136 : aucun resultat affiche le message, Entrée/Ajouter n'ajoutent rien", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  const doc = window.document;
  const search = doc.querySelector("#setlist-song-search");
  search.value = "zzzz";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.ok(doc.querySelector("#setlist-song-results .setlist-no-match"), "message aucune correspondance");
  doc.querySelector("#btn-setlist-add").click();
  search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert.equal(doc.querySelectorAll("#setlist-entries .sl-entry").length, 0, "rien n'est ajouté sans résultat");
});

test("issue #136 : Entrée et le bouton Ajouter ajoutent le premier résultat, champ vidé après ajout", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  openNewSetlistEditor(window);
  const doc = window.document;
  const search = doc.querySelector("#setlist-song-search");
  search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert.equal(doc.querySelectorAll("#setlist-entries .sl-entry").length, 1, "Entrée ajoute le 1er résultat");
  assert.equal(search.value, "", "recherche vidée après ajout");
  search.value = "beta";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  doc.querySelector("#btn-setlist-add").click();
  assert.equal(doc.querySelectorAll("#setlist-entries .sl-entry").length, 2, "bouton Ajouter ajoute le 1er résultat filtré");
  doc.querySelector("#setlist-name").value = "Test";
  doc.querySelector("#btn-setlist-save").click();
  assert.deepEqual(storedSetlists(window)[0].entries.map((e) => e.songId), ["s-1", "s-2"]);
});

test("issue #136 : la liste de résultats est plafonnée à 50", () => {
  const many = [];
  for (let i = 0; i < 80; i++) many.push(song({ id: "s-" + i, title: "Morceau " + i, artist: "", key: "", body: "", speed: 1 }));
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(many) });
  openNewSetlistEditor(window);
  const doc = window.document;
  const search = doc.querySelector("#setlist-song-search");
  search.value = "morceau";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(doc.querySelectorAll("#setlist-song-results .setlist-result").length, 50, "plafond de 50 résultats");
});

test("issue #136 : bouton retour dans la vue setlists + état actif du bouton Setlists", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify(twoSongs()) });
  const doc = window.document;
  const grid = doc.querySelector("#song-grid");
  const section = doc.querySelector("#setlists-section");
  const btnSetlists = doc.querySelector("#btn-setlists");
  assert.equal(section.style.display, "none");
  openSetlistsView(window);
  assert.notEqual(section.style.display, "none", "vue setlists ouverte");
  assert.equal(grid.style.display, "none", "grille masquée");
  assert.ok(btnSetlists.classList.contains("active"), "bouton Setlists marqué actif");
  doc.querySelector("#btn-setlists-back").click();
  assert.equal(section.style.display, "none", "retour : section masquée");
  assert.equal(grid.style.display, "", "retour : grille réaffichée");
  assert.ok(!btnSetlists.classList.contains("active"), "état actif retiré");
});
