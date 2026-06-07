'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');

let overlayWin = null;

function createOverlay(preloadPath) {
  overlayWin = new BrowserWindow({
    width: 320,
    height: 80,
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

  overlayWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; connect-src http://127.0.0.1:3001; script-src 'self'; style-src 'self' 'unsafe-inline'",
        ],
      },
    });
  });

  overlayWin.loadFile(path.join(__dirname, '..', 'client', 'dist', 'overlay.html'));
  return overlayWin;
}

function getOverlay() { return overlayWin; }

module.exports = { createOverlay, getOverlay };
