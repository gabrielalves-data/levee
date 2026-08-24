'use strict';

// Run with: node --test server/cron/snapshot.test.js
// Exercises syncEnabledConnectors()'s ignoreBackoff option — the fix that lets
// the focus-triggered sync-check (server/routes/connectors.js) retry a
// connector stuck in the 24h failure backoff (e.g. claude_plan after an
// expired Claude Code OAuth token) at its own normal cadence, instead of
// staying frozen for up to a day after the user has already fixed it.
//
// Runs against a disposable temp SQLite file — NOT the app's real
// ~/.levee/levee.db — with `../connectors/sync`'s syncService stubbed out (no
// real network fetch). Both `../db/database` and `../connectors/sync` are
// swapped in the require cache before ./snapshot is first required, same
// pattern as server/routes/encryption.test.js.

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3-multiple-ciphers');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'levee-snapshot-test-'));
const DB_PATH = path.join(TMP_DIR, 'levee.db');

const tempDb = new Database(DB_PATH);
tempDb.pragma('journal_mode = WAL');
tempDb.exec(`
  CREATE TABLE services (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    active         INTEGER NOT NULL DEFAULT 1,
    connector_type TEXT    NOT NULL DEFAULT 'manual',
    last_sync_at   TEXT
  );
  CREATE TABLE service_connectors (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id            INTEGER NOT NULL UNIQUE,
    provider_key          TEXT    NOT NULL,
    enabled               INTEGER NOT NULL DEFAULT 0,
    consecutive_failures  INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  INSERT INTO app_settings (key, value) VALUES ('allow_outbound', 'true');
`);

const dbModulePath = require.resolve('../db/database');
require.cache[dbModulePath] = {
  id: dbModulePath, filename: dbModulePath, loaded: true,
  exports: Object.assign(tempDb, { DB_PATH }),
};

let syncedIds = [];
const syncModulePath = require.resolve('../connectors/sync');
require.cache[syncModulePath] = {
  id: syncModulePath, filename: syncModulePath, loaded: true,
  exports: {
    syncService: async (serviceId) => { syncedIds.push(serviceId); },
    upsertMetrics: () => {},
    resolveConnectorSecrets: async () => ({}),
  },
};

const { register } = require('../connectors/registry');
register('test_claude', { syncIntervalHours: 0.5 });

const { syncEnabledConnectors } = require('./snapshot');

function seedBackedOffConnector() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { lastInsertRowid: serviceId } = tempDb.prepare(
    `INSERT INTO services (active, connector_type, last_sync_at) VALUES (1, 'api', ?)`
  ).run(oneHourAgo);
  // 3 consecutive failures — past BACKOFF_THRESHOLD_FAILURES, so a plain
  // (non-ignoreBackoff) call floors its retry interval at 24h even though
  // its own syncIntervalHours (0.5h) elapsed an hour ago.
  tempDb.prepare(
    `INSERT INTO service_connectors (service_id, provider_key, enabled, consecutive_failures)
     VALUES (?, 'test_claude', 1, 3)`
  ).run(serviceId);
  return serviceId;
}

describe('syncEnabledConnectors — ignoreBackoff', () => {
  beforeEach(() => {
    syncedIds = [];
    tempDb.exec('DELETE FROM services; DELETE FROM service_connectors;');
  });

  after(() => {
    tempDb.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('the default (cron) call leaves a backed-off connector alone within the 24h floor', async () => {
    seedBackedOffConnector();
    await syncEnabledConnectors();
    assert.deepEqual(syncedIds, []);
  });

  it('ignoreBackoff:true retries the same connector once its own interval has elapsed', async () => {
    const serviceId = seedBackedOffConnector();
    await syncEnabledConnectors({ ignoreBackoff: true });
    assert.deepEqual(syncedIds, [serviceId]);
  });

  it('ignoreBackoff:true still respects the connector\'s own interval — no-op if not yet due', async () => {
    const justSynced = new Date().toISOString();
    const { lastInsertRowid: serviceId } = tempDb.prepare(
      `INSERT INTO services (active, connector_type, last_sync_at) VALUES (1, 'api', ?)`
    ).run(justSynced);
    tempDb.prepare(
      `INSERT INTO service_connectors (service_id, provider_key, enabled, consecutive_failures)
       VALUES (?, 'test_claude', 1, 3)`
    ).run(serviceId);
    await syncEnabledConnectors({ ignoreBackoff: true });
    assert.deepEqual(syncedIds, []);
  });
});
