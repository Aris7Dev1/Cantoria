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
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la la la", speed: 1 }, overrides);
}

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

function activeSeconds(picker) {
  const active = picker.querySelector("button.active");
  return active ? parseInt(active.getAttribute("data-seconds"), 10) : null;
}

function readerCountdown(window) {
  return activeSeconds(window.document.querySelector("#countdown-picker"));
}

function settingsCountdown(window) {
  return activeSeconds(window.document.querySelector("#def-countdown-picker"));
}

function clickSettingsChoice(window, seconds) {
  window.document.querySelector("#btn-settings-open").click();
  const btn = window.document.querySelector(
    `#def-countdown-picker button[data-seconds="${seconds}"]`
  );
  btn.click();
  window.document.querySelector("#btn-settings-close").click();
}

test("le décompte choisi dans les réglages s'applique à la chanson ouverte ensuite sans redémarrage", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  clickSettingsChoice(window, 10);
  openFirstSong(window);
  assert.equal(settingsCountdown(window), 10);
  assert.equal(readerCountdown(window), 10, "le lecteur doit refléter le décompte par défaut immédiatement");
});

test("le décompte des réglages s'applique aussi à la chanson déjà ouverte", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(readerCountdown(window), 0, "défaut initial : aucun décompte");
  clickSettingsChoice(window, 15);
  assert.equal(readerCountdown(window), 15, "le lecteur ouvert doit suivre le nouveau décompte par défaut");
  assert.equal(
    JSON.parse(window.localStorage.getItem(SETTINGS_KEY)).defaultCountdown,
    15
  );
});

test("la relance d'une chanson réapplique le décompte par défaut des réglages", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  clickSettingsChoice(window, 5);
  openFirstSong(window);
  const picker = window.document.querySelector("#countdown-picker");
  picker.querySelector('button[data-seconds="0"]').click();
  assert.equal(readerCountdown(window), 0, "choix manuel dans le lecteur prioritaire");
  window.document.querySelector("#btn-player-back").click();
  openFirstSong(window);
  assert.equal(readerCountdown(window), 5, "la réouverture doit reprendre le décompte par défaut");
});
