const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { autoUpdater } = require("electron-updater");

const APP_NAME = "Carnet de Chant";
const UPDATE_CONFIG_FILE = path.join(__dirname, "update-config.json");
const UPDATE_CHECK_MIN_INTERVAL = 60 * 60 * 1000;

let mainWindow = null;
let updateTimer = null;
let updateCheckRunning = false;
let updateListenersRegistered = false;

async function readUpdateConfig() {
  try {
    const raw = await fs.readFile(UPDATE_CONFIG_FILE, "utf8");
    const cfg = JSON.parse(raw);
    return {
      enabled: cfg.enabled !== false,
      checkIntervalMs: Number.isFinite(cfg.checkIntervalMs)
        ? Math.max(UPDATE_CHECK_MIN_INTERVAL, cfg.checkIntervalMs)
        : 4 * 60 * 60 * 1000,
      autoDownload: cfg.autoDownload !== false,
    };
  } catch {
    return {
      enabled: true,
      checkIntervalMs: 4 * 60 * 60 * 1000,
      autoDownload: true,
    };
  }
}

function sendUpdateEvent(channel, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(`update:${channel}`, payload);
}

function registerAutoUpdaterListeners() {
  if (updateListenersRegistered) return;
  updateListenersRegistered = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateEvent("checking");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateEvent("available", {
      version: typeof info?.version === "string" ? info.version : "",
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    sendUpdateEvent("not-available", {
      version: typeof info?.version === "string" ? info.version : "",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateEvent("progress", {
      percent: Number.isFinite(progress?.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0,
      bytesPerSecond: Number.isFinite(progress?.bytesPerSecond) ? progress.bytesPerSecond : 0,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateEvent("downloaded", {
      version: typeof info?.version === "string" ? info.version : "",
    });
  });

  autoUpdater.on("update-cancelled", (info) => {
    sendUpdateEvent("cancelled", {
      version: typeof info?.version === "string" ? info.version : "",
    });
  });

  autoUpdater.on("error", (error) => {
    console.error("Mise à jour automatique :", error?.message || error);
    sendUpdateEvent("error", {
      message: error?.message || "Erreur de mise à jour.",
    });
  });
}

async function checkForUpdatesNow() {
  if (!app.isPackaged || updateCheckRunning) return null;

  const cfg = await readUpdateConfig();
  if (!cfg.enabled) return null;

  updateCheckRunning = true;
  try {
    return await autoUpdater.checkForUpdates();
  } finally {
    updateCheckRunning = false;
  }
}

async function configureAutoUpdater() {
  if (!app.isPackaged) return;

  const cfg = await readUpdateConfig();
  if (!cfg.enabled) return;

  registerAutoUpdaterListeners();

  autoUpdater.autoDownload = cfg.autoDownload;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.fullChangelog = true;

  try {
    await checkForUpdatesNow();

    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(() => {
      checkForUpdatesNow().catch((error) => {
        console.error("Vérification de mise à jour :", error?.message || error);
      });
    }, cfg.checkIntervalMs);
  } catch (error) {
    console.error("Configuration de la mise à jour impossible :", error?.message || error);
  }
}

function isAuthorizedSender(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 620,
    show: false,
    title: APP_NAME,
    icon: process.platform === "win32"
      ? path.join(__dirname, "assets", "icon.ico")
      : path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#17120f",
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    configureAutoUpdater();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, "carnet-de-chant-v4.html"));
}

function registerIpc() {
  ipcMain.handle("dialog:open-document", async (event) => {
    if (!isAuthorizedSender(event)) throw new Error("Renderer non autorisé.");

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Importer dans Carnet de Chant",
      properties: ["openFile"],
      filters: [
        {
          name: "Chansons",
          extensions: ["json", "txt", "chordpro", "cho", "crd", "pro"],
        },
        { name: "Tous les fichiers", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePaths.length) return { canceled: true };

    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
    if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) {
      throw new Error("Fichier trop volumineux ou invalide.");
    }

    const content = await fs.readFile(filePath, "utf8");
    return { canceled: false, fileName: path.basename(filePath), content };
  });

  ipcMain.handle("dialog:save-json", async (event, content) => {
    if (!isAuthorizedSender(event)) throw new Error("Renderer non autorisé.");

    if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > 20 * 1024 * 1024) {
      throw new Error("Contenu d'export invalide ou trop volumineux.");
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter le carnet",
      defaultPath: path.join(app.getPath("documents"), "carnet-de-chant.json"),
      filters: [{ name: "Carnet de Chant (JSON)", extensions: ["json"] }],
    });

    if (result.canceled || !result.filePath) return { canceled: true };

    await fs.writeFile(result.filePath, content, { encoding: "utf8", mode: 0o600 });
    return { canceled: false, saved: true };
  });

  ipcMain.handle("app:version", (event) => {
    if (!isAuthorizedSender(event)) throw new Error("Renderer non autorisé.");
    return app.getVersion();
  });

  ipcMain.handle("update:check", async (event) => {
    if (!isAuthorizedSender(event)) throw new Error("Renderer non autorisé.");
    if (!app.isPackaged) return { supported: false, reason: "development" };

    try {
      await checkForUpdatesNow();
      return { supported: true };
    } catch (error) {
      console.error("Vérification manuelle de mise à jour :", error?.message || error);
      return { supported: true, error: error?.message || "Erreur de vérification." };
    }
  });

  ipcMain.handle("update:install", (event) => {
    if (!isAuthorizedSender(event)) throw new Error("Renderer non autorisé.");
    if (!app.isPackaged) return { installed: false, reason: "development" };

    autoUpdater.quitAndInstall({
      isSilent: false,
      isForceRunAfter: true,
    });
    return { installed: true };
  });
}

app.name = APP_NAME;
app.setAppUserModelId("fr.carnetdechant.app");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });

    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    if (updateTimer) clearInterval(updateTimer);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
