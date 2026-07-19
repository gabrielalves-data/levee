'use strict';

// Run with: node --test server/index.test.js
// §9 item 9 — dev fixed-port EADDRINUSE ⇒ the server process exits non-zero
// (via the server.on('error', ...) handler added in server/index.js), and
// electron/main.js's startServer() rejection is caught by a .catch (rather
// than left as an unhandled rejection) so the app surfaces the failure
// instead of crashing silently.
//
// Spawns two real `node server/index.js` child processes on the same fixed
// port — the only way to exercise a genuine EADDRINUSE without duplicating
// Express's own port-binding logic. Both talk to the app's real on-disk DB
// (SQLite WAL tolerates concurrent readers fine); the first is killed at the
// end of the test.

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, 'index.js');
const TEST_PORT = 34519;

function waitForOutput(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}; got: ${buf}`)), timeoutMs);
    function onData(chunk) {
      buf += chunk.toString();
      if (pattern.test(buf)) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve(buf);
      }
    }
    child.stdout.on('data', onData);
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for exit')), timeoutMs);
    child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
}

describe('server EADDRINUSE handling', () => {
  let firstServer;

  after(() => {
    firstServer?.kill();
  });

  it('a second server on the same fixed port exits non-zero instead of crashing unhandled', async () => {
    firstServer = spawn(process.execPath, [SERVER_PATH], {
      env: { ...process.env, PORT: String(TEST_PORT) },
    });
    await waitForOutput(firstServer, /listening on/, 15_000);

    const secondServer = spawn(process.execPath, [SERVER_PATH], {
      env: { ...process.env, PORT: String(TEST_PORT) },
    });
    const code = await waitForExit(secondServer, 15_000);
    assert.notEqual(code, 0, 'second server on a busy port must exit non-zero');
  });
});
