const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const SETTINGS_KEY = "cantoria-settings";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Test", artist: "", body: "[Am]la la la", speed: 1 }, overrides);
}

function openFirstSong(window) {
  window.document.querySelector("#song-grid .song-card").click();
}

function speedVal(window) {
  return window.document.querySelector("#speed-val").textContent;
}

function speedBadge(window) {
  const badges = Array.from(window.document.querySelectorAll("#song-grid .badge")).map((b) => b.textContent);
  return badges.find((t) => t.startsWith("×")) || null;
}

function storedSongs(window) {
  return JSON.parse(window.localStorage.getItem(SONGS_KEY));
}

function storedSettings(window) {
  return JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
}

test("le bandeau contient un stepper vitesse et le sélecteur segmenté a disparu", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  assert.equal(window.document.querySelector("#speed-picker"), null);
  assert.ok(window.document.querySelector("#speed-stepper"), "le stepper vitesse doit exister");
  assert.ok(window.document.querySelector("#speed-down"), "bouton − présent");
  assert.ok(window.document.querySelector("#speed-up"), "bouton + présent");
  assert.equal(speedVal(window), "×1", "valeur courante ×1 par défaut");
  window.close();
});

test("le stepper parcourt 8 paliers réguliers de 0,25", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ speed: 0.25 })]) });
  openFirstSong(window);
  const expected = ["×0,25", "×0,5", "×0,75", "×1", "×1,25", "×1,5", "×1,75", "×2"];
  const seen = [speedVal(window)];
  for (let i = 0; i < 7; i++) {
    window.document.querySelector("#speed-up").click();
    seen.push(speedVal(window));
  }
  assert.deepEqual(seen, expected);
  window.close();
});

test("+ depuis ×1 passe à ×1,25, persiste la vitesse et met à jour le badge ; − depuis ×1 passe à ×0,75", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ speed: 1 })]) });
  openFirstSong(window);
  window.document.querySelector("#speed-up").click();
  assert.equal(speedVal(window), "×1,25");
  assert.equal(storedSongs(window)[0].speed, 1.25, "vitesse persistée dans la chanson");
  assert.equal(speedBadge(window), "×1,25", "badge de la carte mis à jour");
  window.document.querySelector("#speed-down").click();
  window.document.querySelector("#speed-down").click();
  assert.equal(speedVal(window), "×0,75");
  assert.equal(storedSongs(window)[0].speed, 0.75);
  assert.equal(speedBadge(window), "×0,75");
  window.close();
});

test("bornes : à ×0,1 le bouton − est désactivé ; à ×2 le bouton + est désactivé", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ speed: 0.1 })]) });
  openFirstSong(window);
  assert.equal(window.document.querySelector("#speed-down").disabled, true);
  assert.equal(window.document.querySelector("#speed-up").disabled, false);
  for (let i = 0; i < 10; i++) window.document.querySelector("#speed-up").click();
  assert.equal(speedVal(window), "×2");
  assert.equal(window.document.querySelector("#speed-up").disabled, true);
  assert.equal(window.document.querySelector("#speed-down").disabled, false);
  window.close();
});

test("une vitesse hors paliers est affichée telle quelle ; +/− rejoignent le palier le plus proche", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song({ speed: 1.1 })]) });
  openFirstSong(window);
  assert.equal(speedVal(window), "×1,1");
  assert.equal(window.document.querySelector("#speed-up").disabled, false);
  assert.equal(window.document.querySelector("#speed-down").disabled, false);
  window.document.querySelector("#speed-up").click();
  assert.equal(speedVal(window), "×1,25", "+ rejoint le palier immédiatement supérieur");
  window.close();

  const window2 = loadApp({ [SONGS_KEY]: JSON.stringify([song({ speed: 1.1 })]) });
  openFirstSong(window2);
  window2.document.querySelector("#speed-down").click();
  assert.equal(speedVal(window2), "×1", "− rejoint le palier immédiatement inférieur");
  window2.close();
});

