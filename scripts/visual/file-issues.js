#!/usr/bin/env node
/*
 * Fileur d'issues du chien de garde visuel (visual-watch.yml) : transforme
 * les brouillons de la boucle visuelle (visual-out/issues-drafts/) et le
 * rapport de l'explorateur IA en issues GitHub étiquetées `explorer-proposition`.
 *
 * Garde-fous (zone superviseur : ne pas les affaiblir) :
 * - le label `agent-ok` est REFUSÉ : l'approbation d'une tâche reste un
 *   geste humain (même convention que le runner de l'agent codeur) ;
 * - déduplication : un brouillon dont le titre normalisé correspond à une
 *   issue OUVERTE existante n'est pas recréé ;
 * - contre-pression : un rapport d'exploration n'est filé que s'il constate
 *   des frictions, et un seul rapport par but reste ouvert à la fois ;
 * - plafond de créations par run (--max, défaut 5) ;
 * - --dry-run : tout planifier, ne rien créer.
 *
 * Usage : node scripts/visual/file-issues.js --drafts=visual-out/issues-drafts
 *         [--explorer=rapport-exploration.md] [--label=explorer-proposition]
 *         [--max=5] [--repo=owner/name] [--dry-run]
 * Dépôt : --repo ou variable GITHUB_REPOSITORY. `gh` (GH_TOKEN) fait le
 * travail GitHub ; deps.runGh permet l'injection d'un faux gh (tests).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const execFileP = promisify(execFile);

const FORBIDDEN_LABEL = "agent-ok";
const EXPLORER_PREFIX = "Exploration IA —";

function parseArgs(argv, env = process.env) {
  const o = {
    drafts: "", explorer: "", label: "explorer-proposition", max: 5,
    dryRun: false, repo: env.GITHUB_REPOSITORY || "",
  };
  for (const a of argv) {
    if (!a.startsWith("--")) throw new Error(`Argument inattendu : ${a}`);
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    const v = rest.join("=");
    switch (k) {
      case "drafts": o.drafts = v; break;
      case "explorer": o.explorer = v; break;
      case "label": o.label = v; break;
      case "max": {
        const n = parseInt(v, 10);
        if (!Number.isInteger(n) || n < 1) throw new Error("--max : entier ≥ 1 requis");
        o.max = n; break;
      }
      case "dry-run": o.dryRun = true; break;
      case "repo": o.repo = v; break;
      default: throw new Error(`Option inconnue : --${k}`);
    }
  }
  if (o.label === FORBIDDEN_LABEL) {
    throw new Error(`Le label « ${FORBIDDEN_LABEL} » est réservé à l'approbation humaine — le fileur refuse de le poser.`);
  }
  if (!o.repo) throw new Error("Dépôt manquant : --repo=owner/name ou variable GITHUB_REPOSITORY.");
  return o;
}

/* Normalisation de titre pour la déduplication : casse, accents, ponctuation. */
function normTitle(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/* Clé d'un titre d'exploration : le titre sans sa date (un même but ne
   reste ouvert qu'une fois, quelle que soit la date du run). */
function explorerKey(title) {
  return normTitle(String(title || "").replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, ""));
}

/* Brouillons : fichiers .md du dossier, titre = première ligne « # … »
   (format écrit par draftIssues de run.js). Tri par nom = ordre stable. */
function parseDrafts(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const m = text.match(/^#\s+(.+?)\s*\r?\n([\s\S]*)$/);
      if (!m) return null;
      return { kind: "draft", source: f, title: m[1].trim(), body: m[2].trim() };
    }).filter(Boolean);
}

/* Rapport de l'explorateur : but (ligne « But : « … » ») + section
   « Frictions constatées ». Sans frictions, rien à filer. */
