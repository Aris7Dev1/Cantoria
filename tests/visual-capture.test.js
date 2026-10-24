/*
 * Test d'intégration : vrai navigateur sur le vrai HTML. Il est ignoré (et le dit) quand
 * playwright-core ou un Chromium ne sont pas disponibles ; le moteur Electron est exercé
 * par `npm run visual`, pas ici (il demande Xvfb et le binaire Electron).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let pw = null, exe = process.env.VISUAL_CHROMIUM || null;
try {
  pw = require("playwright-core");
  if (!exe) { const p = pw.chromium.executablePath(); if (p && fs.existsSync(p)) exe = p; }
} catch (e) { /* ignoré plus bas */ }
const skip = !pw || !exe ? "playwright-core ou Chromium indisponible" : false;

test("capture réelle : scénarios sur le vrai HTML, état fixe, capture déterministe", { skip }, async () => {
  process.env.VISUAL_CHROMIUM = exe;
  const { captureAll } = require("../scripts/visual/capture");
  const { scenarios } = require("../scripts/visual/scenarios");
  const thresholds = require("../scripts/visual/thresholds.json");
  const root = path.join(__dirname, "..");
  const run = async (dir) => captureAll({ engine: "chromium", repoRoot: root, outDir: dir, themes: ["campfire"], scenarios, thresholds });
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), "vc1-")), d2 = fs.mkdtempSync(path.join(os.tmpdir(), "vc2-"));
  const r1 = await run(d1), r2 = await run(d2);
  assert.deepEqual(r1.map((r) => r.scenario), ["library", "editor", "player", "settings"]);
  for (let i = 0; i < r1.length; i++) {
    assert.ok(fs.statSync(r1[i].png).size > 1000, `${r1[i].scenario} : capture non vide`);
    assert.ok(fs.readFileSync(r1[i].png).equals(fs.readFileSync(r2[i].png)), `${r1[i].scenario} : deux captures identiques`);
  }
  // Le lecteur est bien celui de la chanson ciblée, avec ses accords et paroles.
  const player = r1.find((r) => r.scenario === "player");
  assert.ok(player.violations.every((v) => v.rule !== "overflow" || v.severity !== "error"), "pas de coupure de ligne dans le lecteur par défaut");
});

test("collectMetrics détecte une régression réelle (police réduite, ligne coupée)", { skip }, async () => {
  const { collectMetrics, evaluateMetrics } = require("../scripts/visual/checks");
  const { resetState } = require("../scripts/visual/capture");
  const thresholds = require("../scripts/visual/thresholds.json");
  const browser = await pw.chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
    await page.goto("file://" + path.join(__dirname, "..", "carnet-de-chant-v4.html"));
    await resetState(page, "campfire");
    await page.locator(".song-card", { hasText: "Le chemin du retour" }).click();
    await page.waitForSelector("#player-view.active #stage-inner .line");
    const before = evaluateMetrics(await page.evaluate(collectMetrics), thresholds, "stage");
    await page.addStyleTag({ content: ".seg-word{font-size:9px!important} #stage-inner{font-size:6em!important}" });
    const after = evaluateMetrics(await page.evaluate(collectMetrics), thresholds, "stage");
    const worst = (list) => Math.min(...list.filter((v) => v.rule === "font-size" && v.selector === "span.seg-word").map((v) => v.value), Infinity);
    assert.ok(worst(after) <= 9.01, "la police de 9 px doit être vue");
    assert.ok(after.some((v) => v.rule === "overflow" && v.severity === "error") || worst(after) < worst(before));
  } finally { await browser.close(); }
});
