"use strict";

/*
 * Passerelle Mistral : seul composant qui connaît la vraie clé API.
 *
 * Le conteneur de développement (donc les agents) appelle cette passerelle avec une clé factice ;
 * elle remplace l'autorisation par la vraie clé, ne laisse passer que quelques routes,
 * peut limiter les modèles utilisables, plafonne le nombre de requêtes par heure,
 * puis relaie la réponse (flux SSE compris) sans la tamponner.
 *
 * Aucune dépendance : Node.js seul. Aucun prompt ni en-tête n'est journalisé.
 */

const http = require("node:http");
const https = require("node:https");

const ALLOWED_ROUTES = [
  { method: "POST", path: /^\/v1\/chat\/completions$/, body: true },
  { method: "GET", path: /^\/v1\/models(\/[A-Za-z0-9._:-]+)?$/, body: false },
];

// En-têtes qui ne doivent pas traverser la passerelle, dans les deux sens.
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length",
]);
// En-têtes du client qui pourraient porter une identité : jamais relayés.
const CLIENT_SECRETS = new Set(["authorization", "x-api-key", "api-key", "cookie"]);

function intFromEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function loadConfig(env = process.env) {
  return {
    apiKey: env.MISTRAL_API_KEY || "",
    upstream: env.MISTRAL_UPSTREAM || "https://api.mistral.ai",
    port: intFromEnv(env.GATEWAY_PORT, 8080),
    host: env.GATEWAY_HOST || "0.0.0.0",
    maxBodyBytes: intFromEnv(env.GATEWAY_MAX_BODY_MB, 25) * 1024 * 1024,
    maxRequestsPerHour: intFromEnv(env.GATEWAY_MAX_REQUESTS_PER_HOUR, 600),
    allowedModels: (env.GATEWAY_ALLOWED_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean),
    upstreamTimeoutMs: intFromEnv(env.GATEWAY_UPSTREAM_TIMEOUT_S, 300) * 1000,
  };
}

function sendError(res, status, message, extraHeaders = {}) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ object: "error", type: "gateway_error", code: status, message });
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function createGateway(config, deps = {}) {
  const log = deps.log || ((entry) => console.log(JSON.stringify(entry)));
  const now = deps.now || Date.now;
  const upstream = new URL(config.upstream);
  const transport = upstream.protocol === "http:" ? http : https;
  const agent = new transport.Agent({ keepAlive: true });
  const recent = []; // horodatages des requêtes comptées sur la dernière heure

  function checkRate() {
    if (!config.maxRequestsPerHour) return { ok: true };
    const t = now();
    while (recent.length && t - recent[0] > 3600_000) recent.shift();
    if (recent.length >= config.maxRequestsPerHour) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((3600_000 - (t - recent[0])) / 1000)) };
    }
    recent.push(t);
    return { ok: true };
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > config.maxBodyBytes) {
          reject(Object.assign(new Error("body too large"), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  async function handle(req, res) {
    const started = now();
    const method = req.method || "GET";
    const pathname = (req.url || "/").split("?")[0];
    const entry = { ts: new Date(started).toISOString(), method, path: pathname };
    const finish = (status, extra = {}) => log({ ...entry, status, ms: now() - started, ...extra });

    if (method === "GET" && pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    const route = ALLOWED_ROUTES.find((r) => r.method === method && r.path.test(pathname));
    if (!route) {
      sendError(res, 403, "Route non autorisée par la passerelle.");
      finish(403, { reason: "route" });
      return;
    }

    let body = Buffer.alloc(0);
    if (route.body) {
      try {
        body = await readBody(req);
      } catch (error) {
        sendError(res, error.status || 400, error.status === 413 ? "Requête trop volumineuse." : "Requête illisible.");
        finish(error.status || 400, { reason: "body" });
        return;
      }
      let model = null;
      try {
        model = JSON.parse(body.toString("utf8")).model;
      } catch {
        sendError(res, 400, "Corps JSON invalide.");
        finish(400, { reason: "json" });
        return;
      }
      entry.model = typeof model === "string" ? model : null;
      if (config.allowedModels.length && !config.allowedModels.includes(model)) {
        sendError(res, 403, "Modèle non autorisé par la passerelle.");
        finish(403, { reason: "model" });
        return;
      }
    }

    const rate = checkRate();
    if (!rate.ok) {
      sendError(res, 429, "Plafond de requêtes par heure atteint sur la passerelle.", { "retry-after": String(rate.retryAfter) });
      finish(429, { reason: "rate" });
      return;
    }

    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(name) && !CLIENT_SECRETS.has(name)) headers[name] = value;
    }
    headers.authorization = `Bearer ${config.apiKey}`;
    if (route.body) headers["content-length"] = String(body.length);

    const options = {
      agent,
      method,
      hostname: upstream.hostname,
      port: upstream.port || undefined,
      path: pathname,
      headers,
      timeout: config.upstreamTimeoutMs,
    };

    let bytesOut = 0;
    const upstreamReq = transport.request(options, (upstreamRes) => {
      const outHeaders = {};
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (!HOP_BY_HOP.has(name) && name !== "set-cookie") outHeaders[name] = value;
      }
      res.writeHead(upstreamRes.statusCode || 502, outHeaders);
      if (res.socket) res.socket.setNoDelay(true);
      upstreamRes.on("data", (chunk) => { bytesOut += chunk.length; });
      upstreamRes.on("end", () => finish(upstreamRes.statusCode, { bytes_in: body.length, bytes_out: bytesOut }));
      upstreamRes.on("error", () => res.destroy());
      upstreamRes.pipe(res);
    });
    upstreamReq.on("timeout", () => upstreamReq.destroy(new Error("upstream timeout")));
    upstreamReq.on("error", (error) => {
      sendError(res, 502, "Le fournisseur est injoignable depuis la passerelle.");
      finish(502, { reason: "upstream", detail: error.code || "error" });
    });
    res.on("close", () => {
      if (!res.writableEnded) upstreamReq.destroy();
    });
    upstreamReq.end(route.body ? body : undefined);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(() => sendError(res, 500, "Erreur interne de la passerelle."));
  });
}

function main() {
  const config = loadConfig();
  if (!config.apiKey) {
    console.error("MISTRAL_API_KEY est vide : renseigne .devcontainer/.env puis recrée les conteneurs.");
    process.exit(1);
  }
  const server = createGateway(config);
  server.keepAliveTimeout = 65_000;
  server.listen(config.port, config.host, () => {
    console.log(JSON.stringify({
      msg: "passerelle prête",
      port: config.port,
      upstream: config.upstream,
      max_requests_per_hour: config.maxRequestsPerHour || "illimité",
      allowed_models: config.allowedModels.length ? config.allowedModels : "tous",
    }));
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
}

if (require.main === module) main();

module.exports = { createGateway, loadConfig, ALLOWED_ROUTES };
