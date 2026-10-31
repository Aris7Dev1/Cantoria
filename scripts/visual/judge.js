/*
 * Juge visuel A/B (consultatif). Deux captures, A = référence, B = version courante, présentées au
 * modèle de vision dans les deux ordres et plusieurs fois. Le verdict n'est retenu que s'il résiste
 * à l'inversion d'ordre (biais de position). Sortie du modèle : JSON validé strictement, sinon rejetée.
 * Ce juge ne bloque jamais rien : il produit des observations pour le superviseur.
 */
const fs = require("node:fs");

/* Personas (issue #75) : la lens du juge est composée depuis
   scripts/visual/personas.json — fichier VALIDÉ PAR LE SUPERVISEUR.
   Un persona actif = un jeu d'appels ; inactif = zéro appel.
   Défaut sûr si le fichier est absent : le persona historique. */
function loadPersonas(personasPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(personasPath, "utf8"));
    const list = (raw.personas || []).filter((p) => p.id && Array.isArray(p.lens) && p.lens.length);
    if (list.length) return list;
  } catch (e) { /* fichier absent ou illisible : défaut ci-dessous */ }
  return [{ id: "scene-standard", actif: true, description: "défaut", lens: [
    "Guitariste qui chante, debout ou assis à environ un mètre de l'écran, les deux mains sur la guitare, souvent sous une lumière faible.",
  ]}];
}

function personaPrompt(persona) {
  return [
    "Tu évalues l'interface d'une application de paroles et d'accords à défilement automatique.",
    "Utilisateur évalué (" + persona.id + ") : " + persona.description,
    ...persona.lens,
  ].join(" ");
}

/* Compat : le PERSONA historique reste exporté (tests existants). */
const PERSONA = [
  "Tu évalues l'interface d'une application de bureau de paroles et d'accords à défilement automatique.",
  "Utilisateur : un guitariste qui chante, debout ou assis à environ un mètre de l'écran, les deux mains sur la guitare, souvent sous une lumière faible.",
  "Ce qui compte, par ordre d'importance : lisibilité des paroles et des accords à distance, contraste, prévisibilité et calme de l'écran, commandes repérables d'un coup d'œil, sobriété.",
  "Tu ne juges ni l'originalité ni la modernité du style : seulement ce qui aide ou gêne cet usage.",
].join(" ");

const CRITERIA = ["readability_at_distance", "contrast", "clarity_of_controls", "visual_noise"];

function buildMessages({ imageA, imageB, order, intent, persona }) {
  const systemPrompt = persona ? personaPrompt(persona) : PERSONA;
  const [first, second] = order === "BA" ? [imageB, imageA] : [imageA, imageB];
  const b64 = (buf) => "data:image/png;base64," + Buffer.from(buf).toString("base64");
  const text = [
    "Voici deux captures de la même fenêtre : « image 1 » puis « image 2 ».",
    intent ? `Changement visé (donné par le superviseur, à ne pas supposer réussi) : ${String(intent).slice(0, 500)}` : "",
    "Compare-les pour l'usage décrit. Réponds UNIQUEMENT par un objet JSON, sans texte autour, de cette forme :",
    '{"winner":"1"|"2"|"tie","confidence":0..1,',
    ' "criteria":{"readability_at_distance":"1"|"2"|"tie","contrast":"1"|"2"|"tie","clarity_of_controls":"1"|"2"|"tie","visual_noise":"1"|"2"|"tie"},',
    ' "observations":[{"image":"1"|"2","severity":"minor"|"major","issue":"phrase courte et concrète"}]}',
    "« visual_noise » : « 1 » ou « 2 » désigne l'image la plus calme. Si les images sont identiques ou équivalentes pour cet usage, réponds « tie ». Au plus 6 observations.",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: [
      { type: "text", text },
      { type: "image_url", image_url: b64(first) },
      { type: "image_url", image_url: b64(second) },
    ] },
  ];
}

function extractJson(text) {
  if (typeof text !== "string") return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{"), end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch (e) { return null; }
}

const isPick = (v) => v === "1" || v === "2" || v === "tie";

// Validation stricte : tout ce qui n'est pas exactement dans le format est écarté.
function parseVerdict(text) {
  const o = extractJson(text);
  if (!o || typeof o !== "object") return null;
  const winner = typeof o.winner === "number" ? String(o.winner) : o.winner;
  if (!isPick(winner)) return null;
  const confidence = typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
  const criteria = {};
  for (const k of CRITERIA) {
    const v = o.criteria && typeof o.criteria[k] === "number" ? String(o.criteria[k]) : o.criteria && o.criteria[k];
    criteria[k] = isPick(v) ? v : null;
  }
  const observations = (Array.isArray(o.observations) ? o.observations : [])
    .filter((x) => x && (x.image === "1" || x.image === "2" || x.image === 1 || x.image === 2) && (x.severity === "minor" || x.severity === "major") && typeof x.issue === "string" && x.issue.trim())
    .slice(0, 6)
    .map((x) => ({ image: String(x.image), severity: x.severity, issue: x.issue.trim().slice(0, 300) }));
  return { winner, confidence, criteria, observations };
}

// Position affichée -> image réelle (A = référence, B = courante) selon l'ordre de présentation.
function realImage(pick, order) {
  if (pick === "tie" || pick === null) return pick;
  if (order === "AB") return pick === "1" ? "A" : "B";
  return pick === "1" ? "B" : "A";
}

function majority(votes) {
  const valid = votes.filter((v) => v !== null);
  if (!valid.length) return null;
  const counts = {};
  for (const v of valid) counts[v] = (counts[v] || 0) + 1;
  let best = null, bestN = 0, tied = false;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) { best = k; bestN = n; tied = false; } else if (n === bestN) tied = true;
  }
  return tied || bestN * 2 <= valid.length ? "tie" : best; // majorité stricte, sinon égalité
}

