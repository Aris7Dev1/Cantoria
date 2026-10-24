const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../scripts/visual/checks");
const th = require("../scripts/visual/thresholds.json");

const bg = (color, image = "") => ({ color, image });
const dark = [bg("rgba(0, 0, 0, 0)"), bg("rgb(20, 22, 28)")];

test("parseColor lit rgb, rgba et color(srgb)", () => {
  assert.deepEqual(c.parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(c.parseColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  const s = c.parseColor("color(srgb 1 0 0 / 0.25)");
  assert.equal(Math.round(s.r), 255); assert.equal(s.a, 0.25);
  assert.equal(c.parseColor("transparent"), null);
});

test("contraste WCAG : valeurs de référence", () => {
  const black = { r: 0, g: 0, b: 0, a: 1 }, white = { r: 255, g: 255, b: 255, a: 1 };
  assert.ok(Math.abs(c.contrastRatio(black, white) - 21) < 0.01);
  assert.ok(Math.abs(c.contrastRatio({ r: 119, g: 119, b: 119, a: 1 }, white) - 4.48) < 0.02); // #777 sur blanc
  assert.equal(c.contrastRatio(white, white), 1);
});

test("textContrast tient compte de l'opacité cumulée", () => {
  const full = c.textContrast({ color: "rgb(255, 255, 255)", opacity: 1, bg: dark });
  const faded = c.textContrast({ color: "rgb(255, 255, 255)", opacity: 0.5, bg: dark });
  assert.ok(full > 15);
  assert.ok(faded < full && faded > 1);
});

test("arrière-plan en dégradé : pire cas retenu", () => {
  const grad = [bg("rgba(0, 0, 0, 0)", "radial-gradient(rgb(0, 0, 0) 0%, rgb(200, 200, 200) 100%)")];
  const cands = c.backgroundCandidates(grad);
  assert.equal(cands.length, 2);
  const ratio = c.textContrast({ color: "rgb(255, 255, 255)", opacity: 1, bg: grad });
  assert.ok(ratio < 2, "le pire cas (fond clair) doit dominer : " + ratio);
});

test("arrière-plan semi-transparent composé avec celui du dessous", () => {
  const chain = [bg("rgba(255, 255, 255, 0.5)"), bg("rgb(0, 0, 0)")];
  const [cand] = c.backgroundCandidates(chain);
  assert.ok(Math.abs(cand.r - 127.5) < 1);
});

const text = (over) => ({ sel: "span.seg-word", text: "mot", fontPx: 24, color: "rgb(255, 255, 255)", opacity: 1, bg: dark, inStage: true, kind: "lyric", ...over });
const metrics = (over) => ({ viewport: { w: 1280, h: 820 }, texts: [], targets: [], overflows: [], ...over });

test("paroles trop petites dans le lecteur : erreur ; même taille hors lecteur : avertissement seulement", () => {
  const small = text({ fontPx: 16 });
  const inStage = c.evaluateMetrics(metrics({ texts: [small] }), th, "stage");
  assert.equal(inStage.length, 1);
  assert.equal(inStage[0].severity, "error");
  assert.equal(inStage[0].rule, "font-size");
  const chrome = c.evaluateMetrics(metrics({ texts: [text({ fontPx: 13, inStage: false, kind: "other" })] }), th, "chrome");
  assert.deepEqual(chrome, []);
  const tiny = c.evaluateMetrics(metrics({ texts: [text({ fontPx: 10, inStage: false, kind: "other" })] }), th, "chrome");
  assert.equal(tiny[0].severity, "warning");
});

test("accords : seuils propres et contraste", () => {
  const chord = text({ sel: "span.seg-chord", kind: "chord", fontPx: 17, color: "rgb(120, 120, 120)" });
  const v = c.evaluateMetrics(metrics({ texts: [chord] }), th, "stage");
  assert.deepEqual(v.map((x) => x.rule).sort(), ["contrast", "font-size"]);
});

test("occurrences identiques regroupées, pire valeur conservée", () => {
  const list = [16, 15, 17].map((px) => text({ fontPx: px }));
  const v = c.evaluateMetrics(metrics({ texts: list }), th, "stage");
  assert.equal(v.length, 1);
  assert.equal(v[0].count, 3);
  assert.equal(v[0].value, 15);
});

test("commandes trop petites et débordements", () => {
  const v = c.evaluateMetrics(metrics({
    targets: [{ sel: "button.x", text: "x", w: 20, h: 40 }, { sel: "button.ok", text: "ok", w: 44, h: 44 }],
    overflows: [{ sel: "div.line", kind: "clipped-by-stage-right", px: 30 }, { sel: "p", kind: "beyond-window-right", px: 0.5 }, { sel: "h1", kind: "beyond-window-right", px: 12 }],
  }), th, "chrome");
  const rules = v.map((x) => `${x.severity}:${x.rule}:${x.selector}`);
  assert.ok(rules.includes("warning:target-size:button.x"));
  assert.ok(!rules.some((r) => r.includes("button.ok")));
  assert.ok(rules.includes("error:overflow:div.line"));
  assert.ok(rules.includes("warning:overflow:h1"));
  assert.ok(!rules.some((r) => r.includes(":p")), "sous la tolérance : ignoré");
});

test("un texte conforme ne produit aucun écart", () => {
  assert.deepEqual(c.evaluateMetrics(metrics({ texts: [text()] }), th, "stage"), []);
});

test("les seuils proposés sont cohérents et signalés comme à valider", () => {
  assert.ok(th._note.includes("PROPOSÉS"));
  assert.ok(th.stage.minLyricPx >= th.chrome.minTextPx);
  assert.ok(th.stage.minContrast >= th.chrome.minContrast);
});
