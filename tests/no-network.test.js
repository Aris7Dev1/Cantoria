const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("le HTML ne référence aucune URL externe", () => {
  const html = fs.readFileSync(path.join(root, "cantoria.html"), "utf8");
  const urls = html.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual(urls, []);
});

test("le HTML n'utilise aucune API réseau du navigateur", () => {
  const html = fs.readFileSync(path.join(root, "cantoria.html"), "utf8");
  const forbidden = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|importScripts)/;
  assert.doesNotMatch(html, forbidden);
});

test("le preload n'expose plus de version dépendante de npm", () => {
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  assert.doesNotMatch(preload, /npm_package_version/);
  assert.match(preload, /app:version/);
});

test("le HTML déclare une Content-Security-Policy stricte", () => {
  const html = fs.readFileSync(path.join(root, "cantoria.html"), "utf8");
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/i);
  assert.ok(meta, "balise <meta http-equiv=\"Content-Security-Policy\"> attendue dans cantoria.html");
  const policy = meta[1];
  assert.match(policy, /default-src 'none'/, "default-src 'none' attendu");
  assert.match(policy, /script-src 'unsafe-inline'/, "script-src 'unsafe-inline' attendu (script inline unique)");
  assert.match(policy, /style-src 'unsafe-inline'/, "style-src 'unsafe-inline' attendu (style inline)");
  assert.doesNotMatch(policy, /\bimg-src\b/, "aucun img-src ne doit figurer dans la politique (aucune image utilisée)");
  assert.doesNotMatch(policy, /\bfont-src\b/, "aucun font-src ne doit figurer dans la politique (aucune police embarquée)");
  assert.doesNotMatch(policy, /connect-src/, "aucun connect-src ne doit être autorisé");
  assert.doesNotMatch(policy, /\bhttps?:/i, "aucun schéma http: ou https: ne doit figurer dans la politique");
});

test("aucune ressource du HTML n'est chargée depuis une URL", () => {
  const html = fs.readFileSync(path.join(root, "cantoria.html"), "utf8");
  const externalRefs = html.match(/(?:<script[^>]*\ssrc=|<link[^>]*\shref=|@import|<img[^>]*\ssrc=|url\()\s*["']?\s*(?:https?:)?\/\//gi) || [];
  assert.deepEqual(externalRefs, []);
  const srcAttrs = html.match(/\s(?:src|href)\s*=\s*"([^"]*)"/gi) || [];
  const nonLocal = srcAttrs.filter((attr) => /^(?:https?:)?\/\//i.test(attr.replace(/^\s(?:src|href)\s*=\s*"/i, "").replace(/"$/, "")));
  assert.deepEqual(nonLocal, []);
});
