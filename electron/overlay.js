'use strict';

const { BrowserWindow, app, screen } = require('electron');
const path = require('path');
const fs   = require('fs');

let overlayWin = null;

function boundsPath() {
  return path.join(app.getPath('home'), '.devcost', 'overlay-bounds.json');
}

function getSavedBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsPath(), 'utf8'));
  } catch { return null; }
}

function createOverlay(preloadPath) {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const saved = getSavedBounds();
  const x = saved?.x ?? width - 260 - 16;
  const y = saved?.y ?? 16;

  overlayWin = new BrowserWindow({
    width: 260,
    height: 320,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlayWin.setAlwaysOnTop(true, 'screen-saver');

  // NOTE: CSP is set by the single onHeadersReceived handler in main.js, which
  // runs on this same (default) session. Registering another listener here
  // would replace that one, so we deliberately do not set CSP in the overlay.

  overlayWin.webContents.on('will-navigate', (e, url) => {
    if (!/^(file:|http:\/\/127\.0\.0\.1)/.test(url)) e.preventDefault();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    overlayWin.loadURL('http://127.0.0.1:5173/overlay.html');
  } else {
    overlayWin.loadFile(path.join(__dirname, '..', 'client', 'dist', 'overlay.html'));
  }

  return overlayWin;
}

function getOverlay() { return overlayWin; }

module.exports = { createOverlay, getOverlay };
