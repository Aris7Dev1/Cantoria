const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/* Issue #98 (volet A) : workflow Pages d\u00e9di\u00e9, permissions minimales
   explicites, artefact limit\u00e9 au deck statique, actions \u00e9pingl\u00e9es par SHA,
   ADR consignant la d\u00e9cision. */

const ROOT = path.join(__dirname, "..");
const WF = path.join(ROOT, ".github", "workflows", "pages.yml");

test("le workflow pages.yml existe et d\u00e9clare des permissions minimales explicites", () => {
  assert.ok(fs.existsSync(WF), "pages.yml pr\u00e9sent");
  const wf = fs.readFileSync(WF, "utf8");
  const perms = wf.match(/permissions:\n((?:\s{2}.+\n)+)/);
  assert.ok(perms, "bloc permissions explicite");
  const lines = perms[1].trim().split("\n").map((l) => l.trim());
  assert.deepEqual(lines.sort(), ["contents: read", "id-token: write", "pages: write"].sort(),
    "uniquement contents:read + pages:write + id-token:write");
  assert.ok(!/pull_request_target/.test(wf), "pas de pull_request_target");
  assert.ok(!/secrets\./.test(wf), "aucun secret utilis\u00e9");
});

test("le d\u00e9ploiement ne publie que docs/presentation (volet A seul)", () => {
  const wf = fs.readFileSync(WF, "utf8");
  assert.ok(/path:\s*docs\/presentation/.test(wf), "artefact = docs/presentation uniquement");
  assert.ok(!/cantoria\.html/.test(wf.split("steps:")[1] || ""), "cantoria.html non publi\u00e9 (volet B exclu)");
  assert.ok(/branches:\s*\[main\]/.test(wf), "d\u00e9clench\u00e9 sur push main");
  assert.ok(/tags:\s*\["v\*\.\*\.\*"\]/.test(wf), "et sur les tags de release");
});

test("toutes les actions du workflow sont \u00e9pingl\u00e9es par SHA", () => {
  const wf = fs.readFileSync(WF, "utf8");
  const uses = [...wf.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 4, "au moins 4 actions");
  for (const u of uses) {
    assert.ok(/@[0-9a-f]{40}/.test(u), `${u} \u00e9pingl\u00e9 par SHA`);
  }
});

test("l'ADR 0003 consigne la d\u00e9cision volet A seul", () => {
  const adr = fs.readFileSync(path.join(ROOT, "docs", "adr", "0003-github-pages.md"), "utf8");
  assert.ok(/Volet A seul/.test(adr), "volet A seul d\u00e9cid\u00e9");
  assert.ok(/volet B/.test(adr) && /report\u00e9/.test(adr), "volet B explicitement report\u00e9");
  assert.ok(/pages: write/.test(adr) && /id-token: write/.test(adr), "permissions document\u00e9es");
});

test("le README pointe vers le site Pages", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("https://aris7dev1.github.io/Cantoria/"), "lien Pages dans le README");
});

/* Issue #138 : le deck publié (docs/presentation) reste autonome : aucune
   ressource externe chargée, tous les assets embarqués dans le dossier. */

test("issue #138 : le deck n'embarque aucune ressource externe et toutes ses images existent localement", () => {
  const dir = path.join(ROOT, "docs", "presentation");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.ok(!/\.\.\//.test(html), "aucun chemin relatif vers l'extérieur (../)");
  assert.ok(!/@import|url\(\s*['"]?https?:/i.test(html), "pas de police/ressource distante en CSS");
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(html), "aucun appel réseau dans le deck");
  const srcs = [...html.matchAll(/\ssrc\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length > 0, "le deck embarque bien des images locales");
  for (const s of srcs) {
    assert.ok(!/^https?:\/\//i.test(s), `src externe interdit: ${s}`);
    assert.ok(fs.existsSync(path.join(dir, s)), `asset embarqué présent: ${s}`);
  }
  const hrefs = [...html.matchAll(/\shref\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  for (const h of hrefs) {
    assert.ok(!/^https?:\/\//i.test(h) || h.startsWith("https://github.com/Aris7Dev1/Cantoria"), `lien externe non autorisé: ${h}`);
  }
});

test("issue #138 : le deck reste court (5 diapos max)", () => {
  const html = fs.readFileSync(path.join(ROOT, "docs", "presentation", "index.html"), "utf8");
  const slides = (html.match(/<section class="slide/g) || []).length;
  assert.ok(slides >= 3 && slides <= 5, `deck de ${slides} diapos (3 à 5 attendu)`);
});
