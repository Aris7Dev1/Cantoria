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

function dotPositions(window, chord) {
  const all = diagrams(window);
  const el = all.find((d) => d.querySelector(".cd-name").textContent === chord);
  const svg = el.querySelector("svg");
  const viewBox = svg.getAttribute("viewBox").split(" ").map(Number);
  const [, , w] = viewBox;
  const x0 = 8, fw = (w - 16) / 5;
  return Array.from(svg.querySelectorAll(".cd-dot")).map((c) => ({
    string: Math.round((parseFloat(c.getAttribute("cx")) - x0) / fw),
    y: parseFloat(c.getAttribute("cy")),
  }));
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

test("l'orientation du manche : Mi grave à gauche, comme sur un chansonnier imprimé", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ body: "[F]la" })]) });
  openFirstSong(window);
  // F majeur : frets = [1,3,3,2,1,1] (Mi grave → Mi aigu). Toutes les cordes
  // sont frettées case 1 (barré) : six points, dont le plus à gauche (corde 0)
  // doit être sur la première corde dessinée à gauche.
  const dots = dotPositions(window, "F");
  assert.equal(dots.length, 6, "F barré : un point par corde");
  const strings = dots.map((d) => d.string).sort((a, b) => a - b);
  assert.deepEqual(strings, [0, 1, 2, 3, 4, 5], "les six cordes, de la plus grave (gauche) à la plus aiguë");
  // Am : frets = [-1,0,2,2,1,0]. Seules les cordes 2,3,4 (index Mi grave → aigu)
  // sont frettées : positions gauche→droite = cases 2,2,1 sur les cordes 2,3,4.
  const window2 = loadApp({ [SONGS_KEY]: JSON.stringify([song({ body: "[Am]la" })]) });
  openFirstSong(window2);
  const amDots = dotPositions(window2, "Am");
  assert.equal(amDots.length, 3, "Am : trois cordes frettées");
  const leftToRight = amDots.slice().sort((a, b) => a.string - b.string).map((d) => d.y);
  const y0 = 18, fh = (92 - y0 - 12) / 4;
  assert.ok(Math.abs(leftToRight[0] - (y0 + 1.5 * fh)) < 2, "corde Ré (index 2) à la case 2");
  assert.ok(Math.abs(leftToRight[1] - (y0 + 1.5 * fh)) < 2, "corde Sol (index 3) à la case 2");
  assert.ok(Math.abs(leftToRight[2] - (y0 + 0.5 * fh)) < 2, "corde Si (index 4) à la case 1");
});
