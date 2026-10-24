#!/usr/bin/env node
/*
 * Boucle visuelle, première brique :
 *   capture (Electron sous Xvfb) -> contrôles déterministes -> comparaison à la référence -> juge A/B (optionnel)
 *   -> rapport + brouillons d'issues.
 * Ne crée rien sur GitHub et ne modifie aucun fichier du code : tout est écrit dans le dossier de sortie.
 *
 * Usage : xvfb-run -a node scripts/visual/run.js [options]   (voir docs/visual/README.md)
 */
const fs = require("node:fs");
const path = require("node:path");
const { THEMES } = require("./fixtures");
const { scenarios: ALL_SCENARIOS } = require("./scenarios");
const { decodePng, encodePng, diffImages } = require("./png");

function parseArgs(argv, env = process.env) {
  const o = {
    engine: "electron", themes: THEMES.slice(), scenarios: null, out: "visual-out", baseline: "visual-baseline",
    judge: false, intent: "", repetitions: 2, maxJudgeCalls: 24, strict: false, updateBaseline: false,
    judgeModel: env.VISUAL_JUDGE_MODEL || "mistral-large-4",
    gatewayUrl: env.GATEWAY_URL || "http://mistral-gateway:8080",
  };
  for (const a of argv) {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    const v = rest.join("=");
    if (!a.startsWith("--")) throw new Error(`Argument inattendu : ${a}`);
    switch (k) {
      case "engine": if (!["electron", "chromium"].includes(v)) throw new Error("--engine : electron ou chromium"); o.engine = v; break;
      case "themes": o.themes = v.split(",").filter(Boolean); break;
      case "scenarios": o.scenarios = v.split(",").filter(Boolean); break;
      case "out": o.out = v; break;
      case "baseline": o.baseline = v; break;
      case "judge": o.judge = true; break;
      case "intent": o.intent = v; break;
      case "repetitions": o.repetitions = Math.max(1, Math.min(5, parseInt(v, 10) || 2)); break;
      case "max-judge-calls": o.maxJudgeCalls = Math.max(0, parseInt(v, 10) || 0); break;
      case "judge-model": o.judgeModel = v; break;
      case "strict": o.strict = true; break;
      case "update-baseline": o.updateBaseline = true; break;
      default: throw new Error(`Option inconnue : --${k}`);
    }
  }
  for (const t of o.themes) if (!THEMES.includes(t)) throw new Error(`Thème inconnu : ${t} (${THEMES.join(", ")})`);
  return o;
}

function slug(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }

const RULE_LABEL = { "font-size": "taille de texte", contrast: "contraste", "target-size": "taille des commandes", overflow: "débordement" };

function countBy(results, sev) { return results.reduce((n, r) => n + r.violations.filter((v) => v.severity === sev).length, 0); }

function buildReport(results, opts, extra = {}) {
  const L = [];
  L.push("# Rapport visuel Cantoria", "");
  L.push(`Moteur : ${opts.engine} · thèmes : ${opts.themes.join(", ")} · captures : ${results.length}`);
  L.push(`Erreurs : ${countBy(results, "error")} · avertissements : ${countBy(results, "warning")}`);
  if (!extra.hasBaseline) L.push("", "**Aucune référence** : pas de comparaison ni de juge A/B. Relis les captures, puis lance avec `--update-baseline` pour les adopter comme référence.");
  L.push("", "> Seuils **proposés** (`scripts/visual/thresholds.json`), à valider par le superviseur. Le juge visuel est consultatif : un verdict n'est retenu que s'il résiste à l'inversion d'ordre.", "");
  for (const r of results) {
    L.push(`## ${r.theme} / ${r.scenario}`, "", r.description, "");
    if (r.pixel) {
      L.push(r.pixel.sameSize
        ? `Pixels modifiés par rapport à la référence : ${(r.pixel.changedRatio * 100).toFixed(2)} %${r.pixel.changedRatio > extra.maxChangedRatio ? " (au-dessus du seuil)" : ""}`
        : "Dimensions différentes de la référence.", "");
    } else if (extra.hasBaseline) L.push("Pas de référence pour cette capture.", "");
    if (r.violations.length) {
      L.push("| Gravité | Règle | Élément | Occurrences | Détail |", "|---|---|---|---|---|");
      for (const v of r.violations) L.push(`| ${v.severity === "error" ? "erreur" : "avertissement"} | ${RULE_LABEL[v.rule] || v.rule} | \`${v.selector}\` | ${v.count} | ${v.message} |`);
      L.push("");
    } else L.push("Aucun écart aux seuils.", "");
    if (r.judge) {
      const j = r.judge;
      const txt = { A: "la référence est meilleure (régression possible)", B: "la version courante est meilleure", tie: "équivalentes", inconclusive: "non concluant" }[j.verdict];
      L.push(`**Juge A/B** : ${txt}${j.positionBias ? " (biais de position détecté)" : ""}${j.lean ? ` (tendance : ${j.lean})` : ""} — ${j.validRuns}/${j.totalRuns} réponses valides.`, "");
      for (const o of j.observations.slice(0, 5)) L.push(`- ${o.image === "B" ? "version courante" : "référence"} (${o.severity}${o.mentions > 1 ? `, ${o.mentions}×` : ""}) : ${o.issue}`);
      if (j.observations.length) L.push("");
      if (j.errors.length) L.push(`Erreurs du juge : ${j.errors.slice(0, 3).join(" ; ")}`, "");
    }
  }
  if (extra.judgeUsage) L.push("## Coût du juge", "", `${extra.judgeCalls} appel(s), ${extra.judgeUsage.prompt_tokens} jetons en entrée, ${extra.judgeUsage.completion_tokens} en sortie (à valoriser avec les prix de ta console Mistral).`, "");
  return L.join("\n");
}

