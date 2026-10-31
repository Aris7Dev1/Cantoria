/*
 * Explorateur IA (issue #76) : un agent aux commandes du navigateur qui
 * découvre Cantoria comme un premier utilisateur — sans script, il improvise,
 * tente des parcours, note les frictions. Rapport d'expérience en Markdown
 * sur stdout ; le workflow le poste en commentaire de PR.
 *
 * Limites assumées (documentées dans l'issue #76) :
 * - il agit sur l'application lancée uniquement, ne change AUCUN code ;
 * - simulé ≠ ressenti : la taille des cibles relève du juge A/B (44 px),
 *   la fluidité du test humain ;
 * - le rapport informe, ne bloque jamais.
 *
 * Plafonds : EXPLORER_MAX_ACTIONS (défaut 40), EXPLORER_MAX_CALLS (défaut 30).
 * Mêmes règles de sécurité que judge-ci.js : orchestrateur CI — l'URL Mistral
 * vient du workflow, le dev local passe par la passerelle.
 */
const fs = require("node:fs");
const path = require("node:path");
const { loadPlaywright } = require("./capture");   /* exportée depuis capture.js (fix run du 01/11) */

const ROOT = path.join(__dirname, "..", "..");
const BASE_URL = process.env.MISTRAL_BASE_URL || "";
const API_KEY = process.env.MISTRAL_API_KEY || "";
const MODEL = process.env.MISTRAL_EXPLORER_MODEL || "mistral-small-latest";
const MAX_ACTIONS = parseInt(process.env.EXPLORER_MAX_ACTIONS || "40", 10);
const MAX_CALLS = parseInt(process.env.EXPLORER_MAX_CALLS || "30", 10);
const DEFAULT_GOALS_PATH = path.join(__dirname, "explorer-goals.json");
const VIEWPORT = { width: parseInt(process.env.EXPLORER_WIDTH || "412", 10), height: parseInt(process.env.EXPLORER_HEIGHT || "915", 10) };

function loadGoals() {
  /* Env lue au moment de l'appel (testable), pas au chargement du module. */
  const goalsPath = process.env.EXPLORER_GOALS || DEFAULT_GOALS_PATH;
  try {
    const raw = JSON.parse(fs.readFileSync(goalsPath, "utf8"));
    const goals = (raw.goals || []).filter((g) => typeof g === "string" && g.length > 10);
    if (goals.length) return goals;
  } catch (e) { /* défaut ci-dessous */ }
  return ["Tu es un guitariste qui découvre l'application pour la première fois : crée une chanson avec des accords, lance le défilement, transpose, navigue entre les vues. Note tout ce qui te semble confus, cassé, ou qui ne réagit pas comme prévu."];
}

/* Le menu d'actions disponibles pour l'explorateur : des primitives sûres,
   fermées (pas d'accès arbitraire au système), exprimées en JSON. */
const ACTIONS = [
  { id: "click", args: "sélecteur CSS ou texte visible du bouton/élément", desc: "Cliquer un élément" },
  { id: "fill", args: "sélecteur CSS du champ + texte à saisir", desc: "Remplir un champ de saisie" },
  { id: "press", args: "touche (ex. Enter, Escape, ArrowDown)", desc: "Appuyer une touche clavier" },
  { id: "scroll", args: "delta_y (nombre, positif = vers le bas)", desc: "Faire défiler la page" },
  { id: "back", args: "aucun", desc: "Navigation retour" },
  { id: "note", args: "observation/friction à consigner (texte libre)", desc: "Noter quelque chose sans agir" },
  { id: "done", args: "résumé final en une phrase", desc: "Terminer l'exploration" },
];

