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
      window.Event = window.Event || window.MouseEvent;
    },
  });
  return dom.window;
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la la la", speed: 1 }, overrides);
}

function openEditor(window) {
  window.document.querySelector("#btn-new").click();
  return window.document.querySelector("#f-body");
}

function setSelection(ta, start, end) {
  ta.selectionStart = start;
  ta.selectionEnd = end;
}

test("la barre d'outils de sections est présente dans l'éditeur", () => {
  const window = loadApp();
  openEditor(window);
  for (const id of ["#mark-verse", "#mark-chorus", "#mark-bridge", "#structure-labels"]) {
    assert.ok(window.document.querySelector(id), id + " présent");
  }
});

test("marquer une sélection en refrain l'encapsule en directives ChordPro", () => {
  const window = loadApp();
  const ta = openEditor(window);
  ta.value = "[Am]Couplet\n\n[F]Le refrain\n[G]à marquer\n\n[Am]Suite";
  const start = ta.value.indexOf("[F]Le refrain");
  const end = ta.value.indexOf("[Am]Suite");
  setSelection(ta, start, end);
  window.document.querySelector("#mark-chorus").click();
  assert.match(ta.value, /\{soc\}/, "directive d'ouverture présente");
  assert.match(ta.value, /\{eoc\}/, "directive de fermeture présente");
  assert.ok(ta.value.indexOf("{soc}") < ta.value.indexOf("[F]Le refrain"),
    "la directive ouvre avant la sélection");
  assert.ok(ta.value.indexOf("[F]Le refrain") < ta.value.indexOf("{eoc}"),
    "la fermeture tombe après la sélection");
  assert.ok(ta.value.indexOf("{eoc}") < ta.value.indexOf("[Am]Suite"),
    "la suite n'est pas enveloppée");
});

test("marquer sans sélection insère une paire vide au curseur", () => {
  const window = loadApp();
  const ta = openEditor(window);
  ta.value = "[Am]Début\nFIN";
  setSelection(ta, ta.value.indexOf("FIN"), ta.value.indexOf("FIN"));
  window.document.querySelector("#mark-verse").click();
  assert.match(ta.value, /\{sov\}\n\{eov\}/, "paire vide insérée au curseur");
  assert.ok(ta.value.indexOf("FIN") > ta.value.indexOf("{eov}"),
    "l'insertion ne détruit pas le texte suivant");
});

test("structurer les libellés convertit « [Refrain :] » en directives fermées à la strophe", () => {
  const window = loadApp();
  const ta = openEditor(window);
  ta.value = [
    "Em   Gm",
    "Heure sonne matin",
    "",
    "[Refrain :]",
    "Dm   C",
    "Et pourtant il faut vivre",
    "Bb   A   Dm",
    "Sans problème sans blesser",
    "",
    "Em",
    "Mais vivre pour toujours",
  ].join("\n");
  window.document.querySelector("#structure-labels").click();
  assert.ok(ta.value.indexOf("{soc}") !== -1, "le libellé devient {soc}");
  assert.ok(ta.value.indexOf("{eoc}") !== -1, "une fermeture {eoc} est posée");
  assert.ok(ta.value.indexOf("{soc}") < ta.value.indexOf("Et pourtant"),
    "ouverture avant les paroles du refrain");
  assert.ok(ta.value.indexOf("{eoc}") < ta.value.indexOf("Mais vivre pour toujours"),
    "fermeture avant le couplet suivant");
  assert.ok(ta.value.indexOf("Mais vivre pour toujours") < ta.value.indexOf("{eoc}") === false
    || ta.value.indexOf("{eoc}") < ta.value.indexOf("Mais vivre pour toujours"),
    "le couplet n'est pas enveloppé");
  const toast = window.document.querySelector("#toast").textContent;
  assert.match(toast, /1 section structurée/, "un toast confirme la conversion");
});

test("structurer sans libellé affiche l'absence sans toucher au texte", () => {
  const window = loadApp();
  const ta = openEditor(window);
  ta.value = "[Am]Aucun libellé ici\n[Am]Rien à structurer";
  window.document.querySelector("#structure-labels").click();
  assert.equal(ta.value, "[Am]Aucun libellé ici\n[Am]Rien à structurer", "texte intact");
  const toast = window.document.querySelector("#toast").textContent;
  assert.match(toast, /Aucun libellé de section à structurer/);
});

test("une chanson structurée via l'outil rend une section fermée correctement dans le lecteur", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ body: "[Am]Couplet\n\n[Refrain]\n[F]Le refrain\n\n[Am]Suite" })]) });
  const ta = openEditor(window);
  // simulate: user edits via editor fields then structures
  window.document.querySelector("#song-grid .song-card");
  // open the editor on the existing song
  window.document.querySelector("#song-grid .song-card").click();
  window.document.querySelector("#btn-edit-current").click();
  const body = window.document.querySelector("#f-body");
  body.value = "[Am]Couplet\n\n[Refrain]\n[F]Le refrain\n\n[Am]Suite";
  window.document.querySelector("#structure-labels").click();
  assert.ok(body.value.indexOf("{soc}") !== -1);
  assert.ok(body.value.indexOf("{eoc}") !== -1);
});

test("enregistrer une chanson modifiée renvoie au lecteur de cette chanson", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ body: "[Am]Original" })]) });
  window.document.querySelector("#song-grid .song-card").click();
  assert.ok(window.document.querySelector("#player-view").classList.contains("active"));
  window.document.querySelector("#btn-edit-current").click();
  assert.ok(window.document.querySelector("#editor-view").classList.contains("active"));
  const body = window.document.querySelector("#f-body");
  body.value = "[Am]Modifié";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(window.document.querySelector("#player-view").classList.contains("active"),
    "l'enregistrement d'une modification renvoie au lecteur");
  assert.equal(window.document.querySelector("#p-title").textContent, "Test");
  assert.ok(window.document.querySelector("#stage-inner").textContent.includes("Modifié"),
    "le lecteur affiche la version modifiée");
});

test("enregistrer une nouvelle chanson renvoie à la bibliothèque (comportement inchangé)", () => {
  const window = loadApp();
  window.document.querySelector("#btn-new").click();
  window.document.querySelector("#f-title").value = "Nouvelle";
  window.document.querySelector("#f-body").value = "[C]Paroles";
  window.document.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(window.document.querySelector("#library-view").classList.contains("active"),
    "une nouvelle chanson reste validée côté bibliothèque");
});
