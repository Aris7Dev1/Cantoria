const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../scripts/agent/lib");

test("slugify retire les accents et les caractères spéciaux", () => {
  assert.equal(lib.slugify("Récupérer les copies de secours !"), "recuperer-les-copies-de-secours");
  assert.equal(lib.slugify("   "), "tache");
  assert.equal(lib.slugify("é".repeat(100)).length <= 40, true);
});

test("branchName combine numéro et titre", () => {
  assert.equal(lib.branchName(12, "Ajouter une CSP"), "agent/issue-12-ajouter-une-csp");
});

test("findForbidden bloque fichiers et dossiers protégés", () => {
  const files = [
    "VISION.md", "CLAUDE.md", "docs/adr/0001-electron.md", ".github/workflows/build.yml",
    ".devcontainer/Dockerfile", "scripts/agent/lib.js", "package.json", "package-lock.json",
    "update-config.json", "./VISION.md", "scripts\\agent\\run-issue.js", "AGENTS.md", ".vibe/config.toml", ".vibe/hooks.toml",
    "scripts/visual/thresholds.json", "visual-baseline/campfire/player.png",
  ];
  assert.deepEqual(lib.findForbidden(files).length, files.length);
});

test("findForbidden laisse passer le travail légitime", () => {
  const ok = ["main.js", "preload.js", "carnet-de-chant-v4.html", "tests/new.test.js", "README.md",
    "tests/package.json", "scripts/prepare-release.js", "docs/notes.md"];
  assert.deepEqual(lib.findForbidden(ok), []);
});

test("needsTests signale du code modifié sans test", () => {
  assert.equal(lib.needsTests(["main.js"]), true);
  assert.equal(lib.needsTests(["carnet-de-chant-v4.html", "README.md"]), true);
  assert.equal(lib.needsTests(["main.js", "tests/main.test.js"]), false);
  assert.equal(lib.needsTests(["README.md", "docs/guide.md"]), false);
});

test("parseNumstat additionne les lignes et gère les binaires", () => {
  const out = "10\t2\tmain.js\n-\t-\tassets/icon.png\n3\t0\ttests/a.test.js\n";
  const parsed = lib.parseNumstat(out);
  assert.deepEqual(parsed.files, ["main.js", "assets/icon.png", "tests/a.test.js"]);
  assert.equal(parsed.changedLines, 15);
});

test("hasLabel accepte les objets et les chaînes", () => {
  assert.equal(lib.hasLabel({ labels: [{ name: "agent-ok" }] }, "agent-ok"), true);
  assert.equal(lib.hasLabel({ labels: ["bug"] }, "agent-ok"), false);
  assert.equal(lib.hasLabel({}, "agent-ok"), false);
});

test("renderPrompt remplace les variables sans interpréter le contenu", () => {
  const out = lib.renderPrompt("A={{A}} B={{B}} X={{X}}", { A: "$& $1", B: "{{A}}" });
  assert.equal(out, "A=$& $1 B={{A}} X={{X}}");
});

test("buildVibeArgs : mode non interactif sans aucune option d'approbation globale", () => {
  const args = lib.buildVibeArgs({ promptFile: "/r/prompt.md", outputDir: "/r/out", maxTurns: 40, maxPriceUsd: 2, timeLimitS: 900 });
  assert.equal(args[args.indexOf("--prompt-file") + 1], "/r/prompt.md");
  assert.equal(args[args.indexOf("--agent") + 1], "accept-edits");
  assert.equal(args[args.indexOf("--output") + 1], "json");
  assert.equal(args[args.indexOf("--output-dir") + 1], "/r/out");
  assert.equal(args[args.indexOf("--max-turns") + 1], "40");
  assert.equal(args[args.indexOf("--max-price") + 1], "2");
  assert.equal(args[args.indexOf("--time-limit") + 1], "900");
  for (const forbidden of ["--yolo", "--auto-approve", "--trust", "--smart-approve", "--add-dir", "--worktree"]) {
    assert.ok(!args.includes(forbidden), `${forbidden} ne doit jamais être passé`);
  }
});

test("buildVibeArgs omet les plafonds non fournis", () => {
  const args = lib.buildVibeArgs({ promptFile: "p", outputDir: "o" });
  for (const opt of ["--max-turns", "--max-price", "--time-limit"]) assert.ok(!args.includes(opt));
});