test("sans réglage existant, le bandeau est épinglé et ne se masque jamais", async () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const pin = window.document.querySelector("#btn-pin-controls");
  assert.equal(pin.getAttribute("aria-pressed"), "true");
  assert.equal(pin.getAttribute("aria-label"), "Désépingler le bandeau");
  await sleep(3200);
  assert.equal(window.document.querySelector("#controls").classList.contains("auto-hidden"), false);
  window.close();
});

test("le bouton d'épinlage bascule l'état, persiste controlsPinned et met à jour aria-label", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const pin = window.document.querySelector("#btn-pin-controls");
  pin.click();
  assert.equal(storedSettings(window).controlsPinned, false, "controlsPinned persisté à false");
  assert.equal(pin.getAttribute("aria-pressed"), "false");
  assert.equal(pin.getAttribute("aria-label"), "Épingler le bandeau");
  pin.click();
  assert.equal(storedSettings(window).controlsPinned, true, "controlsPinned persisté à true");
  assert.equal(pin.getAttribute("aria-label"), "Désépingler le bandeau");
  window.close();
});

test("non épinglé : le bandeau se masque après ~3 s et un mousemove sur #stage le réaffiche", async () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ controlsPinned: false }),
  });
  openFirstSong(window);
  const controls = window.document.querySelector("#controls");
  assert.equal(controls.classList.contains("auto-hidden"), false, "visible à l'ouverture");
  await sleep(3200);
  assert.equal(controls.classList.contains("auto-hidden"), true, "masqué après 3 s");
  window.document.querySelector("#stage").dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true }));
  assert.equal(controls.classList.contains("auto-hidden"), false, "réaffiché immédiatement au mousemove");
  await sleep(3200);
  assert.equal(controls.classList.contains("auto-hidden"), true, "le délai de 3 s est réarmé");
  window.close();
});

test("le masquage ne s'applique pas pendant un décompte actif", async () => {
  const window = loadApp({
    [SONGS_KEY]: JSON.stringify([song()]),
    [SETTINGS_KEY]: JSON.stringify({ controlsPinned: false }),
  });
  openFirstSong(window);
  window.document.querySelector('#countdown-picker button[data-seconds="5"]').click();
  window.document.querySelector("#play-toggle").click();
  assert.equal(window.document.querySelector("#countdown-overlay").classList.contains("show"), true);
  await sleep(3200);
  assert.equal(
    window.document.querySelector("#controls").classList.contains("auto-hidden"),
    false,
    "pas de masquage pendant le décompte"
  );
  window.document.querySelector("#play-toggle").click(); // annule le décompte
  assert.equal(window.document.querySelector("#countdown-overlay").classList.contains("show"), false);
  window.close();
});

test("style : chaque commande du bandeau mesure au moins 32 px de côté", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);
  const selectors = [
    "#play-toggle",
    "#speed-down", "#speed-up",
    "#tr-down", "#tr-up",
    "#fs-down", "#fs-up",
    "#cs-down", "#cs-up",
    "#btn-pin-controls",
  ];
  for (const btn of window.document.querySelectorAll("#countdown-picker button")) {
    selectors.push("#countdown-picker button[data-seconds=\"" + btn.getAttribute("data-seconds") + "\"]");
  }
  const px = (v) => parseFloat(v) || 0;
  for (const sel of selectors) {
    const el = window.document.querySelector(sel);
    assert.ok(el, sel + " présent");
    const cs = window.getComputedStyle(el);
    const padY = px(cs.paddingTop) + px(cs.paddingBottom);
    const padX = px(cs.paddingLeft) + px(cs.paddingRight);
    const borderY = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    const borderX = px(cs.borderLeftWidth) + px(cs.borderRightWidth);
    const lineH = cs.lineHeight === "normal" ? px(cs.fontSize) * 1.2 : px(cs.lineHeight);
    const height = Math.max(px(cs.height), px(cs.minHeight), padY + lineH + borderY);
    const width = Math.max(px(cs.width), px(cs.minWidth), padX + borderX);
    assert.ok(height >= 32, sel + " : hauteur calculée " + height + " px < 32 px");
    assert.ok(width >= 32, sel + " : largeur calculée " + width + " px < 32 px");
  }
  window.close();
});

