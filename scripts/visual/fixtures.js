/*
 * Données fixes des captures : mêmes chansons, mêmes identifiants, mêmes dates à chaque exécution,
 * pour que deux captures ne diffèrent que si l'interface a changé.
 */
const SONGS_KEY = "cantoria-songs-v1";
const SETTINGS_KEY = "cantoria-settings";
const THEME_KEY = "cantoria-theme";
const THEMES = ["spotlight", "guitar-case", "campfire", "vibe"];

const T0 = 1700000000000;

const SONGS = [
  {
    id: "fx-1", title: "Le chemin du retour", artist: "Démo", key: "G", capo: "2",
    favori: true, addedAt: T0, lastOpenedAt: T0 + 1000, speed: 1,
    body: [
      "[Intro] [G] [D] [Em] [C]",
      "",
      "[G]Sur le chemin du [D]retour",
      "Le [Em]vent chante sa [C]chanson",
      "[G]Je marche sans [D]détour",
      "Vers [C]toi, vers la [G]maison",
      "",
      "[Refrain]",
      "[C]Oh, ramène-moi [G]là-bas",
      "[Am]Où les étoiles [D]sont si proches",
      "[C]Oh, ramène-moi [G]là-bas",
      "[Am]Je n'ai plus rien [D7]à craindre",
    ].join("\n"),
  },
  {
    id: "fx-2", title: "Ballade de minuit", artist: "Démo", key: "Am", capo: "",
    favori: false, addedAt: T0 + 10, lastOpenedAt: null, speed: 0.75,
    body: ["[Am]Minuit sonne à la [F]porte", "[C]Je ne dors [G]pas", "[Am]Les ombres [F]dansent encore", "[E7]Autour de [Am]moi"].join("\n"),
  },
  {
    id: "fx-3", title: "Un titre particulièrement long pour vérifier la troncature des cartes de la bibliothèque", artist: "Un artiste au nom très long également",
    key: "D", capo: "4", favori: false, addedAt: T0 + 20, lastOpenedAt: null, speed: 1,
    body: ["[D]La la [A]la", "[Bm]La la [G]la"].join("\n"),
  },
];

function seedEntries(theme) {
  return {
    [SONGS_KEY]: JSON.stringify(SONGS),
    [SETTINGS_KEY]: JSON.stringify({
      spotlight: true, defaultFontScale: 1, defaultCountdown: 0, cardTextScale: 1,
      // controlsPinned/controlsCompactMobile : répliquer les DÉFAUTS de
      // l'app (issue #64) — sinon l'assign dans loadSettings écrase les
      // valeurs par défaut par undefined et la baseline capture un état
      // irréaliste (rangée secondaire dépliée sur mobile).
      controlsPinned: true, controlsCompactMobile: true, chordsVisible: true,
      chordDiagrams: "song", lyricsAlign: "center",
      cardFields: { key: true, capo: true, chords: true, speed: true },
    }),
    [THEME_KEY]: theme,
  };
}

// Élément qui prouve que l'application est prête (attendu avant chaque scénario).
const READY_SELECTOR = "#library-view.active .song-card";

// Page chargée par le moteur « chromium » (le moteur « electron » passe par main.js).
const ENTRY_HTML = "cantoria.html";

module.exports = { ENTRY_HTML, READY_SELECTOR, SONGS, SONGS_KEY, SETTINGS_KEY, THEME_KEY, THEMES, seedEntries };
