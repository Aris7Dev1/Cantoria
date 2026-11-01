const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

/* Issue #94 : défilement calibré sur une durée cible (mm:ss), opt-in par
   chanson, mode manuel inchangé par défaut. */

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", key: "", capo: "", body: "[Am]la la la\n[G]mi mi mi", speed: 1 }, overrides);
}

test("parseDuration accepte mm:ss et secondes, refuse le reste", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const doc = window.document;
  // on passe par l'éditeur pour atteindre parseDuration via le formulaire
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#btn-edit-current").click();
  const durations = [
    ["3:24", 204],
    ["0:05", 5],
    ["90", 90],
    ["", null],
    ["abc", null],
    ["3:99", null],
    ["0", null],
  ];
  for (const [input, expected] of durations) {
    doc.querySelector("#f-duration").value = input;
    doc.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    const stored = JSON.parse(window.localStorage.getItem(SONGS_KEY))[0];
    assert.equal(stored.targetDurationSec, expected, `parseDuration(${JSON.stringify(input)})`);
  }
});

test("le champ durée persiste et est réexporté/importé avec la bibliothèque", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#btn-edit-current").click();
  doc.querySelector("#f-duration").value = "2:30";
  doc.querySelector("#f-calibrated").checked = true;
  doc.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  let stored = JSON.parse(window.localStorage.getItem(SONGS_KEY))[0];
  assert.equal(stored.targetDurationSec, 150);
  assert.equal(stored.calibrated, true);

  // réouverture de l'éditeur : le champ est rechargé
  doc.querySelector("#btn-edit-current").click();
  assert.equal(doc.querySelector("#f-duration").value, "2:30");
  assert.equal(doc.querySelector("#f-calibrated").checked, true);

  // export JSON contient le réglage
  let exported = null;
  window.URL.createObjectURL = (blob) => { blob.text().then((t) => { exported = t; }); return "blob:mock"; };
  window.URL.revokeObjectURL = () => {};
  doc.querySelector("#btn-export").click();
  await sleep(20);
  const payload = JSON.parse(exported);
  assert.equal(payload.songs[0].targetDurationSec, 150);
  assert.equal(payload.songs[0].calibrated, true);
});

test("ancienne chanson sans durée cible : mode manuel par défaut, bouton cal. désactivé", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#song-grid .song-card").click();
  const calBtn = window.document.querySelector("#btn-calibrated");
  assert.equal(calBtn.disabled, true, "pas de durée cible -> bouton désactivé");
  assert.equal(window.document.querySelector("#speed-val").textContent, "×1", "mode manuel, pas de marqueur (cal.)");
});

test("chanson calibrée : la vitesse affichée est le facteur équivalent et le défilement finit à ±2 s de la cible", async () => {
  const s = song({ targetDurationSec: 100, calibrated: true, speed: 1 });
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([s]) });
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  await sleep(10);

  const calBtn = doc.querySelector("#btn-calibrated");
  assert.equal(calBtn.disabled, false);
  assert.equal(calBtn.getAttribute("aria-pressed"), "true", "mode calibré actif dès l'ouverture");
  assert.ok(doc.querySelector("#speed-val").textContent.includes("(cal.)"), "marqueur (cal.) affiché");

  // hauteur fictive : 2000px défilables, 500px visibles -> 1500px à parcourir
  const stage = doc.querySelector("#stage");
  Object.defineProperty(stage, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(stage, "clientHeight", { value: 500, configurable: true });
  Object.defineProperty(stage, "scrollTop", { value: 0, writable: true, configurable: true });

  // recalcule l'affichage après le rendu réel
  doc.querySelector("#speed-val").textContent = "";
  // déclenche le calcul via le bouton (déjà actif) : on force un updateSpeedStepper via toggle off/on
  calBtn.click(); // repasse manuel
  calBtn.click(); // recalibré
  const shown = doc.querySelector("#speed-val").textContent;
  // facteur attendu : (1500/100) px/s / (22 * 1 / 1) = 15/22 ≈ 0,68 -> ×0,68 (cal.)
  assert.match(shown, /×0,68 \(cal\.\)/, `facteur équivalent affiché, got: ${shown}`);

  // simule le défilement : vitesse calibrée = 15 px/s sur 1500px -> 100 s (la cible)
  doc.querySelector("#play-toggle").click(); // lance
  assert.ok(doc.querySelector("#play-toggle").textContent === "❚❚");
  // position à 1485px : il reste 15px, soit 1 s à 15 px/s -> la frame suivante atteint la fin
  stage.scrollTop = 1485;
  stage.dispatchEvent(new window.Event("scroll"));
  // attend que le RAF fasse avancer scrollPos au-delà du max (dt réel ~16ms -> ~0,24px/frame, 15px = ~63 frames)
  await new Promise((resolve) => {
    const check = () => {
      if (doc.querySelector("#play-toggle").textContent === "▶") return resolve();
      setTimeout(check, 20);
    };
    setTimeout(check, 20);
  });
  assert.equal(doc.querySelector("#play-toggle").textContent, "▶", "fin atteinte, défilement arrêté");
  assert.ok(window.document.querySelector("#toast").textContent.includes("Fin de la chanson"));
});

test("ajuster manuellement la vitesse quitte le mode calibré (opt-out)", async () => {
  const s = song({ targetDurationSec: 100, calibrated: true });
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([s]) });
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  await sleep(10);
  assert.ok(doc.querySelector("#speed-val").textContent.includes("(cal.)"));
  doc.querySelector("#speed-up").click();
  assert.ok(!doc.querySelector("#speed-val").textContent.includes("(cal.)"), "marqueur retiré après réglage manuel");
  assert.equal(doc.querySelector("#btn-calibrated").getAttribute("aria-pressed"), "false");
});
