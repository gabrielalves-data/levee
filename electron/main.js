'use strict';

const {
  app, BrowserWindow, Tray, Menu,
  globalShortcut, ipcMain, nativeImage, utilityProcess,
} = require('electron');
const path   = require('path');
const crypto = require('crypto');
const fs     = require('fs');
const {
  createOverlay,
  getOverlay,
  PILL,
  clampToWorkArea,
  anchoredPanelBounds,
  pillBoundsFor,
} = require('./overlay');
const { setupUpdater } = require('./updater');

let keytar;
try { keytar = require('keytar'); } catch { keytar = null; }

// Packaged builds let the server bind an OS-assigned ephemeral port per
// launch, reported back over the utilityProcess message channel — nothing
// else can be squatting a port nobody had opened yet. Dev stays on 3001 to
// match the Vite proxy target. PORT is set once startServer() resolves.
let PORT           = 3001;
const LAUNCH_TOKEN = crypto.randomBytes(32).toString('hex');

const CONFIG_PATH  = path.join(require('os').homedir(), '.levee', 'config.json');

function getConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg), { mode: 0o600 }); } catch {}
}

// Identity so the window/taskbar reads "Levee" (not "Electron") and Windows
// groups the taskbar entry / notifications under our own app id.
app.setName('Levee');
app.setAppUserModelId('com.gabriel.levee');

// Window/taskbar icon. Packaged builds carry build/icon.*; dev falls back to the
// PNG logo so the icon is correct even before packaging.
const APP_ICON = app.isPackaged
  ? path.join(__dirname, '..', 'client', 'dist', 'levee-logo.png')
  : path.join(__dirname, '..', 'client', 'public', 'levee-logo.png');

let mainWin       = null;
let tray          = null;
let serverProcess = null;
// Closing the window hides to tray; only a real quit (tray Quit, or the updater's
// quitAndInstall) sets this so the close handler stops intercepting.
let isQuitting    = false;
app.on('before-quit', () => { isQuitting = true; });

function createTrayIcon() {
  const logoPath = path.join(__dirname, '..', 'client', 'public', 'levee-logo.png');
  if (fs.existsSync(logoPath)) {
    return nativeImage.createFromPath(logoPath).resize({ width: 16, height: 16 });
  }
  // Fallback: indigo square if logo file is missing.
  const size = 16;
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const off = i * 4;
    data[off]     = 99;
    data[off + 1] = 102;
    data[off + 2] = 241;
    data[off + 3] = 255;
  }
  return nativeImage.createFromBuffer(data, { width: size, height: size });
}

async function startServer() {
  let dbKey = '';
  try {
    const cfg = getConfig();
    if (cfg.dbEncrypted && keytar) {
      dbKey = (await keytar.getPassword('levee', 'db-encryption-key')) ?? '';
    }
  } catch { /* config absent or unreadable — open unencrypted */ }

  // Run the server under Electron's bundled Node via utilityProcess.fork, so a
  // packaged app needs no system Node install. This requires the native modules
  // (better-sqlite3-multiple-ciphers, keytar) to be built for Electron's ABI —
  // handled by `electron-rebuild` in dev and electron-builder at package time.
  const env = {
    ...process.env,
    LEVEE_TOKEN:  LAUNCH_TOKEN,
    LEVEE_DB_KEY: dbKey,
  };
  // Only dev pins a fixed port (Vite proxy target). Packaged builds omit PORT
  // so server/index.js binds to 0 and the OS assigns an unused port.
  if (!app.isPackaged) env.PORT = String(PORT);

  serverProcess = utilityProcess.fork(path.join(__dirname, '..', 'server', 'index.js'), [], {
    env,
    stdio: 'inherit',
  });

  // Wait for the server's own "ready" message over the utility-process
  // message channel instead of polling HTTP: an HTTP probe can't tell our
  // server apart from any other process that happens to answer on the same
  // port, so a squatter would get accepted and receive the launch token plus
  // every API payload. The message channel is unforgeable by another process.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('[levee] server did not start within 15 s'));
    }, 15_000);
    serverProcess.once('message', (msg) => {
      if (msg?.type === 'ready' && Number.isInteger(msg.port)) {
        PORT = msg.port;
        clearTimeout(timer);
        resolve();
      }
    });
    serverProcess.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`[levee] server process exited with code ${code}`));
    });
  });
  serverProcess.on('exit', (code) => {
    if (code) console.error(`[levee] server process exited with code ${code}`);
  });
  console.log('[levee] server ready');
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 700,
    icon: APP_ICON,
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
    // The packaged app's port is known by the time this handler runs (PORT is
    // set once startServer() resolves, before createMainWindow() is called),
    // so pin connect-src to it instead of a wildcard — a wildcard would let a
    // compromised renderer talk to any other app's loopback port.
    const csp = fromVite
      ? "default-src 'self'; connect-src http://127.0.0.1:3001 http://127.0.0.1:5173 ws://127.0.0.1:5173; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
      : `default-src 'self'; connect-src http://127.0.0.1:${PORT}; script-src 'self'; style-src 'self' 'unsafe-inline'`;

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

  // Never let the renderer spawn a new window (would be an uncontrolled
  // outbound channel). All navigation stays in-window and loopback-only.
  mainWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWin.loadURL('http://127.0.0.1:5173');
  } else {
    mainWin.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  mainWin.on('close', (e) => {
    if (isQuitting) return; // let the quit/install proceed
    e.preventDefault();
    mainWin.hide();
  });
}

function setupTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Levee');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Levee',   click: () => { mainWin?.show(); mainWin?.focus(); } },
    { label: 'Toggle Overlay', click: () => toggleOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('double-click', () => { mainWin?.show(); mainWin?.focus(); });
}

