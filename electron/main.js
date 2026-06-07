'use strict';

const {
  app, BrowserWindow, Tray, Menu,
  globalShortcut, ipcMain, nativeImage,
} = require('electron');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');
const http   = require('http');
const { spawn } = require('child_process');
const { createOverlay, getOverlay } = require('./overlay');

let keytar;
try { keytar = require('keytar'); } catch { keytar = null; }

const PORT         = 3001;
const LAUNCH_TOKEN = crypto.randomBytes(32).toString('hex');
const CONFIG_PATH  = path.join(require('os').homedir(), '.devcost', 'config.json');

function getConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg)); } catch {}
}

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
  let dbKey = '';
  try {
    const cfg = getConfig();
    if (cfg.dbEncrypted && keytar) {
      dbKey = (await keytar.getPassword('devcost', 'db-encryption-key')) ?? '';
    }
  } catch { /* config absent or unreadable — open unencrypted */ }

  // Run the server under system Node.js, not Electron's embedded Node.
  // fork() inherits Electron's Node ABI, which mismatches native modules
  // (better-sqlite3) compiled for system Node. spawn() with the system
  // node binary avoids the ABI mismatch entirely.
  const nodeBin = process.env.npm_node_execpath || 'node';
  serverProcess = spawn(nodeBin, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: {
      ...process.env,
      PORT:           String(PORT),
      DEVCOST_TOKEN:  LAUNCH_TOKEN,
      DEVCOST_DB_KEY: dbKey,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  serverProcess.on('error', (err) => {
    console.error('[devcost] server process error:', err.message);
  });

  // Wait until OUR server (matching this launch's token) is answering before
  // loading the UI. Sending the token lets us tell our server apart from a
  // stale zombie on the same port: a foreign server replies 401, so we keep
  // waiting and fail loudly on timeout instead of silently serving the UI
  // against the wrong process.
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 15_000;
    const check = () => {
      const req = http.request(
        { host: '127.0.0.1', port: PORT, path: '/', method: 'GET',
          headers: { 'x-devcost-token': LAUNCH_TOKEN } },
        (res) => {
          res.resume();
          if (res.statusCode === 401) {
            // Port held by a different server (wrong token). Don't accept it.
            if (Date.now() >= deadline) {
              reject(new Error(
                `[devcost] port ${PORT} is held by another process with a ` +
                `different token (stale server?). Close it and relaunch.`));
            } else {
              setTimeout(check, 200);
            }
          } else {
            resolve(); // our token accepted (404 for "/" is expected)
          }
        });
      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error('[devcost] server did not start within 15 s'));
        } else {
          setTimeout(check, 150);
        }
      });
      req.end();
    };
    setTimeout(check, 150);
  });
  console.log('[devcost] server ready');
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

  // Single CSP handler for the shared default session (covers both the main
  // window and the overlay). onHeadersReceived allows only ONE listener per
  // session, so this must be the only registration — overlay.js must not add
  // its own, or it would silently replace this one.
  mainWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Dev loads from Vite (:5173); prod loads from file://.
    // Vite needs 'unsafe-inline' for React's refresh preamble and ws: for HMR.
    const fromVite = details.url.startsWith('http://127.0.0.1:5173');
    const csp = fromVite
      ? "default-src 'self'; connect-src http://127.0.0.1:3001 http://127.0.0.1:5173 ws://127.0.0.1:5173; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
      : "default-src 'self'; connect-src http://127.0.0.1:3001; script-src 'self'; style-src 'self' 'unsafe-inline'";

    // Strip any pre-existing CSP header (any casing) so ours is the only one —
    // multiple CSP headers are combined by the most-restrictive intersection.
    const headers = {};
    for (const [k, v] of Object.entries(details.responseHeaders)) {
      if (k.toLowerCase() !== 'content-security-policy') headers[k] = v;
    }
    headers['Content-Security-Policy'] = [csp];

    callback({ responseHeaders: headers });
  });

  mainWin.webContents.on('will-navigate', (e, url) => {
    if (!/^(file:|http:\/\/127\.0\.0\.1)/.test(url)) e.preventDefault();
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWin.webContents.openDevTools();
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
  if (getConfig().overlayEnabled !== true) ov.hide();

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

ipcMain.handle('get-overlay-enabled', () => getConfig().overlayEnabled === true);

ipcMain.handle('set-overlay-enabled', (_e, enable) => {
  const cfg = getConfig();
  cfg.overlayEnabled = !!enable;
  saveConfig(cfg);
  const ov = getOverlay();
  if (ov && !ov.isDestroyed()) enable ? ov.show() : ov.hide();
  return true;
});

ipcMain.on('resize-overlay', (_e, width, height) => {
  const ov = getOverlay();
  if (ov && !ov.isDestroyed()) ov.setSize(Math.round(width), Math.round(height));
});

ipcMain.on('widget-updated', () => {
  const ov = getOverlay();
  if (ov && !ov.isDestroyed()) ov.webContents.send('widget-updated');
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  serverProcess?.kill();
});

// Terminal Ctrl+C / kill: ensure the spawned server dies too, so it can't
// become an orphan squatting on the port for the next launch.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { serverProcess?.kill(); app.exit(0); });
}
