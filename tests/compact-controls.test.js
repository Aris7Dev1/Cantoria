const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const SETTINGS_KEY = "cantoria-settings";

const song = () => ({
  id: "s-1", title: "Cendrillon", artist: "Tellem Toros",
  body: "[Am]paroles", speed: 1,
});

function loadApp(settings = {}) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(SONGS_KEY, JSON.stringify([song()]));
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      window.confirm = () => true;
    },
  });
  return dom.window;
}

const tick = () => new Promise((r) => setTimeout(r, 100));

/* Issue #64 : bandeau compact mobile — rangée essentielle par défaut,
   chevron pour révéler les groupes secondaires, réglage mémorisé,
   desktop inchangé. */

test("le chevron existe dans la rangée essentielle (44 px minimum en portrait)", () => {
  const css = fs.readFileSync(HTML_PATH, "utf8");
  const mq = /@media \(max-width: 480px\)[\s\S]*?\n  \}/.exec(css);
  assert.ok(mq, "media query portrait");
  assert.ok(/#btn-toggle-secondary\{display:flex;min-width:44px;min-height:44px/.test(mq[0]),
    "chevron visible et >= 44 px en portrait");
  assert.ok(/#controls\.controls-collapsed \.ctrl-row-secondary\{display:none;\}/.test(mq[0]),
    "le repli masque la rangée secondaire en portrait");
});

test("par défaut (réglage vierge) : rangée repliée, mémorisée, chevron bascule", async () => {
  const window = loadApp();
  await tick();
  const controls = window.document.querySelector("#controls");
  const btn = window.document.querySelector("#btn-toggle-secondary");
  assert.ok(controls.classList.contains("controls-collapsed"),
    "replié par défaut (controlsCompactMobile: true par défaut)");
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  // le réglage par défaut est persisté au premier tap
  btn.click();
  assert.ok(!controls.classList.contains("controls-collapsed"), "tap révèle");
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(btn.getAttribute("aria-label"), "Masquer les commandes secondaires");
  const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
  assert.equal(saved.controlsCompactMobile, false, "le choix est mémorisé");
  // second tap referme
  btn.click();
  assert.ok(controls.classList.contains("controls-collapsed"), "second tap referme");
  window.close();
});

test("réglage mémorisé : controlsCompactMobile=false ouvre le bandeau à l'ouverture du lecteur", async () => {
  const window = loadApp({ controlsCompactMobile: false });
  await tick();
  const controls = window.document.querySelector("#controls");
  assert.ok(!controls.classList.contains("controls-collapsed"),
    "l'état ouvert persiste entre sessions");
  window.close();
});

test("la rangée essentielle contient play, vitesse et le chevron — les secondaires dans l'autre rangée", async () => {
  const window = loadApp();
  await tick();
  const rowMain = window.document.querySelector("#controls .ctrl-row:not(.ctrl-row-secondary):not(.ctrl-row-main)");
  assert.ok(rowMain.querySelector("#play-toggle"), "play dans la rangée essentielle");
  assert.ok(rowMain.querySelector("#speed-stepper"), "vitesse dans la rangée essentielle");
  assert.ok(rowMain.querySelector("#btn-toggle-secondary"), "chevron dans la rangée essentielle");
  const rowSec = window.document.querySelector("#controls-secondary-row");
  for (const id of ["tr-up", "fs-up", "section-next", "countdown-picker"]) {
    assert.ok(rowSec.querySelector("#" + id), "#" + id + " dans la rangée secondaire");
  }
  window.close();
});

test("desktop : la rangée secondaire reste visible (le repli n'a d'effet qu'en portrait)", async () => {
  const window = loadApp(); // réglage replié par défaut
  await tick();
  // jsdom n'applique pas les media queries : la règle de base s'applique.
  // La classe controls-collapsed est présente (état du réglage) mais la
  // règle de masquage vit UNIQUEMENT dans la media query portrait —
  // sur desktop (>=861px), display reste flex.
  const row = window.document.querySelector("#controls-secondary-row");
  assert.equal(window.getComputedStyle(row).display, "flex",
    "règle de base : la classe de repli ne masque pas hors media query");
  window.close();
});

test("l'auto-hide 3s ne casse pas : le bandeau replié répond toujours au réveil", async () => {
  const window = loadApp();
  await tick();
  // marquer l'activité comme le ferait un tap sur la scène : le bandeau
  // doit rester opérationnel (classe auto-hidden retirée au réveil)
  const stage = window.document.querySelector("#stage");
  stage.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  const controls = window.document.querySelector("#controls");
  assert.ok(!controls.classList.contains("auto-hidden"),
    "réveil du bandeau fonctionnel dans l'état replié");
  window.close();
});
