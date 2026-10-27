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

// Même calcul que le test « style : chaque commande du bandeau mesure au moins
// 32 px de côté » (tests/reader-controls.test.js) : getComputedStyle + padding
// + line-height + bordure, avec le max des contributions. La hauteur/largeur
// du contenu enfant est ajoutée : jsdom ne fait pas de layout, un bouton dont
// la taille vient d'un SVG enfant (ex. .fav-btn) n'a ni height ni line-height.
function commandSize(window, el) {
  const px = (v) => parseFloat(v) || 0;
  const cs = window.getComputedStyle(el);
  const padY = px(cs.paddingTop) + px(cs.paddingBottom);
  const padX = px(cs.paddingLeft) + px(cs.paddingRight);
  const borderY = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  const borderX = px(cs.borderLeftWidth) + px(cs.borderRightWidth);
  const lineH = cs.lineHeight === "normal" ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
  let childH = 0;
  let childW = 0;
  for (const child of el.children) {
    const ccs = window.getComputedStyle(child);
    childH = Math.max(childH, px(ccs.height) + px(ccs.marginTop) + px(ccs.marginBottom));
    childW = Math.max(childW, px(ccs.width) + px(ccs.marginLeft) + px(ccs.marginRight));
  }
  return {
    height: Math.max(px(cs.height), px(cs.minHeight), padY + lineH + borderY, padY + childH + borderY),
    width: Math.max(px(cs.width), px(cs.minWidth), padX + borderX, padX + childW + borderX),
  };
}

function assertAtLeast32px(window, el, label) {
  const size = commandSize(window, el);
  assert.ok(size.height >= 32, label + " : hauteur calculée " + size.height + " px < 32 px");
  assert.ok(size.width >= 32, label + " : largeur calculée " + size.width + " px < 32 px");
}

test("style : les swatchs du sélecteur de thème mesurent au moins 32 px de côté", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const swatches = window.document.querySelectorAll(".theme-picker button.swatch");
  assert.ok(swatches.length >= 3, "au moins trois swatchs de thème dans le header");
  swatches.forEach((swatch, i) => {
    assertAtLeast32px(window, swatch, "button.swatch n°" + (i + 1));
  });
  window.close();
});

test("style : les boutons favoris des cartes de la bibliothèque mesurent au moins 32 px de côté", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const favBtns = window.document.querySelectorAll("#song-grid .song-card button.fav-btn");
  assert.ok(favBtns.length >= 1, "au moins un bouton favori sur une carte");
  favBtns.forEach((btn, i) => {
    assertAtLeast32px(window, btn, "button.fav-btn n°" + (i + 1));
  });
  window.close();
});

test("style : les switches des paramètres mesurent au moins 32 px de côté", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-settings-open").click();
  const overlay = window.document.querySelector("#settings-overlay");
  assert.ok(overlay.classList.contains("show"), "#settings-overlay ouvert");
  const switches = overlay.querySelectorAll("button.switch");
  assert.ok(switches.length >= 4, "au moins quatre switches dans les paramètres");
  switches.forEach((btn, i) => {
    assertAtLeast32px(window, btn, "button.switch n°" + (i + 1));
  });
  window.close();
});

test("style : #setting-spotlight mesure au moins 32 px de côté", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-settings-open").click();
  const spotlight = window.document.querySelector("#setting-spotlight");
  assert.ok(spotlight, "#setting-spotlight présent");
  assert.ok(spotlight.classList.contains("switch"), "#setting-spotlight porte la classe .switch");
  assertAtLeast32px(window, spotlight, "button#setting-spotlight");
  window.close();
});

test("style : le knob du switch tient dans la piste et la translation active est cohérente", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-settings-open").click();
  const spotlight = window.document.querySelector("#setting-spotlight");
  const knob = spotlight.querySelector(".knob");
  const px = (v) => parseFloat(v) || 0;
  const cs = window.getComputedStyle(spotlight);
  const knobCs = window.getComputedStyle(knob);
  assert.equal(px(cs.height), 32, "switch de 32 px de haut");
  assert.equal(px(knobCs.width), 26, "knob de 26 px de côté");
  assert.equal(px(knobCs.height), 26, "knob de 26 px de haut");
  // jsdom ne résout pas var(--border) : la bordure déclarée (1 px) est prise
  // dans le calcul à partir du CSS textuel, comme en navigateur.
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const switchRule = /\.switch\{([^}]*)\}/.exec(html);
  assert.ok(switchRule, "règle .switch présente");
  const declaredBorder = px(/border:([\d.]+)px/.exec(switchRule[1])[1]);
  const declaredPad = px(/padding:([\d.]+)px/.exec(switchRule[1])[1]);
  const contentWidth = px(cs.width) - 2 * declaredPad - 2 * declaredBorder;
  const expectedTranslation = contentWidth - px(knobCs.width);
  const knobRule = /\.switch\.active \.knob\{([^}]*)\}/.exec(html);
  assert.ok(knobRule, "règle .switch.active .knob présente");
  const declaredTranslation = px(/translateX\(([\d.]+)px\)/.exec(knobRule[1])[1]);
  assert.equal(declaredTranslation, expectedTranslation,
    "translation active = largeur − 2×padding − 2×bordure − knob (" + expectedTranslation + " px)");
  assert.ok(expectedTranslation >= 0, "le knob tient dans la piste à droite");
  window.close();
});
