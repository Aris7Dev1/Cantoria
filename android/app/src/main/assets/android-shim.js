// Shim Android — adapte window.cantoriaAndroid (pont natif) au contrat
// window.carnetDesktop attendu par cantoria.html (celui de preload.js desktop).
// Chargé par la WebView avant la page ; cantoria.html reste SANS MODIFICATION.
(function () {
  "use strict";
  var native = window.cantoriaAndroid;
  if (!native) return;

  // Import asynchrone (SAF) : openDocument déclenche le sélecteur, l'interface
  // appelle openDocument() qui doit résoudre {canceled, content, fileName}.
  // Le pont natif propose takeOpenedDocument() ; on poll tant que "pending".
  function openDocument() {
    native.openDocument();
    return new Promise(function (resolve) {
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        var raw = null;
        try { raw = native.takeOpenedDocument(); } catch (e) { raw = "null"; }
        if (raw !== "pending") {
          clearInterval(timer);
          try {
            var result = JSON.parse(raw);
            resolve(result || { canceled: true });
          } catch (e) {
            resolve({ canceled: true });
          }
        } else if (tries > 1200) { // ~2 min de sélecteur ouvert au maximum
          clearInterval(timer);
          resolve({ canceled: true });
        }
      }, 100);
    });
  }

  var listeners = { available: [], progress: [], downloaded: [], error: [] };

  // Le natif (MainActivity) diffuse un CustomEvent quand une mise à jour
  // GitHub Releases plus récente est trouvée — on traduit vers les
  // callbacks carnetDesktop.onUpdateAvailable (contrat desktop).
  //
  // Canal sideload (décision post-1.6.0) : PAS de téléchargement in-app.
  // Play Protect et les signatures divergentes (keystore CI vs debug local)
  // rendaient l'installation par-dessus peu fiable ; le bandeau annonce la
  // version et l'interface propose un lien de téléchargement vers GitHub
  // Releases (navigateur), l'utilisateur réinstalle ensuite lui-même.
  window.addEventListener("android-update-available", function (e) {
    var detail = (e && e.detail) || {};
    listeners.available.forEach(function (cb) {
      try { cb({ version: detail.version || "", apkUrl: detail.apkUrl || "" }); }
      catch (err) {}
    });
  });

  // Progression du téléchargement APK piloté par le natif (ApkDownloader).
  window.addEventListener("android-update-progress", function (e) {
    var percent = Number((e && e.detail && e.detail.percent) || 0);
    listeners.progress.forEach(function (cb) {
      try { cb({ percent: percent }); }
      catch (err) {}
    });
  });

  // APK complet : le bandeau passe en « Redémarrer » (onUpdateDownloaded).
  window.addEventListener("android-update-downloaded", function (e) {
    var version = (e && e.detail && e.detail.version) || "";
    listeners.downloaded.forEach(function (cb) {
      try { cb({ version: version }); }
      catch (err) {}
    });
  });

  // Échec du téléchargement : le bandeau est masqué, l'interface affiche un toast.
  window.addEventListener("android-update-error", function (e) {
    var message = (e && e.detail && e.detail.message) || "";
    listeners.error.forEach(function (cb) {
      try { cb({ message: message }); }
      catch (err) {}
    });
  });

  window.carnetDesktop = Object.freeze({
    platform: "android",
    isElectron: false,
    getAppVersion: function () { return Promise.resolve(native.getAppVersion()); },
    setZoomFactor: function () { return Promise.resolve(1); },
    getZoomFactor: function () { return Promise.resolve(1); },
    onZoomChanged: function () { return function () {}; },
    openDocument: openDocument,
    saveJson: function (content) {
      if (typeof content !== "string") {
        return Promise.reject(new TypeError("Le contenu d'export doit \u00eatre une cha\u00eene."));
      }
      return new Promise(function (resolve) {
        var ok = native.saveJson(content);
        resolve(ok ? { saved: true } : { canceled: true });
      });
    },
    saveLibrary: function (content) {
      if (typeof content !== "string") {
        return Promise.reject(new TypeError("Le carnet doit être une chaîne JSON."));
      }
      return new Promise(function (resolve) {
        resolve({ saved: native.saveLibrary(content) });
      });
    },
    loadLibrary: function () {
      return new Promise(function (resolve) {
        resolve(native.loadLibrary());
      });
    },
    writeDailyBackup: function (content) {
      if (typeof content !== "string") {
        return Promise.reject(new TypeError("Le contenu de sauvegarde doit \u00eatre une cha\u00eene."));
      }
      return Promise.resolve({ saved: native.writeDailyBackup(content) });
    },
    // Ouverture du lien de téléchargement dans le navigateur externe
    // (canal sideload) : validée côté natif (HTTPS + domaines GitHub).
    openExternal: function (url) {
      if (typeof url !== "string" || !url) {
        return Promise.reject(new TypeError("L'URL doit être une chaîne non vide."));
      }
      return new Promise(function (resolve) {
        var ok = false;
        try { ok = !!native.openExternal(url); } catch (err) { ok = false; }
        resolve(ok ? { opened: true } : { opened: false });
      });
    },
    setScrolling: function (scrolling) {
      if (typeof scrolling !== "boolean") {
        return Promise.reject(new TypeError("L'\u00e9tat de d\u00e9filement doit \u00eatre un bool\u00e9en."));
      }
      native.setScrolling(scrolling);
      return Promise.resolve({ blocked: scrolling });
    },
    checkForUpdates: function () {
      // La vérification est déclenchée au démarrage par le natif (issue #57).
      // L'interface peut la redemander : le natif expose un canal dédié.
      if (typeof native.checkNow === "function") {
        return Promise.resolve(native.checkNow());
      }
      return Promise.resolve({ supported: false, reason: "already-checked-at-startup" });
    },
    // Installation in-app retirée (canal sideload) : ce canal n'est plus
    // utilisé par l'interface, le contrat carnetDesktop reste complet pour
    // que cantoria.html fonctionne à l'identique sur les deux plateformes.
    installUpdate: function () { return Promise.resolve({ installed: false, reason: "sideload-link" }); },
    onUpdateChecking: function () { return function () {}; },
    onUpdateAvailable: function (callback) {
      listeners.available.push(callback);
      return function () {
        var i = listeners.available.indexOf(callback);
        if (i >= 0) listeners.available.splice(i, 1);
      };
    },
    onUpdateProgress: function (callback) {
      if (typeof callback !== "function") return function () {};
      listeners.progress.push(callback);
      return function () {
        var i = listeners.progress.indexOf(callback);
        if (i >= 0) listeners.progress.splice(i, 1);
      };
    },
    onUpdateDownloaded: function (callback) {
      if (typeof callback !== "function") return function () {};
      listeners.downloaded.push(callback);
      return function () {
        var i = listeners.downloaded.indexOf(callback);
        if (i >= 0) listeners.downloaded.splice(i, 1);
      };
    },
    onUpdateNotAvailable: function () { return function () {}; },
    onUpdateCancelled: function () { return function () {}; },
    onUpdateError: function (callback) {
      if (typeof callback !== "function") return function () {};
      listeners.error.push(callback);
      return function () {
        var i = listeners.error.indexOf(callback);
        if (i >= 0) listeners.error.splice(i, 1);
      };
    },
    /* Dossier de chansons (issue #93) : non disponible sur Android dans cette
       version (le stockage privé + SAF restent en place). Le contrat reste
       complet pour que cantoria.html se comporte à l'identique : les appels
       renvoient une promesse rejetée, jamais une erreur synchrone. */
    pickSongsDir: function () { return Promise.reject(new Error("Dossier de chansons disponible uniquement sur desktop")); },
    listSongsDir: function () { return Promise.reject(new Error("Dossier de chansons disponible uniquement sur desktop")); },
    readSongFile: function () { return Promise.reject(new Error("Dossier de chansons disponible uniquement sur desktop")); },
    writeSongFile: function () { return Promise.reject(new Error("Dossier de chansons disponible uniquement sur desktop")); },
    deleteSongFile: function () { return Promise.reject(new Error("Dossier de chansons disponible uniquement sur desktop")); }
  });
})();