// Brouillons d'issues : jamais publiés, jamais approuvés. Le superviseur les relit, les édite, pose le label.
function draftIssues(results) {
  const drafts = [];
  const groups = new Map();
  for (const r of results) for (const v of r.violations) {
    if (v.severity !== "error") continue;
    const key = `${r.scenario}|${v.rule}|${v.selector}`;
    if (!groups.has(key)) groups.set(key, { scenario: r.scenario, rule: v.rule, selector: v.selector, items: [] });
    groups.get(key).items.push({ theme: r.theme, v });
  }
  for (const g of groups.values()) {
    const worst = g.items.reduce((a, b) => (a.v.value <= b.v.value ? a : b));
    drafts.push({
      title: `Interface (${g.scenario}) : ${RULE_LABEL[g.rule] || g.rule} sous le seuil sur \`${g.selector}\``,
      body: [
        `Contrôle automatique (scénario « ${g.scenario} ») : ${worst.v.message}.`,
        "", `Thèmes concernés : ${[...new Set(g.items.map((i) => i.theme))].join(", ")}.`,
        "", "Cible : atteindre le seuil de `scripts/visual/thresholds.json` sans casser la mise en page (pas de débordement, pas de coupure de ligne dans le lecteur).",
        "", "Critères d'acceptation :",
        "- Le contrôle visuel (`scripts/visual/run.js`) ne signale plus cet élément.",
        "- `npm run check` et `npm test` passent, un test couvre le comportement modifié.",
        "", "_Brouillon généré automatiquement. Non approuvé : relis-le, corrige-le, puis pose toi-même le label `agent-ok`._",
      ].join("\n"),
    });
  }
  for (const r of results) {
    if (!r.judge || r.judge.verdict !== "A") continue;
    const majors = r.judge.observations.filter((o) => o.image === "B" && o.severity === "major");
    drafts.push({
      title: `Régression visuelle perçue : ${r.theme} / ${r.scenario}`,
      body: [
        "Le juge visuel préfère la référence à la version courante, dans les deux ordres de présentation.",
        "", ...(majors.length ? ["Observations sur la version courante :", ...majors.map((o) => `- ${o.issue}`)] : ["Aucune observation majeure détaillée."]),
        "", "_Avis consultatif d'un modèle de vision : vérifie la capture avant d'agir. Brouillon non approuvé._",
      ].join("\n"),
    });
  }
  return drafts;
}

