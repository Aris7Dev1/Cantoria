#!/usr/bin/env node
"use strict";

/*
 * Garde-fou « guard-bash » (hook pre_tool sur l'outil bash).
 *
 * Refuse les commandes destructives ou irréversibles, en complément de la liste
 * noire de .devcontainer/vibe/config.toml : ce hook est la couche versionnée du
 * dépôt, il protège aussi les sessions qui tourneraient avec une configuration
 * plus permissive (agent auto-approve, action CI…).
 *
 * Protocole des hooks Vibe : un événement JSON sur stdin, la décision sur stdout.
 *   - commande bloquée  -> stdout {"decision":"deny","reason":"…"}, exit 0
 *   - commande autorisée -> stdout vide, exit 0
 * Le script ne doit jamais planter : en cas d'erreur interne, il autorise
 * (exit 0, stdout vide) et laisse la liste noire de la configuration agir.
 */

const BLOCKED = [
  [/^git\s+push\b/, "pousser est réservé au superviseur ; le runner pousse lui-même la branche de l'agent"],
  [/^git\s+reset\s+--hard\b/, "git reset --hard détruit le travail non commité"],
  [/^git\s+clean\s+-[a-zA-Z]*f/, "git clean -f supprime définitivement des fichiers non suivis"],
  [/^git\s+branch\s+-[dD]\s+(main|master)\b/, "la branche principale ne se supprime pas"],
  [/^git\s+checkout\s+--\s/, "git checkout -- <chemin> annule les modifications non commitées"],
  [/^git\s+restore\s+--source\b/, "git restore --source écrase des fichiers depuis un commit"],
  [/^git\s+stash\s+(drop|clear)\b/, "git stash drop/clear est irréversible"],
  [/^gh\s+pr\s+merge\b/, "merger une pull request est l'acte de validation du superviseur, pas d'une session Vibe"],
];

/* rm avec l'option récursive (-r, -rf, -fr, -r -f, --recursive) : suppression définitive. */
function isDestructiveRm(command) {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== "rm") return false;
  let recursive = false;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--") break;
    if (token === "--recursive") { recursive = true; continue; }
    if (token.startsWith("--")) continue;
    if (token.startsWith("-") && token.slice(1).includes("r")) recursive = true;
  }
  return recursive;
}

function matchBlocked(command) {
  const cmd = String(command || "").trim();
  if (!cmd) return null;
  for (const [re, reason] of BLOCKED) {
    if (re.test(cmd)) return reason;
  }
  if (isDestructiveRm(cmd)) return "rm récursif (-r) : suppression définitive de fichiers";
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
      const command = event && event.tool_input && event.tool_input.command;
      const reason = matchBlocked(command);
      if (reason) {
        process.stdout.write(JSON.stringify({ decision: "deny", reason: reason }));
      }
    } catch {
      // Entrée illisible : on laisse passer, la liste noire de la configuration reste active.
    }
    process.exit(0);
  };
  // Filet de sécurité : si stdin ne se termine pas, on autorise au bout de 2 s.
  setTimeout(finish, 2000).unref();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
}

main();
