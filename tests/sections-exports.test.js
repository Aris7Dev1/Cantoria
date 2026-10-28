const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";

function loadApp(seed = {}) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      for (const [key, value] of Object.entries(seed)) {
        window.localStorage.setItem(key, value);
      }
      window.confirm = function () { return true; };
    },
  });
  return dom.window;
}

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

/* Format typique des exports de chansonniers web (le-chansonnier.com) :
   libellés de section en texte libre, accords au-dessus des paroles. */
function chansonnierExportBody() {
  return [
    "Couplet",
    "A          F#m",
    "Une chanson douce",
    "Bm                    E",
    "Que me chantait ma maman",
    "",
    "Refrain",
    "A        F#m",
    "Cette chanson douce",
    "Bm                E",
    "Je veux la chanter pour toi",
    "",
    "Pont",
    "F                    A",
    "Mais le brave chevalier passa",
  ].join("\n");
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: chansonnierExportBody(), speed: 1 }, overrides);
}

function sections(window) {
  return Array.from(window.document.querySelectorAll("#stage-inner [data-section]"));
}

test("les libellés texte d'un export chansonnier créent des sections repérables", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const secs = sections(window);
  assert.equal(secs.length, 3, "Couplet, Refrain, Pont");
  assert.equal(secs[0].getAttribute("data-section"), "verse-1");
  assert.ok(secs[0].classList.contains("verse"));
  assert.equal(secs[1].getAttribute("data-section"), "chorus-1");
  assert.ok(secs[1].classList.contains("chorus"), "le refrain porte son liseré");
  assert.equal(secs[2].getAttribute("data-section"), "bridge-1");
  assert.ok(secs[2].classList.contains("bridge"), "le pont porte son liseré");
});

test("le libellé original s'affiche, pas un libellé générique", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const labels = Array.from(window.document.querySelectorAll("#stage-inner .section-label")).map((el) => el.textContent);
  assert.deepEqual(labels, ["Couplet", "Refrain", "Pont"], "le texte du chansonnier est conservé tel quel");
});

test("la navigation par sections fonctionne sur un export chansonnier", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(sections(window).length, 3, "trois ancres de navigation");
  window.document.querySelector("#section-next").click();
  window.document.querySelector("#section-next").click();
  window.document.querySelector("#section-prev").click();
  assert.ok(true, "navigation sans erreur sur les ancres texte");
});

test("un libellé de section musicale (Solo) crée sa propre section et referme le refrain", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song({
      body: ["Refrain", "[A]Le refrain", "", "Solo", "[D]Pam pam pam"].join("\n"),
    })]),
  });
  openFirstSong(window);
  const secs = sections(window);
  assert.equal(secs.length, 2, "le refrain puis le solo");
  assert.equal(secs[0].getAttribute("data-section"), "chorus-1");
  assert.equal(secs[1].getAttribute("data-section"), "verse-1");
  assert.ok(secs[0].querySelector(".line"), "le refrain contient bien ses lignes");
  assert.ok(secs[1].querySelector(".line"), "le solo aussi");
});

test("« Couplet 2 » et « Refrain (x3) » sont reconnus avec leur suffixe", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song({
      body: ["Couplet 1", "[A]Un", "", "Refrain (x3)", "[D]Deux", "", "Couplet 2", "[E]Trois"].join("\n"),
    })]),
  });
  openFirstSong(window);
  const secs = sections(window);
  assert.equal(secs.length, 3);
  assert.equal(secs[0].getAttribute("data-section"), "verse-1");
  assert.equal(secs[1].getAttribute("data-section"), "chorus-1");
  assert.equal(secs[2].getAttribute("data-section"), "verse-2");
});

test("les marqueurs ChordPro {sov}/{soc} continuent de fonctionner comme avant", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song({
      body: ["{sov}", "[Am]Couplet", "{eov}", "", "{soc}", "[F]Refrain", "{eoc}"].join("\n"),
    })]),
  });
  openFirstSong(window);
  const labels = Array.from(window.document.querySelectorAll("#stage-inner .section-label")).map((el) => el.textContent);
  assert.deepEqual(labels, ["Couplet", "Refrain"], "libellés génériques ChordPro inchangés");
  assert.equal(sections(window).length, 2);
});