test("structure : les six groupes de commandes sont encadrés avec un libellé", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  openFirstSong(window);

  // jsdom ne résout pas les em en px : on remonte la cascade en partant de la
  // taille racine du navigateur (16 px, « medium »), comme dans tests/chords.test.js.
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

  const groups = Array.from(window.document.querySelectorAll("#controls .ctrl-group"));
  assert.equal(groups.length, 6, "six boxes de groupe dans le bandeau");

  const expected = [
    { label: "Vitesse", contains: ["#speed-down", "#speed-val", "#speed-up"] },
    { label: "Transpo", contains: ["#tr-down", "#tr-val", "#tr-up"] },
    { label: "Texte", contains: ["#fs-down", "#fs-up"] },
    { label: "Accords", contains: ["#cs-down", "#cs-up"] },
    { label: "Section", contains: ["#section-prev", "#section-next"] },
    { label: "Décompte", contains: ["#countdown-picker"] },
  ];
  groups.forEach((group, i) => {
    const label = group.querySelector(":scope > .ctrl-group-label");
    assert.ok(label, "box n°" + (i + 1) + " : un libellé (.ctrl-group-label) présent");
    assert.equal(label.textContent.trim(), expected[i].label,
      "box n°" + (i + 1) + " : libellé « " + expected[i].label + " »");
    const lcs = window.getComputedStyle(label);
    assert.equal(lcs.textTransform, "uppercase",
      "libellé « " + expected[i].label + " » en text-transform:uppercase");
    assert.equal(lcs.position, "absolute",
      "libellé « " + expected[i].label + " » posé sur la bordure (position:absolute)");
    assert.ok(fontPx(label) >= 12,
      "libellé « " + expected[i].label + " » à " + fontPx(label) + " px, minimum 12 px (seuil interface)");
    const gcs = window.getComputedStyle(group);
    assert.notEqual(gcs.borderTopWidth, "0px", "box « " + expected[i].label + " » : bordure visible");
    for (const sel of expected[i].contains) {
      assert.ok(group.querySelector(sel), "box « " + expected[i].label + " » contient " + sel);
    }
  });

  // Les anciens libellés internes aux steppers sont remplacés par le libellé de la box.
  assert.equal(window.document.querySelectorAll("#controls .stepper > .label").length, 0,
    "plus de span.label interne aux steppers");
  assert.equal(window.document.querySelectorAll("#controls > .ctrl-row > .label").length, 0,
    "plus de span.label « Décompte » isolé dans la ligne");
  window.close();
});

test("structure : le bandeau desktop reste une zone fluide sans empilement", () => {
  /* Issue #64 : le bandeau est désormais structuré en rangées
     (essentielle, secondaire, boutons) pour permettre le repli mobile —
     mais sur desktop, aucune media query ne s'applique : les trois rangées
     restent dans le flux du #controls flex row, sans empilement vertical. */
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const controls = window.document.querySelector("#controls");
  assert.ok(window.document.querySelectorAll("#controls .ctrl-row").length >= 1,
    "les rangées du bandeau existent (refactor #64)");
  assert.equal(window.getComputedStyle(controls).flexDirection, "row",
    "#controls en flex row (desktop : jamais empilé hors media query)");
  for (const id of ["play-toggle", "speed-stepper", "tr-up", "fs-up", "countdown-picker", "btn-pin-controls", "btn-toggle-secondary"]) {
    assert.ok(window.document.querySelector("#controls #" + id), "#" + id + " présent dans le bandeau");
  }
  // desktop : la rangée secondaire est visible (pas de classe de repli au chargement
  // dans un viewport large — le repli est un état interactif, pas un défaut desktop)
  const computed = window.getComputedStyle(window.document.querySelector("#controls-secondary-row"));
  assert.equal(computed.display, "flex", "rangée secondaire visible sur desktop");
  window.close();
});
