const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/* Issue #98 (volet A) : workflow Pages d\u00e9di\u00e9, permissions minimales
   explicites, artefact limit\u00e9 au deck statique, actions \u00e9pingl\u00e9es par SHA,
   ADR consignant la d\u00e9cision. */

const ROOT = path.join(__dirname, "..");
const WF = path.join(ROOT, ".github", "workflows", "pages.yml");

test("le workflow pages.yml existe et d\u00e9clare des permissions minimales explicites", () => {
  assert.ok(fs.existsSync(WF), "pages.yml pr\u00e9sent");
  const wf = fs.readFileSync(WF, "utf8");
  const perms = wf.match(/permissions:\n((?:\s{2}.+\n)+)/);
  assert.ok(perms, "bloc permissions explicite");
  const lines = perms[1].trim().split("\n").map((l) => l.trim());
  assert.deepEqual(lines.sort(), ["contents: read", "id-token: write", "pages: write"].sort(),
    "uniquement contents:read + pages:write + id-token:write");
  assert.ok(!/pull_request_target/.test(wf), "pas de pull_request_target");
  assert.ok(!/secrets\./.test(wf), "aucun secret utilis\u00e9");
});

test("le d\u00e9ploiement ne publie que docs/presentation (volet A seul)", () => {
  const wf = fs.readFileSync(WF, "utf8");
  assert.ok(/path:\s*docs\/presentation/.test(wf), "artefact = docs/presentation uniquement");
  assert.ok(!/cantoria\.html/.test(wf.split("steps:")[1] || ""), "cantoria.html non publi\u00e9 (volet B exclu)");
  assert.ok(/branches:\s*\[main\]/.test(wf), "d\u00e9clench\u00e9 sur push main");
  assert.ok(/tags:\s*\["v\*\.\*\.\*"\]/.test(wf), "et sur les tags de release");
});

test("toutes les actions du workflow sont \u00e9pingl\u00e9es par SHA", () => {
  const wf = fs.readFileSync(WF, "utf8");
  const uses = [...wf.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 4, "au moins 4 actions");
  for (const u of uses) {
    assert.ok(/@[0-9a-f]{40}/.test(u), `${u} \u00e9pingl\u00e9 par SHA`);
  }
});

test("l'ADR 0003 consigne la d\u00e9cision volet A seul", () => {
  const adr = fs.readFileSync(path.join(ROOT, "docs", "adr", "0003-github-pages.md"), "utf8");
  assert.ok(/Volet A seul/.test(adr), "volet A seul d\u00e9cid\u00e9");
  assert.ok(/volet B/.test(adr) && /report\u00e9/.test(adr), "volet B explicitement report\u00e9");
  assert.ok(/pages: write/.test(adr) && /id-token: write/.test(adr), "permissions document\u00e9es");
});

test("le README pointe vers le site Pages", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("https://aris7dev1.github.io/Cantoria/"), "lien Pages dans le README");
});
