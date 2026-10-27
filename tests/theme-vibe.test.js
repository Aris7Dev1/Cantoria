const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const THEME_KEY = "cantoria-theme";
const html = fs.readFileSync(HTML_PATH, "utf8");

// Les 16 variables communes aux thèmes (mêmes noms que les trois autres blocs).
const VIBE_VARS = [
  "--bg", "--bg-panel", "--bg-panel-2", "--border",
  "--ink-dim", "--ink-mid", "--ink-bright",
  "--gold", "--gold-glow",
  "--chord-ink", "--chord-standalone-ink",
  "--teal", "--danger",
  "--bg-glow", "--primary-grad-light", "--primary-ink",
];
// Variables utilisées par les contrôles de contraste : attendues en hexadécimal.
const HEX_VARS = [
  "--bg", "--bg-panel", "--ink-mid", "--ink-bright",
  "--gold", "--danger", "--chord-ink", "--chord-standalone-ink",
];
const VIBE_FONTS = ["--font-display", "--font-body", "--font-chord"];

function loadApp(seed = {}) {
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
  return Object.assign({
    id: "s-1", title: "Test", artist: "",
    body: "[Am]la la la\n[Refrain]",
    speed: 1,
  }, overrides);
}

function vibeBlock() {
  const rule = /html\[data-theme="vibe"\]\{([^}]*)\}/.exec(html);
  assert.ok(rule, 'bloc html[data-theme="vibe"] présent');
  return rule[1];
}

function vibeVars() {
  const vars = {};
  for (const m of vibeBlock().matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

// Toutes les règles CSS scopées au thème vibe : le bloc de variables et les
// règles préfixées html[data-theme="vibe"] … (formes, détails).
function vibeCssRules() {
  const rules = html.match(/html\[data-theme="vibe"\][^{}]*\{[^}]*\}/g) || [];
  assert.ok(rules.length > 1, "règles scopées au thème vibe présentes");
  return rules.join("\n");
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Luminance relative WCAG 2.x (même calcul que tests/interface-contrast.test.js).
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Même calcul que tests/interface-commands.test.js : getComputedStyle + padding
// + line-height + bordure, avec le max des contributions (un bouton dont la
// taille vient d'un enfant SVG, ex. .fav-btn, n'a ni height ni line-height).
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

// jsdom ne résout pas les em en px : on remonte la cascade en partant de la
// taille racine du navigateur (16 px, « medium »), comme tests/chords.test.js.
function fontPx(window, el) {
  const chain = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.unshift(n);
  let px = 16;
  for (const n of chain) {
    const v = window.getComputedStyle(n).fontSize;
    if (v === "medium") continue;
    const m = /^([\d.]+)(px|em|%)$/.exec(v);
    if (!m) continue;
    const val = parseFloat(m[1]);
    if (m[2] === "px") px = val;
    else px = px * val / (m[2] === "%" ? 100 : 1);
  }
  return px;
}

function openPlayer(window, title) {
  const card = [...window.document.querySelectorAll("#song-grid .song-card")]
    .find((c) => c.querySelector(".title").textContent === title);
  assert.ok(card, `la carte « ${title} » doit exister`);
  card.click();
  assert.ok(window.document.querySelector("#player-view").classList.contains("active"),
    "le lecteur doit s'ouvrir");
}

test("sélecteur : quatre swatchs, le clic sur vibe applique, persiste et active le thème", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const swatches = window.document.querySelectorAll(".theme-picker .swatch");
  assert.equal(swatches.length, 4, "quatre swatchs de thème dans le sélecteur");
  const vibe = window.document.querySelector('.theme-picker .swatch[data-theme="vibe"]');
  assert.ok(vibe, "swatch vibe présent");
  vibe.click();
  assert.equal(window.document.documentElement.getAttribute("data-theme"), "vibe",
    "data-theme=vibe appliqué sur <html>");
  assert.equal(window.localStorage.getItem(THEME_KEY), "vibe", "thème persisté dans le localStorage");
  assert.ok(vibe.classList.contains("active"), "swatch vibe actif");
  assert.equal(window.document.querySelectorAll(".theme-picker .swatch.active").length, 1,
    "un seul swatch actif à la fois");
  window.close();
});

test("sélecteur : un thème vibe persisté est restauré au chargement", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]), [THEME_KEY]: "vibe" });
  assert.equal(window.document.documentElement.getAttribute("data-theme"), "vibe",
    "data-theme restauré depuis le localStorage");
  const vibe = window.document.querySelector('.theme-picker .swatch[data-theme="vibe"]');
  assert.ok(vibe.classList.contains("active"), "swatch vibe actif au chargement");
  window.close();
});

