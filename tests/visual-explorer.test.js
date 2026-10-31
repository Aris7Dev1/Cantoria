const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const e = require("../scripts/visual/explorer.js");

const ROOT = path.join(__dirname, "..");
const GOALS_PATH = path.join(ROOT, "scripts/visual/explorer-goals.json");

/* Issue #76 : explorateur IA — buts validés, parsing d'action, menu fermé. */

test("explorer-goals.json : buts validés par le superviseur", () => {
  const raw = JSON.parse(fs.readFileSync(GOALS_PATH, "utf8"));
  assert.ok(/VALIDÉS? PAR LE SUPERVISEUR/.test(raw._note), "en-tête superviseur");
  assert.ok(raw.goals.length >= 2, "plusieurs parcours d'exploration");
  for (const g of raw.goals) {
    assert.equal(typeof g, "string");
    assert.ok(g.length > 40, "but suffisamment décrit");
  }
});

test("loadGoals : fichier présent -> buts ; absent -> défaut sûr", () => {
  const goals = e.loadGoals();
  assert.ok(goals.length >= 2);
  // chemin inexistant : défaut sans crash
  const saved = process.env.EXPLORER_GOALS;
  process.env.EXPLORER_GOALS = path.join(ROOT, "inexistant.json");
  const fallback = e.loadGoals();
  process.env.EXPLORER_GOALS = saved;
  assert.equal(fallback.length, 1, "défaut sûr si fichier absent");
});

test("parseAction : JSON valide -> action ; menu fermé (action inconnue rejetée)", () => {
  const ok = e.parseAction('{"action":"click","args":"#btn-new","observation":"je vois la bibliothèque"}');
  assert.equal(ok.action, "click");
  assert.equal(ok.args, "#btn-new");
  // action hors menu : rejetée (jamais d'action arbitraire)
  const bad = e.parseAction('{"action":"rm -rf /","args":""}');
  assert.equal(bad, null, "action hors menu fermé = rejet");
  // texte non JSON : rejet
  assert.equal(e.parseAction("voilà ce que je ferais"), null);
  // JSON dans bloc de code : accepté
  const fenced = e.parseAction('```json\n{"action":"done","args":"fini"}\n```');
  assert.equal(fenced.action, "done");
});

test("buildTurnMessages : but + historique + capture, une seule image", () => {
  const msgs = e.buildTurnMessages({ goal: "créer une chanson", history: ["click « Bibliothèque »"], screenshot: Buffer.from("png"), step: 3 });
  assert.ok(msgs[0].role === "system" && /testeur/i.test(msgs[0].content));
  assert.ok(msgs[1].content[0].text.includes("créer une chanson"));
  assert.ok(msgs[1].content[0].text.includes("Étape 3"));
  assert.ok(msgs[1].content[0].text.includes("click « Bibliothèque »"));
  assert.equal(msgs[1].content.filter((p) => p.type === "image_url").length, 1, "une capture par tour");
});

test("applyAction : les notes sont consignées, done arrête, actions fermées", async () => {
  const notes = [];
  const fakePage = {
    click: async () => {}, fill: async () => {}, keyboard: { press: async () => {} },
    mouse: { wheel: async () => {} }, goBack: async () => {}, waitForTimeout: async () => {},
  };
  const note = await e.applyAction(fakePage, { action: "note", args: "", observation: "menu confus" }, notes);
  assert.match(note, /noté/);
  assert.equal(notes[0], "menu confus");
  const done = await e.applyAction(fakePage, { action: "done", args: "" }, notes);
  assert.equal(done, null, "done = arrêt");
});
