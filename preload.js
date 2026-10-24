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
  openDocument: () => ipcRenderer.invoke("dialog:open-document"),
  saveJson: (content) => {
    if (typeof content !== "string") {
      return Promise.reject(new TypeError("Le contenu d'export doit être une chaîne."));
    }
    return ipcRenderer.invoke("dialog:save-json", content);
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
}));