test("sélecteur : le thème par défaut au reset des paramètres reste campfire", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]), [THEME_KEY]: "vibe" });
  window.document.querySelector("#btn-settings-reset").click();
  assert.equal(window.document.documentElement.getAttribute("data-theme"), "campfire",
    "le reset ramène au thème par défaut campfire");
  assert.equal(window.localStorage.getItem(THEME_KEY), "campfire", "campfire persisté au reset");
  assert.ok(window.document.querySelector('.theme-picker .swatch[data-theme="campfire"]').classList.contains("active"),
    "swatch campfire actif au reset");
  window.close();
});

test("variables : le bloc vibe définit les 16 variables et les 3 polices monospace", () => {
  const vars = vibeVars();
  for (const name of VIBE_VARS) {
    assert.ok(vars[name], name + " définie dans le bloc vibe");
  }
  for (const name of HEX_VARS) {
    assert.match(vars[name], /^#[0-9a-fA-F]{6}$/,
      name + " en hexadécimal (contrôles de contraste)");
  }
  for (const name of VIBE_FONTS) {
    assert.ok(vars[name], name + " redéfinie dans le bloc vibe");
    assert.match(vars[name], /monospace/,
      name + " se termine par monospace (pile de polices système)");
  }
});

test("contraste : interface ≥ 4,5:1 et lecteur ≥ 7:1 pour le thème vibe", () => {
  const vars = vibeVars();
  const bg = vars["--bg"].toLowerCase();
  const panel = vars["--bg-panel"].toLowerCase();

  // Interface (seuil chrome.minContrast = 4,5:1) : .eyebrow (--gold),
  // .btn.danger (--danger) et les textes --ink-mid/--ink-bright sur --bg/--bg-panel.
  const interfacePairs = [
    ["--gold (.eyebrow)", vars["--gold"]],
    ["--danger (.btn.danger)", vars["--danger"]],
    ["--ink-mid", vars["--ink-mid"]],
    ["--ink-bright", vars["--ink-bright"]],
  ];
  for (const [label, fg] of interfacePairs) {
    for (const [fondName, fond] of [["--bg", bg], ["--bg-panel", panel]]) {
      const ratio = contrastRatio(fg.toLowerCase(), fond);
      assert.ok(ratio >= 4.5,
        label + " (" + fg + ") sur " + fondName + " (" + fond + ") = " +
        ratio.toFixed(2) + ":1 < 4,5:1");
    }
  }

  // Lecteur (seuil stage.minContrast = 7:1) : paroles (--ink-bright) et
  // accords (--chord-ink, --chord-standalone-ink) sur --bg.
  const lecteurPairs = [
    ["paroles (--ink-bright)", vars["--ink-bright"]],
    ["accords (--chord-ink)", vars["--chord-ink"]],
    ["accords isolés (--chord-standalone-ink)", vars["--chord-standalone-ink"]],
  ];
  for (const [label, fg] of lecteurPairs) {
    const ratio = contrastRatio(fg.toLowerCase(), bg);
    assert.ok(ratio >= 7,
      label + " (" + fg + ") sur --bg (" + bg + ") = " + ratio.toFixed(2) + ":1 < 7:1");
  }
});

