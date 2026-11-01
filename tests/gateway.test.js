const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");

const { createGateway, loadConfig } = require(path.join(__dirname, "..", ".devcontainer", "gateway", "server.js"));

const REAL_KEY = "real-key-for-tests-0123456789";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

// Faux fournisseur : enregistre ce qu'il reçoit, répond selon le chemin.
async function startUpstream() {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      if (req.url === "/v1/chat/completions" && req.headers["x-stream"] === "1") {
        res.writeHead(200, { "content-type": "text/event-stream", "set-cookie": "a=b" });
        res.write("data: {\"n\":1}\n\n");
        setTimeout(() => { res.write("data: [DONE]\n\n"); res.end(); }, 400);
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, url: req.url }));
    });
  });
  const port = await listen(server);
  return { server, port, seen };
}

async function setup(overrides = {}) {
  const upstream = await startUpstream();
  const logs = [];
  const config = {
    ...loadConfig({}),
    apiKey: REAL_KEY,
    upstream: `http://127.0.0.1:${upstream.port}`,
    maxRequestsPerHour: 0,
    ...overrides,
  };
  const gateway = createGateway(config, { log: (entry) => logs.push(entry) });
  const port = await listen(gateway);
  return {
    upstream, logs, port,
    request: (method, urlPath, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.end(body);
    }),
    stop: async () => { await close(gateway); await close(upstream.server); },
  };
}

const CHAT = (model = "mistral-large-4-0") => JSON.stringify({ model, messages: [{ role: "user", content: "salut" }] });
const JSON_HEADERS = { "content-type": "application/json" };

test("remplace la clé du client par la vraie clé et ne relaie ni cookie ni x-api-key", async () => {
  const g = await setup();
  try {
    const res = await g.request("POST", "/v1/chat/completions", {
      headers: { ...JSON_HEADERS, authorization: "Bearer cle-factice", "x-api-key": "autre", cookie: "session=1" },
      body: CHAT(),
    });
    assert.equal(res.status, 200);
    const got = g.upstream.seen[0];
    assert.equal(got.headers.authorization, `Bearer ${REAL_KEY}`);
    assert.equal(got.headers["x-api-key"], undefined);
    assert.equal(got.headers.cookie, undefined);
    assert.equal(JSON.parse(got.body).model, "mistral-large-4-0");
  } finally { await g.stop(); }
});

test("relaie le flux SSE au fil de l'eau et retire set-cookie", async () => {
  const g = await setup();
  try {
    const start = Date.now();
    const result = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: g.port, method: "POST", path: "/v1/chat/completions",
        headers: { ...JSON_HEADERS, "x-stream": "1" } }, (res) => {
        let firstChunkAt = null;
        let all = "";
        res.on("data", (c) => { if (firstChunkAt === null) firstChunkAt = Date.now() - start; all += c; });
        res.on("end", () => resolve({ firstChunkAt, all, headers: res.headers, total: Date.now() - start }));
      });
      req.on("error", reject);
      req.end(CHAT());
    });
    assert.match(result.all, /\[DONE\]/);
    assert.ok(result.firstChunkAt < 300, `premier morceau trop tardif : ${result.firstChunkAt} ms`);
    assert.ok(result.total >= 350, "le flux doit durer jusqu'à la fin côté fournisseur");
    assert.equal(result.headers["set-cookie"], undefined);
  } finally { await g.stop(); }
});

test("refuse les routes hors liste blanche sans jamais joindre le fournisseur", async () => {
  const g = await setup();
  try {
    const attempts = [
      ["POST", "/v1/files"], ["GET", "/v1/files"], ["GET", "/v1/fine_tuning/jobs"], ["DELETE", "/v1/models/x"],
      ["POST", "/v1/agents/completions"], ["POST", "/v1/chat/completions/../files"], ["POST", "/v1/chat/completions/"],
      ["POST", "/v1/%2e%2e/files"], ["GET", "/v1/chat/completions"], ["POST", "/v1/models"],
    ];
    for (const [method, urlPath] of attempts) {
      const res = await g.request(method, urlPath, { headers: JSON_HEADERS, body: method === "POST" ? CHAT() : undefined });
      assert.equal(res.status, 403, `${method} ${urlPath} devrait être refusé`);
    }
    assert.equal(g.upstream.seen.length, 0);
  } finally { await g.stop(); }
});

