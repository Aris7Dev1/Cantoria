const fs = require("node:fs");
const path = require("node:path");

const packagePath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

const repository = process.env.GITHUB_REPOSITORY || process.env.CARNET_GITHUB_REPOSITORY || "";
const match = /^([^/]+)\/([^/]+)$/.exec(repository.trim());

if (!match) {
  console.error("GITHUB_REPOSITORY attendu au format owner/repository.");
  process.exit(1);
}

const [, owner, repo] = match;
pkg.repository = {
  type: "git",
  url: `https://github.com/${owner}/${repo}.git`,
};
pkg.build = pkg.build || {};
pkg.build.publish = {
  provider: "github",
  owner,
  repo,
  releaseType: "release",
  publishAutoUpdate: true,
};

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Publication GitHub configurée pour ${owner}/${repo}`);
