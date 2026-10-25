const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const STORAGE_KEY = "cantoria-songs-v1";

function loadApp(songs) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
      window.confirm = function () { return true; };
    },
  });
  return dom.window;
}

function openPlayer(window, title) {
  const card = [...window.document.querySelectorAll("#song-grid .song-card")]
    .find((c) => c.querySelector(".title").textContent === title);
  assert.ok(card, `la carte « ${title} » doit exister`);
  card.click();
  assert.ok(window.document.querySelector("#player-view").classList.contains("active"),
    "le lecteur doit s'ouvrir");
}

function stageLines(window) {
  return [...window.document.querySelectorAll("#stage-inner .line")].map((line) => ({
    text: line.textContent,
    chords: [...line.querySelectorAll(".seg-chord")].map((c) => c.textContent),
    words: [...line.querySelectorAll(".seg-word")].map((w) => w.textContent),
  }));
}

function transpose(window, delta, expectedTotal) {
  const btn = delta > 0 ? "#tr-up" : "#tr-down";
  for (let i = 0; i < Math.abs(delta); i++) window.document.querySelector(btn).click();
  assert.equal(window.document.querySelector("#tr-val").textContent,
    (expectedTotal > 0 ? "+" : "") + expectedTotal);
}

test("une chanson ChordPro rend le texte et les accords du lecteur", () => {
  const window = loadApp([{
    id: "s-1", title: "ChordPro", artist: "Test",
    body: "[Am]paroles en [G]musique\ndeuxième [C]ligne",
  }]);
  openPlayer(window, "ChordPro");
  const lines = stageLines(window);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].chords.filter((c) => c !== ""), ["Am", "G"]);
  assert.deepEqual(lines[0].words, ["paroles", "en", "musique"]);
  assert.deepEqual(lines[1].chords.filter((c) => c !== ""), ["C"]);
  assert.deepEqual(lines[1].words, ["deuxième", "ligne"]);
});

test("le format « accords sur une ligne, paroles dessous » est détecté et rendu", () => {
  const window = loadApp([{
    id: "s-1", title: "Au-dessus", artist: "",
    body: "  Am        G\nparoles en musique ici",
  }]);
  openPlayer(window, "Au-dessus");
  const lines = stageLines(window);
  assert.equal(lines.length, 1, "la ligne d'accords et la ligne de paroles forment un seul bloc");
  assert.ok(lines[0].chords.includes("Am"));
  assert.ok(lines[0].chords.includes("G"));
  assert.deepEqual(lines[0].words, ["paroles", "en", "musique", "ici"]);
});

test("la transposition de +1, +2 et −1 demi-ton s'applique aux accords du lecteur", () => {
  const window = loadApp([{
    id: "s-1", title: "Transpo", artist: "",
    body: "[C]do [G]sol [Am]la",
  }]);
  openPlayer(window, "Transpo");

  transpose(window, 1, 1);
  assert.deepEqual(stageLines(window)[0].chords, ["C#", "G#", "A#m"]);

  transpose(window, 1, 2);
  assert.deepEqual(stageLines(window)[0].chords, ["D", "A", "Bm"]);

  transpose(window, -3, -1);
  assert.deepEqual(stageLines(window)[0].chords, ["B", "F#", "G#m"]);
});

test("la transposition s'applique aussi au format accords-au-dessus et à la tonalité affichée", () => {
  const window = loadApp([{
    id: "s-1", title: "Transpo2", artist: "", key: "Em",
    body: "Em   G\nparoles dessous",
  }]);
  openPlayer(window, "Transpo2");
  assert.ok(window.document.querySelector("#p-sub").textContent.includes("Ton. Em"));
  transpose(window, 2, 2);
  const lines = stageLines(window);
  assert.ok(lines[0].chords.includes("F#m"));
  assert.ok(lines[0].chords.includes("A"));
  assert.ok(window.document.querySelector("#p-sub").textContent.includes("Ton. F#m"));
});

test("les accords composés se transposent en conservant leur qualité", () => {
  const window = loadApp([{
    id: "s-1", title: "Composés", artist: "",
    body: "[Am7]un [F#m]deux [Bb]trois [C/G]quatre [Dsus4]cinq",
  }]);
  openPlayer(window, "Composés");
  assert.deepEqual(stageLines(window)[0].chords, ["Am7", "F#m", "Bb", "C/G", "Dsus4"]);

  transpose(window, 1, 1);
  assert.deepEqual(stageLines(window)[0].chords, ["A#m7", "Gm", "B", "C#/G#", "D#sus4"]);

  transpose(window, -2, -1);
  assert.deepEqual(stageLines(window)[0].chords, ["G#m7", "Fm", "A", "B/F#", "C#sus4"]);
});

