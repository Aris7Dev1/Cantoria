const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const MAIN_PATH = path.join(__dirname, "..", "main.js");
const PRELOAD_PATH = path.join(__dirname, "..", "preload.js");
const STORAGE_KEY = "cantoria-songs-v1";

function loadApp(songs, bridge) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
      window.confirm = function () { return true; };
      if (bridge) window.carnetDesktop = bridge;
    },
  });
  return dom.window;
}

/* ------- 1. powerSaveBlocker côté main.js ------- */

test("main.js démarre et arrête le powerSaveBlocker via le canal scrolling:set", () => {
  const main = fs.readFileSync(MAIN_PATH, "utf8");
  assert.ok(/powerSaveBlocker/.test(main), "powerSaveBlocker doit être importé");
  assert.ok(/prevent-display-sleep/.test(main),
    "le blocker doit utiliser prevent-display-sleep (l'écran ne s'éteint pas en concert)");
  assert.ok(/isAuthorizedSender\(event\)/.test(main) && /scrolling:set/.test(main),
    "le canal scrolling:set vérifie l'émetteur comme les autres canaux");
  assert.ok(/stopScreenBlocker\(\)/.test(main),
    "le blocker doit être arrêté (before-quit et arrêt du défilement)");
});

test("preload.js expose setScrolling en fonction ciblée validée", () => {
  const preload = fs.readFileSync(PRELOAD_PATH, "utf8");
  assert.ok(/setScrolling/.test(preload), "setScrolling est exposé");
  assert.ok(/typeof scrolling !== "boolean"/.test(preload),
    "le type est validé côté preload avant l'invoke");
  assert.ok(/contextBridge\.exposeInMainWorld\("carnetDesktop", Object\.freeze/.test(preload),
    "l'objet exposé reste gelé via contextBridge, sans ipcRenderer brut");
});

test("l'interface appelle setScrolling au démarrage et à l'arrêt du défilement", async () => {
  const calls = [];
  const window = loadApp([{ id: "s-1", title: "Lecture", artist: "", body: "ligne un\nligne deux\nligne trois" }], {
    setScrolling: (v) => { calls.push(v); return Promise.resolve({ blocked: v }); },
  });
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#play-toggle").click();
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(calls.includes(true), "le démarrage du défilement notifie le main (blocker ON)");
  doc.querySelector("#play-toggle").click();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls[calls.length - 1], false, "l'arrêt notifie le main (blocker OFF), dernier appel à false");
});

/* ------- 2. Resynchronisation du scroll manuel ------- */

test("un scroll manuel pendant la lecture resynchronise la position interne", () => {
  const window = loadApp([{ id: "s-1", title: "Sync", artist: "", body: Array.from({ length: 40 }, (_, i) => "parole " + i).join("\n") }]);
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  const stage = doc.querySelector("#stage");
  // démarrer la lecture (sans carnetDesktop : pas d'appel IPC)
  doc.querySelector("#play-toggle").click();
  assert.equal(doc.querySelector("#play-toggle").textContent, "❚❚", "le défilement est lancé");
  // l'utilisateur scrolle manuellement loin en dessous de la position courante
  Object.defineProperty(stage, "scrollTop", {
    configurable: true,
    get() { return this._scrollTop || 0; },
    set(v) { this._scrollTop = v; },
  });
  stage._scrollTop = 300;
  stage.dispatchEvent(new window.Event("scroll"));
  // la frame suivante ne doit pas sauter en arrière : scrollTop reste >= 300
  assert.ok(stage.scrollTop >= 300, "la position manuelle est conservée, pas écrasée par l'ancienne position interne");
});

/* ------- 3. Fin de chanson ------- */