test("GET /v1/models est relayé avec la vraie clé, sans chaîne de requête", async () => {
  const g = await setup();
  try {
    const res = await g.request("GET", "/v1/models?x=1", { headers: { authorization: "Bearer factice" } });
    assert.equal(res.status, 200);
    assert.equal(g.upstream.seen[0].url, "/v1/models");
    assert.equal(g.upstream.seen[0].headers.authorization, `Bearer ${REAL_KEY}`);
  } finally { await g.stop(); }
});

test("liste blanche de modèles : un modèle non autorisé est refusé", async () => {
  const g = await setup({ allowedModels: ["mistral-large-4"] });
  try {
    const ok = await g.request("POST", "/v1/chat/completions", { headers: JSON_HEADERS, body: CHAT("mistral-large-4") });
    const refused = await g.request("POST", "/v1/chat/completions", { headers: JSON_HEADERS, body: CHAT("modele-couteux") });
    assert.equal(ok.status, 200);
    assert.equal(refused.status, 403);
    assert.equal(g.upstream.seen.length, 1);
  } finally { await g.stop(); }
});

test("plafond de requêtes par heure : 429 avec Retry-After", async () => {
  const g = await setup({ maxRequestsPerHour: 2 });
  try {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await g.request("POST", "/v1/chat/completions", { headers: JSON_HEADERS, body: CHAT() });
      statuses.push(res.status);
      if (res.status === 429) assert.ok(Number(res.headers["retry-after"]) > 0);
    }
    assert.deepEqual(statuses, [200, 200, 429]);
    assert.equal(g.upstream.seen.length, 2);
  } finally { await g.stop(); }
});

test("corps trop volumineux : 413", async () => {
  const g = await setup({ maxBodyBytes: 1024 });
  try {
    const res = await g.request("POST", "/v1/chat/completions", {
      headers: JSON_HEADERS,
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "x".repeat(5000) }] }),
    }).catch((error) => ({ status: error.code }));
    assert.ok(res.status === 413 || res.status === "ECONNRESET", `statut inattendu : ${res.status}`);
    assert.equal(g.upstream.seen.length, 0);
  } finally { await g.stop(); }
});

test("corps non JSON : 400", async () => {
  const g = await setup();
  try {
    const res = await g.request("POST", "/v1/chat/completions", { headers: JSON_HEADERS, body: "pas du json" });
    assert.equal(res.status, 400);
    assert.equal(g.upstream.seen.length, 0);
  } finally { await g.stop(); }
});

test("fournisseur injoignable : 502 sans fuite de clé, journaux sans contenu sensible", async () => {
  const g = await setup({ upstream: "http://127.0.0.1:1" });
  try {
    const res = await g.request("POST", "/v1/chat/completions", {
      headers: { ...JSON_HEADERS, authorization: "Bearer cle-du-client-secrete" },
      body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "mot-de-passe-dans-le-prompt" }] }),
    });
    assert.equal(res.status, 502);
    assert.doesNotMatch(res.body, new RegExp(REAL_KEY));
    const everything = JSON.stringify(g.logs);
    assert.doesNotMatch(everything, new RegExp(REAL_KEY));
    assert.doesNotMatch(everything, /cle-du-client-secrete|mot-de-passe-dans-le-prompt/);
    assert.equal(g.logs.at(-1).status, 502);
  } finally { await g.stop(); }
});

test("/healthz répond sans joindre le fournisseur", async () => {
  const g = await setup();
  try {
    const res = await g.request("GET", "/healthz");
    assert.equal(res.status, 200);
    assert.equal(g.upstream.seen.length, 0);
  } finally { await g.stop(); }
});

test("loadConfig lit l'environnement avec des valeurs par défaut prudentes", () => {
  const defaults = loadConfig({});
  assert.equal(defaults.upstream, "https://api.mistral.ai");
  assert.equal(defaults.maxRequestsPerHour, 600);
  assert.deepEqual(defaults.allowedModels, []);
  const custom = loadConfig({ GATEWAY_ALLOWED_MODELS: " a , b ,", GATEWAY_MAX_REQUESTS_PER_HOUR: "50", MISTRAL_API_KEY: "k" });
  assert.deepEqual(custom.allowedModels, ["a", "b"]);
  assert.equal(custom.maxRequestsPerHour, 50);
  assert.equal(custom.apiKey, "k");
});
