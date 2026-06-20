'use strict';

// Opt-in updater. Privacy scope: this NEVER checks on its own — the only network
// call happens when the user clicks "Check for updates" in Settings, which calls
// the `update-check` IPC. Updates are read from the app's public GitHub Releases
// feed (no token is bundled; the publish token is used only at upload time).

const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

function setupUpdater(getWindow) {
  // User drives every step: check → accept download → restart to install.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const send = (state) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update-status', state);
  };

  autoUpdater.on('update-available',     (i) => send({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', ()  => send({ state: 'none' }));
  autoUpdater.on('download-progress',    (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded',    (i) => send({ state: 'downloaded', version: i.version }));
  autoUpdater.on('error',                (e) => send({ state: 'error', message: e?.message ?? String(e) }));

  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('update-check', async () => {
    // autoUpdater throws in dev (app is not packaged) — report it as a state
    // instead of letting the check fail silently.
    if (!app.isPackaged) return { state: 'dev' };
    try {
      await autoUpdater.checkForUpdates();
      return { state: 'checking' };
    } catch (err) {
      return { state: 'error', message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('update-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      send({ state: 'error', message: err?.message ?? String(err) });
      return { ok: false };
    }
  });

  // Quits the app and installs the downloaded update. main.js's `before-quit`
  // sets isQuitting so the window's close-to-tray handler lets the quit through.
  ipcMain.handle('update-install', () => autoUpdater.quitAndInstall());
}

module.exports = { setupUpdater };
