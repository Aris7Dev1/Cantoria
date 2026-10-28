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

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

function songBody() {
  return [
    "{sov}",
    "[Am]Premier couplet",
    "{eov}",
    "",
    "{soc}",
    "[F]Le refrain [C]se repère",
    "{eoc}",
    "",
    "{sob}",
    "[G]Le pont",
    "{eob}",
  ].join("\n");
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: songBody(), speed: 1 }, overrides);
}

function cssRules(window) {
  return Array.from(window.document.styleSheets).flatMap((sheet) => {
    try { return Array.from(sheet.cssRules); } catch (e) { return []; }
  });
}

function ruleFor(window, selector, prop) {
  const rule = cssRules(window).find((r) =>
    r.selectorText && r.selectorText.split(",").map((s) => s.trim()).includes(selector)
  );
  return rule ? rule.style[prop] : undefined;
}

test("le refrain est marqué d'un liseré gauche doré, le pont d'un liseré bleu-vert", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const chorus = window.document.querySelector("#stage-inner .chorus");
  assert.ok(chorus, "un bloc refrain doit exister");
  assert.equal(ruleFor(window, ".chorus", "border-left"), "4px solid var(--gold)",
    "le refrain doit avoir un liseré gauche or, lié à la variable du thème");
  const bridge = window.document.querySelector("#stage-inner .bridge");
  assert.ok(bridge, "un bloc pont doit exister");
  assert.equal(ruleFor(window, ".bridge", "border-left"), "4px solid var(--teal)",
    "le pont doit avoir un liseré bleu-vert");
});

test("les sections portent leur libellé français en clair", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const labels = Array.from(window.document.querySelectorAll("#stage-inner .section-label")).map((el) => el.textContent);
  assert.deepEqual(labels, ["Couplet", "Refrain", "Pont"]);
});

test("le couplet n'est pas encapsulé dans un bloc de couleur pleine", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const verse = window.document.querySelector("#stage-inner .verse");
  assert.ok(verse, "le bloc couplet doit exister (pour l'ancrage des sections)");
  const style = window.getComputedStyle(verse);
  assert.equal(style.backgroundColor, "rgba(0, 0, 0, 0)",
    "le couplet reste sans fond, seul le refrain et le pont se détachent");
});

test("une chanson sans marqueurs ChordPro ne crée aucun bloc de section", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song({ body: "[Am]Juste des paroles [C]sans sections" })]),
  });
  openFirstSong(window);
  assert.equal(window.document.querySelectorAll("#stage-inner .chorus").length, 0);
  assert.equal(window.document.querySelectorAll("#stage-inner .verse").length, 0);
  assert.equal(window.document.querySelectorAll("#stage-inner .bridge").length, 0);
});
