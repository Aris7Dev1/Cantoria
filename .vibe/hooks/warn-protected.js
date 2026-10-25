#!/usr/bin/env node
"use strict";

/*
 * Rappel « warn-protected » (hook post_tool sur write_file et edit).
 *
 * Après l'écriture d'un fichier, signale à l'agent que le chemin touché est dans
 * une zone protégée (AGENTS.md « Zones interdites »). C'est un avertissement :
 * il ne bloque rien, il ajoute un contexte à la sortie de l'outil.
 *
 * Protocole des hooks Vibe : un événement JSON sur stdin, la décision sur stdout.
 * Ici : stdout {"hook_specific_output":{"additional_context":"…"}}, exit 0.
 * Le script ne doit jamais planter : en cas d'erreur interne, il n'écrit rien.
 */

// Même liste que FORBIDDEN_PATHS dans scripts/agent/lib.js (politique du runner).
// Une règle finissant par « / » désigne un dossier ; sinon un fichier exact.
const PROTECTED = [
  "VISION.md",
  "CLAUDE.md",
  "AGENTS.md",
  ".vibe/",
  "docs/adr/",
  "scripts/agent/",
  "scripts/visual/",
  "visual-baseline/",
  ".github/",
  ".devcontainer/",
  "package.json",
  "package-lock.json",
  "update-config.json",
];

function normalizePath(p) {
  return String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativeToCwd(filePath, cwd) {
  const path = require("node:path");
  const rel = path.relative(String(cwd || process.cwd()), String(filePath || ""));
  return normalizePath(rel);
}

function protectedRule(rel) {
  if (!rel || rel.startsWith("..")) return null;
  for (const rule of PROTECTED) {
    if (rule.endsWith("/") ? rel.startsWith(rule) : rel === rule) return rule;
  }
  return null;
}

function main() {
  let raw = "";
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try {
      const event = JSON.parse(raw);
      const input = event && event.tool_input;
      const filePath = input && (input.file_path || input.path);
      const rule = protectedRule(relativeToCwd(filePath, event && event.cwd));
      if (rule) {
        const context =
          "Rappel : « " + normalizePath(filePath) + " » est dans une zone protégée (" + rule + ", voir AGENTS.md « Zones interdites »). " +
          "Toute modification est réservée au superviseur et doit être justifiée dans la pull request.";
        process.stdout.write(JSON.stringify({ hook_specific_output: { additional_context: context } }));
      }
    } catch {
      // Entrée illisible : aucun avertissement.
    }
    process.exit(0);
  };
  // Filet de sécurité : si stdin ne se termine pas, on sort au bout de 2 s.
  setTimeout(finish, 2000).unref();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
}

main();
