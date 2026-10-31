const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const e = require("../scripts/visual/explorer.js");

const ROOT = path.join(__dirname, "..");
const GOALS_PATH = path.join(ROOT, "scripts/visual/explorer-goals.json");

/* Issue #76 : explorateur IA — buts validés, parsing d'action, menu fermé. */

test("explorer-goals.json : buts validés par le superviseur", () => {
  const raw = JSON.parse(fs.readFileSync(GOALS_PATH, "utf8"));
  assert.ok(/VALIDÉS? PAR LE SUPERVISEUR/.test(raw._note), "en-tête superviseur");
  assert.ok(raw.goals.length >= 2, "plusieurs parcours d'exploration");
  for (const g of raw.goals) {
    assert.equal(typeof g, "string");
    assert.ok(g.length > 40, "but suffisamment décrit");
  }
});

test("loadGoals : fichier présent -> buts ; absent -> défaut sûr", () => {
  const goals = e.loadGoals();
  assert.ok(goals.length >= 2);
  // chemin inexistant : défaut sans crash
  const saved = process.env.EXPLORER_GOALS;
  process.env.EXPLORER_GOALS = path.join(ROOT, "inexistant.json");
  const fallback = e.loadGoals();
  process.env.EXPLORER_GOALS = saved;
  assert.equal(fallback.length, 1, "défaut sûr si fichier absent");
});

test("parseAction : JSON valide -> action ; menu fermé (action inconnue rejetée)", () => {
  const ok = e.parseAction('{"action":"click","args":"#btn-new","observation":"je vois la bibliothèque"}');
  assert.equal(ok.action, "click");
  assert.equal(ok.args, "#btn-new");
  // action hors menu : rejetée (jamais d'action arbitraire)
  const bad = e.parseAction('{"action":"rm -rf /","args":""}');
  assert.equal(bad, null, "action hors menu fermé = rejet");
  // texte non JSON : rejet
  assert.equal(e.parseAction("voilà ce que je ferais"), null);
  // JSON dans bloc de code : accepté
  const fenced = e.parseAction('```json\n{"action":"done","args":"fini"}\n```');
  assert.equal(fenced.action, "done");
});

test("buildTurnMessages : but + historique + capture, une seule image", () => {
  const msgs = e.buildTurnMessages({ goal: "créer une chanson", history: ["click « Bibliothèque »"], screenshot: Buffer.from("png"), step: 3 });
  assert.ok(msgs[0].role === "system" && /testeur/i.test(msgs[0].content));
  assert.ok(msgs[1].content[0].text.includes("créer une chanson"));
  assert.ok(msgs[1].content[0].text.includes("Étape 3"));
  assert.ok(msgs[1].content[0].text.includes("click « Bibliothèque »"));
  assert.equal(msgs[1].content.filter((p) => p.type === "image_url").length, 1, "une capture par tour");
});

test("applyAction : les notes sont consignées, done arrête, actions fermées", async () => {
  const notes = [];
  const fakePage = {
    click: async () => {}, fill: async () => {}, keyboard: { press: async () => {} },
    mouse: { wheel: async () => {} }, goBack: async () => {}, waitForTimeout: async () => {},
  };
  const note = await e.applyAction(fakePage, { action: "note", args: "", observation: "menu confus" }, notes);
  assert.match(note, /noté/);
  assert.equal(notes[0], "menu confus");
  const done = await e.applyAction(fakePage, { action: "done", args: "" }, notes);
  assert.equal(done, null, "done = arrêt");
});

test("callChat : fetchImpl optionnel (défaut fetch natif) — régression du run du 01/11", async () => {
  // Le bug : callChat exigeait fetchImpl -> ReferenceError au premier appel de
  // la boucle, exploration morte à l'étape 0 (« 0 étapes, 1 appel »).
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /callChat\(\{ messages, fetchImpl = fetch \}\)/,
    "défaut fetch natif si non injecté");
  // la boucle n'appelle plus avec un fetchImpl indéfini
  assert.ok(!/callChat\(\{ messages: buildTurnMessages[\s\S]*?fetchImpl \}\)/.test(src),
    "la boucle ne passe plus de fetchImpl indéfini");
});

/* Leçons du premier rapport réel (01/11) : carnet vide = but impossible +
boucle de notes identiques. L'explorateur doit seeder un carnet vivant et
couper court aux boucles. */
test("l'explorateur sème un carnet vivant (fixtures) avant exploration", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /seedEntries/, "seed via les fixtures de la boucle visuelle");
  assert.match(src, /addInitScript/, "seed posé AVANT le premier chargement");
});

test("anti-boucle : trois observations identiques arrêtent l'exploration", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /anti-boucle/, "garde anti-boucle présente");
  assert.match(src, /prevObs1 === prevObs2|lastObs === prevObs1 && lastObs === prevObs2/,
    "détection de répétition d'observations");
});

