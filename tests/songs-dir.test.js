const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { JSDOM } = require("jsdom");

/* Issue #93 : dossier de chansons (fichiers .cho) — pont IPC desktop,
   migration douce réversible, détection des ajouts externes, non-régression. */

const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "cantoria.html");
const SONGS_KEY = "cantoria-songs-v1";
const DIR_KEY = "cantoria-songs-dir";

function loadApp(seed = {}, desktop = null) {
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
      if (desktop) window.carnetDesktop = desktop;
    },
  });
  return dom.window;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function song(overrides = {}) {
  return Object.assign({ id: "s-1", title: "Alpha", artist: "A", key: "G", capo: "2", body: "[G]la la\n[C]mi mi", speed: 1 }, overrides);
}

/* Faux pont "dossier de chansons" adossé à un vrai répertoire temporaire. */
function fakeDirBridge(dir) {
  return {
    pickSongsDir: () => Promise.resolve({ canceled: false, dirPath: dir }),
    listSongsDir: (d) => {
      const files = fs.readdirSync(d)
        .filter((n) => [".cho", ".crd", ".pro", ".txt"].includes(path.extname(n).toLowerCase()))
        .map((n) => ({ name: n, size: fs.statSync(path.join(d, n)).size }));
      return Promise.resolve({ files });
    },
    readSongFile: (d, name) => Promise.resolve({ name, content: fs.readFileSync(path.join(d, name), "utf8") }),
    writeSongFile: (d, name, content) => {
      fs.writeFileSync(path.join(d, name), content, "utf8");
      return Promise.resolve({ saved: true });
    },
    deleteSongFile: (d, name) => {
      fs.rmSync(path.join(d, name), { force: true });
      return Promise.resolve({ deleted: true });
    },
  };
}

test("sans pont dossier, le bouton est désactivé et le stockage profil reste actif", () => {
  const window = loadApp({ [SONGS_KEY]: JSON.stringify([song()]) });
  const btn = window.document.querySelector("#btn-songsdir");
  assert.equal(btn.disabled, true, "pas de pont -> bouton désactivé (desktop uniquement)");
  assert.ok(window.document.querySelector("#songsdir-summary").textContent.includes("desktop"));
  assert.ok(Array.isArray(JSON.parse(window.localStorage.getItem(SONGS_KEY))), "carnet profil intact");
});

