'use strict';

const {
  app, BrowserWindow, Tray, Menu,
  globalShortcut, ipcMain, nativeImage,
} = require('electron');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');
const { fork } = require('child_process');
const { createOverlay, getOverlay } = require('./overlay');

let keytar;
try { keytar = require('keytar'); } catch { keytar = null; }

const PORT         = 3001;
const LAUNCH_TOKEN = crypto.randomBytes(32).toString('hex');

let mainWin       = null;
let tray          = null;
let serverProcess = null;

// Build a simple 16×16 indigo square as the tray icon.
function createTrayIcon() {
  const size = 16;
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const off = i * 4;
    data[off]     = 99;   // R  (#6366f1 indigo-500)
    data[off + 1] = 102;  // G
    data[off + 2] = 241;  // B
    data[off + 3] = 255;  // A
  }
  return nativeImage.createFromBuffer(data, { width: size, height: size });
}

async function startServer() {
  const cfgPath = path.join(app.getPath('home'), '.devcost', 'config.json');
  let dbKey = '';
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg.dbEncrypted && keytar) {
      dbKey = (await keytar.getPassword('devcost', 'db-encryption-key')) ?? '';
    }
  } catch { /* config absent or unreadable — open unencrypted */ }

  serverProcess = fork(path.join(__dirname, '..', 'server', 'index.js'), [], {
    env: {
      ...process.env,
      PORT:           String(PORT),
      DEVCOST_TOKEN:  LAUNCH_TOKEN,
      DEVCOST_DB_KEY: dbKey,
    },
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

  mainWin.webContents.on('will-navigate', (e, url) => {
    if (!/^(file:|http:\/\/127\.0\.0\.1)/.test(url)) e.preventDefault();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWin.loadURL('http://127.0.0.1:5173');
  } else {
    mainWin.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  mainWin.on('close', (e) => {
    e.preventDefault();
    mainWin.hide();
  });
}

function setupTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('DevCost');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open DevCost',   click: () => { mainWin?.show(); mainWin?.focus(); } },
    { label: 'Toggle Overlay', click: () => toggleOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.exit(0) },
  ]));
  tray.on('double-click', () => { mainWin?.show(); mainWin?.focus(); });
}

function toggleOverlay() {
  const ov = getOverlay();
  if (!ov) return;
  ov.isVisible() ? ov.hide() : ov.show();
}

function boundsPath() {
  return path.join(app.getPath('home'), '.devcost', 'overlay-bounds.json');
}

app.whenReady().then(async () => {
  // Enable launch-at-login by default on first run.
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

  await startServer();
  createMainWindow();
  setupTray();

  const preloadPath = path.join(__dirname, 'preload.js');
  const ov = createOverlay(preloadPath);

  // Persist overlay position after the user drags it.
  let moveTimer = null;
  ov.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      const [x, y] = ov.getPosition();
      try { fs.writeFileSync(boundsPath(), JSON.stringify({ x, y })); } catch {}
    }, 200);
  });

  globalShortcut.register('CommandOrControl+Shift+G', toggleOverlay);
});

// ── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('get-token', () => LAUNCH_TOKEN);
ipcMain.handle('get-port',  () => PORT);

ipcMain.on('open-dashboard', () => {
  mainWin?.show();
  mainWin?.focus();
  mainWin?.webContents.send('navigate', '/services');
});

ipcMain.handle('get-login-item', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('set-login-item', (_e, enable) => {
  app.setLoginItemSettings({ openAtLogin: !!enable, openAsHidden: !!enable });
  return true;
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  serverProcess?.kill();
});
