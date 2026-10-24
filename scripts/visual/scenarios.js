/*
 * Scénarios de capture. Chacun part d'une page fraîche (bibliothèque fixe) et agit comme un
 * utilisateur : clics sur de vrais éléments, jamais d'appel direct aux fonctions de l'application.
 * `scope` indique si les contrôles « scène » (lecture à distance) s'appliquent.
 */
const scenarios = [
  {
    name: "library",
    description: "Bibliothèque avec trois chansons (dont un titre très long)",
    scope: "chrome",
    async run(page) { await page.waitForSelector(".song-card"); },
  },
  {
    name: "editor",
    description: "Éditeur d'une nouvelle chanson",
    scope: "chrome",
    async run(page) {
      await page.click("#btn-new");
      await page.waitForSelector("#editor-view.active");
    },
  },
  {
    name: "player",
    description: "Lecteur en pause sur la première chanson, taille de texte par défaut",
    scope: "stage",
    async run(page) {
      await page.locator(".song-card", { hasText: "Le chemin du retour" }).click();
      await page.waitForSelector("#player-view.active #stage-inner .line");
    },
  },
  {
    name: "settings",
    description: "Fenêtre des paramètres",
    scope: "chrome",
    root: "#settings-overlay", // seul le contenu de la fenêtre est contrôlé (le reste est derrière)
    async run(page) {
      await page.click("#btn-settings-open");
      await page.waitForSelector("#settings-overlay.show");
    },
  },
];

module.exports = { scenarios };
