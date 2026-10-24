const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("le HTML ne référence aucune URL externe", () => {
  const html = fs.readFileSync(path.join(root, "carnet-de-chant-v4.html"), "utf8");
  const urls = html.match(/https?:\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual(urls, []);
});

test("le HTML n'utilise aucune API réseau du navigateur", () => {
  const html = fs.readFileSync(path.join(root, "carnet-de-chant-v4.html"), "utf8");
  const forbidden = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|importScripts)/;
  assert.doesNotMatch(html, forbidden);
});

test("le preload n'expose plus de version dépendante de npm", () => {
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  assert.doesNotMatch(preload, /npm_package_version/);
  assert.match(preload, /app:version/);
});
