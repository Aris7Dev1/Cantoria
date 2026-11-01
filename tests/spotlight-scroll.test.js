const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";

/* La surbrillance doit suivre le défilement : les offsets sont mesurés dans
   le repère du CONTENU du stage, puis ramenés au viewport en SOUSTRAYANT le
   scrollTop courant. Régression corrigée : l'ancien code AJOUTAIT le
   scrollTop, la ligne éclairée filait hors de l'écran dès les premiers
   pixels de défilement (« le texte n'est plus surligné après le début »,
   rapport mobile — en lecture manuelle comme en défilement automatique). */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadApp() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(SONGS_KEY, JSON.stringify([
        { id: "s-1", title: "Spot", artist: "", body: "alpha\nbeta\ngamma\ndelta\nepsilon", speed: 1 },
      ]));
      window.confirm = function () { return true; };
      /* Pas de layout sous jsdom : géométrie déterministe fournie au
         spotlight — position (hauteur 20) de chaque ligne pilotable par
         une table, l'équivalent de ce que le navigateur mesurerait. */
      let tops = { alpha: 0, beta: 100, gamma: 200, delta: 300, epsilon: 400 };
      window.__setLineTops = function (map) { tops = map; };
      window.Element.prototype.getBoundingClientRect = function () {
        const base = (this.classList && this.classList.contains("line") && tops[this.textContent.trim()] !== undefined)
          ? tops[this.textContent.trim()]
          : 0;
        return { top: base, bottom: base + 20, height: 20, width: 100, left: 0, right: 100, x: 0, y: base };
      };
    },
  });
  return dom.window;
}

function stubStage(window) {
  const stage = window.document.querySelector("#stage");
  Object.defineProperty(stage, "clientHeight", { configurable: true, get() { return 600; } });
  Object.defineProperty(stage, "scrollTop", {
    configurable: true,
    get() { return this._st || 0; },
    set(v) { this._st = v; },
  });
  return stage;
}

function focusLines(window) {
  return [...window.document.querySelectorAll("#stage-inner .line.focus-line")];
}

test("la surbrillance suit le défilement (offsets en repère contenu)", async () => {
  const window = loadApp();
  window.document.querySelector("#song-grid .song-card").click();
  const stage = stubStage(window);
  /* Premier passage à scrollTop=0 : la mesure se fige (repère contenu). */
  stage.dispatchEvent(new window.Event("scroll"));
  await sleep(120);
  /* Défilement de 100 px : la ligne dont le centre viewport (centre à 38 %
     de 600 px = 228) est « delta » (sommet contenu 300). Avec l'ancien bug
     (+ scrollTop), c'est « beta » qui aurait été éclairée hors écran. */
  stage._st = 100;
  stage.dispatchEvent(new window.Event("scroll"));
  await sleep(120);
  const focused = focusLines(window);
  assert.equal(focused.length, 1, "exactement une ligne éclairée");
  assert.equal(focused[0].textContent.trim(), "delta",
    "la ligne proche du centre du viewport est éclairée (contenu − scroll)");
  const lines = [...window.document.querySelectorAll("#stage-inner .line")];
  const alpha = lines.find((l) => l.textContent.trim() === "alpha");
  assert.equal(alpha.style.opacity, "0.22", "la ligne la plus haute est au plancher d'opacité");
  window.close();
});

test("un changement de taille de texte re-mesure les lignes (cache invalidé)", async () => {
  const window = loadApp();
  window.document.querySelector("#song-grid .song-card").click();
  const stage = stubStage(window);
  stage.dispatchEvent(new window.Event("scroll"));
  await sleep(120);
  stage._st = 100;
  stage.dispatchEvent(new window.Event("scroll"));
  await sleep(120);
  assert.equal(focusLines(window)[0].textContent.trim(), "delta", "état initial : delta éclairée");
  /* A+ change la hauteur des lignes : la géométrie mesurée est périmée.
     Nouveau layout simulé (gamma glisse vers le centre), puis A+ : le cache
     doit être invalidé et la surbrillance suivre la nouvelle géométrie. */
  window.__setLineTops({ alpha: 40, beta: 140, gamma: 240, delta: 340, epsilon: 440 });
  window.document.querySelector("#fs-up").click();
  stage.dispatchEvent(new window.Event("scroll"));
  await sleep(120);
  const focused = focusLines(window);
  assert.equal(focused.length, 1, "une ligne reste éclairée après A+");
  assert.equal(focused[0].textContent.trim(), "gamma",
    "le cache a été invalidé : la surbrillance suit la nouvelle géométrie");
  window.close();
});
