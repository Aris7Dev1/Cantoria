const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

// Thème clair « Plein air » (data-theme="daylight") : structure identique aux
// autres thèmes, exposition complète (swatch + i18n fr/en), et contrastes du
// chrome ≥ 4,5:1 — même approche textuelle que tests/interface-contrast.test.js.
const MIN_CHROME_CONTRAST = 4.5;

function themeVars(theme) {
  const rule = new RegExp('html\\[data-theme="' + theme + '"\\]\\{([^}]*)\\}').exec(html);
  assert.ok(rule, 'bloc html[data-theme="' + theme + '"] présent');
  const vars = {};
  for (const m of rule[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    vars[m[1]] = m[2].toLowerCase();
  }
  return vars;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

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

const COMMON_HEX_VARS = [
  "--bg", "--bg-panel", "--bg-panel-2", "--border",
  "--ink-dim", "--ink-mid", "--ink-bright",
  "--gold", "--chord-ink", "--chord-standalone-ink",
  "--teal", "--danger",
  "--bg-glow", "--primary-grad-light", "--primary-ink",
];

test("daylight : le bloc de thème expose toutes les variables communes en hex", () => {
  const vars = themeVars("daylight");
  for (const name of COMMON_HEX_VARS) {
    assert.ok(vars[name], "daylight : " + name + " doit être définie en hex");
  }
  const rule = new RegExp('html\\[data-theme="daylight"\\]\\{([^}]*)\\}').exec(html);
  assert.ok(/--gold-glow\s*:\s*rgba\(/.test(rule[1]), "daylight : --gold-glow doit rester une couleur rgba()");
});

test("daylight : le thème est clair (fond plus lumineux que les encres)", () => {
  const vars = themeVars("daylight");
  assert.ok(luminance(vars["--bg"]) > luminance(vars["--ink-bright"]),
    "daylight : --bg doit être plus lumineux que --ink-bright (thème clair)");
  // Les libellés de section (teal) et la bordure restent lisibles sur le fond :
  // la teinte sombre du teal garantit le contraste, au prix d'une ambiance
  // « feuille à musique » — c'est le parti pris du thème.
});

test("daylight : un swatch du sélecteur de thème l'expose", () => {
  const m = /<button class="swatch" data-theme="daylight"[^>]*>/.exec(html);
  assert.ok(m, "un swatch data-theme=\"daylight\" doit exister dans le sélecteur de thèmes");
  assert.ok(/data-i18n-aria="themeDaylight"/.test(m[0]), "le swatch porte data-i18n-aria=\"themeDaylight\"");
  assert.ok(/data-i18n-title="themeDaylight"/.test(m[0]), "le swatch porte data-i18n-title=\"themeDaylight\"");
});

test("daylight : libellés i18n présents en français et en anglais", () => {
  assert.ok(/themeDaylight: "Plein air",/.test(html), "i18n fr : themeDaylight: \"Plein air\"");
  assert.ok(/themeDaylight: "Daylight",/.test(html), "i18n en : themeDaylight: \"Daylight\"");
});

test("daylight : le teal du chrome atteint 4,5:1 sur tous les fonds d'interface", () => {
  const vars = themeVars("daylight");
  const fonds = [["--bg", vars["--bg"]], ["--bg-panel", vars["--bg-panel"]],
    ["--bg-panel-2", vars["--bg-panel-2"]], ["--bg-glow", vars["--bg-glow"]]];
  for (const [label, fond] of fonds) {
    const ratio = contrastRatio(vars["--teal"], fond);
    assert.ok(ratio >= MIN_CHROME_CONTRAST,
      "daylight : --teal (" + vars["--teal"] + ") sur " + label + " (" + fond + ") = " +
        ratio.toFixed(2) + ":1 < " + MIN_CHROME_CONTRAST + ":1");
  }
});

test("daylight : --danger reste une teinte rouge (canal rouge dominant)", () => {
  const { r, g, b } = hexToRgb(themeVars("daylight")["--danger"]);
  assert.ok(r > g && r > b, "daylight : --danger reste rouge (r=" + r + ", g=" + g + ", b=" + b + ")");
});
