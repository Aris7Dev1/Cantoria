const test = require("node:test");
const assert = require("node:assert/strict");
const j = require("../scripts/visual/judge");

const verdictJson = (winner, extra = {}) => JSON.stringify({
  winner, confidence: 0.8,
  criteria: { readability_at_distance: winner, contrast: winner, clarity_of_controls: "tie", visual_noise: "tie" },
  observations: [{ image: "1", severity: "major", issue: "Accords trop petits" }], ...extra,
});

test("parseVerdict accepte du JSON strict, avec ou sans bloc de code", () => {
  assert.equal(j.parseVerdict(verdictJson("2")).winner, "2");
  assert.equal(j.parseVerdict("```json\n" + verdictJson("tie") + "\n```").winner, "tie");
  assert.equal(j.parseVerdict("Voici : " + verdictJson("1") + " fin").winner, "1");
});

test("parseVerdict rejette tout ce qui sort du format", () => {
  assert.equal(j.parseVerdict("pas de json"), null);
  assert.equal(j.parseVerdict(JSON.stringify({ winner: "A" })), null);
  assert.equal(j.parseVerdict(JSON.stringify({ winner: "3" })), null);
  assert.equal(j.parseVerdict(null), null);
  const v = j.parseVerdict(JSON.stringify({ winner: "1", confidence: 7, criteria: { contrast: "x" }, observations: [{ image: "9", severity: "major", issue: "x" }, { image: "2", severity: "minor", issue: "  " }] }));
  assert.equal(v.confidence, null);
  assert.equal(v.criteria.contrast, null);
  assert.deepEqual(v.observations, []);
});

test("realImage convertit la position affichée en image réelle", () => {
  assert.equal(j.realImage("1", "AB"), "A");
  assert.equal(j.realImage("2", "AB"), "B");
  assert.equal(j.realImage("1", "BA"), "B");
  assert.equal(j.realImage("2", "BA"), "A");
  assert.equal(j.realImage("tie", "BA"), "tie");
});

test("buildMessages : ordre des images respecté, aucune étiquette révélant la référence", () => {
  const A = Buffer.from("AAAA"), B = Buffer.from("BBBB");
  const ab = j.buildMessages({ imageA: A, imageB: B, order: "AB", intent: "agrandir les accords" });
  const ba = j.buildMessages({ imageA: A, imageB: B, order: "BA" });
  const urls = (m) => m[1].content.filter((c) => c.type === "image_url").map((c) => Buffer.from(c.image_url.split(",")[1], "base64").toString());
  assert.deepEqual(urls(ab), ["AAAA", "BBBB"]);
  assert.deepEqual(urls(ba), ["BBBB", "AAAA"]);
  const textAb = ab[1].content[0].text;
  assert.match(textAb, /agrandir les accords/);
  assert.doesNotMatch(textAb, /référence|baseline|avant|après|ancienne|nouvelle/i);
  assert.match(ab[0].content, /guitariste/);
});

const run = (order, winner) => ({ order, verdict: j.parseVerdict(verdictJson(winner)) });

test("aggregate : B gagne si les deux ordres le désignent", () => {
  // Ordre AB : B est en position 2 ; ordre BA : B est en position 1.
  const r = j.aggregate([run("AB", "2"), run("AB", "2"), run("BA", "1"), run("BA", "1")]);
  assert.equal(r.verdict, "B");
  assert.equal(r.positionBias, false);
});

test("aggregate : un modèle qui répond toujours « 1 » est détecté comme biaisé", () => {
  const r = j.aggregate([run("AB", "1"), run("AB", "1"), run("BA", "1"), run("BA", "1")]);
  assert.equal(r.verdict, "inconclusive");
  assert.equal(r.positionBias, true);
});

test("aggregate : égalité, tendance et réponses insuffisantes", () => {
  assert.equal(j.aggregate([run("AB", "tie"), run("BA", "tie")]).verdict, "tie");
  const lean = j.aggregate([run("AB", "tie"), run("BA", "1")]);
  assert.equal(lean.verdict, "inconclusive");
  assert.equal(lean.lean, "B");
  assert.equal(j.aggregate([run("AB", "2"), { order: "BA", verdict: null }]).verdict, "inconclusive");
});

test("aggregate : observations ramenées aux images réelles et dédupliquées", () => {
  const r = j.aggregate([run("AB", "2"), run("BA", "1")]);
  // « image 1 » en ordre AB = A ; « image 1 » en ordre BA = B
  const imgs = r.observations.map((o) => o.image).sort();
  assert.deepEqual(imgs, ["A", "B"]);
  const same = j.aggregate([run("AB", "2"), run("AB", "2")]);
  assert.equal(same.observations.length, 1);
  assert.equal(same.observations[0].mentions, 2);
});

