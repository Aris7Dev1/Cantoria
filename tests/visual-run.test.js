const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const run = require("../scripts/visual/run");
const { encodePng } = require("../scripts/visual/png");

function solid(w, h, rgb) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255; }
  return encodePng({ width: w, height: h, data });
}

function fakeCapture(colorFor, violationsFor = () => []) {
  return async ({ outDir, themes, scenarios }) => {
    const out = [];
    for (const theme of themes) for (const sc of scenarios) {
      const png = path.join(outDir, theme, `${sc.name}.png`);
      fs.mkdirSync(path.dirname(png), { recursive: true });
      fs.writeFileSync(png, solid(20, 20, colorFor(theme, sc.name)));
      out.push({ theme, scenario: sc.name, description: sc.description, scope: sc.scope, png, violations: violationsFor(theme, sc.name) });
    }
    return out;
  };
}

const th = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "visual", "thresholds.json"), "utf8"));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "visual-run-"));
const quiet = { log: () => {} };

test("parseArgs : valeurs par défaut sûres et options validées", () => {
  const o = run.parseArgs([], {});
  assert.equal(o.engine, "electron");
  assert.equal(o.judge, false, "le juge (payant) est désactivé par défaut");
  assert.equal(o.gatewayUrl, "http://mistral-gateway:8080");
  assert.equal(o.judgeModel, "mistral-large-4");
  assert.deepEqual(run.parseArgs(["--themes=campfire", "--judge", "--repetitions=9"], {}).themes, ["campfire"]);
  assert.equal(run.parseArgs(["--repetitions=9"], {}).repetitions, 5);
  assert.throws(() => run.parseArgs(["--engine=firefox"], {}), /engine/);
  assert.throws(() => run.parseArgs(["--themes=neon"], {}), /Thème inconnu/);
  assert.throws(() => run.parseArgs(["--bidon"], {}), /Option inconnue/);
  assert.throws(() => run.parseArgs(["oups"], {}), /inattendu/);
});

test("première exécution : rapport, pas de référence, aucun juge", async () => {
  const root = tmp();
  let judged = 0;
  const r = await run.main(["--themes=campfire", "--judge"], { repoRoot: root, thresholds: th, captureAll: fakeCapture(() => [10, 10, 10]), judge: { judgePair: async () => { judged++; } }, ...quiet });
  assert.equal(judged, 0);
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(path.join(root, "visual-out", "report.md")));
  assert.match(fs.readFileSync(path.join(root, "visual-out", "report.md"), "utf8"), /Aucune référence/);
});

test("--update-baseline crée la référence ; une exécution identique ne déclenche pas le juge", async () => {
  const root = tmp();
  const deps = { repoRoot: root, thresholds: th, captureAll: fakeCapture(() => [10, 10, 10]), ...quiet };
  await run.main(["--themes=campfire", "--update-baseline"], deps);
  assert.ok(fs.existsSync(path.join(root, "visual-baseline", "campfire", "player.png")));
  let judged = 0;
  await run.main(["--themes=campfire", "--judge"], { ...deps, judge: { judgePair: async () => { judged++; return {}; } } });
  assert.equal(judged, 0, "captures identiques : pas d'appel payant");
});

test("une capture modifiée déclenche le juge, dans la limite du plafond ; une régression produit un brouillon", async () => {
  const root = tmp();
  await run.main(["--themes=campfire", "--update-baseline"], { repoRoot: root, thresholds: th, captureAll: fakeCapture(() => [10, 10, 10]), ...quiet });
  const calls = [];
  const judge = {
    judgePair: async (a) => {
      calls.push(a);
      a.budget.remaining -= 4;
      return { verdict: "A", positionBias: false, lean: null, validRuns: 4, totalRuns: 4, errors: [], usage: { prompt_tokens: 1000, completion_tokens: 50 }, observations: [{ image: "B", severity: "major", issue: "Accords illisibles", mentions: 2 }] };
    },
  };
  const r = await run.main(["--themes=campfire", "--judge", "--intent=agrandir", "--max-judge-calls=8", "--scenarios=library,player,editor"], {
    repoRoot: root, thresholds: th, captureAll: fakeCapture(() => [200, 200, 200]), judge, env: { MISTRAL_API_KEY: "" }, ...quiet,
  });
  assert.equal(calls.length, 2, "plafond de 8 appels, 4 par paire : 2 paires jugées");
  assert.equal(calls[0].intent, "agrandir");
  assert.equal(calls[0].apiKey, "via-passerelle");
  assert.equal(calls[0].baseUrl, "http://mistral-gateway:8080");
  assert.ok(fs.existsSync(path.join(root, "visual-out", "diff", "campfire", "library.png")));
  assert.ok(r.drafts.some((d) => /Régression visuelle perçue/.test(d.title) && /Accords illisibles/.test(d.body)));
  assert.match(r.report, /la référence est meilleure/);
  assert.match(r.report, /8 appel/);
});

test("les erreurs déterministes produisent des brouillons non approuvés ; --strict fait échouer", async () => {
  const root = tmp();
  const viol = (theme, sc) => (sc === "player" ? [{ rule: "font-size", severity: "error", selector: "span.seg-chord", count: 3, value: 14, threshold: 18, message: "accords : 14 px (minimum 18 px)" }] : []);
  const base = { repoRoot: root, thresholds: th, captureAll: fakeCapture(() => [1, 2, 3], viol), ...quiet };
  const soft = await run.main(["--themes=campfire,spotlight"], base);
  assert.equal(soft.code, 0);
  assert.equal(soft.drafts.length, 1, "un brouillon par règle et élément, tous thèmes confondus");
  assert.match(soft.drafts[0].body, /campfire, spotlight/);
  assert.match(soft.drafts[0].body, /Non approuvé/);
  assert.doesNotMatch(soft.drafts[0].body, /^agent-ok$/m);
  const strict = await run.main(["--themes=campfire", "--strict"], base);
  assert.equal(strict.code, 1);
  const files = fs.readdirSync(path.join(root, "visual-out", "issues-drafts"));
  assert.equal(files.length, 1);
});

test("slug : titres de brouillons sûrs pour un nom de fichier", () => {
  assert.equal(run.slug("Lecteur/player : écart ../../x"), "lecteur-player-ecart-x");
});
