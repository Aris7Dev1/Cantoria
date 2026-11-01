const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/* Issue #96 (branche A) : i18n minimal FR/EN, FR par d\u00e9faut, bascule sans
   recharger les donn\u00e9es, contenu du carnet jamais touch\u00e9. */

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const LANG_KEY = "cantoria-lang";

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
  return Object.assign({ id: "s-1", title: "Amsterdam", artist: "Jacques Brel", key: "E", body: "[E]paroles\n", speed: 1 }, overrides);
}

test("FR par d\u00e9faut : titres d'interface en fran\u00e7ais", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const doc = window.document;
  assert.equal(doc.querySelector("h1").textContent, "Mes chansons");
  assert.equal(doc.querySelector("#btn-new").textContent.trim(), "+ Nouvelle chanson");
  assert.equal(doc.documentElement.getAttribute("lang"), "fr");
});

test("bascule EN : l'interface passe en anglais sans toucher aux chansons", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const doc = window.document;
  doc.querySelector('#lang-picker button[data-lang="en"]').click();
  assert.equal(doc.querySelector("h1").textContent, "My songs");
  assert.equal(doc.querySelector("#btn-new").textContent.trim(), "+ New song");
  assert.equal(doc.querySelector("#btn-export").textContent.trim(), "Export all");
  assert.equal(doc.documentElement.getAttribute("lang"), "en");
  assert.equal(window.localStorage.getItem(LANG_KEY), "en");
  // le contenu du carnet reste intact et en fran\u00e7ais
  const card = doc.querySelector("#song-grid .song-card .title");
  assert.equal(card.textContent, "Amsterdam");
  const stored = JSON.parse(window.localStorage.getItem(SONGS_KEY));
  assert.equal(stored[0].title, "Amsterdam");
  assert.equal(stored[0].artist, "Jacques Brel");
});

test("retour FR apr\u00e8s EN, et persistance au rechargement", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]), [LANG_KEY]: "en" });
  const doc = window.document;
  assert.equal(doc.querySelector("h1").textContent, "My songs", "EN charg\u00e9 depuis le stockage");
  doc.querySelector('#lang-picker button[data-lang="fr"]').click();
  assert.equal(doc.querySelector("h1").textContent, "Mes chansons");
  assert.equal(window.localStorage.getItem(LANG_KEY), "fr");
});

test("les deux dictionnaires couvrent exactement les m\u00eames cl\u00e9s", () => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const block = html.slice(html.indexOf("var I18N = {"), html.indexOf("var LANG_KEY"));
  const keys = (b) => new Set([...b.matchAll(/^ {6}([A-Za-z_$][\w$]*):/gm)].map((x) => x[1]));
  const kFr = keys(block.slice(block.indexOf("fr: {"), block.indexOf("en: {")));
  const kEn = keys(block.slice(block.indexOf("en: {")));
  assert.ok(kFr.size > 50, "dictionnaire FR substantiel");
  assert.deepEqual([...kFr].sort(), [...kEn].sort(), "m\u00eames cl\u00e9s en fr et en");
});

test("le README contient un r\u00e9sum\u00e9 anglais", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  assert.ok(/guitarist's songbook/i.test(readme), "accroche EN pr\u00e9sente");
  assert.ok(/fran\u00e7ais/i.test(readme) && /english/i.test(readme), "les deux langues mentionn\u00e9es");
});