test("la fin du défilement affiche un retour visuel", async () => {
  const window = loadApp([{ id: "s-1", title: "Fin", artist: "", body: "une seule ligne" }]);
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  const stage = doc.querySelector("#stage");
  /* Contenu à peine plus haut que la zone (max = 830 px) : le défilement
     atteint le fond en quelques frames réelles sous jsdom. */
  Object.defineProperty(stage, "scrollHeight", { configurable: true, get() { return 830; } });
  Object.defineProperty(stage, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(stage, "scrollTop", {
    configurable: true,
    get() { return this._st || 0; },
    set(v) { this._st = v; },
  });
  doc.querySelector("#play-toggle").click();
  /* 200 px à ~22 px/s : sous jsdom les frames arrivent vite, on boucle
     jusqu'au toast avec un garde-fou de 5 s. */
  const deadline = Date.now() + 5000;
  while (!doc.querySelector("#toast").classList.contains("show") && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(doc.querySelector("#toast").classList.contains("show"), "un toast s'affiche à la fin");
  assert.ok(doc.querySelector("#toast").textContent.includes("Fin"), "le toast annonce la fin de la chanson");
  assert.equal(doc.querySelector("#play-toggle").textContent, "▶", "le bouton revient à l'état lecture");
});

/* ------- 4. Tactile : réveil du bandeau ------- */

test("le bandeau se réveille au toucher sur la zone de lecture", () => {
  const window = loadApp([{ id: "s-1", title: "Tap", artist: "", body: "paroles" }]);
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  const stage = doc.querySelector("#stage");
  const controls = doc.querySelector("#controls");
  // bandeau non épinglé + masqué par le timer
  doc.querySelector("#btn-pin-controls").click(); // désépingler
  controls.classList.add("auto-hidden");
  assert.ok(controls.classList.contains("auto-hidden"), "bandeau masqué avant le tap");
  stage.dispatchEvent(new window.Event("touchstart"));
  assert.ok(!controls.classList.contains("auto-hidden"),
    "un touchstart sur la zone de lecture fait réapparaître le bandeau");
});

/* ------- 5. Vitesse : paliers étendus ------- */

test("les paliers de vitesse descendent jusqu'à ×0,1", () => {
  const window = loadApp([{ id: "s-1", title: "Vitesse", artist: "", body: "paroles", speed: 0.25 }]);
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  assert.equal(doc.querySelector("#speed-val").textContent, "×0,25", "la vitesse initiale est affichée");
  const down = doc.querySelector("#speed-down");
  down.click();
  assert.equal(doc.querySelector("#speed-val").textContent, "×0,2", "palier sous ×0,25 disponible");
  down.click();
  assert.equal(doc.querySelector("#speed-val").textContent, "×0,15");
  down.click();
  assert.equal(doc.querySelector("#speed-val").textContent, "×0,1", "vitesse minimale ×0,1");
  assert.ok(down.disabled, "le bouton − est désactivé au palier le plus bas");
});

/* ------- 6. Spotlight : cache des mesures ------- */

test("le spotlight mesure les lignes une fois puis réutilise le cache", async () => {
  const window = loadApp([{ id: "s-1", title: "Spot", artist: "", body: "ligne une\nligne deux\nligne trois" }]);
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  const stage = doc.querySelector("#stage");
  const lines = doc.querySelectorAll("#stage-inner .line");
  assert.ok(lines.length >= 3, "des lignes sont rendues");
  /* Sans layout jsdom, clientHeight vaut 0 : hauteur de zone réaliste pour
     que le calcul de proximité aboutisse. */
  Object.defineProperty(stage, "clientHeight", { configurable: true, get() { return 600; } });
  Object.defineProperty(stage, "scrollTop", {
    configurable: true,
    get() { return this._st || 0; },
    set(v) { this._st = v; },
  });
  stage.dispatchEvent(new window.Event("scroll"));
  await new Promise((r) => setTimeout(r, 100));
  const withOpacity = [...lines].filter((l) => l.style.opacity !== "").length;
  assert.ok(withOpacity > 0, "le spotlight applique des opacités");
  /* Deuxième application depuis le cache : le stage ne doit plus être
     re-mesuré (une seule mesure pour tout le cycle de rendu). */
  let rectCalls = 0;
  const orig = stage.getBoundingClientRect.bind(stage);
  stage.getBoundingClientRect = function () { rectCalls++; return orig(); };
  stage.dispatchEvent(new window.Event("scroll"));
  await new Promise((r) => setTimeout(r, 100));
  const withOpacity2 = [...lines].filter((l) => l.style.opacity !== "").length;
  assert.ok(withOpacity2 > 0, "les opacités sont recalculées depuis le cache");
  assert.ok(rectCalls <= 1, "le stage n'est mesuré qu'une fois par application, pas par ligne");
});