function toggleOverlay() {
  const ov = getOverlay();
  if (!ov) return;
  ov.isVisible() ? ov.hide() : ov.show();
}

function boundsPath() {
  return path.join(app.getPath('home'), '.levee', 'overlay-bounds.json');
}

app.whenReady().then(async () => {
  // Enable launch-at-login once, on first run only. Re-applying every launch
  // would silently override a user who later disables it in Settings.
  const cfg = getConfig();
  if (!cfg.firstRunDone) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    saveConfig({ ...cfg, firstRunDone: true });
  }

  await startServer();
  createMainWindow();
  setupTray();
  setupUpdater(() => mainWin);

  const preloadPath = path.join(__dirname, 'preload.js');
  const ov = createOverlay(preloadPath);
  if (getConfig().overlayEnabled !== true) ov.hide();

  globalShortcut.register('CommandOrControl+Shift+G', toggleOverlay);
});

// ── IPC handlers ───────────────────────────────────────────────────────────

ipcMain.handle('get-token', () => LAUNCH_TOKEN);
ipcMain.handle('get-port',  () => PORT);

ipcMain.on('open-dashboard', (_e, serviceId) => {
  mainWin?.show();
  mainWin?.focus();
  mainWin?.webContents.send('navigate', serviceId ? `/services?focus=${serviceId}` : '/services');
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
  if (ov && !ov.isDestroyed()) {
    if (enable) {
      // Show first, then tell the renderer to play the scale/fade-in.
      ov.show();
      ov.webContents.send('overlay-visibility', true);
    } else {
      // Let the renderer play the exit animation, then hide the window — but
      // re-check state at fire time so a quick re-enable cancels the hide.
      ov.webContents.send('overlay-visibility', false);
      setTimeout(() => {
        const o = getOverlay();
        if (o && !o.isDestroyed() && getConfig().overlayEnabled !== true) o.hide();
      }, 320);
    }
  }
  return true;
});

// Persist the FAB (collapsed pill) origin — the single source of truth for the
// overlay's position. The panel is always derived from it, so saving the pill
// keeps a restart restoring the dot exactly where the user left it.
function savePillOrigin(p) {
  try { fs.writeFileSync(boundsPath(), JSON.stringify({ x: p.x, y: p.y })); } catch {}
}

// Pill → panel: choose the anchor (which corner stays pinned) from the FAB's
// position so the panel opens toward the screen interior and never overflows.
// Returns the anchor so the renderer can match its morph origin and FAB corner.
ipcMain.handle('overlay-expand', (_e, w, h) => {
  const ov = getOverlay();
  if (!ov || ov.isDestroyed()) return { h: 'left', v: 'top' };
  const b = ov.getBounds();
  const { bounds, anchor } = anchoredPanelBounds(b.x, b.y, Math.round(w), Math.round(h));
  ov.setBounds(bounds);
  savePillOrigin(pillBoundsFor(bounds, anchor));
  return anchor;
});

// Panel width change while open: keep the anchored (FAB) corner fixed.
ipcMain.on('overlay-refit', (_e, w, h, anchor) => {
  const ov = getOverlay();
  if (!ov || ov.isDestroyed()) return;
  const b = ov.getBounds();
  const nw = Math.round(w), nh = Math.round(h);
  const x = anchor.h === 'left' ? b.x : b.x + b.width  - nw;
  const y = anchor.v === 'top'  ? b.y : b.y + b.height - nh;
  const bounds = clampToWorkArea({ x, y, width: nw, height: nh });
  ov.setBounds(bounds);
  savePillOrigin(pillBoundsFor(bounds, anchor));
});

// Panel → pill: collapse to the anchored corner so the FAB stays where it sat.
ipcMain.on('overlay-collapse', (_e, anchor) => {
  const ov = getOverlay();
  if (!ov || ov.isDestroyed()) return;
  const pill = pillBoundsFor(ov.getBounds(), anchor);
  ov.setBounds(pill);
  savePillOrigin(pill);
});

// The overlay is non-focusable, so the native `-webkit-app-region: drag` region
// can't move it on Windows. The renderer drives the drag manually: it reads the
// current position once, then streams new positions while the grip is held.
ipcMain.handle('overlay-get-position', () => {
  const ov = getOverlay();
  return ov && !ov.isDestroyed() ? ov.getPosition() : [0, 0];
});

let overlayMoveTimer = null;
ipcMain.on('overlay-move', (_e, x, y, w, h, anchor) => {
  const ov = getOverlay();
  if (!ov || ov.isDestroyed()) return;
  // Pin an explicit size each move and clamp to the work area: on Windows with
  // fractional display scaling, repeatedly calling setPosition on a transparent
  // frameless window accumulates rounding error and slowly inflates it; clamping
  // also guarantees neither the FAB nor the panel can be dragged off-screen.
  const cur = ov.getBounds();
  const width  = Math.round(w) || cur.width;
  const height = Math.round(h) || cur.height;
  const bounds = clampToWorkArea({ x: Math.round(x), y: Math.round(y), width, height });
  ov.setBounds(bounds);
  // Convert the (possibly panel-sized) bounds back to the pill origin before
  // persisting, so the saved position is always the FAB corner.
  const pill = width <= PILL
    ? { x: bounds.x, y: bounds.y }
    : pillBoundsFor(bounds, anchor || { h: 'left', v: 'top' });
  clearTimeout(overlayMoveTimer);
  overlayMoveTimer = setTimeout(() => savePillOrigin(pill), 200);
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
