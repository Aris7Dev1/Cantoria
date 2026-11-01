const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/* Issue #97 : pipeline de signature conditionn\u00e9 aux secrets + ADR 0004. */

const ROOT = path.join(__dirname, "..");
const BUILD = fs.readFileSync(path.join(ROOT, ".github", "workflows", "build.yml"), "utf8");

test("build.yml : \u00e9tapes de signature conditionn\u00e9es aux secrets, jamais en clair", () => {
  assert.ok(/secrets\.WIN_CSC_LINK/.test(BUILD), "secret WIN_CSC_LINK r\u00e9f\u00e9renc\u00e9");
  assert.ok(/secrets\.APPLE_API_KEY/.test(BUILD), "secret APPLE_API_KEY r\u00e9f\u00e9renc\u00e9");
  assert.ok(/secrets\.MACOS_CSC_LINK/.test(BUILD), "secret MACOS_CSC_LINK r\u00e9f\u00e9renc\u00e9");
  // aucun secret avec une valeur litt\u00e9rale
  assert.ok(!/secrets\.\w+\s*[:=]\s*['"][^'"$]/m.test(BUILD), "aucune valeur de secret en clair");
  // avertissements explicites si secrets absents
  assert.ok(/::warning::/.test(BUILD), "warning CI si non sign\u00e9");
  assert.ok(/WIN_CSC_LINK == ''/.test(BUILD), "condition 'secret absent' explicite (Windows)");
  assert.ok(/APPLE_API_KEY == ''/.test(BUILD), "condition 'secret absent' explicite (macOS)");
});

test("build.yml : toutes les actions sont \u00e9pingl\u00e9es par SHA", () => {
  const uses = [...BUILD.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 5);
  for (const u of uses) {
    assert.ok(/@[0-9a-f]{40}/.test(u), `${u} \u00e9pingl\u00e9 par SHA`);
  }
});

test("build.yml garde ses permissions minimales (contents: write uniquement)", () => {
  const perms = BUILD.match(/permissions:\n((?:\s{2}.+\n)+)/);
  assert.ok(perms);
  assert.deepEqual(perms[1].trim().split("\n").map((l) => l.trim()), ["contents: write"]);
});

test("ADR 0004 consigne les deux volets et la liste superviseur-only", () => {
  const adr = fs.readFileSync(path.join(ROOT, "docs", "adr", "0004-signature-distribution.md"), "utf8");
  assert.ok(/F-Droid/.test(adr) && /Play Store/.test(adr), "volet B : canaux document\u00e9s");
  assert.ok(/hors port\u00e9e agent/i.test(adr), "liste des actions superviseur-only pr\u00e9sente");
  assert.ok(/jamais dans le d\u00e9p\u00f4t/.test(adr), "keystore jamais versionn\u00e9");
});