test("contraste : --danger du thème vibe reste une teinte rouge (canal rouge dominant)", () => {
  const { r, g, b } = hexToRgb(vibeVars()["--danger"].toLowerCase());
  assert.ok(r > g && r > b, "vibe : --danger reste rouge (r=" + r + ", g=" + g + ", b=" + b + ")");
});

test("tailles : commandes ≥ 32 px et texte du lecteur non réduit avec le thème vibe actif", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]), [THEME_KEY]: "vibe" });
  assert.equal(window.document.documentElement.getAttribute("data-theme"), "vibe",
    "thème vibe actif pendant le test");

  // Bibliothèque : swatchs du sélecteur et boutons favoris des cartes.
  window.document.querySelectorAll(".theme-picker button.swatch").forEach((swatch, i) => {
    assertAtLeast32px(window, swatch, "button.swatch n°" + (i + 1));
  });
  window.document.querySelectorAll("#song-grid .song-card button.fav-btn").forEach((btn, i) => {
    assertAtLeast32px(window, btn, "button.fav-btn n°" + (i + 1));
  });

  // Paramètres : switches de la fenêtre.
  window.document.querySelector("#btn-settings-open").click();
  const overlay = window.document.querySelector("#settings-overlay");
  assert.ok(overlay.classList.contains("show"), "#settings-overlay ouvert");
  overlay.querySelectorAll("button.switch").forEach((btn, i) => {
    assertAtLeast32px(window, btn, "button.switch n°" + (i + 1));
  });
  window.document.querySelector("#btn-settings-close").click();

  // Lecteur : commandes du bandeau (mêmes sélecteurs que tests/reader-controls.test.js).
  openPlayer(window, "Test");
  const selectors = [
    "#play-toggle",
    "#speed-down", "#speed-up",
    "#tr-down", "#tr-up",
    "#fs-down", "#fs-up",
    "#btn-pin-controls",
  ];
  for (const btn of window.document.querySelectorAll("#countdown-picker button")) {
    selectors.push("#countdown-picker button[data-seconds=\"" + btn.getAttribute("data-seconds") + "\"]");
  }
  for (const sel of selectors) {
    const el = window.document.querySelector(sel);
    assert.ok(el, sel + " présent");
    assertAtLeast32px(window, el, sel);
  }

  // Tailles de police du lecteur : le thème ne les réduit pas (seuils
  // scripts/visual/thresholds.json : accords ≥ 18 px, paroles ≥ 20 px).
  const chord = window.document.querySelector("#stage-inner .seg-chord");
  const word = window.document.querySelector("#stage-inner .seg-word");
  const standalone = window.document.querySelector("#stage-inner .seg-chord.standalone");
  assert.ok(chord && word && standalone, "le lecteur contient un accord, une parole et un accord isolé");
  assert.ok(fontPx(window, chord) >= 18,
    `accord à ${fontPx(window, chord)} px, minimum 18 px avec le thème vibe`);
  assert.ok(fontPx(window, word) >= 20,
    `parole à ${fontPx(window, word)} px, minimum 20 px avec le thème vibe`);
  assert.ok(fontPx(window, standalone) >= 18,
    `accord isolé à ${fontPx(window, standalone)} px, minimum 18 px avec le thème vibe`);
  window.close();
});

test("zéro réseau : le CSS du thème vibe n'embarque aucune ressource externe", () => {
  const css = vibeCssRules();
  assert.doesNotMatch(css, /url\(/i, "aucun url() dans les règles vibe");
  assert.doesNotMatch(css, /https?:/i, "aucune URL dans les règles vibe");
  assert.doesNotMatch(css, /@import/i, "aucun @import dans les règles vibe");
  assert.doesNotMatch(css, /@font-face/i, "aucun @font-face dans les règles vibe");
});
