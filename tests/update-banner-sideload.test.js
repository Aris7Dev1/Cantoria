const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "cantoria.html"), "utf8");

function loadDom(scriptOverrides) {
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only" });
  const win = dom.window;
  const listeners = { available: [], progress: [], downloaded: [], error: [] };
  win.carnetDesktop = Object.freeze({
    platform: scriptOverrides.platform,
    isElectron: scriptOverrides.platform !== "android",
    onUpdateAvailable: (cb) => { listeners.available.push(cb); return () => {}; },
    onUpdateProgress: (cb) => { listeners.progress.push(cb); return () => {}; },
    onUpdateDownloaded: (cb) => { listeners.downloaded.push(cb); return () => {}; },
    onUpdateError: (cb) => { listeners.error.push(cb); return () => {}; },
    installUpdate: () => Promise.resolve({ installed: false }),
    openExternal: (url) => { win.__openedExternal = url; return Promise.resolve({ opened: true }); },
  });
  win.localStorage.clear();
  win.document.title = "Cantoria";
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  win.eval(script);
  return { win, listeners };
}

/* Canal sideload Android (décision post-1.6.0) : le bandeau annonce la version
   et propose un lien « Télécharger l'APK » ouvert dans le navigateur externe,
   PAS de téléchargement in-app (boucle « Redémarrer » constatée avec Play
   Protect et signatures divergentes). */
test("Android : le bandeau de mise à jour propose le lien APK sans téléchargement in-app", () => {
  const { win, listeners } = loadDom({ platform: "android" });
  const banner = win.document.querySelector("#update-banner");
  const action = win.document.querySelector("#update-action");
  const detail = win.document.querySelector("#update-detail");

  listeners.available.forEach((cb) => cb({ version: "1.7.0", apkUrl: "https://github.com/Aris7Dev1/Cantoria/releases/download/v1.7.0/cantoria-1.7.0-android.apk" }));

  assert.ok(banner.classList.contains("show"), "le bandeau est affiché");
  assert.match(win.document.querySelector("#update-title").textContent, /1\.7\.0/);
  assert.match(detail.textContent, /GitHub Releases/);
  assert.equal(action.disabled, false, "le bouton est actif immédiatement");
  assert.match(action.textContent, /Télécharger l'APK/);

  action.click();
  assert.equal(
    win.__openedExternal,
    "https://github.com/Aris7Dev1/Cantoria/releases/download/v1.7.0/cantoria-1.7.0-android.apk",
    "le clic ouvre l'URL du bandeau via openExternal (navigateur externe)"
  );
});

/* Desktop : le flux electron-updater est inchangé — le bouton reste désactivé
   pendant le téléchargement automatique, aucun lien APK. */
test("Desktop : le bandeau conserve le téléchargement automatique electron-updater", () => {
  const { win, listeners } = loadDom({ platform: "win32" });
  const action = win.document.querySelector("#update-action");

  listeners.available.forEach((cb) => cb({ version: "1.7.0" }));

  assert.equal(action.disabled, true, "téléchargement en cours : bouton désactivé");
  assert.match(action.textContent, /Téléchargement/);
  assert.doesNotMatch(action.textContent, /APK/);
});
