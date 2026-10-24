#!/usr/bin/env node
"use strict";

/*
 * Runner de l'agent codeur : une issue approuvée -> une branche vérifiée -> une pull request.
 *
 *   node scripts/agent/run-issue.js <numéro-issue> [--dry-run] [--no-pr] [--base=main]
 *                                   [--timeout-min=30] [--budget-usd=3] [--max-turns=60]
 *
 * Principe : l'agent (Mistral Vibe, mode non interactif) code et commite dans un worktree isolé,
 * mais ne peut pas pousser. Le runner refait ses propres vérifications, applique la politique
 * (fichiers protégés, taille du diff) puis pousse et ouvre la pull request. Il ne fusionne jamais.
 *
 * Codes de sortie : 0 succès · 1 usage/prérequis · 2 échec de l'agent · 3 contrôles en échec · 4 politique violée.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const lib = require("./lib");

const EXIT = { OK: 0, USAGE: 1, AGENT: 2, CHECKS: 3, POLICY: 4 };

function parseArgs(argv) {
  const opts = { issue: null, dryRun: false, noPr: false, base: "main", timeoutMin: null, budgetUsd: null, maxTurns: null };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-pr") opts.noPr = true;
    else if (arg.startsWith("--base=")) opts.base = arg.slice(7);
    else if (arg.startsWith("--timeout-min=")) opts.timeoutMin = Number(arg.slice(14));
    else if (arg.startsWith("--budget-usd=")) opts.budgetUsd = Number(arg.slice(13));
    else if (arg.startsWith("--max-turns=")) opts.maxTurns = Number(arg.slice(12));
    else if (/^\d+$/.test(arg) && opts.issue === null) opts.issue = Number(arg);
    else throw new Error(`Argument inconnu : ${arg}`);
  }
  if (opts.issue === null) throw new Error("Numéro d'issue manquant.");
  return opts;
}

const env = process.env;
const config = {
  requiredLabel: env.AGENT_REQUIRED_LABEL || "agent-ok",
  maxDiffLines: Number(env.AGENT_MAX_DIFF_LINES) || 600,
  timeoutMin: Number(env.AGENT_TIMEOUT_MIN) || 30,
  budgetUsd: Number(env.AGENT_BUDGET_USD) || 3,
  maxTurns: Number(env.AGENT_MAX_TURNS) || 60,
  // Marge (secondes) laissée à Vibe après --time-limit pour écrire son export avant l'arrêt forcé.
  graceS: env.AGENT_GRACE_S !== undefined && Number(env.AGENT_GRACE_S) >= 0 ? Number(env.AGENT_GRACE_S) : 90,
  worktreesDir: env.AGENT_WORKTREES_DIR || path.join(os.homedir(), "agent-worktrees"),
  logsDir: env.AGENT_LOGS_DIR || path.join(os.homedir(), "agent-logs"),
  vibeCmd: env.AGENT_VIBE_CMD || "vibe",
  // Configuration de confiance de Vibe (liste blanche de commandes, passerelle, modèle).
  // Par défaut : celle du dépôt du superviseur, jamais celle du worktree de l'agent.
  vibeConfig: env.AGENT_VIBE_CONFIG || "",
  ghCmd: env.AGENT_GH_CMD || "gh",
  skipInstall: env.AGENT_SKIP_INSTALL === "1",
  allowOtherAuthors: env.AGENT_ALLOW_OTHER_AUTHORS === "1",
};

function step(message) {
  console.log(`\n==> ${message}`);
}

function die(code, message, hints = []) {
  console.error(`\nERREUR : ${message}`);
  for (const hint of hints) console.error(`  ${hint}`);
  process.exit(code);
}

function exec(command, args, options = {}) {
  const { bin, prefixArgs } = lib.splitCommand(command);
  const res = spawnSync(bin, [...prefixArgs, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  return {
    status: res.status,
    signal: res.signal,
    error: res.error,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

const git = (args, cwd, extraEnv) => exec("git", args, { cwd, env: { ...env, ...extraEnv } });
const gh = (args, cwd) => exec(config.ghCmd, args, { cwd });
const tail = (text, lines = 40) => text.trim().split("\n").slice(-lines).join("\n");

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    die(EXIT.USAGE, error.message, ["Usage : node scripts/agent/run-issue.js <issue> [--dry-run] [--no-pr]"]);
  }
  const timeoutMin = opts.timeoutMin || config.timeoutMin;
  const budgetUsd = opts.budgetUsd || config.budgetUsd;
  const maxTurns = opts.maxTurns || config.maxTurns;

  const top = git(["rev-parse", "--show-toplevel"], process.cwd());
  if (top.status !== 0) die(EXIT.USAGE, "Ce dossier n'est pas un dépôt Git.");
  const repoRoot = top.stdout.trim();

  const vibeConfigPath = config.vibeConfig || path.join(repoRoot, ".devcontainer", "vibe", "config.toml");
  if (!fs.existsSync(vibeConfigPath)) {
    die(EXIT.USAGE, `Configuration de Vibe introuvable : ${vibeConfigPath}`);
  }

  step(`Synchronisation de origin/${opts.base}`);
  const fetched = git(["fetch", "origin", opts.base], repoRoot);
  if (fetched.status !== 0) die(EXIT.USAGE, "git fetch a échoué.", [tail(fetched.stderr, 5)]);
  const baseRef = `origin/${opts.base}`;

  const vision = git(["show", `${baseRef}:VISION.md`], repoRoot);
  if (vision.status === 0 && lib.visionIncomplete(vision.stdout)) {
    die(EXIT.USAGE, `VISION.md contient encore « ${lib.VISION_PLACEHOLDER} » sur ${baseRef}.`, [
      "L'agent suit ce document : complète-le (principes, périmètre, zones interdites), commite-le sur la branche de base, puis relance.",
    ]);
  }

  step(`Lecture de l'issue #${opts.issue}`);
  const view = gh(["issue", "view", String(opts.issue), "--json", "number,title,body,labels,state,author"], repoRoot);
  if (view.status !== 0) {
    die(EXIT.USAGE, "Impossible de lire l'issue.", [tail(view.stderr, 5), "Es-tu connecté ? (gh auth login)"]);
  }
  let issue;
  try {
    issue = JSON.parse(view.stdout);
  } catch {
    die(EXIT.USAGE, "Réponse de gh illisible.");
  }

  if (String(issue.state).toUpperCase() !== "OPEN") die(EXIT.USAGE, `L'issue n'est pas ouverte (${issue.state}).`);
  if (!lib.hasLabel(issue, config.requiredLabel)) {
    die(EXIT.USAGE, `L'issue n'a pas le label d'approbation « ${config.requiredLabel} ».`, [
      "Seul le superviseur pose ce label : c'est lui qui autorise l'agent à travailler sur cette tâche.",
    ]);
  }
  if (!config.allowOtherAuthors) {
    const me = gh(["api", "user", "--jq", ".login"], repoRoot);
    const author = issue.author && issue.author.login;
    if (me.status !== 0) die(EXIT.USAGE, "Impossible de déterminer ton identité GitHub.", [tail(me.stderr, 5)]);
    if (!author || author.toLowerCase() !== me.stdout.trim().toLowerCase()) {
      die(EXIT.USAGE, `L'issue a été créée par « ${author} », pas par toi (« ${me.stdout.trim()} »).`, [
        "Le contenu d'une issue devient une instruction pour l'agent : seules tes propres issues sont acceptées.",
      ]);
    }
  }

  const branch = lib.branchName(issue.number, issue.title);
  const template = fs.readFileSync(path.join(__dirname, "prompt-template.md"), "utf8");
  const prompt = lib.renderPrompt(template, {
    POLICY: lib.SYSTEM_POLICY,
    BRANCH: branch,
    BASE: opts.base,
    NUMBER: issue.number,
    TITLE: issue.title,
    BODY: issue.body || "(corps vide)",
  });

  if (opts.dryRun) {
    step("Simulation (--dry-run) : rien n'est créé");
    console.log(`Branche : ${branch}`);
    const previewArgs = lib.buildVibeArgs({
      promptFile: "<run>/prompt.md", outputDir: "<run>/out", maxTurns, maxPriceUsd: budgetUsd, timeLimitS: timeoutMin * 60,
    });
    console.log(`Commande : ${config.vibeCmd} ${previewArgs.join(" ")}`);
    console.log(`Configuration Vibe : ${vibeConfigPath}`);
    console.log(`Plafonds : ${maxTurns} tours · ${budgetUsd} $ · ${timeoutMin} min\n\n----- Prompt -----\n${prompt}`);
    return;
  }

  const worktree = path.join(config.worktreesDir, `issue-${issue.number}`);
  if (fs.existsSync(worktree)) {
    die(EXIT.USAGE, `Le worktree existe déjà : ${worktree}`, [`Supprime-le : git worktree remove --force ${worktree}`]);
  }
  if (git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot).status === 0) {
    die(EXIT.USAGE, `La branche locale ${branch} existe déjà.`);
  }
  if (git(["ls-remote", "--exit-code", "--heads", "origin", branch], repoRoot).status === 0) {
    die(EXIT.USAGE, `La branche distante ${branch} existe déjà.`);
  }

  step(`Création du worktree ${worktree}`);
  fs.mkdirSync(config.worktreesDir, { recursive: true });
  const added = git(["worktree", "add", "-b", branch, worktree, baseRef], repoRoot);
  if (added.status !== 0) die(EXIT.USAGE, "git worktree add a échoué.", [tail(added.stderr, 5)]);

  const leave = (code, message, hints = []) =>
    die(code, message, [...hints, `Worktree conservé pour inspection : ${worktree}`,
      `Nettoyage : git worktree remove --force ${worktree} && git branch -D ${branch}`]);

  // Identité Git de repli, uniquement par variables d'environnement (ne touche pas la config partagée).
  const hasIdentity = git(["config", "user.email"], repoRoot).stdout.trim() !== "";
  const identityEnv = hasIdentity ? {} : {
    GIT_AUTHOR_NAME: "Agent Cantoria",
    GIT_AUTHOR_EMAIL: "agent@localhost",
    GIT_COMMITTER_NAME: "Agent Cantoria",
    GIT_COMMITTER_EMAIL: "agent@localhost",
  };

  if (!config.skipInstall) {
    step("Installation des dépendances dans le worktree");
    const install = exec("npm", [fs.existsSync(path.join(worktree, "package-lock.json")) ? "ci" : "install"], { cwd: worktree });
    if (install.status !== 0) leave(EXIT.USAGE, "L'installation des dépendances a échoué.", [tail(install.stderr, 10)]);
  }

  step(`Lancement de l'agent (${maxTurns} tours max · ${budgetUsd} $ max · ${timeoutMin} min max)`);
  // Dossier d'exécution (droits 700) : configuration Vibe isolée, prompt, export et journal de session.
  fs.mkdirSync(config.logsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = fs.mkdtempSync(path.join(config.logsDir, `issue-${issue.number}-${stamp}-`));
  const vibeHome = path.join(runDir, "home");
  const outputDir = path.join(runDir, "out");
  const promptFile = path.join(runDir, "prompt.md");
  fs.mkdirSync(vibeHome, { recursive: true });
  fs.copyFileSync(vibeConfigPath, path.join(vibeHome, "config.toml"));
  fs.writeFileSync(promptFile, prompt, { mode: 0o600 });
  console.log(`Dossier d'exécution : ${runDir}`);

  // Environnement minimal pour l'agent : pas de jeton GitHub, pas de variables du superviseur,
  // et une clé Mistral factice (la vraie clé n'existe que dans la passerelle).
  // AGENT_PASSTHROUGH_ENV (noms séparés par des virgules) : variables à transmettre explicitement
  // (ex. un proxy). Appliqué en premier : il ne peut écraser aucune des valeurs fixées ci-dessous.
  const passthrough = {};
  for (const name of (env.AGENT_PASSTHROUGH_ENV || "").split(",").map((n) => n.trim()).filter(Boolean)) {
    if (env[name] !== undefined) passthrough[name] = env[name];
  }
  const agentEnv = {
    ...passthrough,
    PATH: env.PATH || "",
    HOME: env.HOME || os.homedir(),
    LANG: env.LANG || "C.UTF-8",
    TERM: "dumb",
    TMPDIR: env.TMPDIR || os.tmpdir(),
    CI: "1",
    VIBE_HOME: vibeHome,
    MISTRAL_API_KEY: "via-passerelle",
    ...identityEnv,
  };
  const { bin, prefixArgs } = lib.splitCommand(config.vibeCmd);
  const vibeArgs = lib.buildVibeArgs({ promptFile, outputDir, maxTurns, maxPriceUsd: budgetUsd, timeLimitS: timeoutMin * 60 });
  const run = spawnSync(bin, [...prefixArgs, ...vibeArgs], {
    cwd: worktree,
    encoding: "utf8",
    // Vibe s'arrête lui-même au délai (--time-limit) et écrit son export ; ceci n'est qu'un filet.
    timeout: (timeoutMin * 60 + config.graceS) * 1000,
    maxBuffer: 128 * 1024 * 1024,
    env: agentEnv,
  });
  const logFile = path.join(runDir, "run.json");
  fs.writeFileSync(logFile, JSON.stringify({
    issue: issue.number, branch, status: run.status, signal: run.signal,
    error: run.error ? String(run.error) : null, stdout: run.stdout, stderr: run.stderr,
  }, null, 2), { mode: 0o600 });
  console.log(`Journal : ${logFile}`);

  const timedOut = Boolean(run.error && run.error.code === "ETIMEDOUT");
  if (run.error && !timedOut) leave(EXIT.AGENT, `Impossible de lancer l'agent : ${run.error.message}`);
  if (timedOut) leave(EXIT.AGENT, `L'agent n'a pas rendu la main après ${timeoutMin} min (+ ${config.graceS} s de marge).`);

  let exportJson = null;
  try {
    exportJson = fs.readFileSync(path.join(outputDir, "export.json"), "utf8");
  } catch {
    // pas d'export : on s'appuie sur le code de sortie
  }
  const outcome = lib.parseVibeResult({ stdout: run.stdout || "", exportJson, exitCode: run.status });
  if (!outcome.ok) {
    leave(EXIT.AGENT, `L'agent n'a pas terminé : ${lib.describeOutcome(outcome)}.`, [
      tail(`${run.stderr || ""}\n${outcome.summary}`, 15),
      `Journal de session Vibe : ${outputDir}`,
    ]);
  }

  const warnings = [];
  const dirty = git(["status", "--porcelain"], worktree).stdout.trim();
  if (dirty) {
    git(["add", "-A"], worktree);
    const auto = git(["commit", "-m", "Enregistrer les modifications laissées non commitées par l'agent"], worktree, identityEnv);
    if (auto.status !== 0) leave(EXIT.AGENT, "Modifications non commitées impossibles à enregistrer.", [tail(auto.stderr, 5)]);
    warnings.push("L'agent a laissé des modifications non commitées ; le runner les a enregistrées dans un commit séparé.");
  }

  const ahead = Number(git(["rev-list", "--count", `${baseRef}..HEAD`], worktree).stdout.trim());
  if (!ahead) leave(EXIT.AGENT, "L'agent n'a produit aucun commit.", [tail(outcome.summary, 15)]);

  step("Contrôle de la politique");
  const numstat = git(["diff", "--no-renames", "--numstat", `${baseRef}...HEAD`], worktree);
  const { files, changedLines } = lib.parseNumstat(numstat.stdout);
  const forbidden = lib.findForbidden(files);
  if (forbidden.length) {
    leave(EXIT.POLICY, "L'agent a modifié des fichiers protégés. Rien n'a été poussé.", forbidden.map((f) => `- ${f}`));
  }
  if (changedLines > config.maxDiffLines) {
    leave(EXIT.POLICY, `Diff trop volumineux : ${changedLines} lignes (max ${config.maxDiffLines}). Rien n'a été poussé.`,
      ["Découpe l'issue en tâches plus petites."]);
  }
  if (lib.needsTests(files)) {
    warnings.push("Du code a changé sans qu'aucun fichier de `tests/` ne change : à examiner de près.");
  }
  if (!outcome.summary.trim()) warnings.push("L'agent n'a fourni aucun résumé.");

  step("Contrôles indépendants (npm run check, npm test)");
  const checkRun = exec("npm", ["run", "check"], { cwd: worktree });
  const testRun = exec("npm", ["test"], { cwd: worktree });
  const checks = { check: checkRun.status === 0, test: testRun.status === 0 };
  console.log(`check : ${checks.check ? "OK" : "ÉCHEC"} · test : ${checks.test ? "OK" : "ÉCHEC"}`);
  if (!checks.check || !checks.test) {
    leave(EXIT.CHECKS, "Les vérifications échouent sur le travail de l'agent. Rien n'a été poussé.", [
      tail(`${checkRun.stdout}\n${checkRun.stderr}\n${testRun.stdout}\n${testRun.stderr}`, 30),
    ]);
  }

  step(`Push de ${branch}`);
  const pushed = git(["push", "-u", "origin", branch], worktree);
  if (pushed.status !== 0) leave(EXIT.USAGE, "git push a échoué.", [tail(pushed.stderr, 8), "Authentification : gh auth login puis gh auth setup-git"]);

  if (opts.noPr) {
    console.log(`\nBranche poussée : ${branch} (pull request non créée, --no-pr).`);
    return;
  }

  step("Création de la pull request");
  const body = lib.buildPrBody({
    issueNumber: issue.number, summary: outcome.summary, files, changedLines,
    checks, warnings, steps: outcome.steps, costUsd: outcome.costUsd,
  });
  const bodyFile = path.join(os.tmpdir(), `pr-body-${issue.number}-${process.pid}.md`);
  fs.writeFileSync(bodyFile, body, { mode: 0o600 });
  const prArgs = ["pr", "create", "--base", opts.base, "--head", branch,
    "--title", `${issue.title} (#${issue.number})`, "--body-file", bodyFile];
  if (warnings.length) prArgs.push("--draft");
  const pr = gh(prArgs, worktree);
  fs.rmSync(bodyFile, { force: true });
  if (pr.status !== 0) leave(EXIT.USAGE, "gh pr create a échoué (la branche est poussée).", [tail(pr.stderr, 8)]);

  console.log(`\nPull request : ${pr.stdout.trim().split("\n").pop()}${warnings.length ? " (brouillon : voir les avertissements)" : ""}`);
  console.log(`Worktree : ${worktree}  (suppression : git worktree remove ${worktree})`);
}

main();