test("cas limites : ligne vide, ligne de label et accord inconnu laissé intact", () => {
  const window = loadApp([{
    id: "s-1", title: "Limites", artist: "",
    body: "[C]avant\n\nRefrain\n[Xyz]inconnu [G]connu",
  }]);
  openPlayer(window, "Limites");
  const stage = window.document.querySelector("#stage-inner");
  assert.ok(stage.querySelector(".gap"), "la ligne vide produit un séparateur");
  const comment = stage.querySelector(".comment-row");
  assert.ok(comment, "la ligne « Refrain » produit un label");
  assert.equal(comment.textContent, "Refrain");
  const lines = stageLines(window);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].chords, ["C"]);
  assert.deepEqual(lines[1].chords, ["Xyz", "G"], "l'accord inconnu n'est ni transposé ni supprimé");

  transpose(window, 1, 1);
  const shifted = stageLines(window);
  assert.deepEqual(shifted[1].chords, ["Xyz", "G#"], "l'accord inconnu reste intact après transposition");
});

test("une ligne [Refrain] entre crochets est rendue comme accord isolé et reste intacte", () => {
  const window = loadApp([{
    id: "s-1", title: "Label crochets", artist: "",
    body: "[C]avant\n[Refrain]\n[G]après",
  }]);
  openPlayer(window, "Label crochets");
  const lines = stageLines(window);
  assert.equal(lines.length, 3);
  assert.ok(window.document.querySelector("#stage-inner .line.instrumental"),
    "une ligne d'accords sans parole est rendue en bloc instrumental");
  assert.deepEqual(lines[1].chords, ["Refrain"]);
  assert.equal(lines[1].text, "Refrain");

  transpose(window, 1, 1);
  const shifted = stageLines(window);
  assert.deepEqual(shifted[0].chords, ["C#"]);
  assert.deepEqual(shifted[1].chords, ["Refrain"], "« Refrain » n'est pas un accord : il reste intact");
  assert.deepEqual(shifted[2].chords, ["G#"]);
});

test("à la taille par défaut, les accords mesurent ≥ 18 px et les paroles ≥ 20 px dans le lecteur", () => {
  const window = loadApp([{
    id: "s-1", title: "Tailles", artist: "",
    body: "[Am]paroles en [G]musique",
  }]);
  openPlayer(window, "Tailles");

  // jsdom ne résout pas les em en px : on remonte la cascade en partant de la
  // taille racine du navigateur (16 px, « medium »), comme le fait le moteur.
  function fontPx(el) {
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.unshift(n);
    let px = 16;
    for (const n of chain) {
      const v = window.getComputedStyle(n).fontSize;
      if (v === "medium") continue;
      const m = /^([\d.]+)(px|em|%)$/.exec(v);
      if (!m) continue;
      const val = parseFloat(m[1]);
      if (m[2] === "px") px = val;
      else px = px * val / (m[2] === "%" ? 100 : 1);
    }
    return px;
  }

  const chord = window.document.querySelector("#stage-inner .seg-chord");
  const word = window.document.querySelector("#stage-inner .seg-word");
  assert.ok(chord && word, "le lecteur doit contenir un accord et une parole");
  assert.ok(fontPx(chord) >= 18,
    `accord à ${fontPx(chord)} px, minimum 18 px (seuils scripts/visual/thresholds.json)`);
  assert.ok(fontPx(word) >= 20,
    `parole à ${fontPx(word)} px, minimum 20 px (seuils scripts/visual/thresholds.json)`);

  // Le réglage de taille (A−/A+) reste relatif : il s'applique sur #stage-inner en em.
  const stageInner = window.document.querySelector("#stage-inner");
  assert.equal(window.getComputedStyle(stageInner).fontSize, "1em",
    "la taille par défaut laisse #stage-inner à 1em");
  window.document.querySelector("#fs-up").click();
  assert.equal(window.getComputedStyle(stageInner).fontSize, "1.15em",
    "A+ augmente la taille du lecteur de 0,15 em");
  assert.ok(fontPx(chord) >= 18 && fontPx(word) >= 20,
    "les seuils restent atteints après A+");
  window.document.querySelector("#fs-down").click();
  window.document.querySelector("#fs-down").click();
  const scaleDown = parseFloat(window.getComputedStyle(stageInner).fontSize);
  assert.ok(Math.abs(scaleDown - 0.85) < 1e-9,
    `A− diminue la taille du lecteur de 0,15 em par cran (attendu 0,85, obtenu ${scaleDown})`);
});

test("les accords utilisés listés sous le titre suivent la transposition", () => {
  const window = loadApp([{
    id: "s-1", title: "Badges", artist: "",
    body: "[C]un [G]deux [C]trois",
  }]);
  openPlayer(window, "Badges");
  const badges = () => [...window.document.querySelectorAll("#chords-used .badge")].map((b) => b.textContent);
  assert.deepEqual(badges(), ["C", "G"]);
  transpose(window, 1, 1);
  assert.deepEqual(badges(), ["C#", "G#"]);
});