function parseExplorerReport(text) {
  const t = String(text || "");
  const goal = ((t.match(/^But\s*:\s*«(.*)»\s*$/m) || [])[1] || "").trim();
  const frictions = [];
  const lines = t.split(/\r?\n/);
  const start = lines.findIndex((l) => /^###\s*Frictions constatées/.test(l));
  if (start !== -1) {
    for (const l of lines.slice(start + 1)) {
      if (/^#{1,3}\s/.test(l) || l.trim().startsWith("*Rapport")) break;
      const m = l.match(/^[-*]\s+(.*)$/);
      if (m) frictions.push(m[1].trim());
    }
  }
  return { goal, frictions, hasFrictions: frictions.length > 0, full: t };
}

/* Titre court du but : la première proposition avant « : » (les buts de
   explorer-goals.json commencent par le persona, ex : « Tu prépares une
   répétition : … »). C'est la clé de contre-pression. */
function shortGoal(goal) {
  const head = String(goal || "").split(/[:;]/)[0].trim();
  if (!head) return "but inconnu";
  return head.length > 60 ? head.slice(0, 57) + "…" : head;
}

function buildExplorerIssue(report, date) {
  const title = `${EXPLORER_PREFIX} ${shortGoal(report.goal)} (${date})`;
  const body = [
    "Rapport d'exploration IA automatique (chien de garde visuel) — consultatif : il informe, il ne décide rien.",
    "",
    `Date du run : ${date}. Frictions constatées : ${report.frictions.length}.`,
    "",
    "<details><summary>Rapport complet</summary>",
    "",
    report.full,
    "",
    "</details>",
    "",
    "---",
    "_Issue créée automatiquement avec le label `explorer-proposition`. Relis-la, corrige-la si besoin, puis pose toi-même le label `agent-ok` pour confier le traitement à l'agent codeur._",
  ].join("\n");
  return { kind: "explorer", title, body, hasFrictions: true };
}

/* Planifie les créations : brouillons d'abord (constats déterministes),
   puis le rapport d'exploration, dans la limite du plafond. */
function planCreations({ drafts, explorerReport, existingTitles, max }) {
  const planned = [];
  const seenDraft = new Set(existingTitles.map(normTitle));
  const seenExplorer = new Set(existingTitles.map(explorerKey));
  for (const d of drafts) {
    if (planned.length >= max) return planned;
    if (seenDraft.has(normTitle(d.title))) continue;
    planned.push(d);
  }
  if (explorerReport && explorerReport.hasFrictions && planned.length < max) {
    if (!seenExplorer.has(explorerKey(explorerReport.title))) planned.push(explorerReport);
  }
  return planned;
}

async function main(argv, deps = {}) {
  const env = deps.env || process.env;
  const opts = parseArgs(argv, env);
  const date = deps.date || new Date().toISOString().slice(0, 10);
  const log = deps.log || ((m) => process.stdout.write(m + "\n"));
  const runGh = deps.runGh || ((args) => execFileP("gh", args));

  const drafts = parseDrafts(opts.drafts);
  const explorerText = opts.explorer && fs.existsSync(opts.explorer)
    ? fs.readFileSync(opts.explorer, "utf8") : "";
  const rep = parseExplorerReport(explorerText);
  const explorerIssue = rep.hasFrictions ? buildExplorerIssue(rep, date) : null;

  /* Déduplication : titres des issues OUVERTES, toutes étiquettes confondues. */
  const { stdout } = await runGh(["issue", "list", "--repo", opts.repo, "--state", "open", "--json", "title", "--limit", "300"]);
  const existingTitles = JSON.parse(stdout).map((i) => i.title);
  const planned = planCreations({ drafts, explorerReport: explorerIssue, existingTitles, max: opts.max });

  log(`Fileur : ${drafts.length} brouillon(s) déterministe(s), ${explorerIssue ? 1 : 0} rapport d'exploration à filer — ${planned.length} création(s) prévue(s) (plafond ${opts.max}, dédoublonné contre les issues ouvertes).`);
  if (!planned.length) { log("Rien à créer."); return { code: 0, created: [] }; }

  const created = [];
  for (const p of planned) {
    log(`${opts.dryRun ? "[dry-run] " : ""}[${p.kind}] ${p.title}`);
    if (opts.dryRun) { created.push(p); continue; }
    const bodyFile = path.join(os.tmpdir(), `cantoria-fileur-${process.pid}-${created.length}.md`);
    fs.writeFileSync(bodyFile, p.body + "\n", "utf8");
    try {
      const out = await runGh(["issue", "create", "--repo", opts.repo, "--title", p.title, "--body-file", bodyFile, "--label", opts.label]);
      log(`  → ${String(out.stdout || "").trim()}`);
      created.push(p);
    } finally {
      fs.rmSync(bodyFile, { force: true });
    }
  }
  log(opts.dryRun ? "Dry-run : aucune issue créée." : `${created.length} issue(s) créée(s) avec le label « ${opts.label} ».`);
  return { code: 0, created };
}

if (require.main === module) {
  main(process.argv.slice(2)).then((r) => process.exit(r.code)).catch((e) => {
    process.stderr.write(`Erreur du fileur : ${e.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  parseArgs, normTitle, explorerKey, parseDrafts, parseExplorerReport,
  shortGoal, buildExplorerIssue, planCreations, main, FORBIDDEN_LABEL, EXPLORER_PREFIX,
};
