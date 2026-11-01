const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

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
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la [C]la [F]la", speed: 1 }, overrides);
}

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

/* Mode lecture épurée (rapport mobile) : les éléments masqués ne doivent
   plus réserver de place. La rangée de diagrammes vidée et le bandeau
   auto-masqué laissaient deux bandes mortes (sous le titre, en bas) qui
   mangeaient la zone de lecture. */

test("la rangée de diagrammes vidée ne réserve plus d'espace (display:none via :empty)", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const zone = window.document.querySelector("#chord-diagrams");
  assert.ok(zone.children.length > 0, "des diagrammes sont affichés au départ");
  assert.equal(window.getComputedStyle(zone).display, "flex", "rangée visible quand elle a du contenu");
  window.document.querySelector("#btn-chords-visibility").click();
  assert.equal(zone.children.length, 0, "l'œil vide la rangée (comportement existant)");
  assert.equal(window.getComputedStyle(zone).display, "none",
    "une fois vide, la rangée sort du flux — plus de bande morte sous le titre");
  window.document.querySelector("#btn-chords-visibility").click();
  assert.ok(zone.children.length > 0, "les diagrammes reviennent avec l'œil");
  assert.equal(window.getComputedStyle(zone).display, "flex", "et la rangée redevient visible");
  window.close();
});

test("le bandeau auto-masqué rend son espace au lecteur (display:none)", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const controls = window.document.querySelector("#controls");
  assert.equal(window.getComputedStyle(controls).display, "flex", "bandeau visible par défaut");
  /* Même état que le timer de 3 s non épinglé (cf. reader-reliability :
     la classe suffit, pas besoin d'attendre le délai réel). */
  controls.classList.add("auto-hidden");
  assert.equal(window.getComputedStyle(controls).display, "none",
    "auto-hidden = retiré du flux, pas seulement transparent (plus de bande morte en bas)");
  controls.classList.remove("auto-hidden");
  assert.equal(window.getComputedStyle(controls).display, "flex", "le réveil restaure le bandeau dans le flux");
  window.close();
});