/* Leçon du 2e rapport : les clics timeoutaient sur des libellés devinés
   (« Bouton 'Nouvelle chanson' » au lieu de « ＋ Nouvelle chanson »).
   Le modèle doit recevoir la liste RÉELLE des éléments visibles à chaque tour. */
test("chaque tour inclut la liste réelle des éléments interactifs visibles", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /visibleTargets/, "extraction des cibles visibles");
  assert.match(src, /Éléments interactifs visibles/, "la liste est dans le prompt");
  assert.match(src, /TEXTE EXACT/, "règle : texte exact, jamais reformulé");
  const msgs = e.buildTurnMessages({ goal: "g", history: [], screenshot: Buffer.from("x"), step: 1,
    targets: [{ text: "＋ Nouvelle chanson", sel: "#btn-new" }] });
  assert.ok(msgs[1].content[0].text.includes("＋ Nouvelle chanson"),
    "le libellé exact apparaît dans le prompt");
  assert.ok(msgs[1].content[0].text.includes("#btn-new"), "le sélecteur est fourni");
});

test("visibleTargets : borne le nombre de cibles (prompt compact)", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /out\.length >= 25/, "25 cibles maximum par tour");
});

/* Leçon du 3e rapport : #btn-editor-back ouvre une confirmation native
   (uiConfirm) — l'agent timeoutait derrière un dialog jamais vu. */
test("les dialogs natifs sont acceptés et consignés (leçon run 3)", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /page\.on\("dialog"/, "écoute des dialogs natifs");
  assert.match(src, /d\.accept\(\)/, "acceptés automatiquement (l'utilisateur confirme)");
  assert.match(src, /\[dialog:/, "consignés dans l'historique");
});

/* Leçon du run 5 : les chansons de la bibliothèque sont des .song-card,
   pas des boutons — le clic sur le titre seul timeoutait. Les cartes
   doivent apparaître dans les cibles et se cliquer via leur classe. */
test("les cartes de chansons sont des cibles cliquables (leçon run 5)", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /\.song-card/, "les cartes sont extraites");
  assert.match(src, /hasText: a/, "le clic sur une carte utilise son texte via .song-card");
  assert.match(src, /card: true/, "les cartes sont marquées dans la liste des cibles");
});

/* Leçons du run 6 : (a) les boutons icônes ont un aria-label, pas de texte —
   "Basculer favori" était invisible pour getByText ; (b) une modale ouverte
   couvre le reste de l'écran : l'agent cliquait #btn-settings-open DERRIÈRE
   l'overlay ; (c) les swatches de thème (boutons couleur sans texte)
   doivent être exposés par data-theme. */
test("aria-label/title comme texte de cible + swatches par data-theme", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /aria-label/, "aria-label utilisé comme texte");
  assert.match(src, /\.swatch\[data-theme=/, "swatches exposés par data-theme");
});

test("modale ouverte : les cibles se limitent à son contenu + avertissement", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /modal-overlay\.show/, "détection de modale ouverte");
  assert.match(src, /Une fenêtre modale est ouverte/, "avertissement dans le prompt");
  assert.match(src, /scope\.querySelectorAll/, "cibles limitées au scope de la modale");
});

/* Leçon du run 7 : #btn-save est sous le fold du formulaire éditeur
   (overflow-y: auto) — invisible dans le viewport portrait, l'agent
   ne savait pas l'atteindre. */
test("cibles hors écran exposées + scroll vers une cible nommée (run 7)", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/visual/explorer.js"), "utf8");
  assert.match(src, /offscreen/, "les cibles hors écran sont marquées, pas masquées");
  assert.match(src, /hors écran : fais défiler/, "le prompt indique comment les atteindre");
  assert.match(src, /scrollIntoViewIfNeeded/, "scroll vers une cible nommée");
});

/* Leçon du run 8 : la branche act.target.card n'était jamais prise —
   parseAction ne remplissait pas act.target. La cible est désormais
   résolue côté orchestrateur contre la liste réelle du tour. */
test("resolveTarget : l'args du modèle retrouve la cible réelle (carte, swatch)", () => {
  const targets = [
    { text: "＋ Nouvelle chanson", sel: "#btn-new" },
    { text: "Ballade de minuit", card: true },
    { text: "Thème Vibe", sel: '.swatch[data-theme="vibe"]' },
  ];
  // carte par titre exact
  const card = e.resolveTarget({ args: "Ballade de minuit" }, targets);
  assert.ok(card && card.card, "la carte est résolue");
  // par préfixe (le modèle tronque parfois)
  const pref = e.resolveTarget({ args: "Ballade de minuit (reprise)" }, targets);
  assert.ok(pref && pref.card, "résolution par préfixe");
  // bouton par texte
  const btn = e.resolveTarget({ args: "＋ Nouvelle chanson" }, targets);
  assert.equal(btn.sel, "#btn-new");
  // inconnu : null (retombera sur getByText)
  assert.equal(e.resolveTarget({ args: "n'importe quoi" }, targets), null);
});