test("majority exige une majorité stricte", () => {
  assert.equal(j.majority(["A", "A", "B"]), "A");
  assert.equal(j.majority(["A", "B"]), "tie");
  assert.equal(j.majority([null, null]), null);
});

test("callChat : route, en-têtes, corps et extraction", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }) };
  };
  const out = await j.callChat({ baseUrl: "http://gw:8080/", apiKey: "via-passerelle", model: "m", messages: [{ role: "user", content: "x" }], fetchImpl });
  assert.equal(seen.url, "http://gw:8080/v1/chat/completions");
  assert.equal(seen.init.headers.authorization, "Bearer via-passerelle");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, "m"); assert.equal(body.temperature, 0);
  assert.equal(body.top_p, 1, "l'échantillonnage glouton exige top_p = 1 explicite");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(out.text, "ok"); assert.equal(out.usage.prompt_tokens, 10);
  await assert.rejects(j.callChat({ baseUrl: "http://gw", apiKey: "k", model: "m", messages: [], fetchImpl: async () => ({ ok: false, status: 429, text: async () => "slow down" }) }), /HTTP 429/);
});

test("judgePair : 2 ordres × répétitions, plafond d'appels, erreurs tolérées", async () => {
  let calls = 0;
  const call = async ({ messages }) => {
    calls++;
    const firstImg = Buffer.from(messages[1].content[1].image_url.split(",")[1], "base64").toString();
    // Un juge raisonnable : préfère toujours l'image « BBBB ».
    const winner = firstImg === "BBBB" ? "1" : "2";
    return { text: verdictJson(winner), usage: { prompt_tokens: 100, completion_tokens: 20 } };
  };
  /* Issue #75 : judgePair retourne { perPersona, global, usage } —
     une passe par persona actif (défaut unique si non fournis). */
  const r = await j.judgePair({ imageA: Buffer.from("AAAA"), imageB: Buffer.from("BBBB"), repetitions: 2, call });
  assert.equal(calls, 4);
  assert.equal(r.perPersona.length, 1, "un seul persona par défaut");
  assert.equal(r.perPersona[0].verdict, "B");
  assert.equal(r.global.B, 1);
  assert.equal(r.usage.prompt_tokens, 400);

  const budget = { remaining: 3 };
  const r2 = await j.judgePair({ imageA: Buffer.from("A"), imageB: Buffer.from("B"), repetitions: 2, call, budget });
  assert.equal(budget.remaining, 0);
  assert.ok(r2.perPersona[0].errors.some((e) => /plafond/.test(e)));

  const r3 = await j.judgePair({ imageA: Buffer.from("A"), imageB: Buffer.from("B"), repetitions: 1, call: async () => { throw new Error("boom"); } });
  assert.equal(r3.perPersona[0].verdict, "inconclusive");
  assert.equal(r3.perPersona[0].errors.length, 2);

  /* Un appel en échec ne consomme pas le plafond : seuls les appels aboutis
     décrémentent budget.remaining, une salve d'erreurs n'affame pas la suite. */
  const budgetFail = { remaining: 2 };
  const rFail = await j.judgePair({ imageA: Buffer.from("A"), imageB: Buffer.from("B"), repetitions: 2, call: async () => { throw new Error("HTTP 400"); }, budget: budgetFail });
  assert.equal(budgetFail.remaining, 2, "aucun appel abouti : plafond intact");
  assert.equal(rFail.perPersona[0].errors.length, 4, "2 ordres × 2 répétitions en échec, aucun rejet de plafond");
  assert.ok(!rFail.perPersona[0].errors.some((e) => /plafond/.test(e)));

  /* Personas multiples : chaque persona actif = une passe ; inactif = zéro appel. */
  let callsMulti = 0;
  const callMulti = async () => { callsMulti++; return { text: verdictJson("2"), usage: { prompt_tokens: 1, completion_tokens: 1 } }; };
  const personas = [
    { id: "actif-1", actif: true, description: "d1", lens: ["l1"] },
    { id: "inactif", actif: false, description: "d2", lens: ["l2"] },
    { id: "actif-2", actif: true, description: "d3", lens: ["l3"] },
  ];
  const r4 = await j.judgePair({ imageA: Buffer.from("A"), imageB: Buffer.from("B"), repetitions: 1, call: callMulti, personas });
  assert.equal(callsMulti, 4, "2 personas actifs × 2 ordres = 4 appels (l'inactif ne coûte rien)");
  assert.equal(r4.perPersona.length, 2);
  assert.deepEqual(r4.perPersona.map((p) => p.persona), ["actif-1", "actif-2"]);
  assert.equal(r4.global.tie, 2, "les deux personas préfèrent l'image 2 (position 1 = A : verdict B ici via winner=2 inversé)");
});
