const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const source = () => fs.readFileSync(HTML_PATH, "utf8");

/* Issue #55 : cibles tactiles 44 px (recommandation Android/Material) pour
   les commandes principales du lecteur, et disposition compacte du bandeau
   en portrait étroit — sans régression desktop. */

test("les commandes principales du lecteur atteignent 44 px en portrait", () => {
  const css = source();
  const m = /@media \(max-width: 480px\)[\s\S]*?\n  \}/.exec(css);
  assert.ok(m, "la media query portrait (max-width: 480px) existe");
  const block = m[0];
  assert.ok(/\.stepper button\{width:44px;height:44px;\}/.test(block),
    "steppers à 44×44 en portrait");
  assert.ok(/#controls \.segmented button\{min-height:44px;min-width:44px/.test(block),
    "segmented (décompte) à 44 px minimum en portrait");
  assert.ok(/#play-toggle\{width:52px;height:52px;\}/.test(block),
    "play encore plus grand (52 px) en portrait");
});

test("le bandeau passe en disposition compacte (empilée) en portrait", () => {
  const css = source();
  const m = /@media \(max-width: 480px\)[\s\S]*?\n  \}/.exec(css);
  assert.ok(m);
  const block = m[0];
  assert.ok(/#controls\{\s*flex-direction:column/.test(block),
    "le bandeau s'empile verticalement en portrait");
  assert.ok(/env\(safe-area-inset-bottom\)/.test(block),
    "le padding bas respecte la zone sûre (barre de navigation Android)");
});

test("pas de régression desktop : la disposition horizontale reste la règle par défaut", () => {
  const css = source();
  // en dehors des media queries, #controls reste une rangée horizontale
  const base = /#controls\{[^}]*flex-direction:row[^}]*\}/.exec(css);
  assert.ok(base, "disposition row par défaut conservée");
  // la media query portrait ne s'active qu'en étroit
  assert.ok(/@media \(max-width: 480px\)/.test(css),
    "l'activation du mode compact est bornée aux viewports étroits");
});

test("aucune régression des seuils 32 px existants (bibliothèque, paramètres)", () => {
  const css = source();
  /* Les seuils 32 px s'appliquent aux éléments CLIQUABLES (swatches, fav-btn,
     switch, segmented…). Les kbd de la modale d'aide sont du texte affiché,
     pas des cibles tactiles. */
  /* Ne mesurer que les éléments interactifs eux-mêmes, pas les icônes svg
     qu'ils contiennent (une icône de 24 px dans un bouton de 40 px est correcte). */
  const rules = [...css.matchAll(/^[^{}]*\{[^}]*\}/gm)].map((m) => m[0]);
  for (const rule of rules) {
    const selector = rule.slice(0, rule.indexOf("{"));
    if (!/(?:^|,\s*)(?:button|\.swatch|\.fav-btn\b|\.switch\b)/.test(selector)) continue;
    if (/svg|\.knob|\.kbd/.test(selector)) continue;
    const h = /(?:^|;)(?:min-)?height:(\d+)px/.exec(rule);
    if (h) assert.ok(parseInt(h[1], 10) >= 32,
      `cible tactile trop petite : ${rule.slice(0, 60)}…`);
  }
});

test("le stage adapte ses marges en portrait (lecture à un mètre)", () => {
  const css = source();
  const m = /@media \(max-width: 480px\)[\s\S]*?\n  \}/.exec(css);
  assert.ok(m);
  assert.ok(/#stage\{padding:12vh 10px 30vh;\}/.test(m[0]),
    "marges verticales réduites en portrait (plus de lignes visibles)");
  assert.ok(/#song-grid\{grid-template-columns:1fr/.test(m[0]),
    "les cartes de chansons s'empilent en une colonne en portrait");
});