async function main(argv, deps = {}) {
  const repoRoot = deps.repoRoot || path.resolve(__dirname, "..", "..");
  const opts = parseArgs(argv, deps.env || process.env);
  const thresholds = deps.thresholds || JSON.parse(fs.readFileSync(path.join(__dirname, "thresholds.json"), "utf8"));
  const log = deps.log || ((m) => process.stderr.write(m + "\n"));
  const scenarios = opts.scenarios ? ALL_SCENARIOS.filter((s) => opts.scenarios.includes(s.name)) : ALL_SCENARIOS;
  if (!scenarios.length) throw new Error("Aucun scénario ne correspond.");
  const outDir = path.resolve(repoRoot, opts.out);
  const baseDir = path.resolve(repoRoot, opts.baseline);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const capture = deps.captureAll || require("./capture").captureAll;
  const results = await capture({ engine: opts.engine, repoRoot, outDir: path.join(outDir, "current"), themes: opts.themes, scenarios, thresholds, log });

  // Comparaison à la référence.
  let hasBaseline = false;
  for (const r of results) {
    const ref = path.join(baseDir, r.theme, `${r.scenario}.png`);
    if (!fs.existsSync(ref)) continue;
    hasBaseline = true;
    r.baselinePng = ref;
    const d = diffImages(decodePng(fs.readFileSync(ref)), decodePng(fs.readFileSync(r.png)), thresholds.pixel.perChannelTolerance);
    r.pixel = { sameSize: d.sameSize, changedRatio: d.changedRatio, changedPixels: d.changedPixels };
    if (d.diff && d.changedPixels) {
      const dp = path.join(outDir, "diff", r.theme);
      fs.mkdirSync(dp, { recursive: true });
      fs.writeFileSync(path.join(dp, `${r.scenario}.png`), encodePng(d.diff));
    }
  }

  // Juge A/B : seulement sur les captures qui ont changé, dans la limite du plafond d'appels.
  let judgeUsage = null, judgeCalls = 0;
  if (opts.judge) {
    const { judgePair } = deps.judge || require("./judge");
    const apiKey = (deps.env || process.env).MISTRAL_API_KEY || "via-passerelle";
    const budget = { remaining: opts.maxJudgeCalls };
    const start = budget.remaining;
    judgeUsage = { prompt_tokens: 0, completion_tokens: 0 };
    for (const r of results) {
      if (!r.baselinePng) continue;
      if (budget.remaining <= 0) { log(`juge : plafond d'appels atteint, ${r.theme}/${r.scenario} non jugé`); continue; }
      if (r.pixel && r.pixel.sameSize && r.pixel.changedRatio <= thresholds.pixel.maxChangedRatio) continue;
      r.judge = await judgePair({
        imageA: fs.readFileSync(r.baselinePng), imageB: fs.readFileSync(r.png), intent: opts.intent,
        repetitions: opts.repetitions, baseUrl: opts.gatewayUrl, apiKey, model: opts.judgeModel, fetchImpl: deps.fetchImpl, budget,
      });
      judgeUsage.prompt_tokens += r.judge.usage.prompt_tokens; judgeUsage.completion_tokens += r.judge.usage.completion_tokens;
      log(`juge ${r.theme}/${r.scenario} : ${r.judge.verdict}`);
    }
    judgeCalls = start - budget.remaining;
  }

  if (opts.updateBaseline) {
    for (const r of results) {
      const dest = path.join(baseDir, r.theme, `${r.scenario}.png`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(r.png, dest);
    }
    log(`Référence mise à jour : ${baseDir}`);
  }

  const drafts = draftIssues(results);
  fs.mkdirSync(path.join(outDir, "issues-drafts"), { recursive: true });
  drafts.forEach((d, i) => fs.writeFileSync(path.join(outDir, "issues-drafts", `${String(i + 1).padStart(2, "0")}-${slug(d.title)}.md`), `# ${d.title}\n\n${d.body}\n`));
  const report = buildReport(results, opts, { hasBaseline, maxChangedRatio: thresholds.pixel.maxChangedRatio, judgeUsage, judgeCalls });
  fs.writeFileSync(path.join(outDir, "report.md"), report);
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ options: opts, results: results.map(({ png, baselinePng, ...r }) => ({ ...r, png: path.relative(outDir, png) })), judgeUsage, judgeCalls }, null, 2));
  const errors = countBy(results, "error");
  log(`Rapport : ${path.join(outDir, "report.md")} (${errors} erreur(s), ${countBy(results, "warning")} avertissement(s), ${drafts.length} brouillon(s))`);
  return { code: opts.strict && errors ? 1 : 0, results, drafts, report };
}

if (require.main === module) {
  main(process.argv.slice(2)).then((r) => process.exit(r.code)).catch((e) => { process.stderr.write(`Erreur : ${e.message}\n`); process.exit(2); });
}

module.exports = { parseArgs, buildReport, draftIssues, main, slug };
