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
}

function stageLines(window) {
  return [...window.document.querySelectorAll("#stage-inner .line")].map((line) => ({
    text: line.textContent,
    chords: [...line.querySelectorAll(".seg-chord")].map((c) => c.textContent),
    words: [...line.querySelectorAll(".seg-word")].map((w) => w.textContent),
  }));
}

/* Régression du bug #43 : l'ancienne regex permissive prenait « Elle », « Aime »,
   « Acide », « Danse », « Encore », « Amour » pour des accords, et parseBody
   dévorait la ligne de paroles suivante comme ligne jumelle. */
test("une ligne de paroles française commençant par A–G n'est pas une ligne d'accords", () => {
  const window = loadApp([{
    id: "s-1", title: "Paroles FR", artist: "",
    body: "Elle\nétait à Paris\nAime\nla vie en rose\nAcide rock\nc'est du poison\nDanse\nencore un peu\nEncore\nune fois\nAmour\ninterdit",
  }]);
  openPlayer(window, "Paroles FR");
  const lines = stageLines(window);
  assert.equal(lines.length, 12,
    "12 lignes de paroles : aucune ne doit être dévorée comme ligne jumelle");
  lines.forEach((line, i) => {
    assert.equal(line.chords.filter(Boolean).length, 0,
      `la ligne ${i + 1} (« ${line.text} ») ne doit contenir aucun accord`);
  });
  assert.equal(lines[0].words.join(""), "Elle");
  assert.equal(lines[11].words.join(""), "interdit");
});

test("les vraies lignes d'accords restent détectées avec leurs qualités", () => {
  const window = loadApp([{
    id: "s-1", title: "Vrais accords", artist: "",
    body: "Am  F#m7  Bb  D7  G/B  Cadd9  Esus4  Cmaj7  A7(b5)  Em7sus4",
  }]);
  openPlayer(window, "Vrais accords");
  const lines = stageLines(window);
  assert.equal(lines.length, 1, "une seule ligne instrumentale");
  const chords = lines[0].chords;
  ["Am", "F#m7", "Bb", "D7", "G/B", "Cadd9", "Esus4", "Cmaj7", "A7(b5)", "Em7sus4"]
    .forEach((name) => assert.ok(chords.includes(name), `l'accord ${name} doit être reconnu`));
});

test("le format accords-au-dessus-des-paroles n'engloutit plus les paroles suivantes", () => {
  const window = loadApp([{
    id: "s-1", title: "Mixte", artist: "",
    body: [
      "Am           C",
      "paroles ici",
      "Elle",
      "était là",
    ].join("\n"),
  }]);
  openPlayer(window, "Mixte");
  const lines = stageLines(window);
  assert.equal(lines.length, 3, "bloc accords+paroles, puis deux lignes de paroles intactes");
  assert.deepEqual(lines[0].words, ["paroles", "ici"], "les paroles du bloc restent entières");
  assert.equal(lines[1].words.join(" "), "Elle");
  assert.equal(lines[2].words.join(" "), "était là");
});

test("une fondamentale nue sur sa ligne n'est pas prise pour une ligne d'accords", () => {
  const window = loadApp([{
    id: "s-1", title: "Nues", artist: "",
    body: "A\nCeci est une phrase\nC D\nparoles",
  }]);
  openPlayer(window, "Nues");
  const lines = stageLines(window);
  assert.equal(lines[0].words.join(""), "A", "« A » seul reste une ligne de texte");
  assert.equal(lines[1].words.join(" "), "Ceci est une phrase");
  assert.ok(lines[2].chords.join("").length > 0, "la ligne C D reste une ligne d'accords");
  assert.ok(lines[2].words.includes("paroles"), "la parole « paroles » est bien collée aux accords C D");
});
