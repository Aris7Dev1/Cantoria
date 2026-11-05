const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

// Contraste du lecteur : seuil 7:1 identique à scripts/visual/thresholds.json
// (stage.minContrast). Même approche que tests/interface-contrast.test.js :
// jsdom ne calcule ni var() ni contrastes, on travaille sur le CSS textuel.
const MIN_READER_CONTRAST = 7;

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

// Composition d'une couleur semi-transparente sur un fond opaque.
function compositeOver(fgHex, alpha, bgHex) {
  const f = hexToRgb(fgHex), b = hexToRgb(bgHex);
  const mix = (x, y) => Math.round(x * alpha + y * (1 - alpha));
  const r = mix(f.r, b.r), g = mix(f.g, b.g), bl = mix(f.b, b.b);
  return "#" + [r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// Fonds de la scène : le dégradé radial du body va de --bg-glow (haut) à --bg,
// .chorus/.bridge posent --bg-panel-2 — les trois peuvent porter des accords.
function stageBackgrounds(vars) {
  return [["--bg", vars["--bg"]], ["--bg-glow", vars["--bg-glow"]], ["--bg-panel-2", vars["--bg-panel-2"]]];
}

test("échelle or : chaque thème expose 12 marches --gold-1..--gold-12", () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    for (let i = 1; i <= 12; i++) {
      assert.ok(vars["--gold-" + i], theme + " : --gold-" + i + " doit être définie en hex");
    }
  }
});

test("échelle or : luminance strictement décroissante de la marche 1 à la marche 12", () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    for (let i = 1; i < 12; i++) {
      assert.ok(
        luminance(vars["--gold-" + i]) > luminance(vars["--gold-" + (i + 1)]),
        theme + " : --gold-" + i + " (" + vars["--gold-" + i] + ") doit être plus claire que --gold-" + (i + 1) +
          " (" + vars["--gold-" + (i + 1)] + ")"
      );
    }
  }
});

test("échelle or : la marche 8 est le --gold actuel (zéro dérive visuelle des accents)", () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    assert.equal(vars["--gold-8"], vars["--gold"],
      theme + " : --gold-8 (" + vars["--gold-8"] + ") doit rester identique à --gold (" + vars["--gold"] + ")");
  }
});

test("lecteur : --chord-ink atteint 7:1 sur tous les fonds de scène, pour les cinq thèmes", () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    for (const [label, fond] of stageBackgrounds(vars)) {
      const ratio = contrastRatio(vars["--chord-ink"], fond);
      assert.ok(
        ratio >= MIN_READER_CONTRAST,
        theme + " : --chord-ink (" + vars["--chord-ink"] + ") sur " + label + " (" + fond + ") = " +
          ratio.toFixed(2) + ":1 < " + MIN_READER_CONTRAST + ":1"
      );
    }
  }
});

test("lecteur : --chord-standalone-ink à l'opacité .line.instrumental atteint 7:1 sur tous les fonds", () => {
  // Dernière occurrence : #stage-inner[data-lyrics-align="left"] déclare aussi
  // .line.instrumental (marges uniquement) — la règle générique (gap/opacité)
  // vient en fin de cascade.
  const re = /\.line\.instrumental\{([^}]*)\}/g;
  let m, last = null;
  while ((m = re.exec(html)) !== null) last = m;
  assert.ok(last, "règle .line.instrumental présente");
  const op = /opacity\s*:\s*([\d.]+)/.exec(last[1]);
  assert.ok(op, ".line.instrumental déclare une opacité");
  const opacity = parseFloat(op[1]);

  for (const theme of THEMES) {
    const vars = themeVars(theme);
    for (const [label, fond] of stageBackgrounds(vars)) {
      const composited = compositeOver(vars["--chord-standalone-ink"], opacity, fond);
      const ratio = contrastRatio(composited, fond);
      assert.ok(
        ratio >= MIN_READER_CONTRAST,
        theme + " : --chord-standalone-ink (" + vars["--chord-standalone-ink"] + " @ " + opacity +
          " sur " + label + " " + fond + " → " + composited + ") = " + ratio.toFixed(2) + ":1 < " +
          MIN_READER_CONTRAST + ":1"
      );
    }
  }
});

test("lecteur : --ink-bright (paroles) atteint 7:1 sur tous les fonds de scène", () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    for (const [label, fond] of stageBackgrounds(vars)) {
      const ratio = contrastRatio(vars["--ink-bright"], fond);
      assert.ok(
        ratio >= MIN_READER_CONTRAST,
        theme + " : --ink-bright (" + vars["--ink-bright"] + ") sur " + label + " (" + fond + ") = " +
          ratio.toFixed(2) + ":1 < " + MIN_READER_CONTRAST + ":1"
      );
    }
  }
});
