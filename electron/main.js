'use strict';

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { createOverlay } = require('./overlay');

const PORT = 3001;
const LAUNCH_TOKEN = crypto.randomBytes(32).toString('hex');

let mainWin = null;
let tray = null;
let serverProcess = null;

function startServer() {
  serverProcess = fork(path.join(__dirname, '..', 'server', 'index.js'), [], {
    env: { ...process.env, PORT: String(PORT), DEVCOST_TOKEN: LAUNCH_TOKEN },
    silent: false,
  });
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; connect-src http://127.0.0.1:3001; script-src 'self'; style-src 'self' 'unsafe-inline'",
        ],
      },
    });
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWin.loadURL('http://127.0.0.1:5173');
  } else {
    mainWin.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  // Minimize to tray on close
  mainWin.on('close', (e) => {
    e.preventDefault();
    mainWin.hide();
  });
}

function setupTray() {
  // TODO: replace icon.png with actual asset
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('DevCost');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open DevCost', click: () => mainWin?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.exit(0) },
  ]));
  tray.on('double-click', () => mainWin?.show());
}

app.whenReady().then(() => {
  startServer();
  createMainWindow();
  setupTray();
  createOverlay(path.join(__dirname, 'preload.js'));

  globalShortcut.register('CommandOrControl+Shift+D', () => {
    mainWin?.isVisible() ? mainWin.hide() : (mainWin?.show(), mainWin?.focus());
  });
});

ipcMain.handle('get-token', () => LAUNCH_TOKEN);
ipcMain.handle('get-port',  () => PORT);

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  serverProcess?.kill();
});
