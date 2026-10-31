const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const html = () => fs.readFileSync(HTML_PATH, "utf8");

/* Nettoyage mobile (décision 1.1/1.2 de la release) : sur écran tactile,
   les indications clavier n'ont pas de sens — masquées proprement,
   desktop strictement inchangé. Détection par hover:none (pas la largeur :
   une tablette avec clavier garde ses raccourcis). */

function boot(mobile) {
  const dom = new JSDOM(html(), {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: !!mobile, addListener() {}, removeListener() {} });
    },
  });
  return dom.window;
}

test("tactile : la classe touch-device est posée et masque les indications clavier", async () => {
  const window = boot(true);
  await new Promise((r) => setTimeout(r, 200));
  const doc = window.document;
  assert.ok(doc.documentElement.classList.contains("touch-device"),
    "classe touch-device posée sur <html>");
  // CSS : les règles de masquage existent pour la classe
  const css = html();
  assert.ok(/html\.touch-device \.kbd\{display:none;\}/.test(css), "kbd masqués en tactile");
  assert.ok(/html\.touch-device \.section-tools-label\.shortcut-hint\{display:none;\}/.test(css),
    "libellé Ctrl+S masqué en tactile");
  window.close();
});

test("tactile : la modale d'aide ne montre aucune liste de raccourcis", async () => {
  const window = boot(true);
  await new Promise((r) => setTimeout(r, 200));
  const doc = window.document;
  doc.querySelector("#btn-help-open-player").click();
  assert.equal(doc.querySelectorAll("#help-content .help-list").length, 0,
    "aucune liste de raccourcis sur tactile");
  assert.ok(doc.querySelectorAll("#help-content .help-note").length > 0,
    "les notes d'usage restent affichées");
  window.close();
});

test("desktop : aucune régression — raccourcis et listes intacts", async () => {
  const window = boot(false);
  await new Promise((r) => setTimeout(r, 200));
  const doc = window.document;
  assert.ok(!doc.documentElement.classList.contains("touch-device"),
    "pas de classe touch-device sur desktop");
  doc.querySelector("#btn-help-open-player").click();
  assert.ok(doc.querySelectorAll("#help-content .help-list").length > 0,
    "les listes de raccourcis restent affichées sur desktop");
  // le libellé Ctrl+S reste dans le DOM (masqué par CSS uniquement en tactile)
  assert.ok(doc.querySelector(".section-tools-label.shortcut-hint"),
    "le libellé Ctrl+S existe toujours sur desktop");
  window.close();
});
