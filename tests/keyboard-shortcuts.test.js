const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const SETTINGS_KEY = "cantoria-settings";

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

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

function keydown(window, init, target) {
  const event = new window.KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, init));
  (target || window.document).dispatchEvent(event);
  return event;
}

function playToggleText(window) {
  return window.document.querySelector("#play-toggle").textContent;
}

function fontSizeEm(window) {
  return parseFloat(window.document.querySelector("#stage-inner").style.fontSize);
}

test("Espace dans le lecteur démarre la lecture, Espace à nouveau met en pause", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(playToggleText(window), "▶");
  keydown(window, { key: " " });
  assert.equal(playToggleText(window), "❚❚", "lecture démarrée");
  keydown(window, { key: " " });
  assert.equal(playToggleText(window), "▶", "pause");
  window.close();
});

test("Espace est preventDefault (pas de double déclenchement sur un bouton focalisé)", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const event = keydown(window, { key: " " });
  assert.equal(event.defaultPrevented, true);
  assert.equal(playToggleText(window), "❚❚", "un seul déclenchement");
  window.close();
});

test("Ctrl+↑ augmente la taille des paroles d'un palier, Ctrl+↓ la diminue", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(fontSizeEm(window), 1);
  keydown(window, { key: "ArrowUp", ctrlKey: true });
  assert.ok(Math.abs(fontSizeEm(window) - 1.15) < 1e-9, "1 → 1,15 em");
  keydown(window, { key: "ArrowUp", ctrlKey: true });
  assert.ok(Math.abs(fontSizeEm(window) - 1.3) < 1e-9, "1,15 → 1,3 em");
  keydown(window, { key: "ArrowDown", ctrlKey: true });
  assert.ok(Math.abs(fontSizeEm(window) - 1.15) < 1e-9, "1,3 → 1,15 em");
  window.close();
});

test("Ctrl+↑/↓ sont preventDefault (pas de scroll)", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const up = keydown(window, { key: "ArrowUp", ctrlKey: true });
  const down = keydown(window, { key: "ArrowDown", ctrlKey: true });
  assert.equal(up.defaultPrevented, true);
  assert.equal(down.defaultPrevented, true);
  window.close();
});

test("bornes : Ctrl+↑ plafonne à 4,4 em, Ctrl+↓ plancher à 0,7 em", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ defaultFontScale: 4.4 }),
  });
  openFirstSong(window);
  assert.ok(Math.abs(fontSizeEm(window) - 4.4) < 1e-9);
  keydown(window, { key: "ArrowUp", ctrlKey: true });
  assert.ok(Math.abs(fontSizeEm(window) - 4.4) < 1e-9, "plafond 4,4 respecté");
  window.close();

  const window2 = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ defaultFontScale: 0.7 }),
  });
  openFirstSong(window2);
  assert.ok(Math.abs(fontSizeEm(window2) - 0.7) < 1e-9);
  keydown(window2, { key: "ArrowDown", ctrlKey: true });
  assert.ok(Math.abs(fontSizeEm(window2) - 0.7) < 1e-9, "plancher 0,7 respecté");
  window2.close();
});

test("les raccourcis sont inactifs quand le lecteur n'est pas ouvert", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  // Vue bibliothèque : aucun lecteur ouvert.
  assert.equal(window.document.querySelector("#player-view").classList.contains("active"), false);
  keydown(window, { key: " " });
  keydown(window, { key: "ArrowUp", ctrlKey: true });
  keydown(window, { key: "ArrowDown", ctrlKey: true });
  assert.equal(playToggleText(window), "▶", "pas de lecture déclenchée");
  assert.equal(window.document.querySelector("#stage-inner").style.fontSize, "", "taille inchangée");
  window.close();
});

test("les raccourcis sont inactifs quand le focus est dans un champ de saisie", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const input = window.document.querySelector("#f-title"); // champ de l'éditeur
  keydown(window, { key: " " }, input);
  keydown(window, { key: "ArrowUp", ctrlKey: true }, input);
  assert.equal(playToggleText(window), "▶", "Espace ignoré dans un champ");
  assert.equal(fontSizeEm(window), 1, "Ctrl+↑ ignoré dans un champ");

  const textarea = window.document.querySelector("#f-body");
  keydown(window, { key: " ", ctrlKey: false }, textarea);
  assert.equal(playToggleText(window), "▶", "Espace ignoré dans un textarea");
  window.close();
});

test("les raccourcis ne perturbent pas les autres touches (ex. Ctrl+Espace, ↑ seul)", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const ctrlSpace = keydown(window, { key: " ", ctrlKey: true });
  assert.equal(ctrlSpace.defaultPrevented, false, "Ctrl+Espace non intercepté");
  assert.equal(playToggleText(window), "▶");
  const plainUp = keydown(window, { key: "ArrowUp" });
  assert.equal(plainUp.defaultPrevented, false, "↑ seul non intercepté");
  assert.equal(fontSizeEm(window), 1);
  window.close();
});

test("le raccourci bibliothèque (Enter sur une carte) fonctionne toujours", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const card = window.document.querySelector("#song-grid .song-card");
  const event = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  card.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(window.document.querySelector("#player-view").classList.contains("active"), true,
    "le lecteur s'ouvre");
  window.close();
});

test("découvrabilité : les boutons concernés mentionnent leur raccourci dans title", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.match(window.document.querySelector("#play-toggle").getAttribute("title"), /Espace/);
  assert.match(window.document.querySelector("#fs-up").getAttribute("title"), /Ctrl\+↑/);
  assert.match(window.document.querySelector("#fs-down").getAttribute("title"), /Ctrl\+↓/);
  window.close();
});
