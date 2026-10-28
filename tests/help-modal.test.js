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
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la la la", speed: 1 }, overrides);
}

function keydown(window, props) {
  const event = new window.KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, props));
  window.document.dispatchEvent(event);
  return event;
}

function helpOverlay(window) {
  return window.document.querySelector("#help-overlay");
}

function helpItems(window) {
  return Array.from(window.document.querySelectorAll("#help-content .help-list li"));
}

function keysText(window) {
  return Array.from(window.document.querySelectorAll("#help-content .kbd")).map((k) => k.textContent);
}

test("la bibliothèque et le lecteur proposent chacun un bouton d'aide accessible", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const libBtn = window.document.querySelector("#btn-help-open");
  assert.ok(libBtn, "bouton ? dans l'en-tête de la bibliothèque");
  assert.equal(libBtn.getAttribute("aria-label"), "Aide et raccourcis clavier");
  window.document.querySelector("#song-grid .song-card").click();
  const playerBtn = window.document.querySelector("#btn-help-open-player");
  assert.ok(playerBtn, "bouton ? dans le bandeau du lecteur");
});

test("la modale d'aide liste tous les raccourcis documentés avec leurs touches", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-help-open").click();
  assert.ok(helpOverlay(window).classList.contains("show"), "la modale doit s'ouvrir");

  const sections = Array.from(window.document.querySelectorAll("#help-content .help-section-title")).map((s) => s.textContent);
  assert.deepEqual(sections, ["Lecteur", "Zoom de l'interface", "Bibliothèque", "Éditeur"]);

  const items = helpItems(window);
  assert.equal(items.length, 8, "5 raccourcis lecteur + 2 zoom + 1 bibliothèque");
  assert.ok(items.every((li) => li.querySelector(".help-action")), "chaque ligne a une action");
  assert.ok(items.every((li) => li.querySelector(".kbd")), "chaque ligne a des touches en keycaps");

  const keys = keysText(window).join(" ");
  assert.match(keys, /Espace/);
  assert.match(keys, /Ctrl/);
  assert.match(keys, /Shift/);
  assert.match(keys, /↑ \/ ↓/);
  assert.match(keys, /← \/ →/);
});

test("la modale d'aide se ferme par Échap, clic dehors et bouton Fermer", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-help-open").click();
  assert.ok(helpOverlay(window).classList.contains("show"));
  keydown(window, { key: "Escape" });
  assert.ok(!helpOverlay(window).classList.contains("show"), "Échap ferme l'aide");

  window.document.querySelector("#btn-help-open").click();
  helpOverlay(window).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(!helpOverlay(window).classList.contains("show"), "clic hors panneau ferme l'aide");

  window.document.querySelector("#btn-help-open-player").click();
  window.document.querySelector("#btn-help-close").click();
  assert.ok(!helpOverlay(window).classList.contains("show"), "le bouton Fermer ferme l'aide");
});

test("Échap n'interfère pas avec la fermeture des paramètres quand l'aide est fermée", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-settings-open").click();
  const settings = window.document.querySelector("#settings-overlay");
  assert.ok(settings.classList.contains("show"));
  keydown(window, { key: "Escape" });
  assert.ok(!settings.classList.contains("show"), "Échap ne doit rien casser hors aide");
});

test("les info-bulles des boutons du lecteur correspondent aux raccourcis affichés dans l'aide", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#song-grid .song-card").click();
  const titles = Array.from(window.document.querySelectorAll("#controls button[title]"))
    .map((b) => b.getAttribute("title"));
  const withShortcut = titles.filter((t) => /\(|Ctrl|Espace/.test(t));
  assert.ok(withShortcut.length >= 5, "les commandes du bandeau documentent leurs raccourcis");
  window.document.querySelector("#btn-help-open-player").click();
  const helpText = window.document.querySelector("#help-content").textContent;
  for (const marker of ["Ctrl", "Espace", "↑"]) {
    assert.ok(helpText.includes(marker), `l'aide doit mentionner ${marker}`);
  }
});

test("ouvrir l'aide depuis le lecteur ne déclenche pas lecture ni défilement", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#song-grid .song-card").click();
  const toggle = window.document.querySelector("#play-toggle");
  assert.equal(toggle.textContent, "▶");
  window.document.querySelector("#btn-help-open-player").click();
  assert.equal(toggle.textContent, "▶", "l'aide ne doit pas lancer la lecture");
  assert.ok(helpOverlay(window).classList.contains("show"));
});
