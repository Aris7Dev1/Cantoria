/*
 * Simulation de bout en bout du runner dans un dépôt temporaire, avec un faux `vibe` et un faux `gh`.
 * Nécessite Git et un système de type Unix : ignoré sous Windows.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

const RUNNER = path.join(__dirname, "..", "scripts", "agent", "run-issue.js");
const FAKE_VIBE = path.join(__dirname, "fixtures", "fake-vibe.js");
const FAKE_GH = path.join(__dirname, "fixtures", "fake-gh.js");
const skip = process.platform === "win32" ? "Git + shell requis" : false;

const identity = {
  GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    env: { ...process.env, ...identity },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cantoria-sim-"));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  git(root, "init", "--bare", "-b", "main", remote);
  git(root, "clone", remote, work);
  git(work, "checkout", "-b", "main");
  fs.writeFileSync(path.join(work, "package.json"),
    JSON.stringify({ scripts: { check: "node --check main.js", test: "node tests/run.js" } }));
  fs.writeFileSync(path.join(work, "main.js"), "console.log('hi');\n");
  fs.writeFileSync(path.join(work, "VISION.md"), "# Vision\n");
  fs.writeFileSync(path.join(work, "AGENTS.md"), "# Règles\n");
  fs.mkdirSync(path.join(work, "tests"));
  fs.writeFileSync(path.join(work, "tests", "run.js"),
    "process.exit(require('fs').existsSync('BREAK') ? 1 : 0);\n");
  git(work, "add", "-A");
  git(work, "commit", "-m", "Initial");
  git(work, "push", "-u", "origin", "main");
  const vibeConfig = path.join(root, "vibe-config.toml");
  fs.writeFileSync(vibeConfig, "# config de confiance (test)\nactive_model = \"large-4\"\n");
  return { root, remote, work, vibeConfig };
}

const ISSUE = (overrides = {}) => JSON.stringify({
  number: 5, title: "Corriger le bug", body: "Décris le bug ici.", state: "OPEN",
  labels: [{ name: "agent-ok" }], author: { login: "james" }, ...overrides,
});

function runRunner(sb, { mode = "ok", issue = ISSUE(), extraArgs = [], ghUser = "james" } = {}) {
  const files = {
    ghLog: path.join(sb.root, "gh.log"),
    prompt: path.join(sb.root, "prompt.txt"),
    args: path.join(sb.root, "args.json"),
    env: path.join(sb.root, "env.json"),
  };
  const res = spawnSync(process.execPath, [RUNNER, "5", ...extraArgs], {
    cwd: sb.work,
    encoding: "utf8",
    env: {
      ...process.env, ...identity,
      AGENT_VIBE_CMD: `${process.execPath} ${FAKE_VIBE}`,
      AGENT_VIBE_CONFIG: sb.vibeConfig,
      AGENT_GRACE_S: "0",
      // Le runner purge l'environnement de l'agent : on transmet explicitement les commandes du faux Vibe.
      AGENT_PASSTHROUGH_ENV: "FAKE_MODE,FAKE_PROMPT_OUT,FAKE_ARGS_OUT,FAKE_ENV_OUT",
      // Secrets du superviseur : ils ne doivent JAMAIS atteindre l'agent.
      GH_TOKEN: "ghp_secret_du_superviseur",
      GITHUB_TOKEN: "ghs_secret_du_superviseur",
      SECRET_SUPERVISEUR: "valeur-secrete",
      AGENT_GH_CMD: `${process.execPath} ${FAKE_GH}`,
      AGENT_WORKTREES_DIR: path.join(sb.root, "wt"),
      AGENT_LOGS_DIR: path.join(sb.root, "logs"),
      AGENT_SKIP_INSTALL: "1",
      FAKE_MODE: mode, FAKE_ISSUE_JSON: issue, FAKE_GH_USER: ghUser,
      FAKE_GH_LOG: files.ghLog, FAKE_PROMPT_OUT: files.prompt, FAKE_ARGS_OUT: files.args, FAKE_ENV_OUT: files.env,
    },
  });
  const remoteHasBranch = git(sb.root, "ls-remote", "--heads", sb.remote, "agent/issue-5-corriger-le-bug").trim() !== "";
  const ghLog = fs.existsSync(files.ghLog) ? fs.readFileSync(files.ghLog, "utf8") : "";
  return { res, files, remoteHasBranch, ghLog, worktree: path.join(sb.root, "wt", "issue-5") };
}

test("succès : branche poussée, PR ouverte, prompt et plafonds transmis à Vibe", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb);
  assert.equal(out.res.status, 0, out.res.stderr + out.res.stdout);
  assert.ok(out.remoteHasBranch, "la branche doit être poussée");
  assert.match(out.ghLog, /"pr","create"/);
  assert.doesNotMatch(out.ghLog, /--draft/);
  const body = fs.readFileSync(`${out.files.ghLog}.body`, "utf8");
  assert.match(body, /Closes #5/);
  assert.match(body, /Bug corrigé, test ajouté/);
  assert.match(body, /3 appels au modèle/);
  assert.match(body, /0\.12 \$/);

  const prompt = fs.readFileSync(out.files.prompt, "utf8");
  assert.match(prompt, /Décris le bug ici\./);
  assert.match(prompt, /VISION\.md/);
  assert.match(prompt, /Tu ne peux ni pousser/, "la politique doit être injectée dans le prompt");
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/, "aucune variable de gabarit ne doit rester");

  const args = JSON.parse(fs.readFileSync(out.files.args, "utf8"));
  assert.equal(args[args.indexOf("--agent") + 1], "accept-edits");
  assert.equal(args[args.indexOf("--max-turns") + 1], "60");
  assert.equal(args[args.indexOf("--max-price") + 1], "3");
  assert.equal(args[args.indexOf("--time-limit") + 1], "1800");
  for (const forbidden of ["--yolo", "--auto-approve", "--trust", "--smart-approve"]) {
    assert.ok(!args.includes(forbidden), `${forbidden} ne doit pas être passé à Vibe`);
  }
});

test("l'agent ne reçoit ni jeton GitHub ni secret du superviseur, et une configuration isolée", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb);
  assert.equal(out.res.status, 0, out.res.stderr);
  const seen = JSON.parse(fs.readFileSync(out.files.env, "utf8"));
  assert.equal(seen.GH_TOKEN, null);
  assert.equal(seen.GITHUB_TOKEN, null);
  assert.equal(seen.SECRET_SUPERVISEUR, null);
  assert.equal(seen.MISTRAL_API_KEY, "via-passerelle");
  assert.equal(seen.configCopied, true, "la configuration de confiance doit être copiée dans le VIBE_HOME de l'exécution");
  assert.ok(seen.VIBE_HOME.startsWith(path.join(sb.root, "logs")), "VIBE_HOME doit être propre à l'exécution");
  assert.equal(fs.realpathSync(seen.cwd), fs.realpathSync(out.worktree), "l'agent travaille dans le worktree");
  const copied = fs.readFileSync(path.join(seen.VIBE_HOME, "config.toml"), "utf8");
  assert.match(copied, /config de confiance/);
});

test("refuse une issue sans le label d'approbation", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { issue: ISSUE({ labels: [] }) });
  assert.equal(out.res.status, 1);
  assert.match(out.res.stderr, /agent-ok/);
  assert.equal(fs.existsSync(out.worktree), false);
});

test("refuse une issue créée par quelqu'un d'autre", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { issue: ISSUE({ author: { login: "inconnu" } }) });
  assert.equal(out.res.status, 1);
  assert.match(out.res.stderr, /pas par toi/);
  assert.equal(fs.existsSync(out.worktree), false);
});

test("refuse une issue fermée", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { issue: ISSUE({ state: "CLOSED" }) });
  assert.equal(out.res.status, 1);
});

test("fichier protégé modifié : rien n'est poussé (code 4)", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "forbidden" });
  assert.equal(out.res.status, 4);
  assert.match(out.res.stderr, /VISION\.md/);
  assert.equal(out.remoteHasBranch, false);
  assert.doesNotMatch(out.ghLog, /"pr","create"/);
});

test("tests en échec : rien n'est poussé (code 3)", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "breaktests" });
  assert.equal(out.res.status, 3);
  assert.equal(out.remoteHasBranch, false);
});

test("code modifié sans test : PR en brouillon avec avertissement", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "notests" });
  assert.equal(out.res.status, 0, out.res.stderr);
  assert.match(out.ghLog, /--draft/);
  assert.match(fs.readFileSync(`${out.files.ghLog}.body`, "utf8"), /aucun fichier de `tests\/`/);
});

test("modifications non commitées : enregistrées par le runner, PR en brouillon", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "dirty" });
  assert.equal(out.res.status, 0, out.res.stderr);
  assert.ok(out.remoteHasBranch);
  assert.match(out.ghLog, /--draft/);
});

test("aucun commit : échec de l'agent (code 2)", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "nocommit" });
  assert.equal(out.res.status, 2);
  assert.equal(out.remoteHasBranch, false);
});

test("panne de la passerelle ou du modèle : code 2, rien de poussé", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "infra" });
  assert.equal(out.res.status, 2);
  assert.match(out.res.stderr, /panne.*502/);
  assert.equal(out.remoteHasBranch, false);
});

test("plafond de tours atteint : le travail partiel n'est JAMAIS poussé (code 2)", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "turn-limit" });
  assert.equal(out.res.status, 2);
  assert.match(out.res.stderr, /limite de tours/);
  assert.equal(out.remoteHasBranch, false);
  assert.doesNotMatch(out.ghLog, /"pr","create"/);
  assert.ok(fs.existsSync(out.worktree), "le worktree est conservé pour inspection");
});

test("plafond de coût atteint : code 2, rien de poussé", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "price-limit" });
  assert.equal(out.res.status, 2);
  assert.match(out.res.stderr, /plafond de coût/);
  assert.equal(out.remoteHasBranch, false);
});

test("sans export lisible, l'échec est détecté par le code de sortie", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "no-export" });
  assert.equal(out.res.status, 2);
  assert.equal(out.remoteHasBranch, false);
});

test("Vibe qui ne rend pas la main : arrêt forcé, code 2", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "hang", extraArgs: ["--timeout-min=0.02"] });
  assert.equal(out.res.status, 2);
  assert.match(out.res.stderr, /pas rendu la main/);
  assert.equal(out.remoteHasBranch, false);
});

test("configuration de projet de Vibe (AGENTS.md, .vibe/) : refusée comme fichier protégé (code 4)", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { mode: "forbidden-vibe" });
  assert.equal(out.res.status, 4);
  assert.match(out.res.stderr, /AGENTS\.md/);
  assert.match(out.res.stderr, /\.vibe\/config\.toml/);
  assert.equal(out.remoteHasBranch, false);
});

test("configuration de Vibe introuvable : code 1 avant tout effet de bord", { skip }, () => {
  const sb = makeSandbox();
  fs.rmSync(sb.vibeConfig);
  const out = runRunner(sb);
  assert.equal(out.res.status, 1);
  assert.match(out.res.stderr, /Configuration de Vibe introuvable/);
  assert.equal(fs.existsSync(out.worktree), false);
});

test("--dry-run n'a aucun effet de bord", { skip }, () => {
  const sb = makeSandbox();
  const out = runRunner(sb, { extraArgs: ["--dry-run"] });
  assert.equal(out.res.status, 0, out.res.stderr);
  assert.match(out.res.stdout, /Prompt/);
  assert.equal(fs.existsSync(out.worktree), false);
  assert.equal(out.remoteHasBranch, false);
});

test("VISION.md encore en gabarit : l'agent n'est pas lancé", { skip }, () => {
  const sb = makeSandbox();
  fs.writeFileSync(path.join(sb.work, "VISION.md"), "# Vision\n<!-- À COMPLÉTER : mission -->\n");
  git(sb.work, "add", "-A");
  git(sb.work, "commit", "-m", "Vision en gabarit");
  git(sb.work, "push", "origin", "main");
  const out = runRunner(sb);
  assert.equal(out.res.status, 1, out.res.stderr + out.res.stdout);
  assert.match(out.res.stderr + out.res.stdout, /À COMPLÉTER/);
  assert.equal(out.remoteHasBranch, false);
  assert.ok(!fs.existsSync(out.worktree), "aucun worktree créé");
});
