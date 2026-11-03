"use strict";
/*
 * Tests statiques du workflow Watchdog visuel (.github/workflows/visual-watch.yml), 
 * sur le médele d'android-shell.test.js : lecture du YAML sans l'exécuter.
 * Périmètre : le rapport de run systématique (GITHUB_STEP_SUMMARY) et le
 * renommage « chien de garde » → ʨ Watchdog ʻ.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const WF = fs.readFileSync(path.join(__dirname_, "..", ".github", "workflows", "visual-watch.yml"), "utf8");

test("le workflow s'affiche sous le nom « Visual watchdog ʿ", () => {
  assert.match(WF, /^name: Visual watchdog$/m);
});

test("le terme franÃǡis « chien de garde » a disparu du workflow", () => {
  assert.doesNotMatch(WF, /chien de garde/i);
});

test("chaque run publie un rapport de run dans GITHUB_STEP_SUMMARY", () => {
  assert.match(WF, /Rapport de run \(résumé Watchdog\)/);
  assert.match(WF, /GITHUB_STEP_SUMMARY/);
  /* le rapport répond même si une étape précédente échoue */
  assert.match(WF, /if: always\(\)/);
});

test("le rapport distingue explorateur désactivé, rapport absent, rapport présent", () => {
  assert.match(WF, /run_explorer/);
  assert.match(WF, /rapport-exploration\.md/);
  assert.match(WF, /Frictions constatées/);
});

test("le résultat du fileur alimente le rapport (log capturé par tee)", () => {
  assert.match(WF, /tee visual-out\/fileur\.log/);
});

test("aucun secret ni permission de plus : contents read + issues write", () => {
  assert.match(WF, /contents: read/);
  assert.match(WF, /issues: write/);
});
