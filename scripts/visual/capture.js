/*
 * Capture de l'application : Electron réel sous Xvfb (moteur "electron", celui qui compte), ou
 * Chromium sur le fichier HTML (moteur "chromium", sans processus principal ni preload : utile pour
 * itérer sans Electron, mais pas représentatif à 100 %).
 *
 * Même état de départ à chaque scénario : profil vierge, chansons et réglages fixes (fixtures.js),
 * animations coupées, curseur masqué.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collectMetrics, evaluateMetrics } = require("./checks");
const { seedEntries, READY_SELECTOR, ENTRY_HTML } = require("./fixtures");

function loadPlaywright() {
  try { return require("playwright-core"); }
  catch (e) {
    throw new Error("playwright-core introuvable. Installe-le (npm install) : c'est une dépendance de développement du projet.");
  }
}

async function launch({ engine, repoRoot, viewport }) {
  const pw = loadPlaywright();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cantoria-visual-"));
  if (engine === "electron") {
    let electronPath = process.env.VISUAL_ELECTRON;
    if (!electronPath) {
      try { electronPath = require(path.join(repoRoot, "node_modules", "electron")); }
      catch (e) { throw new Error("Electron introuvable dans node_modules (npm install), ni dans VISUAL_ELECTRON."); }
    }
    const app = await pw._electron.launch({
      executablePath: electronPath,
      args: [repoRoot, "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }, v) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setContentSize(v.width, v.height);
    }, viewport);
    return { page, profile, close: async () => { await app.close(); fs.rmSync(profile, { recursive: true, force: true }); } };
  }
  if (engine === "chromium") {
    const browser = await pw.chromium.launch({
      executablePath: process.env.VISUAL_CHROMIUM || undefined,
      args: ["--no-sandbox", "--disable-gpu"],
    });
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto("file://" + path.join(repoRoot, ENTRY_HTML || "index.html"));
    return { page, profile, close: async () => { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); } };
  }
  throw new Error(`Moteur inconnu : ${engine} (electron | chromium)`);
}

async function resetState(page, theme) {
  await page.evaluate((entries) => {
    localStorage.clear();
    for (const k of Object.keys(entries)) localStorage.setItem(k, entries[k]);
  }, seedEntries(theme));
  await page.reload();
  await page.waitForSelector(READY_SELECTOR || "body", { timeout: 15000 });
  await page.addStyleTag({ content: "*,*::before,*::after{caret-color:transparent!important}" });
}

async function captureAll({ engine, repoRoot, outDir, themes, scenarios, thresholds, log = () => {} }) {
  const viewport = { width: thresholds.viewport.width, height: thresholds.viewport.height };
  const session = await launch({ engine, repoRoot, viewport });
  const results = [];
  try {
    for (const theme of themes) {
      for (const sc of scenarios) {
        await resetState(session.page, theme);
        await sc.run(session.page);
        await session.page.waitForTimeout(150); // fin des transitions de mise en page
        const dir = path.join(outDir, theme);
        fs.mkdirSync(dir, { recursive: true });
        const png = path.join(dir, `${sc.name}.png`);
        await session.page.screenshot({ path: png, animations: "disabled", caret: "hide" });
        const metrics = await session.page.evaluate(collectMetrics, sc.root || null);
        const violations = evaluateMetrics(metrics, thresholds, sc.scope);
        results.push({ theme, scenario: sc.name, description: sc.description, scope: sc.scope, png, violations });
        log(`${theme}/${sc.name} : ${violations.filter((v) => v.severity === "error").length} erreur(s), ${violations.filter((v) => v.severity === "warning").length} avertissement(s)`);
      }
    }
  } finally {
    await session.close();
  }
  return results;
}

module.exports = { captureAll, launch, resetState };
