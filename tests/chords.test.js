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

  // Le réglage de taille (A−/A+) pose --reader-scale sur #stage-inner ; la règle
  // CSS compense le zoom de l'interface (calc(var(--reader-scale) * 1rem / var(--zoom))).
  const stageInner = window.document.querySelector("#stage-inner");
  assert.equal(stageInner.style.getPropertyValue("--reader-scale"), "1",
    "la taille par défaut pose --reader-scale: 1");
  window.document.querySelector("#fs-up").click();
  assert.equal(stageInner.style.getPropertyValue("--reader-scale"), "1.15",
    "A+ augmente la taille du lecteur de 0,15");
  assert.ok(fontPx(chord) >= 18 && fontPx(word) >= 20,
    "les seuils restent atteints après A+");
  window.document.querySelector("#fs-down").click();
  window.document.querySelector("#fs-down").click();
  const scaleDown = parseFloat(stageInner.style.getPropertyValue("--reader-scale"));
  assert.ok(Math.abs(scaleDown - 0.85) < 1e-9,
    `A− diminue la taille du lecteur de 0,15 par cran (attendu 0,85, obtenu ${scaleDown})`);
});

test("le zoom de l'interface est compensé sur #stage-inner (paroles à taille constante)", () => {
  const window = loadApp([{
    id: "s-1", title: "Zoom", artist: "",
    body: "[Am]paroles en [G]musique",
  }]);
  openPlayer(window, "Zoom");

  // La règle CSS de #stage-inner doit compenser le zoom via calc() et / var(--zoom…).
  // (extraction directe : la règle est précédée d'un commentaire, pas d'une accolade)
  const css = styleSheet();
  const ruleMatch = /(?:^|\})\s*#stage-inner\{([^}]*)\}/m.exec(css);
  assert.ok(ruleMatch, "la règle « #stage-inner » doit exister");
  const decl = ruleMatch[1];
  const fontSizeDecl = /font-size\s*:\s*([^;]+)/.exec(decl);
  assert.ok(fontSizeDecl, "#stage-inner doit déclarer font-size");
  assert.match(fontSizeDecl[1], /calc\(/, "le font-size de #stage-inner utilise calc()");
  assert.match(fontSizeDecl[1], /\/\s*var\(--zoom/, "le font-size de #stage-inner est divisé par var(--zoom)");
  assert.match(fontSizeDecl[1], /var\(--reader-scale/, "le font-size de #stage-inner dépend de var(--reader-scale)");

  // Résolution de la cascade à la main (jsdom ne résout ni calc() ni var()) :
  // à --zoom: 2 et --reader-scale: 1, le font-size calculé vaut 16 / 2 = 8 px.
  const stageInner = window.document.querySelector("#stage-inner");
  stageInner.style.setProperty("--reader-scale", "1");
  window.document.documentElement.style.setProperty("--zoom", "2");
  const m = /calc\(\s*var\(--reader-scale,\s*([\d.]+)\)\s*\*\s*([\d.]+)rem\s*\/\s*var\(--zoom,\s*([\d.]+)\)\s*\)/.exec(fontSizeDecl[1]);
  assert.ok(m, "la formule calc(var(--reader-scale, 1) * 1rem / var(--zoom, 1)) est reconnue");
  const readerScale = parseFloat(stageInner.style.getPropertyValue("--reader-scale")) || parseFloat(m[1]);
  const zoom = parseFloat(window.document.documentElement.style.getPropertyValue("--zoom")) || parseFloat(m[3]);
  const computedPx = 16 * parseFloat(m[2]) * readerScale / zoom;
  assert.equal(computedPx, 8, "à --zoom: 2 et --reader-scale: 1, #stage-inner vaut 8 px (16 / 2)");
  window.close();
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

/* ---------- Contraste des accords du lecteur (WCAG 2.x, seuil 7:1) ---------- */

// jsdom ne résout ni var() ni les dégradés de fond : on lit la feuille embarquée,
// on résout les variables par thème et on applique la formule WCAG, comme le fait
// scripts/visual/checks.js (pire cas retenu parmi les fonds de la scène).
function styleSheet() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const m = /<style>([\s\S]*?)<\/style>/.exec(html);
  assert.ok(m, "cantoria.html doit embarquer sa feuille de style");
  return m[1];
}

function themeVars(css, theme) {
  const re = new RegExp('html\\[data-theme="' + theme + '"\\]\\{([^}]*)\\}');
  const m = re.exec(css);
  assert.ok(m, `le thème « ${theme} » doit définir ses variables`);
  const vars = {};
  for (const decl of m[1].split(";")) {
    const d = /--([\w-]+)\s*:\s*(.+)/.exec(decl.trim());
    if (d) vars[d[1]] = d[2].trim();
  }
  return vars;
}

function ruleDecl(css, selector) {
  // Ancré sur la fin de la règle précédente : distingue `.seg-chord{…}` de
  // `… .line.focus-line .seg-chord{…}` (sélecteur composé, même suffixe).
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp("(?:^|\\})\\s*" + escaped + "\\{([^}]*)\\}").exec(css);
  assert.ok(m, `la règle « ${selector} » doit exister`);
  return m[1];
}

function parseHex(str) {
  const m = /^#([0-9a-f]{6})$/i.exec(str);
  assert.ok(m, `couleur hex attendue, obtenu « ${str} »`);
  return [1, 3, 5].map((i) => parseInt(m[1].slice(i - 1, i + 1), 16));
}

function resolveVar(value, vars) {
  // Résout var(--x, fallback) récursivement (fallbacks imbriqués autorisés).
  const m = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/.exec(value);
  assert.ok(m, `la couleur doit être un var(), obtenu « ${value} »`);
  if (m[1].slice(2) in vars) return vars[m[1].slice(2)];
  assert.ok(m[2], `la variable ${m[1]} doit être définie (pas de fallback)`);
  return resolveVar(m[2].trim(), vars);
}

function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function compositeOver(fg, alpha, bg) {
  return fg.map((f, i) => f * alpha + bg[i] * (1 - alpha));
}

test("les accords du lecteur ont un contraste ≥ 7:1 pour les trois thèmes", () => {
  // Le lecteur doit rendre les deux formes d'accords.
  const window = loadApp([{
    id: "s-1", title: "Contraste", artist: "",
    body: "[Am]paroles en [G]musique\n[Am] [C] [G]",
  }]);
  openPlayer(window, "Contraste");
  assert.ok(window.document.querySelector("#stage-inner .seg-chord"), "un accord au-dessus des paroles");
  assert.ok(window.document.querySelector("#stage-inner .seg-chord.standalone"), "un accord standalone (ligne instrumentale)");

  const css = styleSheet();
  const chordColor = /color\s*:\s*([^;]+)/.exec(ruleDecl(css, ".seg-chord"))[1].trim();
  const standaloneColor = /color\s*:\s*([^;]+)/.exec(ruleDecl(css, ".seg-chord.standalone"))[1].trim();
  const instrumentalOpacity = parseFloat(/opacity\s*:\s*([\d.]+)/.exec(ruleDecl(css, ".line.instrumental"))[1]);

  for (const theme of ["spotlight", "guitar-case", "campfire"]) {
    const vars = themeVars(css, theme);
    // Fonds de la scène : le dégradé radial du body va de --bg-glow (haut) à --bg ;
    // le contrôle retient le pire cas, on teste donc les deux.
    const backgrounds = [parseHex(vars.bg), parseHex(vars["bg-glow"])];

    const chordFg = parseHex(resolveVar(chordColor, vars));
    const chordRatios = backgrounds.map((bg) => contrastRatio(chordFg, bg));
    assert.ok(Math.min(...chordRatios) >= 7,
      `${theme} : contraste .seg-chord ${Math.min(...chordRatios).toFixed(2)}:1 < 7:1`);

    // .seg-chord.standalone siège dans .line.instrumental (opacité réduite) :
    // la couleur effective est composée avec le fond avant le calcul du ratio.
    const standaloneFg = parseHex(resolveVar(standaloneColor, vars));
    const standaloneRatios = backgrounds.map((bg) =>
      contrastRatio(compositeOver(standaloneFg, instrumentalOpacity, bg), bg));
    assert.ok(Math.min(...standaloneRatios) >= 7,
      `${theme} : contraste .seg-chord.standalone ${Math.min(...standaloneRatios).toFixed(2)}:1 < 7:1`);
  }
});
