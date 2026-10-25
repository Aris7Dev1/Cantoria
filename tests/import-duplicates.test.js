const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const STORAGE_KEY = "cantoria-songs-v1";

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

function storedSongs(window) {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
}

function toastText(window) {
  return window.document.querySelector("#toast").textContent;
}

function importFile(window, name, content) {
  const file = new window.File([content], name, { type: "text/plain" });
  const input = window.document.querySelector("#import-input");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  return new Promise((resolve) => {
    // FileReader est asynchrone : on attend que le toast soit affiché.
    const check = () => {
      if (window.document.querySelector("#toast").classList.contains("show")) return resolve();
      setTimeout(check, 10);
    };
    setTimeout(check, 10);
  });
}

const existing = [
  { id: "s-1", title: "Hallelujah", artist: "Leonard Cohen", body: "[Am]Now I've heard" },
  { id: "s-2", title: "Wonderwall", artist: "Oasis", body: "[Em]Today is gonna be" },
];

test("l'import JSON ignore les doublons et importe les nouveautés", async () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(existing) });
  const payload = JSON.stringify({
    schemaVersion: 1,
    songs: [
      { id: "s-1", title: "Hallelujah", artist: "Leonard Cohen", body: "[Am]Now I've heard" },
      { id: "s-9", title: "Hallelujah", artist: "Leonard Cohen", body: "[Am]Now I've heard" },
      { id: "s-3", title: "hallelujah ", artist: " leonard cohen ", body: "[am]now i've   heard" },
      { id: "s-4", title: "Imagine", artist: "John Lennon", body: "[C]Imagine there's no heaven" },
    ],
  });
  await importFile(window, "carnet.json", payload);

  const songs = storedSongs(window);
  assert.equal(songs.length, 3, "un seul doublon (même id) et deux doublons de contenu ignorés");
  assert.ok(songs.some((s) => s.id === "s-4" && s.title === "Imagine"));
  assert.equal(toastText(window), "1 chanson(s) importée(s), 3 doublon(s) ignoré(s)");
});

test("aucune chanson existante n'est supprimée ni modifiée par l'import", async () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(existing) });
  const payload = JSON.stringify({
    songs: [
      { id: "s-1", title: "Hallelujah", artist: "Leonard Cohen", body: "[Am]Now I've heard" },
      { id: "s-5", title: "Nouveau", artist: "", body: "[G]test" },
    ],
  });
  await importFile(window, "carnet.json", payload);

  const songs = storedSongs(window);
  assert.equal(songs.length, 3);
  for (const [index, original] of existing.entries()) {
    for (const field of ["id", "title", "artist", "body"]) {
      assert.equal(songs[index][field], original[field], `le champ ${field} de la chanson existante ne doit pas changer`);
    }
  }
});

test("un import sans doublon se comporte comme avant", async () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(existing) });
  const payload = JSON.stringify({
    songs: [
      { id: "s-7", title: "Yesterday", artist: "The Beatles", body: "[F]Yesterday" },
      { id: "s-8", title: "Let It Be", artist: "The Beatles", body: "[C]Let it be" },
    ],
  });
  await importFile(window, "carnet.json", payload);

  const songs = storedSongs(window);
  assert.equal(songs.length, 4);
  assert.equal(toastText(window), "2 chanson(s) importée(s), 0 doublon(s) ignoré(s)");
});

test("un doublon dans le même fichier importé n'est ajouté qu'une fois", async () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(existing) });
  const payload = JSON.stringify({
    songs: [
      { id: "s-10", title: "Neuf", artist: "A", body: "[C]x" },
      { id: "s-11", title: "Neuf", artist: "A", body: "[C]x" },
    ],
  });
  await importFile(window, "carnet.json", payload);

  const songs = storedSongs(window);
  assert.equal(songs.length, 3);
  assert.equal(toastText(window), "1 chanson(s) importée(s), 1 doublon(s) ignoré(s)");
});

test("l'import d'un fichier TXT unique ignore un doublon de contenu", async () => {
  const withEmptyArtist = [
    { id: "s-1", title: "Hallelujah", artist: "", body: "[Am]Now I've heard" },
  ];
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(withEmptyArtist) });
  await importFile(window, "Hallelujah.txt", "[Am]Now I've heard");

  const songs = storedSongs(window);
  assert.equal(songs.length, 1, "le TXT reprend le titre du fichier, doublon de la chanson existante");
  assert.equal(toastText(window), "0 chanson(s) importée(s), 1 doublon(s) ignoré(s)");
});

test("l'import d'un fichier TXT unique nouveau est ajouté normalement", async () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify(existing) });
  await importFile(window, "Nouvelle.txt", "[G]paroles inédites");

  const songs = storedSongs(window);
  assert.equal(songs.length, 3);
  assert.equal(songs[2].title, "Nouvelle");
  assert.equal(toastText(window), "1 chanson(s) importée(s), 0 doublon(s) ignoré(s)");
});
