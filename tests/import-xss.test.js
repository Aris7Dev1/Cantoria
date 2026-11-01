const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/* Garde-fou anti-XSS (audit sécurité) : un fichier importé (ChordPro, TXT ou
   JSON) contenant du HTML/JS malveillant doit être affiché LITTÉRALEMENT,
   jamais interprété. Aucune balise du payload ne doit exister dans le DOM
   rendu (carte de bibliothèque, lecteur, accords, commentaires). */

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const STORAGE_KEY = "cantoria-songs-v1";

const PAYLOAD_TITLE = '<img src=x onerror="window.__xssFired=true">';
const PAYLOAD_BODY = [
  "{title: <script>window.__xssFired=true</script>}",
  "[Am]<img src=x onerror=\"window.__xssFired=true\">la la",
  "{comment: <svg onload=window.__xssFired=true>}",
  "<iframe src=\"javascript:window.__xssFired=true\"></iframe>",
].join("\n");

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

function importFile(window, name, content) {
  const file = new window.File([content], name, { type: "text/plain" });
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

function dangerousElements(window) {
  const doc = window.document;
  // Le <script> inline unique de cantoria.html est le code de l'app lui-même ;
  // un script injecté par un payload importé serait un élément script distinct.
  const appScript = doc.querySelector("script:not([src])");
  return Array.from(doc.querySelectorAll("img, script, iframe, object, embed, video, audio, link, base, form"))
    .filter((el) => el !== appScript)
    .filter((el) => /__xssFired|onerror|onload|javascript:/.test(el.outerHTML));
}

test("la CSP verrouille base-uri et form-action", () => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(meta, "balise CSP attendue");
  assert.match(meta[1], /base-uri 'none'/, "base-uri 'none' attendu");
  assert.match(meta[1], /form-action 'none'/, "form-action 'none' attendu");
});

test("un fichier ChordPro piégé s'affiche littéralement dans le lecteur", async () => {
  const window = loadApp();
  await importFile(window, "piege.cho", PAYLOAD_BODY);
  const songs = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  assert.equal(songs.length, 1, "la chanson piégée est importée");

  window.document.querySelector("#song-grid .song-card").click();
  const stage = window.document.querySelector("#stage-inner");
  assert.ok(stage.innerHTML.length > 0, "le lecteur est rendu");
  assert.equal(dangerousElements(window).length, 0, "aucune balise dangereuse dans le DOM");
  assert.equal(window.__xssFired, undefined, "aucun gestionnaire d'événement exécuté");
  assert.ok(/<img src=x|<svg onload|<iframe/.test(stage.textContent), "le payload est visible en texte brut");
  assert.ok(stage.innerHTML.includes("&lt;"), "le payload est échappé dans le HTML");
});

test("un JSON piégé s'affiche littéralement sur la carte et dans le lecteur", async () => {
  const window = loadApp();
  const payload = JSON.stringify({
    schemaVersion: 1,
    songs: [{ id: "s-xss", title: PAYLOAD_TITLE, artist: '<b>artiste</b>', body: PAYLOAD_BODY }],
  });
  await importFile(window, "carnet.json", payload);

  const card = window.document.querySelector("#song-grid .song-card");
  assert.ok(card, "la carte est rendue");
  const titleEl = card.querySelector(".card-head .title");
  assert.equal(titleEl.textContent, PAYLOAD_TITLE, "le titre est du texte brut");
  assert.equal(card.querySelectorAll("img, script, iframe").length, 0);

  card.click();
  const stage = window.document.querySelector("#stage-inner");
  assert.equal(dangerousElements(window).length, 0, "aucune balise dangereuse après ouverture");
  assert.equal(window.__xssFired, undefined);
  assert.ok(stage.textContent.includes("<iframe"), "le payload du corps reste du texte");
  assert.ok(window.document.querySelector("#p-title").textContent.includes("<img"), "titre lecteur en texte brut");
});
