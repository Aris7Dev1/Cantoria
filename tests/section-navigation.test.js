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

function songBody() {
  return [
    "{sov}",
    "[Am]Couplet un",
    "{eov}",
    "",
    "{soc}",
    "[F]Refrain un",
    "{eoc}",
    "",
    "{sov}",
    "[Am]Couplet deux",
    "{eov}",
    "",
    "{soc}",
    "[F]Refrain deux",
    "{eoc}",
  ].join("\n");
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: songBody(), speed: 1 }, overrides);
}

function sections(window) {
  return Array.from(window.document.querySelectorAll("#stage-inner [data-section]"));
}

function keydown(window, props) {
  const event = new window.KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true, ctrlKey: true }, props));
  window.document.dispatchEvent(event);
  return event;
}

test("les sections sont numérotées pour servir d'ancres de navigation", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const ids = sections(window).map((el) => el.getAttribute("data-section"));
  assert.deepEqual(ids, ["verse-1", "chorus-1", "verse-2", "chorus-2"]);
});

test("« section suivante » avance d'une section, « précédente » recule", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const stage = window.document.querySelector("#stage");
  const stageTop = stage.getBoundingClientRect().top;
  const topOf = (i) => sections(window)[i].getBoundingClientRect().top - stageTop;

  window.document.querySelector("#section-next").click();
  assert.ok(Math.abs(topOf(1)) < 60, `après un saut on doit être au refrain 1 (écart ${Math.abs(topOf(1))})`);
  window.document.querySelector("#section-next").click();
  assert.ok(Math.abs(topOf(2)) < 60, "puis au couplet 2");
  window.document.querySelector("#section-prev").click();
  assert.ok(Math.abs(topOf(1)) < 60, "le retour amène au refrain 1");
});

test("la navigation s'arrête aux bornes sans erreur", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  for (let i = 0; i < 10; i++) window.document.querySelector("#section-prev").click();
  const stage = window.document.querySelector("#stage");
  assert.equal(stage.scrollTop, 0, "on reste bloqué au début");
  for (let i = 0; i < 10; i++) window.document.querySelector("#section-next").click();
  const targets = sections(window);
  const last = targets[targets.length - 1].getBoundingClientRect().top;
  const stageTop = stage.getBoundingClientRect().top;
  assert.ok(last - stageTop < window.innerHeight, "le dernier saut atteint la dernière section");
});

test("les raccourcis Ctrl+Shift+←/→ déclenchent la navigation de sections", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const next = window.document.querySelector("#section-next");
  const prev = window.document.querySelector("#section-prev");
  let calls = 0;
  next.addEventListener("click", () => calls++);
  prev.addEventListener("click", () => calls++);
  keydown(window, { key: "ArrowRight", shiftKey: true });
  keydown(window, { key: "ArrowLeft", shiftKey: true });
  assert.equal(calls, 2, "chaque raccourci doit déclencher un clic de navigation");
});

test("sans marqueurs de section, la navigation ne fait rien et ne casse rien", () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song({ body: "[Am]Sans sections du tout" })]),
  });
  openFirstSong(window);
  assert.equal(sections(window).length, 0);
  window.document.querySelector("#section-next").click();
  window.document.querySelector("#section-prev").click();
  assert.equal(window.document.querySelector("#stage").scrollTop, 0);
});

test("l'aide documente les raccourcis de navigation par section", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  window.document.querySelector("#btn-help-open").click();
  const text = window.document.querySelector("#help-content").textContent;
  assert.match(text, /Section précédente \/ suivante/);
});
