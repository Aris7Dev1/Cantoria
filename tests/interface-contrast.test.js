const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

// jsdom ne résout pas var() et ne calcule pas les contrastes : on extrait les
// valeurs hex du CSS textuel (même approche que le test du knob de
// tests/interface-commands.test.js) et on calcule le ratio WCAG en JS pur.
// Seuil : 4,5:1, identique à scripts/visual/thresholds.json (chrome.minContrast).
const MIN_CONTRAST = 4.5;

const THEMES = ["spotlight", "guitar-case", "campfire", "vibe", "daylight"];

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

// Luminance relative WCAG 2.x (linéarisation sRGB).
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

// .eyebrow n'a plus d'opacité : sa couleur effective est --gold plein.
// .btn.danger a color:var(--danger) sur fond transparent (.btn.ghost) :
// la couleur effective est --danger plein.
function eyebrowColor() {
  const rule = /\.eyebrow\{([^}]*)\}/.exec(html);
  assert.ok(rule, "règle .eyebrow présente");
  assert.ok(!/opacity\s*:/.test(rule[1]), ".eyebrow ne doit plus déclarer d'opacité (dégrade le contraste)");
  const m = /color\s*:\s*var\((--[\w-]+)\)/.exec(rule[1]);
  assert.ok(m, ".eyebrow déclare une couleur en var()");
  return m[1];
}

function dangerColor() {
  const rule = /\.btn\.danger\{([^}]*)\}/.exec(html);
  assert.ok(rule, "règle .btn.danger présente");
  const m = /color\s*:\s*var\((--[\w-]+)\)/.exec(rule[1]);
  assert.ok(m, ".btn.danger déclare une couleur en var()");
  return m[1];
}

// Fonds effectifs : header et éditeur sur --bg (dégradé radial centré sur
// --bg-glow puis --bg : le pire cas est --bg, le plus sombre des deux) ;
// le panneau des paramètres (.modal-panel) sur --bg-panel.
function backgrounds(vars) {
  return { bg: vars["--bg"], panel: vars["--bg-panel"] };
}

test("contraste : .eyebrow atteint 4,5:1 sur les cinq thèmes", () => {
  const colorVar = eyebrowColor();
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    assert.ok(vars[colorVar], colorVar + " définie pour le thème " + theme);
    const { bg, panel } = backgrounds(vars);
    for (const [label, fond] of [["--bg", bg], ["--bg-panel", panel]]) {
      const ratio = contrastRatio(vars[colorVar], fond);
      assert.ok(
        ratio >= MIN_CONTRAST,
        theme + " : .eyebrow (" + vars[colorVar] + ") sur " + label + " (" + fond + ") = " +
          ratio.toFixed(2) + ":1 < " + MIN_CONTRAST + ":1"
      );
    }
  }
});

test("contraste : .btn.danger atteint 4,5:1 sur les cinq thèmes", () => {
  const colorVar = dangerColor();
  assert.equal(colorVar, "--danger", ".btn.danger consomme --danger");
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    assert.ok(vars["--danger"], "--danger définie pour le thème " + theme);
    const { bg, panel } = backgrounds(vars);
    for (const [label, fond] of [["--bg", bg], ["--bg-panel", panel]]) {
      const ratio = contrastRatio(vars["--danger"], fond);
      assert.ok(
        ratio >= MIN_CONTRAST,
        theme + " : .btn.danger (" + vars["--danger"] + ") sur " + label + " (" + fond + ") = " +
          ratio.toFixed(2) + ":1 < " + MIN_CONTRAST + ":1"
      );
    }
  }
});

test("contraste : --danger reste une teinte rouge (canal rouge dominant)", () => {
  for (const theme of THEMES) {
    const { r, g, b } = hexToRgb(themeVars(theme)["--danger"]);
    assert.ok(r > g && r > b, theme + " : --danger reste rouge (r=" + r + ", g=" + g + ", b=" + b + ")");
  }
});
