const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const STORAGE_KEY = "cantoria-songs-v1";

function loadApp(songs) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
      window.confirm = function () { throw new Error("confirm() natif ne doit plus être appelé"); };
    },
  });
  return dom.window;
}

function css() {
  return fs.readFileSync(HTML_PATH, "utf8");
}

test("le CSS définit :focus-visible pour la navigation clavier", () => {
  const source = css();
  assert.ok(/:focus-visible/.test(source), "une règle :focus-visible doit exister");
  assert.ok(/outline\s*:\s*2px solid var\(--gold\)/.test(source),
    "le focus visible doit poser un contour de 2px");
});

test("le CSS respecte prefers-reduced-motion", () => {
  const source = css();
  assert.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(source),
    "une media query prefers-reduced-motion doit exister");
});

test("ember-pulse n'est plus infini (3 cycles puis statique)", () => {
  const source = css();
  const m = /animation\s*:\s*ember-pulse[^;]*;/.exec(source);
  assert.ok(m, "la règle ember-pulse doit exister");
  assert.ok(!/\binfinite\b/.test(m[0]),
    "ember-pulse ne doit plus tourner en boucle infinie : " + m[0]);
  assert.ok(/\s3\s*;/.test(m[0]), "ember-pulse doit se limiter à 3 itérations : " + m[0]);
});

test("plus aucun confirm() natif dans le script de l'interface", () => {
  const source = css();
  const script = /<script>([\s\S]*)<\/script>/.exec(source)[1];
  assert.ok(!/\bconfirm\s*\(/.test(script),
    "le script ne doit contenir aucun appel à confirm() natif");
});

test("la modale de confirmation remplace le dialogue natif pour la suppression d'une chanson", async () => {
  const window = loadApp([{ id: "s-1", title: "Victime", artist: "", body: "paroles" }]);
  const doc = window.document;
  const card = doc.querySelector("#song-grid .song-card");
  card.click();
  assert.ok(doc.querySelector("#player-view").classList.contains("active"), "lecteur ouvert");
  doc.querySelector("#btn-edit-current").click();
  assert.ok(doc.querySelector("#editor-view").classList.contains("active"), "éditeur ouvert");
  doc.querySelector("#btn-delete").click();
  const overlay = doc.querySelector("#confirm-overlay");
  assert.ok(overlay.classList.contains("show"), "la modale de confirmation s'ouvre");
  assert.ok(doc.querySelector("#confirm-message").textContent.includes("Supprimer"),
    "le message de confirmation mentionne la suppression");
  // Annulation : la chanson survit
  doc.querySelector("#confirm-cancel").click();
  await Promise.resolve();
  assert.ok(!overlay.classList.contains("show"), "la modale se ferme à l'annulation");
  const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.length, 1, "la chanson n'est pas supprimée après annulation");
  // Confirmation : la chanson est supprimée
  doc.querySelector("#btn-delete").click();
  doc.querySelector("#confirm-ok").click();
  await Promise.resolve();
  const after = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  assert.equal(after.length, 0, "la chanson est supprimée après confirmation");
});

test("l'import d'un JSON précédé d'un BOM UTF-8 réussit", () => {
  const window = loadApp([]);
  const doc = window.document;
  const bom = "\uFEFF" + JSON.stringify([{ title: "Depuis PowerShell", body: "paroles" }]);
  const input = doc.querySelector("#import-input");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ name: "export.json" }],
  });
  Object.defineProperty(input, "value", {
    configurable: true,
    get() { return ""; },
    set() {},
  });
  let readText = null;
  Object.defineProperty(window, "FileReader", {
    configurable: true,
    value: function () {
      this.onload = null;
      this.onerror = null;
      this.readAsText = function () {
        const ev = { target: { result: readText } };
        this.result = readText;
        if (this.onload) this.onload(ev);
      };
    },
  });
  readText = bom;
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  assert.equal(stored.length, 1, "la chanson du JSON avec BOM est importée");
  assert.equal(stored[0].title, "Depuis PowerShell");
});

test("la sauvegarde avant restauration utilise un préfixe distinct de « corrupted »", () => {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  assert.ok(script.includes("SONGS_REPLACE_PREFIX"), "un préfixe distinct est défini");
  assert.ok(/backupLibraryBeforeReplace/.test(script),
    "la restauration passe par backupLibraryBeforeReplace");
  assert.ok(!/backupUnreadableLibrary\(JSON\.stringify\(songs\)\)/.test(script),
    "l'état sain n'est plus stocké sous le préfixe des corruptions");
});
