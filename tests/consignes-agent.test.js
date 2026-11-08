const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* Règle superviseur (post-1.6.0) : tout agent IA intervenant sur le dépôt doit
   connaître les consignes, les PR suivent le gabarit, les releases suivent la
   procédure. Ces garde-fous empêchent une suppression silencieuse. */
test("AGENTS.md impose la lecture des consignes avant d'agir", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /Lis les consignes AVANT d'agir/, "règle de lecture des consignes présente");
  for (const doc of [".github/pull_request_template.md", "docs/procedure-release.md", "docs/agent/README.md"]) {
    assert.ok(agents.includes(doc), `AGENTS.md doit référencer ${doc}`);
  }
});

test("AGENTS.md : la définition de « terminé » exige le gabarit de PR et la procédure de release", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /pull_request_template\.md/, "le gabarit de PR est imposé");
  assert.match(agents, /un tag publié ne se déplace jamais/, "la règle des tags immuables est imposée");
  assert.match(agents, /npm version/, "la procédure de bump est référencée");
});

test("le gabarit de PR du dépôt définit les sections attendues", () => {
  const tpl = read(".github/pull_request_template.md");
  assert.match(tpl, /## Résumé/);
  assert.match(tpl, /## Checklist de relecture/);
  assert.match(tpl, /## Risques et points d'attention/);
});

test("le runner produit des corps de PR qui suivent le gabarit du dépôt", () => {
  const lib = require(path.join(ROOT, "scripts/agent/lib.js"));
  const body = lib.buildPrBody({
    issueNumber: 12, summary: "Résumé de test", files: ["main.js"], changedLines: 10,
    checks: { check: true, test: true }, warnings: [], steps: 2, costUsd: 0.2,
  });
  const tpl = read(".github/pull_request_template.md");
  for (const section of tpl.match(/^## (.+)$/gm)) {
    assert.ok(body.includes(section), `le corps du runner doit contenir « ${section} »`);
  }
});
