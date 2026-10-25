/*
 * Garde-fous de configuration du conteneur de développement.
 * Ils protègent l'invariant central : la vraie clé Mistral ne doit pas être lisible
 * depuis le conteneur où l'agent exécute du code.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dc = path.join(__dirname, "..", ".devcontainer");
const read = (...p) => fs.readFileSync(path.join(dc, ...p), "utf8");

// Extrait le bloc d'un service du docker-compose.yml (de « <nom>: » au service suivant).
function serviceBlock(compose, name) {
  const lines = compose.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  assert.notEqual(start, -1, `service ${name} introuvable`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[i]) || /^[A-Za-z]/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

test("le .env (vraie clé) est masqué par /dev/null dans le conteneur de dev", () => {
  const dev = serviceBlock(read("docker-compose.yml"), "dev");
  assert.match(dev, /^\s*- \/dev\/null:\/workspaces\/cantoria\/\.devcontainer\/\.env:ro\s*$/m);
});

test("le conteneur de dev ne reçoit jamais la vraie clé", () => {
  const compose = read("docker-compose.yml");
  const dev = serviceBlock(compose, "dev");
  assert.doesNotMatch(dev, /env_file/);
  assert.doesNotMatch(dev, /\$\{MISTRAL_API_KEY/);
  assert.match(dev, /MISTRAL_API_KEY: via-passerelle/);
  const gateway = serviceBlock(compose, "mistral-gateway");
  assert.match(gateway, /MISTRAL_API_KEY: \$\{MISTRAL_API_KEY:\?/);
  assert.doesNotMatch(gateway, /ports:/, "aucun port publié sur l'hôte");
});

test("les deux services suppriment les capacités Linux et l'élévation de privilèges", () => {
  const compose = read("docker-compose.yml");
  for (const name of ["dev", "mistral-gateway"]) {
    const block = serviceBlock(compose, name);
    assert.match(block, /cap_drop:\s*\n\s*- ALL/, `${name} : cap_drop ALL`);
    assert.match(block, /no-new-privileges:true/, `${name} : no-new-privileges`);
  }
});

test("le Dockerfile ne contient que la clé factice", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /MISTRAL_API_KEY=via-passerelle/);
  assert.doesNotMatch(dockerfile, /MISTRAL_API_KEY=(?!via-passerelle)\S+/);
});

test("post-create.sh contrôle que le masque du .env est actif", () => {
  const script = read("post-create.sh");
  assert.match(script, /-s \.devcontainer\/\.env/);
  assert.match(script, /ALERTE/);
});

test("Vibe : passerelle locale, télémétrie coupée, commandes dangereuses refusées", () => {
  const toml = read("vibe", "config.toml");
  assert.match(toml, /api_base = "http:\/\/mistral-gateway:8080\/v1"/);
  for (const key of ["enable_telemetry", "enable_otel", "enable_update_checks", "enable_auto_update", "enable_connectors", "enable_background_processes"]) {
    assert.match(toml, new RegExp(`^${key} = false`, "m"), `${key} doit être false`);
  }
  // Sous-agents autorisés par décision du superviseur (voir le commentaire de .devcontainer/vibe/config.toml).
  assert.match(toml, /^enable_subagents = true/m, "enable_subagents est autorisé par décision du superviseur");
  const deny = toml.slice(toml.indexOf("denylist"));
  for (const cmd of ["git push", "curl", "wget", "npm install", "sudo", "docker", "gh "]) {
    assert.ok(deny.includes(`"${cmd}"`), `denylist doit contenir « ${cmd} »`);
  }
  assert.doesNotMatch(toml, /^(yolo|auto_approve)\s*=/m);
});

test("le .env réel ne peut pas être commité", () => {
  const ignore = fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8");
  assert.match(ignore, /^\.devcontainer\/\.env$/m);
});

test("la boucle visuelle n'embarque aucune clé et passe par la passerelle", () => {
  const dir = path.join(__dirname, "..", "scripts", "visual");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(src, /api\.mistral\.ai/, `${f} : jamais d'appel direct à Mistral`);
    assert.doesNotMatch(src, /\b[A-Za-z0-9]{32}\b.*Bearer|Bearer\s+[A-Za-z0-9]{32}/, `${f} : pas de clé en dur`);
  }
  const run = fs.readFileSync(path.join(dir, "run.js"), "utf8");
  assert.match(run, /GATEWAY_URL/);
  assert.match(run, /via-passerelle/);
});