function buildTurnMessages({ goal, history, screenshot, step }) {
  const b64 = (buf) => "data:image/png;base64," + Buffer.from(buf).toString("base64");
  const text = [
    `But de l'utilisateur à accomplir : ${goal}`,
    "",
    `Étape ${step}. Voici la capture d'écran de l'état actuel de l'application.`,
    history.length ? "Historique de tes actions récentes (les plus récentes en dernier) :" : "C'est le début de l'exploration.",
    ...history.slice(-12).map((h) => `- ${h}`),
    "",
    "Réponds UNIQUEMENT par un objet JSON de cette forme :",
    '{"action":"click|fill|press|scroll|back|note|done","args":"...","observation":"phrase courte sur ce que tu vois ou viens de constater"}',
    "",
    "Règles :",
    "- avance toujours vers le but ; si un élément ne réagit pas comme prévu, note-le (action note) puis tente autre chose ;",
    "- « observation » doit être concrète (ce que tu vois, pas des généralités) ;",
    "- quand le but est accompli ou que tu es bloqué, action « done » avec un résumé.",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: "Tu es un testeur d'application méticuleux qui découvre une app de paroles/accords pour guitare comme un premier utilisateur. Tu ne juges pas le style : tu testes l'usage. Réponds uniquement en JSON." },
    { role: "user", content: [
      { type: "text", text },
      { type: "image_url", image_url: b64(screenshot) },
    ] },
  ];
}

function parseAction(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(candidate.slice(start, end + 1));
    if (!o.action || !ACTIONS.some((a) => a.id === o.action)) return null;
    return { action: o.action, args: String(o.args || ""), observation: String(o.observation || "") };
  } catch (e) { return null; }
}

