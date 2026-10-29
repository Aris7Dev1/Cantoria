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

/* Régression : le sous-menu « Copies de secours » doit être un enfant direct
   du .modal-panel des paramètres. Un mauvais merge l'avait déplacé en dehors
   du panneau : la règle .modal-panel.show-subview > :not(.modal-subview)
   masquait alors tout le contenu du panneau (bande grise vide de 42 px,
   padding seul) et le sous-menu s'affichait plein écran, sans cadre. */
test("le sous-menu des copies de secours est dans le panneau des paramètres", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([{ id: "s-1", title: "Test", artist: "", body: "[Am]paroles" }]) });
  const doc = window.document;
  const subview = doc.querySelector("#backups-subview");
  const panel = doc.querySelector("#settings-overlay .modal-panel");
  assert.ok(subview, "#backups-subview existe");
  assert.ok(panel, ".modal-panel des paramètres existe");
  assert.equal(subview.parentElement, panel,
    "#backups-subview doit être un enfant direct du .modal-panel, pas de l'overlay");
});

test("à l'ouverture du sous-menu, le panneau garde son contenu de sous-vue et pas seulement son padding", () => {
  const t = Date.now();
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([{ id: "s-1", title: "Test", artist: "", body: "[Am]paroles" }]),
    ["cantoria-edit-backup-" + (t - 1000)]: JSON.stringify({ id: "s-1", title: "Test", artist: "", body: "[Am]ancienne version" }),
  });
  const doc = window.document;
  doc.querySelector("#btn-settings-open").click();
  doc.querySelector("#btn-manage-backups").click();
  const panel = doc.querySelector("#settings-overlay .modal-panel");
  assert.ok(panel.classList.contains("show-subview"), "le panneau passe en mode sous-vue");
  /* Si le sous-menu est hors du panneau, le sélecteur d'enfants masque tout
     et le panneau se réduit à son padding (texte cumulé « Paramètres » seul).
     Dans le panneau, les titres de section du sous-menu restent atteignables. */
  const titles = [...panel.querySelectorAll(".modal-subview .setting-title")].map((el) => el.textContent);
  assert.ok(titles.includes("Carnet"), "la section Carnet est rendue dans le panneau");
  assert.ok(titles.includes("Chansons modifiées"), "la section Chansons modifiées est rendue dans le panneau");
});
