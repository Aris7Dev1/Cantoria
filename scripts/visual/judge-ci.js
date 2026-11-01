/*
 * Orchestrateur CI du juge A/B par personas (issue #75).
 * Compare les captures de la PR (visual-out/pr/current) aux baselines du
 * dépôt (visual-baseline) et rend un verdict Markdown sur stdout —
 * le workflow le poste en commentaire de PR.
 *
 * Consultatif : aucune sortie non nulle sur verdict défavorable.
 * Plafond d'appels : JUDGE_MAX_CALLS (défaut 10) partagé entre personas.
 */
const fs = require("node:fs");
const path = require("node:path");
const { judgePair, loadPersonas } = require("./judge");

const ROOT = path.join(__dirname, "..", "..");
const OUT = process.env.JUDGE_OUT_DIR || path.join(ROOT, "visual-out", "pr", "current");
const BASE = process.env.JUDGE_BASE_DIR || path.join(ROOT, "visual-baseline");
const PERSONAS_PATH = path.join(__dirname, "personas.json");
const MAX_CALLS = parseInt(process.env.JUDGE_MAX_CALLS || "10", 10);

/* ⚠️ Ce script est l'orchestrateur CI (workflow visual-judge.yml) : la clé
   vient de secrets.MISTRAL_API_KEY sur un runner GitHub. Dans le conteneur de
   dev, le juge passe par la passerelle locale (mistral-gateway) — jamais
   d'URL Mistral en dur ici : MISTRAL_BASE_URL est fournie par le workflow.
   Le test devcontainer-security vérifie cette séparation. */
const BASE_URL = process.env.MISTRAL_BASE_URL || "";
const API_KEY = process.env.MISTRAL_API_KEY || "";
const MODEL = process.env.MISTRAL_JUDGE_MODEL || "mistral-large-4-0";

function main() {
  if (!API_KEY || !BASE_URL) {
    console.error("MISTRAL_API_KEY ou MISTRAL_BASE_URL absente — orchestrateur CI : voir visual-judge.yml (le dev local passe par la passerelle).");
    process.exit(0); // consultatif : pas d'échec de PR
  }
  const personas = loadPersonas(PERSONAS_PATH);
  const budget = { remaining: MAX_CALLS };
  const lines = ["## Verdict du juge visuel (A/B par personas)", ""];
  lines.push(`Personas actifs : ${personas.filter((p) => p.actif).map((p) => p.id).join(", ") || "aucun"}`);
  lines.push(`Plafond d'appels : ${MAX_CALLS}` + (budget.remaining < MAX_CALLS ? " (partiellement consommé)" : ""));
  lines.push("");

  const themes = fs.existsSync(OUT) ? fs.readdirSync(OUT) : [];
  let judged = 0;
  const allErrors = [];

  (async () => {
    for (const theme of themes) {
      const dir = path.join(OUT, theme);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".png")) continue;
        const scenario = f.replace(/\.png$/, "");
        const baseline = path.join(BASE, theme, f);
        if (!fs.existsSync(baseline)) continue; // pas de référence : pas de jugement
        const imageB = fs.readFileSync(path.join(dir, f)); // courant
        const imageA = fs.readFileSync(baseline);          // référence
        if (imageB.equals(imageA)) {
          lines.push(`- **${theme}/${scenario}** : identique à la référence.`);
          continue;
        }
        if (budget.remaining <= 0) {
          lines.push(`- **${theme}/${scenario}** : plafond d'appels atteint — non jugé.`);
          continue;
        }
        try {
          const r = await judgePair({
            imageA, imageB, repetitions: 1, baseUrl: BASE_URL, apiKey: API_KEY,
            model: MODEL, budget, personas: personas.filter((p) => p.actif),
          });
          judged++;
          for (const p of r.perPersona) {
            const verdictTxt = { A: "la référence est meilleure (régression possible)",
              B: "la version courante est meilleure", tie: "équivalentes",
              inconclusive: "non concluant" }[p.verdict] || p.verdict;
            lines.push(`- **${theme}/${scenario}** · persona **${p.persona}** : ${verdictTxt}.`);
            for (const o of (p.observations || []).slice(0, 3)) {
              lines.push(`  - ${o.image === "B" ? "courant" : "référence"} (${o.severity}) : ${o.issue}`);
            }
            if (p.errors && p.errors.length) allErrors.push(...p.errors);
          }
        } catch (e) {
          allErrors.push(`${theme}/${scenario} : ${e.message}`);
        }
      }
    }
    lines.push("");
    if (judged === 0 && allErrors.length === 0) {
      lines.push("Aucune différence visuelle détectée par rapport aux références.");
    }
    if (allErrors.length) {
      lines.push("**Erreurs du juge** (le verdict reste partiel) :");
      for (const e of allErrors.slice(0, 5)) lines.push(`- ${e}`);
    }
    lines.push("");
    lines.push("*Verdict consultatif — le merge reste décision du superviseur.*");
    process.stdout.write(lines.join("\n"));
  })().catch((e) => {
    console.error("Juge en échec :", e.message);
    process.exit(0); // consultatif
  });
}

main();
