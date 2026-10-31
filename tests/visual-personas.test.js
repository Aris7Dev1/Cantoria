const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const j = require("../scripts/visual/judge.js");

const ROOT = path.join(__dirname, "..");
const PERSONAS_PATH = path.join(ROOT, "scripts/visual/personas.json");

/* Issue #75 : personas du juge — composition de prompt, inactifs zéro appel,
   fichier validé par le superviseur. */

test("personas.json existe et est validé par le superviseur", () => {
  const raw = JSON.parse(fs.readFileSync(PERSONAS_PATH, "utf8"));
  assert.ok(/VALIDÉS? PAR LE SUPERVISEUR/.test(raw._note),
    "l'en-tête documente que le superviseur valide ces profils");
  assert.ok(Array.isArray(raw.personas) && raw.personas.length >= 1);
  for (const p of raw.personas) {
    assert.ok(p.id, "persona avec id");
    assert.equal(typeof p.actif, "boolean", "actif explicite");
    assert.ok(Array.isArray(p.lens) && p.lens.length, "lens non vide");
    assert.ok(p.description, "description présente");
  }
  assert.ok(raw.personas.some((p) => p.actif), "au moins un persona actif");
});

test("loadPersonas : fichier présent -> personas du fichier ; absent -> défaut sûr", () => {
  const list = j.loadPersonas(PERSONAS_PATH);
  assert.ok(list.length >= 1);
  assert.ok(list.some((p) => p.id === "scene-standard"), "le persona pivot existe");
  // fichier absent : pas de crash, défaut sûr
  const fallback = j.loadPersonas(path.join(ROOT, "inexistant.json"));
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].id, "scene-standard");
});

test("personaPrompt : la lens du persona compose le prompt système", () => {
  const prompt = j.personaPrompt({ id: "test-p", description: "guitariste test", lens: ["l1", "l2"] });
  assert.ok(prompt.includes("test-p"), "l'id du persona est annoncé au modèle");
  assert.ok(prompt.includes("guitariste test"), "la description est dans le prompt");
  assert.ok(prompt.includes("l1") && prompt.includes("l2"), "chaque ligne de lens est utilisée");
});

test("buildMessages : persona fourni -> prompt du persona ; absent -> PERSONA historique", () => {
  const img = Buffer.from("x");
  const withPersona = j.buildMessages({ imageA: img, imageB: img, order: "AB", intent: "", persona: { id: "p", description: "d", lens: ["LENS-PERSONA"] } });
  assert.ok(withPersona[0].content.includes("LENS-PERSONA"), "prompt système = persona");
  const without = j.buildMessages({ imageA: img, imageB: img, order: "AB", intent: "" });
  assert.equal(without[0].content, j.PERSONA, "sans persona : PERSONA historique (compatibilité)");
});
