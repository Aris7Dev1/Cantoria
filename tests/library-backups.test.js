const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "cantoria.html");
const STORAGE_KEY = "cantoria-songs-v1";
const BACKUP_PREFIX = `${STORAGE_KEY}-corrupted-`;

function loadApp(seed = {}, options = {}) {
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
      if (options.carnetDesktop) {
        window.carnetDesktop = options.carnetDesktop;
      }
      if (options.createObjectURL) {
        window.URL.createObjectURL = options.createObjectURL;
        window.URL.revokeObjectURL = function () {};
      }
    },
  });
  return dom.window;
}

function openSettings(window) {
  window.document.querySelector("#btn-settings-open").click();
}

function backupRows(window) {
  return window.document.querySelectorAll("#backup-list .setting-row");
}

test("les copies de secours sont listées de la plus récente à la plus ancienne avec leur date", () => {
  const songs = [{ id: "s-1", title: "Actuelle", body: "" }];
  const stampOld = Date.UTC(2026, 0, 2, 10, 30, 0);
  const stampNew = Date.UTC(2026, 0, 3, 12, 45, 0);
  const window = loadApp({
    [STORAGE_KEY]: JSON.stringify(songs),
    [`${BACKUP_PREFIX}${stampOld}`]: JSON.stringify([{ id: "s-2", title: "Ancienne", body: "" }]),
    [`${BACKUP_PREFIX}${stampNew}`]: "pas du json",
  });
  openSettings(window);
  const rows = backupRows(window);
  assert.equal(rows.length, 2);
  const firstTitle = rows[0].querySelector(".setting-title").textContent;
  const secondTitle = rows[1].querySelector(".setting-title").textContent;
  assert.equal(firstTitle, new Date(stampNew).toLocaleString("fr-FR"));
  assert.equal(secondTitle, new Date(stampOld).toLocaleString("fr-FR"));
  assert.ok(rows[0].textContent.includes("Contenu illisible"));
  assert.ok(rows[1].textContent.includes("1 chanson(s)"));
});

test("chaque copie de secours a un bouton Télécharger", () => {
  const window = loadApp({
    [STORAGE_KEY]: JSON.stringify([{ id: "s-1", title: "Actuelle", body: "" }]),
    [`${BACKUP_PREFIX}1000`]: JSON.stringify([{ id: "s-2", title: "Secours", body: "" }]),
  });
  openSettings(window);
  const buttons = window.document.querySelectorAll("#backup-list .setting-row .backup-download");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, "Télécharger");
});

test("sans copie de secours, la section indique qu'aucune copie n'est disponible", () => {
  const window = loadApp({ [STORAGE_KEY]: JSON.stringify([{ id: "s-1", title: "Test", body: "" }]) });
  openSettings(window);
  assert.ok(window.document.querySelector("#backup-list").textContent.includes("Aucune copie de secours"));
  assert.equal(window.document.querySelectorAll("#backup-list .backup-download").length, 0);
});

test("télécharger une copie exporte son contenu brut via carnetDesktop.saveJson", async () => {
  const raw = JSON.stringify([{ id: "s-2", title: "Secours", body: "[Am]la" }]);
  const current = JSON.stringify([{ id: "s-1", title: "Actuelle", body: "" }]);
  const saved = [];
  const window = loadApp(
    {
      [STORAGE_KEY]: current,
      [`${BACKUP_PREFIX}1000`]: raw,
    },
    {
      carnetDesktop: {
        saveJson: (content) => {
          saved.push(content);
          return Promise.resolve({ canceled: false, saved: true });
        },
      },
    }
  );
  openSettings(window);
  window.document.querySelector("#backup-list .setting-row .backup-download").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(saved, [raw], "le contenu exporté doit être identique au brut sauvegardé");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), current, "la bibliothèque actuelle ne doit pas être modifiée");
  assert.equal(window.localStorage.getItem(`${BACKUP_PREFIX}1000`), raw, "la copie de secours ne doit pas être modifiée");
});

test("télécharger une copie illisible exporte aussi son contenu brut", async () => {
  const raw = '[{"id":"s-1","title":"Perdu"';
  const current = JSON.stringify([{ id: "s-1", title: "Actuelle", body: "" }]);
  const saved = [];
  const window = loadApp(
    {
      [STORAGE_KEY]: current,
      [`${BACKUP_PREFIX}2000`]: raw,
    },
    {
      carnetDesktop: {
        saveJson: (content) => {
          saved.push(content);
          return Promise.resolve({ canceled: false, saved: true });
        },
      },
    }
  );
  openSettings(window);
  window.document.querySelector("#backup-list .setting-row .backup-download").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(saved, [raw]);
  assert.equal(window.localStorage.getItem(STORAGE_KEY), current);
});

test("sans carnetDesktop, le téléchargement utilise le repli blob avec le contenu brut", async () => {
  const raw = JSON.stringify([{ id: "s-2", title: "Secours", body: "" }]);
  const current = JSON.stringify([{ id: "s-1", title: "Actuelle", body: "" }]);
  const blobs = [];
  const window = loadApp(
    {
      [STORAGE_KEY]: current,
      [`${BACKUP_PREFIX}3000`]: raw,
    },
    {
      createObjectURL: (blob) => {
        blobs.push(blob);
        return "blob:copie-secours";
      },
    }
  );
  const anchors = [];
  const originalAppend = window.document.body.appendChild.bind(window.document.body);
  window.document.body.appendChild = function (node) {
    anchors.push(node);
    return originalAppend(node);
  };
  window.HTMLAnchorElement.prototype.click = function () {};
  openSettings(window);
  window.document.querySelector("#backup-list .setting-row .backup-download").click();
  assert.equal(blobs.length, 1);
  assert.equal(anchors.length, 1, "un lien de téléchargement dédié doit être créé");
  assert.equal(anchors[0].download, "cantoria-copie-secours-3000.json");
  assert.equal(anchors[0].href, "blob:copie-secours");
  const text = await blobs[0].text();
  assert.equal(text, raw, "le blob doit contenir le brut sauvegardé");
  assert.equal(window.localStorage.getItem(STORAGE_KEY), current, "la bibliothèque actuelle ne doit pas être modifiée");
});

test("télécharger ne modifie ni la bibliothèque ni les copies de secours", async () => {
  const raw = JSON.stringify([{ id: "s-2", title: "Secours", body: "" }]);
  const current = JSON.stringify([{ id: "s-1", title: "Actuelle", body: "" }]);
  const window = loadApp(
    {
      [STORAGE_KEY]: current,
      [`${BACKUP_PREFIX}1000`]: raw,
    },
    {
      carnetDesktop: {
        saveJson: () => Promise.resolve({ canceled: false, saved: true }),
      },
    }
  );
  openSettings(window);
  window.document.querySelector("#backup-list .setting-row .backup-download").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(window.localStorage.getItem(STORAGE_KEY), current);
  assert.equal(window.localStorage.getItem(`${BACKUP_PREFIX}1000`), raw);
  assert.equal(window.localStorage.length, 2, "aucune clé ne doit être ajoutée ni supprimée");
});
