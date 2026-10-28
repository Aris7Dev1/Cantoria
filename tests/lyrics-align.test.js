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
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]La la la", speed: 1 }, overrides);
}

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

function stageInner(window) {
  return window.document.querySelector("#stage-inner");
}

function storedSettings(window) {
  return JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
}

test("les paroles sont centrées par défaut, sans attribut d'alignement perturbateur", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(stageInner(window).getAttribute("data-lyrics-align"), "center");
});

test("le réglage « À gauche » aligne les lignes à gauche immédiatement", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector('#align-picker button[data-align="left"]').click();
  assert.equal(stageInner(window).getAttribute("data-lyrics-align"), "left");
  assert.equal(storedSettings(window).lyricsAlign, "left");
});

test("la préférence d'alignement est relue au chargement", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ lyricsAlign: "left" }),
  });
  openFirstSong(window);
  assert.equal(stageInner(window).getAttribute("data-lyrics-align"), "left");
});

test("l'alignement à gauche se traduit en règles CSS : lignes collées au bord gauche", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const findRule = (sel, prop) => {
    for (const sheet of Array.from(window.document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule.selectorText && rule.selectorText.split(",").map((s) => s.trim()).includes(sel)) {
          const v = rule.style[prop];
          if (v) return v;
        }
      }
    }
    return undefined;
  };
  assert.equal(findRule('#stage-inner[data-lyrics-align="left"] .line', "margin-left"), "0px",
    "les lignes collent à gauche");
  assert.equal(findRule('#stage-inner[data-lyrics-align="left"] .line', "margin-right"), "auto",
    "et s'étirent depuis la gauche");
  assert.equal(findRule('#stage-inner[data-lyrics-align="left"] .section-label', "text-align"), "left",
    "les libellés de section suivent");
});

test("le reset des paramètres restaure le centrage", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ lyricsAlign: "left" }),
  });
  openFirstSong(window);
  window.document.querySelector("#btn-settings-open").click();
  window.document.querySelector("#btn-settings-reset").click();
  assert.equal(stageInner(window).getAttribute("data-lyrics-align"), "center");
  assert.equal(storedSettings(window).lyricsAlign, "center");
});