async function callChat({ messages, fetchImpl = fetch }) {
  /* Défaut : fetch natif de Node 22 (testable par injection, utilisable en CI
     sans paramètre — bug du run du 01/11 : fetchImpl indéfini -> ReferenceError
     au premier appel, exploration morte à l'étape 0). */
  const res = await fetchImpl(`${BASE_URL.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, response_format: { type: "json_object" } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 150)}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || "" };
}

/* Exécute une action sur la page — primitives fermées, jamais de code arbitraire. */
async function applyAction(page, act, notes) {
  switch (act.action) {
    case "click": {
      const a = act.args.trim();
      try {
        if (/^[a-zA-Z.#][\w#.\- >.:]*$/.test(a) && a.length < 80) {
          await page.click(a, { timeout: 4000 });
        } else {
          await page.getByText(a, { exact: false }).first().click({ timeout: 4000 });
        }
        return `click « ${a} »`;
      } catch (e) { return `click « ${a} » a ÉCHOUÉ (${e.message.split("\n")[0]})`; }
    }
    case "fill": {
      const m = act.args.split("||");
      const sel = (m[0] || "").trim(), val = (m[1] || "").trim();
      try { await page.fill(sel, val, { timeout: 4000 }); return `saisie dans « ${sel} »`; }
      catch (e) { return `saisie « ${sel} » a ÉCHOUÉ (${e.message.split("\n")[0]})`; }
    }
    case "press": {
      try { await page.keyboard.press(act.args.trim().slice(0, 20)); return `touche ${act.args.trim()}`; }
      catch (e) { return `touche ${act.args} a ÉCHOUÉ`; }
    }
    case "scroll": {
      const dy = parseInt(act.args, 10) || 300;
      await page.mouse.wheel(0, dy);
      return `défilement ${dy}px`;
    }
    case "back": {
      await page.goBack().catch(() => {});
      return "retour navigation";
    }
    case "note": {
      notes.push(act.observation || act.args);
      return `noté : ${act.observation || act.args}`;
    }
    case "done": return null;
    default: return null;
  }
}

async function main() {
  if (!API_KEY || !BASE_URL) {
    console.error("MISTRAL_API_KEY ou MISTRAL_BASE_URL absente — orchestrateur CI (voir visual-explorer.yml).");
    process.exit(0);
  }
  const goals = loadGoals();
  const goal = process.env.EXPLORER_GOAL || goals[Math.floor(Math.random() * goals.length)];
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ args: ["--no-sandbox", "--disable-gpu"] });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  /* Seed avant le premier chargement : l'explorateur découvre un carnet VIVANT
     (leçon du premier rapport : but « concert » impossible sur un carnet vide,
     l'explorateur bouclait sur « Ton carnet est vide »). On réutilise les
     fixtures de la boucle visuelle — même source que les captures. */
  const { seedEntries } = require("./fixtures");
  const seed = seedEntries(process.env.EXPLORER_THEME || "spotlight");
  await page.addInitScript((entries) => {
    for (const k of Object.keys(entries)) localStorage.setItem(k, entries[k]);
  }, seed);
  await page.goto("file://" + path.join(ROOT, "cantoria.html"));

  const lines = ["## Rapport d'exploration IA (issue #76)", ""];
  lines.push(`But : « ${goal} »`);
  lines.push(`Viewport : ${VIEWPORT.width}×${VIEWPORT.height} (portrait) · plafonds : ${MAX_ACTIONS} actions, ${MAX_CALLS} appels.`);
  lines.push("");
  const history = [];
  const notes = [];
  const frictions = [];
  let prevObs1 = "", prevObs2 = "";
  let calls = 0;
  let steps = 0;

  try {
    while (steps < MAX_ACTIONS && calls < MAX_CALLS) {
      const screenshot = await page.screenshot({ type: "png" });
      calls++;
      let act = null;
      try {
        const out = await callChat({ messages: buildTurnMessages({ goal, history, screenshot, step: steps + 1 }) });
        act = parseAction(out.text);
      } catch (e) { history.push(`erreur modèle : ${e.message}`); break; }
      if (!act) { history.push("réponse modèle invalide"); steps++; continue; }
      steps++;
      const desc = await applyAction(page, act, notes);
      if (act.action === "done") { history.push(`terminé : ${act.args}`); break; }
      const entry = `${desc}${act.observation ? ` — ${act.observation}` : ""}`;
      history.push(entry);
      if (/ÉCHOUÉ/.test(desc)) frictions.push(entry);
      /* Anti-boucle (leçon du premier rapport : 12 notes identiques d'affilée
         sur un écran bloqué). Trois observations consécutives quasi identiques
         = l'explorateur tourne en rond : on termine avec un constat honnête. */
      const lastObs = (act.observation || "").slice(0, 60);
      if (lastObs && lastObs === prevObs1 && lastObs === prevObs2) {
        history.push(`anti-boucle : trois observations identiques, exploration arrêtée (l'état ne change pas malgré les actions)`);
        lines.push(`_Exploration arrêtée par l'anti-boucle après ${steps} étapes : l'interface semblait ne plus réagir._`);
        break;
      }
      prevObs2 = prevObs1; prevObs1 = lastObs;
      await page.waitForTimeout(250);
    }
  } finally {
    await browser.close();
  }

  lines.push(`### Parcours (${steps} étapes, ${calls} appels)`);
  for (const h of history.slice(0, 40)) lines.push(`- ${h}`);
  lines.push("");
  if (notes.length) {
    lines.push("### Observations de l'explorateur");
    for (const n of notes.slice(0, 15)) lines.push(`- ${n}`);
    lines.push("");
  }
  if (frictions.length) {
    lines.push("### Frictions constatées (actions sans effet attendu)");
    for (const f of frictions.slice(0, 15)) lines.push(`- ${f}`);
  } else {
    lines.push("Aucune friction bloquante constatée sur ce parcours.");
  }
  lines.push("");
  lines.push("*Rapport consultatif, généré par l'explorateur IA — il ne remplace ni les tests ni le test humain ; le merge reste décision du superviseur.*");
  process.stdout.write(lines.join("\n"));
}

module.exports = { loadGoals, buildTurnMessages, parseAction, applyAction, ACTIONS };

if (require.main === module) main().catch((e) => { console.error("Explorateur en échec :", e.message); process.exit(0); });
