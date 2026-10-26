const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const SETTINGS_KEY = "cantoria-settings";

function loadApp(seed = {}, options = {}) {
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
      if (options.carnetDesktop) {
        window.carnetDesktop = options.carnetDesktop;
      }
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
  return parseFloat(window.document.querySelector("#stage-inner").style.getPropertyValue("--reader-scale"));
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
  assert.equal(window.document.querySelector("#stage-inner").style.getPropertyValue("--reader-scale"), "", "taille inchangée");
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

/* ---------- Zoom de l'interface (Ctrl+± / Ctrl+- / Ctrl+0) ---------- */

function zoomMock(initial = 1) {
  const state = { factor: initial, calls: [] };
  return {
    state,
    api: {
      setZoomFactor: (f) => {
        state.calls.push(f);
        state.factor = f;
        return Promise.resolve(f);
      },
      getZoomFactor: () => Promise.resolve(state.factor),
      onZoomChanged: () => () => {},
    },
  };
}

function zoomCssVar(window) {
  return window.document.documentElement.style.getPropertyValue("--zoom");
}

test("Ctrl+= et Ctrl++ zooment par paliers de 0,1 via carnetDesktop.setZoomFactor", async () => {
  const mock = zoomMock(1);
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, { carnetDesktop: mock.api });
  await new Promise((r) => setTimeout(r, 0)); // laisse l'init getZoomFactor se résoudre
  keydown(window, { key: "=", ctrlKey: true });
  keydown(window, { key: "+", ctrlKey: true });
  assert.deepEqual(mock.state.calls, [1.1, 1.2]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(zoomCssVar(window), "1.2", "--zoom mis à jour sur :root");
  window.close();
});

test("Ctrl+- dézoome, Ctrl+0 retourne à ×1, les événements sont preventDefault", async () => {
  const mock = zoomMock(1.5);
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, { carnetDesktop: mock.api });
  await new Promise((r) => setTimeout(r, 0));
  const minus = keydown(window, { key: "-", ctrlKey: true });
  assert.equal(minus.defaultPrevented, true);
  const zero = keydown(window, { key: "0", ctrlKey: true });
  assert.equal(zero.defaultPrevented, true);
  assert.deepEqual(mock.state.calls, [1.4, 1]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(zoomCssVar(window), "1");
  window.close();
});

test("bornes du zoom : [0,5 ; 2]", async () => {
  const mock = zoomMock(1.95);
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, { carnetDesktop: mock.api });
  await new Promise((r) => setTimeout(r, 0));
  keydown(window, { key: "=", ctrlKey: true });
  keydown(window, { key: "=", ctrlKey: true });
  assert.deepEqual(mock.state.calls, [2, 2], "plafond ×2 atteint et maintenu");
  window.close();

  const mock2 = zoomMock(0.55);
  const window2 = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, { carnetDesktop: mock2.api });
  await new Promise((r) => setTimeout(r, 0));
  keydown(window2, { key: "-", ctrlKey: true });
  keydown(window2, { key: "-", ctrlKey: true });
  assert.deepEqual(mock2.state.calls, [0.5, 0.5], "plancher ×0,5 atteint et maintenu");
  window2.close();
});

test("les raccourcis zoom sont globaux : actifs dans la bibliothèque et avec le focus dans un champ", async () => {
  const mock = zoomMock(1);
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, { carnetDesktop: mock.api });
  await new Promise((r) => setTimeout(r, 0));
  // Vue bibliothèque (pas de lecteur ouvert).
  keydown(window, { key: "=", ctrlKey: true });
  assert.deepEqual(mock.state.calls, [1.1], "zoom actif hors du lecteur");
  // Focus dans un champ de saisie : les modificateurs restent actifs.
  openFirstSong(window);
  const input = window.document.querySelector("#f-title");
  keydown(window, { key: "=", ctrlKey: true }, input);
  assert.deepEqual(mock.state.calls, [1.1, 1.2], "zoom actif même dans un champ");
  window.close();
});

test("les raccourcis zoom n'interfèrent pas avec Espace / Ctrl+↑/↓", async () => {
  const mock = zoomMock(1);
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) }, { carnetDesktop: mock.api });
  await new Promise((r) => setTimeout(r, 0));
  openFirstSong(window);
  const space = keydown(window, { key: " ", ctrlKey: true });
  assert.equal(space.defaultPrevented, false, "Ctrl+Espace non intercepté par le zoom");
  assert.equal(playToggleText(window), "▶", "pas de lecture déclenchée");
  const up = keydown(window, { key: "ArrowUp", ctrlKey: true });
  assert.equal(up.defaultPrevented, true, "Ctrl+↑ toujours intercepté par le lecteur");
  assert.ok(Math.abs(fontSizeEm(window) - 1.15) < 1e-9, "la taille des paroles a augmenté");
  assert.deepEqual(mock.state.calls, [], "aucun appel zoom déclenché");
  // Sans Ctrl, les touches =, -, 0 ne déclenchent pas le zoom.
  const plain = keydown(window, { key: "=" });
  assert.equal(plain.defaultPrevented, false);
  assert.deepEqual(mock.state.calls, []);
  window.close();
});

test("sans carnetDesktop (navigateur), le zoom reste en repli local sur --zoom", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  await new Promise((r) => setTimeout(r, 0));
  keydown(window, { key: "=", ctrlKey: true });
  assert.equal(zoomCssVar(window), "1.1", "--zoom appliqué localement");
  keydown(window, { key: "0", ctrlKey: true });
  assert.equal(zoomCssVar(window), "1");
  window.close();
});
