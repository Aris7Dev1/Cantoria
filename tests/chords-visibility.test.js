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

function chordsZone(window) {
  return window.document.querySelector("#chords-used");
}

function eyeButton(window) {
  return window.document.querySelector("#btn-chords-visibility");
}

function storedSettings(window) {
  return JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
}

test("les accords sont visibles par défaut et le bouton œil est cohérent", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(chordsZone(window).children.length, 3, "Am, C, F");
  assert.equal(eyeButton(window).getAttribute("aria-pressed"), "true");
});

test("le bouton œil du lecteur cache et restaure les accords immédiatement", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  eyeButton(window).click();
  assert.equal(chordsZone(window).children.length, 0, "les accords disparaissent");
  assert.equal(eyeButton(window).getAttribute("aria-pressed"), "false");
  assert.equal(storedSettings(window).chordsVisible, false, "le choix est mémorisé");
  eyeButton(window).click();
  assert.equal(chordsZone(window).children.length, 3, "les accords reviennent");
  assert.equal(storedSettings(window).chordsVisible, true);
});

test("le réglage global sert de valeur par défaut à l'ouverture d'une chanson", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ chordsVisible: false }),
  });
  openFirstSong(window);
  assert.equal(chordsZone(window).children.length, 0, "accords cachés dès l'ouverture");
  assert.equal(eyeButton(window).getAttribute("aria-pressed"), "false");
});

test("le réglage global s'applique aussi à la chanson déjà ouverte", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector("#setting-chords-visible").click();
  assert.equal(chordsZone(window).children.length, 0, "prise en compte immédiate");
  assert.equal(storedSettings(window).chordsVisible, false);
});

test("la transposition ne fait pas réapparaître des accords cachés", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  eyeButton(window).click();
  assert.equal(chordsZone(window).children.length, 0);
  window.document.querySelector("#tr-up").click();
  assert.equal(chordsZone(window).children.length, 0, "les accords restent cachés après transposition");
  assert.equal(window.document.querySelector("#tr-val").textContent, "+1");
});

test("la réinitialisation des paramètres restaure les accords visibles", async () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ chordsVisible: false }),
  });
  openFirstSong(window);
  window.document.querySelector("#btn-settings-open").click();
  await confirmAndFlush(window, window.document.querySelector("#btn-settings-reset"));
  assert.equal(storedSettings(window).chordsVisible, true, "le défaut revient à visible");
  assert.equal(chordsZone(window).children.length, 3, "les accords réapparaissent dans le lecteur ouvert");
});
