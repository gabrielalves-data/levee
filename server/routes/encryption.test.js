'use strict';

// Run with: node --test server/routes/encryption.test.js
// §9 item 5 — rekey round-trips (enable → disable) on a populated WAL DB;
// induced failure path restores from .pre-rekey and removes the keychain entry.
//
// Runs against a disposable temp SQLite file — NOT the app's real
// ~/.levee/levee.db — and an in-memory secrets stub — NOT Electron/safeStorage.
// Both `../db/database` and `../secrets` are swapped in the require cache
// before encryption.js is first required, so the route's real logic (keychain
// write → verify → backup → rekey → integrity check → cleanup, with rollback
// on failure) runs for real, without touching the user's actual database,
// config file, or OS keychain.

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3-multiple-ciphers');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'levee-encryption-test-'));
const DB_PATH = path.join(TMP_DIR, 'levee.db');

const tempDb = new Database(DB_PATH);
tempDb.pragma('journal_mode = WAL');
tempDb.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
tempDb.prepare('INSERT INTO t (v) VALUES (?)').run('populated-row');

const CFG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'levee-encryption-cfg-'));
fs.mkdirSync(path.join(CFG_DIR, '.levee'), { recursive: true });

const secretStore = new Map();

const dbModulePath = require.resolve('../db/database');
require.cache[dbModulePath] = {
  id: dbModulePath, filename: dbModulePath, loaded: true,
  exports: Object.assign(tempDb, { DB_PATH }),
};

const secretsModulePath = require.resolve('../secrets');
require.cache[secretsModulePath] = {
  id: secretsModulePath, filename: secretsModulePath, loaded: true,
  exports: {
    getSecret: async (k) => (secretStore.has(k) ? secretStore.get(k) : null),
    setSecret: async (k, v) => { secretStore.set(k, v); },
    deleteSecret: async (k) => { secretStore.delete(k); },
  },
};

// encryption.js resolves its config path from os.homedir() at module load —
// stub it just long enough for that to land in our temp dir instead of the
// user's real ~/.levee/config.json.
const originalHomedir = os.homedir;
os.homedir = () => CFG_DIR;
const encryptionRouter = require('./encryption');
os.homedir = originalHomedir;

function getHandler(method, routePath) {
  const layer = encryptionRouter.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  return layer.route.stack[0].handle;
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const statusHandler = getHandler('get', '/status');
const toggleHandler = getHandler('post', '/toggle');

after(() => {
  tempDb.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.rmSync(CFG_DIR, { recursive: true, force: true });
});

describe('encryption toggle — rekey round-trip', () => {
  it('rejects a non-boolean enable', async () => {
    const res = mockRes();
    await toggleHandler({ body: { enable: 'yes' } }, res);
    assert.equal(res.statusCode, 400);
  });

  it('starts unencrypted', async () => {
    const res = mockRes();
    await statusHandler({}, res);
    assert.equal(res.body.encrypted, false);
  });

  it('enables encryption: rekeys the populated WAL DB and stores the key', async () => {
    const res = mockRes();
    await toggleHandler({ body: { enable: true } }, res);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.encrypted, true);
    assert.ok(secretStore.get('db-encryption-key'), 'key must be stored');
    assert.equal(tempDb.pragma('journal_mode', { simple: true }), 'wal');

    const row = tempDb.prepare('SELECT v FROM t WHERE v = ?').get('populated-row');
    assert.equal(row.v, 'populated-row'); // data survived the rekey
  });

  it('disables encryption: rekeys back to plaintext and removes the key', async () => {
    const res = mockRes();
    await toggleHandler({ body: { enable: false } }, res);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.encrypted, false);
    assert.equal(secretStore.has('db-encryption-key'), false);
    assert.equal(tempDb.pragma('journal_mode', { simple: true }), 'wal');

    const row = tempDb.prepare('SELECT v FROM t WHERE v = ?').get('populated-row');
    assert.equal(row.v, 'populated-row'); // data survived the round-trip
  });
});

describe('encryption toggle — failure path', () => {
  it('restores from .pre-rekey and removes the keychain entry when rekey fails', async () => {
    const originalPragma = tempDb.pragma.bind(tempDb);
    tempDb.pragma = (stmt, opts) => {
      if (typeof stmt === 'string' && stmt.startsWith('rekey=')) {
        throw new Error('simulated rekey failure');
      }
      return originalPragma(stmt, opts);
    };

    try {
      const res = mockRes();
      await toggleHandler({ body: { enable: true } }, res);
      assert.equal(res.statusCode, 500);
      assert.match(res.body.error, /pre-rekey backup left at/);
      assert.equal(secretStore.has('db-encryption-key'), false, 'key must be rolled back on failure');
      assert.ok(fs.existsSync(`${DB_PATH}.pre-rekey`), '.pre-rekey backup must be left for manual recovery');
    } finally {
      tempDb.pragma = originalPragma;
      fs.rmSync(`${DB_PATH}.pre-rekey`, { force: true });
      tempDb.pragma('journal_mode = WAL'); // route left it on DELETE mid-failure; restore for a clean close
    }
  });
});
