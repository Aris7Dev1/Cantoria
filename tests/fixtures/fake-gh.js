// Faux `gh` pour tester le runner sans GitHub. Comportement piloté par l'environnement.
const fs = require("node:fs");

const args = process.argv.slice(2);
const log = process.env.FAKE_GH_LOG;
if (log) fs.appendFileSync(log, `${JSON.stringify(args)}\n`);

if (args[0] === "issue" && args[1] === "view") {
  process.stdout.write(process.env.FAKE_ISSUE_JSON || "{}");
} else if (args[0] === "api" && args[1] === "user") {
  process.stdout.write(`${process.env.FAKE_GH_USER || "james"}\n`);
} else if (args[0] === "pr" && args[1] === "create") {
  const i = args.indexOf("--body-file");
  if (i !== -1 && log) fs.copyFileSync(args[i + 1], `${log}.body`);
  process.stdout.write("https://github.com/test/cantoria/pull/7\n");
} else {
  process.stderr.write(`fake-gh : commande inattendue ${args.join(" ")}\n`);
  process.exit(1);
}