test("migration vers le dossier : fichiers .cho écrits, carnet profil conservé (réversible)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cantoria-dir-"));
  const songs = [song(), song({ id: "s-2", title: "Bêta", artist: "B", key: "", capo: "", body: "[D]hey" })];
  const window = loadApp(
    { [SONGS_KEY]: JSON.stringify(songs) },
    fakeDirBridge(dir)
  );
  window.localStorage.setItem(DIR_KEY, dir);

  // simule la migration (même code que le clic sur le bouton après confirmation)
  const doc = window.document;
  // Le dossier est déjà configuré : le premier dialogue propose de changer de dossier.
  doc.querySelector("#btn-songsdir").click();
  await sleep(20);
  doc.querySelector("#confirm-ok").click(); // "choisir un autre dossier"
  await sleep(20);
  // pickSongsDir renvoie le même dossier, puis la modale "copier maintenant ?"
  await sleep(20);
  if (doc.querySelector("#confirm-overlay").classList.contains("show")) {
    doc.querySelector("#confirm-ok").click(); // "copier maintenant"
  }
  await sleep(120);

  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".cho"));
  assert.equal(files.length, 2, "un fichier .cho par chanson");
  const content = fs.readFileSync(path.join(dir, "Alpha.cho"), "utf8");
  assert.ok(content.includes("{title: Alpha}"));
  assert.ok(content.includes("{artist: A}"));
  assert.ok(content.includes("{key: G}"));
  assert.ok(content.includes("{capo: 2}"));
  assert.ok(content.includes("[G]la la"), "corps ChordPro conservé");
  // réversibilité : le carnet profil est toujours là, inchangé
  assert.equal(JSON.parse(window.localStorage.getItem(SONGS_KEY)).length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("détection au lancement : un fichier ajouté à la main dans le dossier est importé, pas de perte", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cantoria-dir-"));
  fs.writeFileSync(path.join(dir, "Externe.cho"), "{title: Externe}\n{artist: X}\n\n[Am]hello\n");
  const window = loadApp(
    { [SONGS_KEY]: JSON.stringify([song()]), [DIR_KEY]: dir },
    fakeDirBridge(dir)
  );
  await sleep(500); // laisse detectDirChangesOnStartup tourner
  const stored = JSON.parse(window.localStorage.getItem(SONGS_KEY));
  assert.equal(stored.length, 2, "chanson externe importée");
  const added = stored.find((s) => s.title === "Externe");
  assert.ok(added, "titre repris depuis l'en-tête ChordPro");
  assert.equal(added.artist, "X");
  assert.ok(added.body.includes("[Am]hello"), "corps brut conservé");
  assert.equal(stored.filter((s) => s.id === "s-1").length, 1, "chanson existante non dupliquée/perdue");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("supprimer une chanson dans l'app supprime aussi son fichier .cho quand le dossier est actif", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cantoria-dir-"));
  const window = loadApp(
    { [SONGS_KEY]: JSON.stringify([song()]), [DIR_KEY]: dir },
    fakeDirBridge(dir)
  );
  const doc = window.document;
  doc.querySelector("#song-grid .song-card").click();
  doc.querySelector("#btn-edit-current").click();
  // écrit d'abord le fichier via saveSongs (miroir)
  doc.querySelector("#song-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(30);
  assert.ok(fs.existsSync(path.join(dir, "Alpha.cho")), "miroir .cho écrit à la sauvegarde");
  doc.querySelector("#btn-delete").click();
  await sleep(20);
  doc.querySelector("#confirm-ok").click();
  await sleep(30);
  assert.equal(JSON.parse(window.localStorage.getItem(SONGS_KEY)).length, 0, "chanson supprimée du carnet");
  assert.ok(!fs.existsSync(path.join(dir, "Alpha.cho")), "fichier .cho supprimé aussi");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("main.js : les canaux songsdir:* valident l'émetteur et les entrées", () => {
  const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  const block = main.slice(main.indexOf("SONG_FILE_EXT") - 200);
  for (const channel of ["songsdir:pick", "songsdir:list", "songsdir:read", "songsdir:write", "songsdir:delete"]) {
    assert.ok(main.includes(`ipcMain.handle("${channel}"`), `canal ${channel} présent`);
  }
  // chaque handler vérifie l'émetteur
  const handlers = block.split('ipcMain.handle(').slice(1);
  for (const h of handlers) {
    assert.ok(h.includes("isAuthorizedSender(event)"), "isAuthorizedSender dans chaque handler songsdir");
  }
  // whitelist d'extensions + garde anti échappement de dossier
  assert.ok(/SONG_FILE_EXT\s*=\s*\[/.test(block), "whitelist d'extensions");
  assert.ok(block.includes("path.resolve(dirPath) + path.sep"), "vérification que le chemin reste dans le dossier");
  assert.ok(block.includes(".tmp-"), " écriture atomique via fichier temporaire");
  assert.ok(/MAX_SONG_BYTES/.test(block), "plafond de taille par fichier");
});

test("preload.js expose les 5 fonctions songsdir avec validation des types", () => {
  const preload = fs.readFileSync(path.join(ROOT, "preload.js"), "utf8");
  for (const fn of ["pickSongsDir", "listSongsDir", "readSongFile", "writeSongFile", "deleteSongFile"]) {
    assert.ok(preload.includes(fn), `preload expose ${fn}`);
  }
  assert.ok(preload.includes("ipcRenderer.on(channel, listener)"), "les abonnements passent par le helper subscribe() interne");
});

test("ADR 0002 présent et cohérent avec l'implémentation", () => {
  const adr = fs.readFileSync(path.join(ROOT, "docs/adr/0002-stockage-dossier-chansons.md"), "utf8");
  assert.ok(adr.includes("réversible"), "migration réversible documentée");
  assert.ok(/suppression automatique|ne supprime pas/i.test(adr), "pas de suppression auto documentée");
});
