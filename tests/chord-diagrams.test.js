const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
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

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la [C]la [F]la", speed: 1 }, overrides);
}

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

function diagrams(window) {
  return Array.from(window.document.querySelectorAll("#chord-diagrams .chord-diagram"));
}

function diagramNames(window) {
  return diagrams(window).map((d) => d.querySelector(".cd-name").textContent);
}

function storedSettings(window) {
  return JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
}

test("les diagrammes des accords de la chanson s'affichent avec leur nom", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.deepEqual(diagramNames(window), ["Am", "C", "F"]);
  const first = diagrams(window)[0];
  assert.ok(first.querySelector("svg"), "chaque diagramme est un SVG");
  assert.ok(first.querySelector("svg .cd-dot"), "le diagramme Am a des points de doigté");
});

test("les diagrammes suivent la transposition", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  window.document.querySelector("#tr-up").click();
  assert.deepEqual(diagramNames(window), ["A#m", "C#", "F#"]);
});

test("un accord hors dictionnaire obtient une forme de barré transposée", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ body: "[Bm]la [F#]la" })]) });
  openFirstSong(window);
  assert.deepEqual(diagramNames(window), ["Bm", "F#"]);
  const bmin = diagrams(window)[0];
  const dots = bmin.querySelectorAll(".cd-dot");
  assert.ok(dots.length >= 4, "Bm en forme de barré a plusieurs points");
  assert.ok(bmin.querySelector("svg text"), "le numéro de première case est affiché");
});

test("la position « En bas » place les diagrammes après la zone de lecture", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const zone = window.document.querySelector("#chord-diagrams");
  const stage = window.document.querySelector("#stage");
  assert.ok(zone.nextElementSibling === stage, "par défaut les diagrammes sont au-dessus de la scène");
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector('#diagrams-picker button[data-pos="bottom"]').click();
  assert.equal(storedSettings(window).chordDiagrams, "bottom");
  assert.ok(zone.previousElementSibling === stage, "« En bas » place les diagrammes sous la scène");
});

test("la position « Masqués » vide la rangée de diagrammes", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector('#diagrams-picker button[data-pos="hidden"]').click();
  assert.equal(diagrams(window).length, 0);
  assert.equal(storedSettings(window).chordDiagrams, "hidden");
});

test("le bouton œil qui cache les accords cache aussi les diagrammes", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.ok(diagrams(window).length > 0);
  window.document.querySelector("#btn-chords-visibility").click();
  assert.equal(diagrams(window).length, 0, "les diagrammes suivent la visibilité des accords");
  window.document.querySelector("#btn-chords-visibility").click();
  assert.ok(diagrams(window).length > 0, "et reviennent avec");
});

test("un accord non reconnaissable n'affiche pas de diagramme cassé", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ body: "[Am]la [Qq]la" })]) });
  openFirstSong(window);
  assert.deepEqual(diagramNames(window), ["Am"]);
});
