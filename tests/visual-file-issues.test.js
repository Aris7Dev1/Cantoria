"use strict";
/*
 * Tests du fileur d'issues (scripts/visual/file-issues.js) — chien de garde
 * visuel. `gh` est injecté (deps.runGh) : aucun appel réseau, aucune création
 * réelle, comme le font agent-lib.test.js / agent-runner.test.js avec le
 * faux `gh` des fixtures.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const fileur = require("../scripts/visual/file-issues");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cantoria-fileur-test-"));
}

function writeDraft(dir, name, title, body) {
  fs.writeFileSync(path.join(dir, name), `# ${title}\n\n${body}\n`, "utf8");
}

const RAPPORT_AVEC_FRICTIONS = [
  "## Rapport d'exploration IA (issue #76)",
  "",
  "But : « Tu prépares une répétition : cherche une chanson existante dans la bibliothèque, marque-la en favori. »",
  "Viewport : 412×915 (portrait) · plafonds : 40 actions, 30 appels.",
  "",
  "### Parcours (12 étapes, 13 appels)",
  "- click « Bibliothèque »",
  "",
  "### Observations de l'explorateur",
  "- la recherche répond bien",
  "",
  "### Frictions constatées (actions sans effet attendu)",
  "- click « Favori » a ÉCHOUÉ (timeout)",
  "- saisie « #f-title || X » a ÉCHOUÉ (champ masqué)",
  "",
  "*Rapport consultatif, généré par l'explorateur IA.*",
].join("\n");

const RAPPORT_SANS_FRICTION = RAPPORT_AVEC_FRICTIONS.replace(
  "### Frictions constatées (actions sans effet attendu)\n- click « Favori » a ÉCHOUÉ (timeout)\n- saisie « #f-title || X » a ÉCHOUÉ (champ masqué)\n",
  "Aucune friction bloquante constatée sur ce parcours.\n"
);

function fakeGh(existingTitles) {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "issue" && args[1] === "list") {
      return { stdout: JSON.stringify(existingTitles.map((t) => ({ title: t }))) };
    }
    if (args[0] === "issue" && args[1] === "create") {
      return { stdout: "https://github.com/o/r/issues/42\n" };
    }
    throw new Error("commande gh inattendue : " + args.join(" "));
  };
  run.calls = calls;
  return run;
}

test("parseArgs refuse catégoriquement le label agent-ok", () => {
  assert.throws(() => fileur.parseArgs(["--repo=o/r", "--label=agent-ok"], {}), /agent-ok/);
});
test("parseArgs : option inconnue, max invalide, dépôt manquant", () => {
  assert.throws(() => fileur.parseArgs(["--repo=o/r", "--pirate=1"], {}), /inconnue/);
  assert.throws(() => fileur.parseArgs(["--repo=o/r", "--max=0"], {}), /--max/);
  assert.throws(() => fileur.parseArgs([], {}), /Dépôt manquant/);
});
test("parseArgs : défauts sains et GITHUB_REPOSITORY lue", () => {
  const o = fileur.parseArgs([], { GITHUB_REPOSITORY: "o/r" });
  assert.equal(o.repo, "o/r");
  assert.equal(o.label, "explorer-proposition");
  assert.equal(o.max, 5);
  assert.equal(o.dryRun, false);
});
test("normTitle ignore casse, accents et ponctuation", () => {
  assert.equal(
    fileur.normTitle("Interface (player) : Régression `#f-lyrics`"),
    fileur.normTitle("interface player regression f lyrics")
  );
});
test("explorerKey retire la date : deux runs du même but se dédupliquent", () => {
  const a = fileur.explorerKey("Exploration IA — Tu prépares une répétition (2026-11-02)");
  const b = fileur.explorerKey("Exploration IA — tu prepares une repetition (2027-01-11)");
  assert.equal(a, b);
});
test("parseDrafts lit le format de run.js (titre en « # »), ignore le reste", () => {
  const dir = tmpDir();
  writeDraft(dir, "01-a.md", "Interface (player) : contraste sous le seuil sur `.chord`", "Contrôle automatique : contraste 4,2:1.");
  writeDraft(dir, "02-b.md", "Régression visuelle perçue : spotlight / player", "Le juge préfère la référence.");
  fs.writeFileSync(path.join(dir, "03-pas-une-issue.txt"), "ignoré", "utf8");
  fs.writeFileSync(path.join(dir, "04-sans-titre.md"), "pas de ligne de titre\n", "utf8");
  const drafts = fileur.parseDrafts(dir);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].title, "Interface (player) : contraste sous le seuil sur `.chord`");
  assert.ok(drafts[0].body.startsWith("Contrôle automatique"));
  assert.equal(drafts[0].kind, "draft");
  assert.deepEqual(fileur.parseDrafts(path.join(dir, "inexistant")), []);
});
test("parseExplorerReport : but extrait, frictions listées", () => {
  const rep = fileur.parseExplorerReport(RAPPORT_AVEC_FRICTIONS);
  assert.ok(rep.hasFrictions);
  assert.equal(rep.frictions.length, 2);
  assert.match(rep.frictions[0], /ÉCHOUÉ/);
  assert.match(rep.goal, /^Tu prépares une répétition/);
});
test("parseExplorerReport : sans friction, rien à filer", () => {
  const rep = fileur.parseExplorerReport(RAPPORT_SANS_FRICTION);
  assert.equal(rep.hasFrictions, false);
  assert.equal(rep.frictions.length, 0);
});
test("buildExplorerIssue : titre court et daté, corps complet et honnête", () => {
  const rep = fileur.parseExplorerReport(RAPPORT_AVEC_FRICTIONS);
  const issue = fileur.buildExplorerIssue(rep, "2026-11-02");
  assert.equal(issue.title, "Exploration IA — Tu prépares une répétition (2026-11-02)");
  assert.equal(issue.kind, "explorer");
  assert.match(issue.body, /Frictions constatées : 2/);
  assert.match(issue.body, /explorer-proposition/);
  assert.match(issue.body, /chien de garde visuel/);
  assert.match(issue.body, /agent-ok/); // le rappel « approbation humaine »
});
test("planCreations déduplique contre les issues ouvertes (titre normalisé)", () => {
  const drafts = [
    { kind: "draft", title: "Interface (player) : contraste sous le seuil sur `.chord`", body: "b1" },
    { kind: "draft", title: "Régression visuelle perçue : spotlight / player", body: "b2" },
  ];
  const planned = fileur.planCreations({
    drafts, explorerReport: null,
    existingTitles: ["interface player contraste sous le seuil sur chord"], max: 5,
  });
  assert.equal(planned.length, 1);
  assert.equal(planned[0].title, drafts[1].title);
});
test("planCreations respecte le plafond --max", () => {
  const drafts = [1, 2, 3].map((i) => ({ kind: "draft", title: `T${i}`, body: "b" }));
  const planned = fileur.planCreations({ drafts, explorerReport: null, existingTitles: [], max: 2 });
  assert.equal(planned.length, 2);
});
test("planCreations file le rapport d'exploration quand aucun même but n'est ouvert", () => {
  const rep = fileur.parseExplorerReport(RAPPORT_AVEC_FRICTIONS);
  const issue = fileur.buildExplorerIssue(rep, "2026-11-02");
  const planned = fileur.planCreations({ drafts: [], explorerReport: issue, existingTitles: [], max: 5 });
  assert.equal(planned.length, 1);
  assert.equal(planned[0].kind, "explorer");
});
test("planCreations : contre-pression — un seul rapport ouvert par but", () => {
  const rep = fileur.parseExplorerReport(RAPPORT_AVEC_FRICTIONS);
  const issue = fileur.buildExplorerIssue(rep, "2026-11-02");
  const existing = ["Exploration IA — Tu prépares une répétition (2026-10-26)"];
  const planned = fileur.planCreations({ drafts: [], explorerReport: issue, existingTitles: existing, max: 5 });
  assert.equal(planned.length, 0);
});
test("planCreations : brouillons prioritaires sur le rapport d'exploration", () => {
  const rep = fileur.parseExplorerReport(RAPPORT_AVEC_FRICTIONS);
  const issue = fileur.buildExplorerIssue(rep, "2026-11-02");
  const drafts = [1, 2].map((i) => ({ kind: "draft", title: `T${i}`, body: "b" }));
  const planned = fileur.planCreations({ drafts, explorerReport: issue, existingTitles: [], max: 2 });
  assert.equal(planned.length, 2);
  assert.ok(planned.every((p) => p.kind === "draft"));
});
test("main --dry-run : planifie sans jamais appeler gh issue create", async () => {
  const dir = tmpDir();
  writeDraft(dir, "01-a.md", "Interface (player) : contraste sous le seuil", "corps");
  const gh = fakeGh([]);
  const logs = [];
  const r = await fileur.main(["--drafts=" + dir, "--repo=o/r", "--dry-run"], {
    runGh: gh, env: {}, date: "2026-11-02", log: (m) => logs.push(m),
  });
  assert.equal(r.created.length, 1);
  assert.ok(gh.calls.every((a) => !(a[1] === "create")), "dry-run ne crée rien");
  assert.ok(logs.some((l) => l.includes("[draft]")));
});
test("main crée les issues avec explorer-proposition, jamais agent-ok", async () => {
  const dir = tmpDir();
  writeDraft(dir, "01-a.md", "Interface (player) : contraste sous le seuil", "corps");
  const gh = fakeGh([]);
  const r = await fileur.main(["--drafts=" + dir, "--repo=o/r"], {
    runGh: gh, env: {}, date: "2026-11-02",
  });
  const create = gh.calls.find((a) => a[1] === "create");
  assert.ok(create, "gh issue create appelé");
  const labelIdx = create.indexOf("--label");
  assert.equal(create[labelIdx + 1], "explorer-proposition");
  assert.ok(!create.some((x) => x === "agent-ok"));
  assert.equal(r.created.length, 1);
});
test("main file un rapport d'exploration avec frictions", async () => {
  const dir = tmpDir();
  const repDir = tmpDir();
  fs.writeFileSync(path.join(repDir, "rapport.md"), RAPPORT_AVEC_FRICTIONS, "utf8");
  const gh = fakeGh([]);
  const r = await fileur.main(
    ["--drafts=" + dir, "--explorer=" + path.join(repDir, "rapport.md"), "--repo=o/r"],
    { runGh: gh, env: {}, date: "2026-11-02" }
  );
  assert.equal(r.created.length, 1);
  assert.equal(r.created[0].title, "Exploration IA — Tu prépares une répétition (2026-11-02)");
});
test("main ignore un rapport sans friction et un rapport absent", async () => {
  const dir = tmpDir();
  const repDir = tmpDir();
  fs.writeFileSync(path.join(repDir, "rapport.md"), RAPPORT_SANS_FRICTION, "utf8");
  const gh = fakeGh([]);
  const r = await fileur.main(
    ["--drafts=" + dir, "--explorer=" + path.join(repDir, "rapport.md"), "--repo=o/r"],
    { runGh: gh, env: {}, date: "2026-11-02" }
  );
  assert.equal(r.created.length, 0);
  const r2 = await fileur.main(
    ["--drafts=" + dir, "--explorer=" + path.join(repDir, "absent.md"), "--repo=o/r"],
    { runGh: gh, env: {}, date: "2026-11-02" }
  );
  assert.equal(r2.created.length, 0);
});
test("main ne recrée pas une issue ouverte identique", async () => {
  const dir = tmpDir();
  writeDraft(dir, "01-a.md", "Interface (player) : contraste sous le seuil", "corps");
  const gh = fakeGh(["Interface (player) : contraste sous le seuil"]);
  const r = await fileur.main(["--drafts=" + dir, "--repo=o/r"], {
    runGh: gh, env: {}, date: "2026-11-02",
  });
  assert.equal(r.created.length, 0);
  assert.ok(gh.calls.every((a) => a[1] !== "create"));
});
