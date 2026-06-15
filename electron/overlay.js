'use strict';

const { BrowserWindow, app, screen } = require('electron');
const path = require('path');
const fs   = require('fs');

let overlayWin = null;

const PILL = 38;   // collapsed (minimized) overlay window size — kept in sync with overlay.jsx (ORB 26 + 2·GUTTER 6)
const MARGIN = 12; // gap kept between the overlay (FAB or panel) and every screen edge

function boundsPath() {
  return path.join(app.getPath('home'), '.levee', 'overlay-bounds.json');
}

function getSavedBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsPath(), 'utf8'));
  } catch { return null; }
}

// Work area of the display the bounds sit on (multi-monitor correct).
function workAreaFor(bounds) {
  return screen.getDisplayMatching(bounds).workArea;
}

// Pin a window rectangle inside the work area (inset by MARGIN) so it can never
// leave the screen and always keeps a gap from every edge. If the window is too
// large for the inset area on an axis, fall back to centring it on that axis.
function clampToWorkArea(bounds) {
  const wa = workAreaFor(bounds);
  const clampAxis = (start, size, min, span) => {
    const lo = min + MARGIN;
    const hi = min + span - size - MARGIN;
    return hi < lo ? Math.round(min + (span - size) / 2) : Math.max(lo, Math.min(start, hi));
  };
  return {
    ...bounds,
    x: clampAxis(bounds.x, bounds.width,  wa.x, wa.width),
    y: clampAxis(bounds.y, bounds.height, wa.y, wa.height),
  };
}

// Decide, per axis, which corner the panel anchors to so it opens toward the
// screen interior and never overflows. Given the collapsed PILL at (px,py),
// returns the panel's clamped bounds plus the anchor { h, v } the renderer uses
// to orient the FAB and the morph origin.
//   h: 'left'  → window left edge pinned, panel grows right
//      'right' → window right edge pinned, panel grows left
//   v: 'top' / 'bottom' analogously.
function anchoredPanelBounds(px, py, panelW, panelH) {
  const wa = workAreaFor({ x: px, y: py, width: PILL, height: PILL });
  const cx = px + PILL / 2;
  const cy = py + PILL / 2;

  const fits = (start, len, min, max) => start >= min && start + len <= max;
  const pick = (center, mid, lowStart, highStart, len, min, max) => {
    // Prefer expanding toward the interior (away from the nearest edge), but
    // fall back to the other direction if the preferred one would overflow.
    const preferLow = center < mid; // FAB in the low half → grow toward high
    const primary   = preferLow ? lowStart  : highStart;
    const fallback  = preferLow ? highStart : lowStart;
    const anchor     = preferLow ? 'low' : 'high';
    if (fits(primary,  len, min, max)) return { start: primary,  anchor };
    if (fits(fallback, len, min, max)) return { start: fallback, anchor: preferLow ? 'high' : 'low' };
    return { start: primary, anchor }; // neither fits; clamp will handle it
  };

  // `fits` is tested against the margin-inset area so a chosen direction always
  // leaves room for the gap; clampToWorkArea below enforces it precisely.
  const hx = pick(cx, wa.x + wa.width / 2,  px, px + PILL - panelW, panelW, wa.x + MARGIN, wa.x + wa.width  - MARGIN);
  const vy = pick(cy, wa.y + wa.height / 2, py, py + PILL - panelH, panelH, wa.y + MARGIN, wa.y + wa.height - MARGIN);

  return {
    bounds: clampToWorkArea({ x: hx.start, y: vy.start, width: panelW, height: panelH }),
    anchor: { h: hx.anchor === 'low' ? 'left' : 'right', v: vy.anchor === 'low' ? 'top' : 'bottom' },
  };
}

// Collapse a panel back to the PILL pinned at its anchored corner, so the FAB
// lands exactly where it visually sat while open.
function pillBoundsFor(panelBounds, anchor) {
  const x = anchor.h === 'left' ? panelBounds.x : panelBounds.x + panelBounds.width  - PILL;
  const y = anchor.v === 'top'  ? panelBounds.y : panelBounds.y + panelBounds.height - PILL;
  return clampToWorkArea({ x, y, width: PILL, height: PILL });
}

function createOverlay(preloadPath) {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  const saved = getSavedBounds();
  // The overlay restores collapsed (PILL-sized). Clamp the restored origin so a
  // stale/off-screen saved position (e.g. a disconnected monitor) lands on screen.
  const raw = { x: saved?.x ?? width - PILL - 16, y: saved?.y ?? 16, width: PILL, height: PILL };
  const { x, y } = clampToWorkArea(raw);

  overlayWin = new BrowserWindow({
    width: 296,
    height: 72,
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

  // Deny renderer-initiated window creation — no uncontrolled outbound channel.
  overlayWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const isDev = !app.isPackaged;
  if (isDev) {
    overlayWin.loadURL('http://127.0.0.1:5173/overlay.html');
  } else {
    overlayWin.loadFile(path.join(__dirname, '..', 'client', 'dist', 'overlay.html'));
  }

  return overlayWin;
}

function getOverlay() { return overlayWin; }

module.exports = {
  createOverlay,
  getOverlay,
  PILL,
  clampToWorkArea,
  anchoredPanelBounds,
  pillBoundsFor,
};
