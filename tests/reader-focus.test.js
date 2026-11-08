const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

// Design du lecteur (recommandations acceptées) : hiérarchie de la ligne active
// par la taille et la teinte (pas de fond teinté : un fond plus clair derrière
// les accords ferait chuter le contraste sous 7:1), paroles semi-grasses,
// taille des accords réglable indépendamment, libellés de section dans la
// marge sur écran large. Tests textuels sur le CSS/JS embarqué (même approche
// que tests/interface-contrast.test.js).

// Toutes les déclarations des règles « selecteur { … } » : les thèmes
// (html[data-theme="…"]) et les variantes d'alignement déclarent leurs propres
// règles pour ces sélecteurs ; chaque test précise ce qu'il attend.
function rules(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}", "g");
  const bodies = [];
  let m;
  while ((m = re.exec(html)) !== null) bodies.push(m[1]);
  assert.ok(bodies.length > 0, "au moins une règle " + selector + " présente");
  return bodies;
}

function some(bodies, re, message) {
  assert.ok(bodies.some((b) => re.test(b)), message);
}

function none(bodies, re, message) {
  assert.ok(!bodies.some((b) => re.test(b)), message);
}

test("ligne active : agrandie par transform scale, sans fond teinté", () => {
  const bodies = rules(".line.focus-line");
  some(bodies, /transform\s*:\s*scale\(\s*var\(--focus-scale,\s*1\.06\)\s*\)/,
    ".line.focus-line doit déclarer transform:scale(var(--focus-scale,1.06))");
  none(bodies, /background/,
    ".line.focus-line ne doit déclarer aucun fond (la hiérarchie passe par la taille et la teinte, pas par un fond qui dégraderait le contraste des accords)");
});

test("ligne active : animée en douceur (transition du transform sur .line)", () => {
  some(rules(".line"), /transition\s*:\s*[^;]*transform/,
    ".line doit animer transform (transition opacity…,transform…)");
});

test("ligne active : les accords passent à l'encre standalone, sans fond", () => {
  const bodies = rules(".line.focus-line .seg-chord");
  some(bodies, /color\s*:\s*var\(--chord-standalone-ink,\s*var\(--chord-ink,\s*var\(--gold\)\)\)/,
    "les accords de la ligne active consomment var(--chord-standalone-ink, …)");
  none(bodies, /background/,
    ".line.focus-line .seg-chord ne doit déclarer aucun fond");
});

test("paroles : semi-grasses pour asseoir la hiérarchie accord/parole", () => {
  some(rules(".seg-word"), /font-weight\s*:\s*600/,
    ".seg-word doit déclarer font-weight:600");
});

test("accords : la taille suit --chord-scale (inline et standalone)", () => {
  some(rules(".seg-chord"), /font-size\s*:\s*calc\(var\(--chord-scale,\s*1\)\s*\*\s*\.9em\)/,
    ".seg-chord doit calculer sa taille depuis var(--chord-scale)");
  some(rules(".seg-chord.standalone"), /font-size\s*:\s*calc\(var\(--chord-scale,\s*1\)\s*\*\s*1em\)/,
    ".seg-chord.standalone doit calculer sa taille depuis var(--chord-scale)");
});

test("accords : stepper A−/A+ dédié, câblé avec bornes et invalidation du spotlight", () => {
  assert.ok(/id="cs-down"/.test(html), "bouton #cs-down présent");
  assert.ok(/id="cs-up"/.test(html), "bouton #cs-up présent");
  assert.ok(/data-i18n="chordSize"/.test(html), "libellé du groupe câblé en i18n (chordSize)");

  const up = /\$\("#cs-up"\)\.addEventListener\("click", function\(\)\{([^}]*)\}\)/.exec(html);
  assert.ok(up, "handler #cs-up présent");
  assert.ok(/Math\.min\(2, chordScale \+ 0\.1\)/.test(up[1]), "#cs-up plafonne chordScale à 2");
  assert.ok(/setProperty\("--chord-scale", chordScale\)/.test(up[1]), "#cs-up applique --chord-scale");
  assert.ok(/invalidateSpotlightCache\(\)/.test(up[1]), "#cs-up invalide le cache du spotlight");

  const down = /\$\("#cs-down"\)\.addEventListener\("click", function\(\)\{([^}]*)\}\)/.exec(html);
  assert.ok(down, "handler #cs-down présent");
  assert.ok(/Math\.max\(0\.6, chordScale - 0\.1\)/.test(down[1]), "#cs-down plancher chordScale à 0,6");
  assert.ok(/setProperty\("--chord-scale", chordScale\)/.test(down[1]), "#cs-down applique --chord-scale");
  assert.ok(/invalidateSpotlightCache\(\)/.test(down[1]), "#cs-down invalide le cache du spotlight");

  assert.ok(/var chordScale = 1;/.test(html), "variable chordScale déclarée");
  // Réinitialisée à chaque ouverture de chanson, comme la taille des paroles.
  assert.ok(
    /chordScale = 1;\s*\n\s*\$\("#stage-inner"\)\.style\.setProperty\("--reader-scale", fontScale\);\s*\n\s*\$\("#stage-inner"\)\.style\.setProperty\("--chord-scale", chordScale\);/.test(html),
    "chordScale est réinitialisée puis appliquée à l'ouverture d'une chanson");
});

test("sections : libellés repoussés dans la marge sur écran ≥ 1000 px", () => {
  const m = /@media \(min-width:1000px\)\{([\s\S]*?)\n  \}/.exec(html);
  assert.ok(m, "media query (min-width:1000px) présente");
  const block = m[1];
  assert.ok(/#stage-inner\{padding:0 150px;\}/.test(block),
    "la gouttière de #stage-inner réserve la place des libellés (150 px)");
  assert.ok(/\.verse \.section-label,\.chorus \.section-label,\.bridge \.section-label\{[\s\S]*?position:absolute;/.test(block),
    "les libellés de section passent en position:absolute dans la marge");
  assert.ok(/left:-136px/.test(block), "les libellés sont ancrés dans la gouttière gauche (left:-136px)");
  assert.ok(/\.verse,\.chorus,\.bridge\{position:relative;\}/.test(block),
    "les conteneurs de section deviennent le bloc d'ancrage (position:relative)");
  // La règle doit suivre .chorus .section-label{position:relative;} pour
  // gagner en cascade à spécificité égale.
  const mediaIdx = html.indexOf("@media (min-width:1000px)");
  const relIdx = html.indexOf(".chorus .section-label{position:relative;}");
  assert.ok(relIdx !== -1 && mediaIdx > relIdx,
    "la media query doit venir après .chorus .section-label{position:relative;} (cascade)");
});

test("sections : libellés à 12 px (seuil chrome du contrôle visuel)", () => {
  const bodies = rules(".section-label");
  some(bodies, /font-size\s*:\s*12px/, ".section-label doit passer à 12px");
  none(bodies, /font-size\s*:\s*11px/, ".section-label ne doit plus être à 11px");
});
