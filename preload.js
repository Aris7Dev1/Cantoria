const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") {
    throw new TypeError("Le callback doit être une fonction.");
  }

  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);

  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("carnetDesktop", Object.freeze({
  platform: process.platform,
  isElectron: true,
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  setZoomFactor: (factor) => ipcRenderer.invoke("zoom:set", factor),
  getZoomFactor: () => ipcRenderer.invoke("zoom:get"),
  onZoomChanged: (callback) => subscribe("zoom:changed", callback),
  openDocument: () => ipcRenderer.invoke("dialog:open-document"),
  saveJson: (content) => {
    if (typeof content !== "string") {
      return Promise.reject(new TypeError("Le contenu d'export doit être une chaîne."));
    }
    return ipcRenderer.invoke("dialog:save-json", content);
  },
  writeDailyBackup: (content) => {
    if (typeof content !== "string") {
      return Promise.reject(new TypeError("Le contenu de sauvegarde doit \u00eatre une cha\u00eene."));
    }
    return ipcRenderer.invoke("backup:write-daily", content);
  },
  setScrolling: (scrolling) => {
    if (typeof scrolling !== "boolean") {
      return Promise.reject(new TypeError("L'\u00e9tat de d\u00e9filement doit \u00eatre un bool\u00e9en."));
    }
    return ipcRenderer.invoke("scrolling:set", scrolling);
  },
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateChecking: (callback) => subscribe("update:checking", callback),
  onUpdateAvailable: (callback) => subscribe("update:available", callback),
  onUpdateProgress: (callback) => subscribe("update:progress", callback),
  onUpdateDownloaded: (callback) => subscribe("update:downloaded", callback),
  onUpdateNotAvailable: (callback) => subscribe("update:not-available", callback),
  onUpdateCancelled: (callback) => subscribe("update:cancelled", callback),
  onUpdateError: (callback) => subscribe("update:error", callback),
  // Dossier de chansons (issue #93) : stockage optionnel en fichiers ChordPro.
  pickSongsDir: () => ipcRenderer.invoke("songsdir:pick"),
  listSongsDir: (dirPath) => {
    if (typeof dirPath !== "string" || !dirPath) {
      return Promise.reject(new TypeError("Le chemin du dossier doit être une chaîne non vide."));
    }
    return ipcRenderer.invoke("songsdir:list", dirPath);
  },
  readSongFile: (dirPath, name) => {
    if (typeof dirPath !== "string" || !dirPath || typeof name !== "string" || !name) {
      return Promise.reject(new TypeError("Chemin et nom de fichier requis."));
    }
    return ipcRenderer.invoke("songsdir:read", dirPath, name);
  },
  writeSongFile: (dirPath, name, content) => {
    if (typeof dirPath !== "string" || !dirPath || typeof name !== "string" || !name) {
      return Promise.reject(new TypeError("Chemin et nom de fichier requis."));
    }
    if (typeof content !== "string") {
      return Promise.reject(new TypeError("Le contenu doit être une chaîne."));
    }
    return ipcRenderer.invoke("songsdir:write", dirPath, name, content);
  },
  deleteSongFile: (dirPath, name) => {
    if (typeof dirPath !== "string" || !dirPath || typeof name !== "string" || !name) {
      return Promise.reject(new TypeError("Chemin et nom de fichier requis."));
    }
    return ipcRenderer.invoke("songsdir:delete", dirPath, name);
  },
}));