/*
 * runs : [{ order: "AB"|"BA", verdict: parseVerdict(...) | null }]
 * Verdict final :
 *   A | B      : les deux ordres donnent le même gagnant réel
 *   tie        : les deux ordres concluent à l'égalité
 *   inconclusive : désaccord entre les ordres (biais de position probable), ou trop peu de réponses valides
 */
function aggregate(runs) {
  const valid = runs.filter((r) => r.verdict);
  const byOrder = {};
  for (const order of ["AB", "BA"]) {
    byOrder[order] = majority(valid.filter((r) => r.order === order).map((r) => realImage(r.verdict.winner, order)));
  }
  const a = byOrder.AB, b = byOrder.BA;
  let verdict = "inconclusive", positionBias = false, lean = null;
  if (a && b) {
    if (a === b) verdict = a;
    else if (a === "tie" || b === "tie") lean = a === "tie" ? b : a;
    else {
      // Chaque ordre désigne une image réelle différente : si c'est la même position, c'est du biais.
      positionBias = true;
    }
  }
  const observations = [];
  for (const r of valid) for (const o of r.verdict.observations) {
    const img = realImage(o.image, r.order);
    const dup = observations.find((x) => x.image === img && x.issue.toLowerCase() === o.issue.toLowerCase());
    if (dup) dup.mentions++;
    else observations.push({ image: img, severity: o.severity, issue: o.issue, mentions: 1 });
  }
  observations.sort((x, y) => y.mentions - x.mentions);
  const confs = valid.map((r) => r.verdict.confidence).filter((c) => c !== null);
  return {
    verdict, positionBias, lean, byOrder,
    validRuns: valid.length, totalRuns: runs.length,
    meanConfidence: confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : null,
    observations,
  };
}

async function callChat({ baseUrl, apiKey, model, messages, fetchImpl = fetch, timeoutMs = 120000, temperature = 0 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, response_format: { type: "json_object" } }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    const text = Array.isArray(content) ? content.map((c) => (c && c.text) || "").join("") : content;
    return { text, usage: json.usage || null };
  } finally {
    clearTimeout(timer);
  }
}

/*
 * Juge une paire. repetitions = nombre de fois par ordre (2 ordres => 2×repetitions appels).
 * Les appels sont séquentiels : on ne dépasse pas le plafond de requêtes de la passerelle.
 */
async function judgePair({ imageA, imageB, intent, repetitions = 2, baseUrl, apiKey, model, fetchImpl, call = callChat, budget, personas, personasPath }) {
  /* Issue #75 : une passe par persona ACTIF (les inactifs ne coûtent rien).
     Sans personas fournis : comportement historique (PERSONA unique). */
  const active = personas
    ? personas.filter((p) => p.actif)
    : loadPersonas(personasPath || "").filter((p) => p.actif);
  const list = active.length ? active : [{ id: "scene-standard", actif: true, description: "défaut", lens: [] }];
  let usage = { prompt_tokens: 0, completion_tokens: 0 };
  const perPersona = [];
  for (const persona of list) {
    const runs = [];
    const errors = [];
    for (const order of ["AB", "BA"]) {
      for (let i = 0; i < repetitions; i++) {
        if (budget && budget.remaining <= 0) { errors.push("plafond d'appels atteint"); continue; }
        if (budget) budget.remaining--;
        try {
          const out = await call({ baseUrl, apiKey, model, messages: buildMessages({ imageA, imageB, order, intent, persona }), fetchImpl });
          if (out.usage) { usage.prompt_tokens += out.usage.prompt_tokens || 0; usage.completion_tokens += out.usage.completion_tokens || 0; }
          const verdict = parseVerdict(out.text);
          if (!verdict) errors.push(`réponse invalide (${order}, essai ${i + 1})`);
          runs.push({ order, verdict });
        } catch (e) {
          errors.push(`${order} essai ${i + 1} : ${e.message}`);
          runs.push({ order, verdict: null });
        }
      }
    }
    perPersona.push({ persona: persona.id, ...aggregate(runs), errors });
  }
  /* Verdict global : majorité des personas (information, jamais bloquant). */
  const global = perPersona.reduce((acc, p) => {
    if (p.verdict === "B") acc.B = (acc.B || 0) + 1;
    else if (p.verdict === "A") acc.A = (acc.A || 0) + 1;
    else acc.tie = (acc.tie || 0) + 1;
    return acc;
  }, {});
  return { perPersona, global, usage };
}

function readPng(p) { return fs.readFileSync(p); }

module.exports = { PERSONA, buildMessages, extractJson, parseVerdict, realImage, majority, aggregate, callChat, judgePair, readPng, loadPersonas, personaPrompt };