test("extractFinalMessage prend le dernier message texte de l'assistant", () => {
  const entries = [
    { type: "message", role: "user", content: [{ type: "text", text: "tâche" }] },
    { type: "message", role: "assistant", content: [{ type: "text", text: "premier" }] },
    { type: "message", role: "assistant", content: [{ type: "text", text: "résumé " }, { type: "text", text: "final" }] },
  ];
  assert.equal(lib.extractFinalMessage(JSON.stringify(entries)), "résumé \nfinal");
  assert.equal(lib.extractFinalMessage("pas du json"), "");
  assert.equal(lib.extractFinalMessage(JSON.stringify({ role: "assistant" })), "");
  assert.equal(lib.extractFinalMessage(JSON.stringify([{ type: "message", role: "assistant", content: [] }])), "");
});

test("parseVibeResult : terminé seulement si code 0 ET outcome finished", () => {
  const exportJson = JSON.stringify({ outcome: "finished", exit_code: 0, steps: 4, cost_usd: 0.5 });
  const stdout = JSON.stringify([{ type: "message", role: "assistant", content: [{ type: "text", text: "Fait" }] }]);
  const good = lib.parseVibeResult({ stdout, exportJson, exitCode: 0 });
  assert.deepEqual([good.ok, good.summary, good.steps, good.costUsd], [true, "Fait", 4, 0.5]);

  const limited = lib.parseVibeResult({ stdout, exportJson: JSON.stringify({ outcome: "turn_limit", exit_code: 3 }), exitCode: 3 });
  assert.equal(limited.ok, false);
  assert.match(lib.describeOutcome(limited), /limite de tours/);

  // code 0 mais sans export lisible : on refuse de conclure à un succès
  assert.equal(lib.parseVibeResult({ stdout, exportJson: null, exitCode: 0 }).ok, false);
  assert.equal(lib.parseVibeResult({ stdout, exportJson: "{cassé", exitCode: 0 }).ok, false);
  assert.equal(lib.parseVibeResult({ stdout: "", exportJson: null, exitCode: null }).ok, false);
});

test("describeOutcome rend les causes d'arrêt lisibles", () => {
  const infra = lib.parseVibeResult({ stdout: "", exportJson: JSON.stringify({ outcome: "infrastructure_failure", exit_code: 2, error: { message: "502" } }), exitCode: 2 });
  assert.match(lib.describeOutcome(infra), /panne.*502/);
  assert.match(lib.describeOutcome({ outcome: null, exitCode: 9, errorMessage: "" }), /code de sortie 9/);
});

test("buildPrBody suit le gabarit de PR du d\u00e9p\u00f4t et mentionne l'issue, les contr\u00f4les et les avertissements", () => {
  const body = lib.buildPrBody({
    issueNumber: 7, summary: "R\u00e9sum\u00e9", files: ["main.js"], changedLines: 12,
    checks: { check: true, test: true }, warnings: ["Pas de test"], steps: 3, costUsd: 0.25,
  });
  // Gabarit .github/pull_request_template.md : sections et ordre impos\u00e9s
  const ordre = [body.indexOf("## R\u00e9sum\u00e9"), body.indexOf("## Checklist de relecture")];
  assert.ok(ordre[0] >= 0 && ordre[1] > ordre[0], "R\u00e9sum\u00e9 avant Checklist de relecture");
  assert.match(body, /Closes #7/);
  assert.match(body, /- \[x\].*p\u00e9rim\u00e8tre de l'issue #7/);
  assert.match(body, /Avertissements/);
  assert.match(body, /npm test` : OK/);
  assert.match(body, /3 appels au mod\u00e8le/);
  assert.match(body, /0\.25 \$/);
});

test("buildPrBody signale les contr\u00f4les en \u00e9chec", () => {
  const body = lib.buildPrBody({
    issueNumber: 8, summary: "R\u00e9sum\u00e9", files: ["main.js"], changedLines: 5,
    checks: { check: true, test: false }, warnings: [], steps: 1, costUsd: 0.1,
  });
  assert.match(body, /`npm test` : \u00c9CHEC/);
  assert.match(body, /\u26a0\ufe0f/);
})

test("visionIncomplete repère un VISION.md encore en gabarit", () => {
  assert.equal(lib.visionIncomplete("## Mission\n<!-- À COMPLÉTER : une phrase -->"), true);
  assert.equal(lib.visionIncomplete("## Mission\nUne vraie mission."), false);
  assert.equal(lib.visionIncomplete(undefined), false);
});
