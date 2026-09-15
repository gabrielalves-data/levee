'use strict';

// Landing-page screenshots (levee-site's assets/overview|services|settings.png).
// Run `npm run dev:client` first, then `node scripts/capture.js`.
//
// Runs against a throwaway home directory seeded by scripts/seed-demo.js, so
// the real ~/.levee/levee.db (and its config) is never opened.

const { _electron: electron } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_WIDTH = 1100;
const TARGET_HEIGHT = 700;
const VITE_URL = 'http://127.0.0.1:5173';
const ROOT = path.join(__dirname, '..');

(async () => {
  // Dev Electron loads the renderer from Vite; without it every capture is blank.
  try {
    await fetch(VITE_URL);
  } catch {
    console.error(`[capture] Vite is not running at ${VITE_URL} — start it with \`npm run dev:client\``);
    process.exit(1);
  }

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'levee-capture-'));
  // Node's os.homedir() reads USERPROFILE on Windows and HOME elsewhere.
  const env = { ...process.env, USERPROFILE: home, HOME: home };
  // Inherited when run from an Electron host (e.g. VS Code's terminal/extension
  // host); it would make electron.exe start as plain Node and reject the args.
  delete env.ELECTRON_RUN_AS_NODE;
  let app;

  try {
    // firstRunDone stops main.js from registering this dev Electron as a login item.
    fs.mkdirSync(path.join(home, '.levee'), { mode: 0o700 });
    fs.writeFileSync(path.join(home, '.levee', 'config.json'), JSON.stringify({ firstRunDone: true }), { mode: 0o600 });

    const seed = spawnSync(require('electron'), [path.join(__dirname, 'seed-demo.js')], {
      cwd: ROOT,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1', LEVEE_DEMO_HOME: home },
      stdio: 'inherit',
    });
    if (seed.status !== 0) throw new Error('seed-demo.js failed');

    app = await electron.launch({
      cwd: ROOT,
      env: { ...env, LEVEE_CAPTURE_HOME: home },
      args: [
        '-r', path.join(__dirname, 'capture-home.js'),
        // Exact pixel output regardless of OS display scaling.
        '--force-device-scale-factor=1',
        // Own Chromium profile, so this instance doesn't share the installed app's.
        `--user-data-dir=${path.join(home, 'user-data')}`,
        // The app directory, not electron/main.js: same entry (package.json
        // "main"), but app.getVersion() only reads package.json this way —
        // otherwise Settings shows Electron's version instead of Levee's.
        '.',
      ],
    });

    // The main window only exists once the server is up — wait for it, then
    // resize that exact window (the overlay is a second BrowserWindow).
    const main = await app.firstWindow();
    const win = await app.browserWindow(main);
    await win.evaluate((w, { width, height }) => {
      w.setContentSize(width, height);
      w.center();
    }, { width: TARGET_WIDTH, height: TARGET_HEIGHT });
    await main.setViewportSize({ width: TARGET_WIDTH, height: TARGET_HEIGHT });
    await main.waitForLoadState('networkidle');

    const pages = [
      { label: 'overview', ready: 'text=Monthly Trend' },
      { label: 'services', ready: 'text=Weekly Usage' },
      // The chapter copy covers outbound, encryption and backups — all at the
      // bottom of Settings, so scroll there before capturing.
      { label: 'settings', ready: 'text=Database Encryption', scrollToEnd: true },
    ];
    for (const { label, ready, scrollToEnd } of pages) {
      await main.click(`aside nav >> text=${label}`);
      await main.waitForSelector(ready);
      await main.waitForLoadState('networkidle');
      await main.waitForFunction(() => !/Loading/.test(document.querySelector('main').innerText));
      if (scrollToEnd) {
        await main.evaluate(() => {
          const el = document.querySelector('main');
          el.scrollTop = el.scrollHeight;
        });
      }
      // Let the route view transition and Recharts' entry animation settle.
      await main.waitForTimeout(1500);
      await main.screenshot({
        path: path.join(ROOT, 'assets', `${label}.png`),
        clip: { x: 0, y: 0, width: TARGET_WIDTH, height: TARGET_HEIGHT },
        animations: 'disabled',
      });
      console.log(`[capture] assets/${label}.png`);
    }
  } finally {
    await app?.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error('[capture]', err.message);
  process.exit(1);
});
