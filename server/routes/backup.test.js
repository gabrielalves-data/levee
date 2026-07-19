'use strict';

// Run with: node --test server/routes/backup.test.js
// §9 item 4 — FORBIDDEN_KEY_RE sweep on export; import round-trips
// services+connectors+metrics with correct `source`; encrypted export/import
// round-trip (§4.5). Uses only Node built-ins, matching connectors.test.js's
// dependency-free convention — route handlers invoked directly (no supertest),
// against the real db module (as connectors.test.js already does), scoped to
// a uniquely-named test service so cleanup is a single delete (FK cascade
// drops its connectors/metrics automatically).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');
const backupRouter = require('./backup');
const { encryptExport, decryptExport } = require('../backupCrypto');

function getHandler(method, path) {
  const layer = backupRouter.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
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

const exportHandler = getHandler('get', '/export');
const encryptedExportHandler = getHandler('post', '/export');
const importHandler = getHandler('post', '/import');

const TEST_SERVICE = '__test_backup_export__';
const TEST_PROVIDER = '__test_provider__';

describe('backup export — FORBIDDEN_KEY_RE sweep', () => {
  let serviceId;

  before(() => {
    const r = db.prepare(`
      INSERT INTO services (name, provider, category, cost_model, connector_type)
      VALUES (?, ?, 'tool', 'flat', 'api')
    `).run(TEST_SERVICE, TEST_PROVIDER);
    serviceId = r.lastInsertRowid;
    db.prepare(`
      INSERT INTO service_connectors (service_id, provider_key, enabled, config)
      VALUES (?, ?, 1, ?)
    `).run(serviceId, TEST_PROVIDER, JSON.stringify({ apiKey: 'shhh', accountSid: 'AC123', token: 'nope' }));
  });

  after(() => {
    db.prepare('DELETE FROM services WHERE id = ?').run(serviceId);
  });

  it('strips secret-shaped config keys but keeps safe ones', async () => {
    const res = mockRes();
    await exportHandler({}, res);
    const entry = res.body.connectors.find((c) => c.service === TEST_SERVICE);
    assert.ok(entry, 'test connector must appear in export');
    assert.equal(entry.config.apiKey, undefined);
    assert.equal(entry.config.token, undefined);
    assert.equal(entry.config.accountSid, 'AC123');
  });
});

describe('backup import — round-trip with correct source, and encrypted export/import', () => {
  const serviceIds = [];

  after(() => {
    for (const id of serviceIds) db.prepare('DELETE FROM services WHERE id = ?').run(id);
  });

  // Payloads below deliberately omit `connectors` — the real on-disk DB this
  // suite runs against may have real, live-enabled connectors, and importing
  // those would make backup.js's post-import credential check call the real
  // (Electron-only) secrets.js, which rejects outside Electron. That behavior
  // is exercised elsewhere; this suite only cares about the services/metrics
  // round-trip and the encryption envelope, so it keeps its payload minimal
  // and self-contained regardless of what else is in the DB.
  function minimalPayload(svc) {
    return {
      version: 1,
      services: [svc],
      connectors: [],
      widget_slots: [],
      monthly_snapshots: [],
      app_settings: [],
    };
  }

  it('round-trips a service + metric through export → import with correct source', async () => {
    const insert = db.prepare(`
      INSERT INTO services (name, provider, category, cost_model, connector_type, monthly_cost)
      VALUES (?, ?, 'tool', 'flat', 'manual', 12.5)
    `).run(TEST_SERVICE + '_roundtrip', TEST_PROVIDER);
    const serviceId = insert.lastInsertRowid;
    serviceIds.push(serviceId);
    db.prepare(`
      INSERT INTO service_metrics (service_id, metric_key, label, value_type, value_num, source)
      VALUES (?, 'monthly_bill', 'Monthly Bill', 'currency', 12.5, 'sync')
    `).run(serviceId);

    const exportRes = mockRes();
    await exportHandler({}, exportRes);
    const svc = exportRes.body.services.find((s) => s.name === TEST_SERVICE + '_roundtrip');
    assert.ok(svc);
    assert.equal(svc.metrics[0].value_type, 'currency');

    // Re-import the same service — should update the existing row, not duplicate it.
    const importRes = mockRes();
    await importHandler({ body: minimalPayload(svc) }, importRes);
    assert.equal(importRes.statusCode, 200);
    assert.ok(importRes.body.ok);

    const stillOne = db.prepare('SELECT COUNT(*) AS n FROM services WHERE name = ?').get(TEST_SERVICE + '_roundtrip');
    assert.equal(stillOne.n, 1);
    const metricRow = db.prepare(
      "SELECT source FROM service_metrics WHERE service_id = ? AND metric_key = 'monthly_bill'"
    ).get(serviceId);
    // upsertMetric's ON CONFLICT clause never touches `source` — re-importing an
    // existing metric preserves whatever wrote it last (here, 'sync' from setup).
    assert.equal(metricRow.source, 'sync');
  });

  it('encrypted export requires a passphrase', async () => {
    const res = mockRes();
    await encryptedExportHandler({ body: {} }, res);
    assert.equal(res.statusCode, 400);
  });

  it('encrypted export round-trips through import with the right passphrase', async () => {
    const svc = { name: TEST_SERVICE + '_enc', provider: TEST_PROVIDER, category: 'tool', cost_model: 'flat' };
    const exportRes = mockRes();
    await encryptedExportHandler({ body: { passphrase: 'correct horse battery staple' } }, exportRes);
    assert.equal(exportRes.body.v, 1);

    // Confirm the envelope actually decrypts to the real export shape...
    const { decryptExport } = require('../backupCrypto');
    const decrypted = JSON.parse(decryptExport('correct horse battery staple', exportRes.body));
    assert.equal(decrypted.version, 1);

    // ...then exercise the encrypted import path with a minimal, controlled payload.
    const minimalEnvelope = encryptExport('correct horse battery staple', JSON.stringify(minimalPayload(svc)));
    const importRes = mockRes();
    await importHandler({ body: { ...minimalEnvelope, passphrase: 'correct horse battery staple' } }, importRes);
    assert.equal(importRes.statusCode, 200);
    assert.ok(importRes.body.ok);
    const id = db.prepare('SELECT id FROM services WHERE name = ?').get(svc.name)?.id;
    if (id) serviceIds.push(id);
  });

  it('rejects import with the wrong passphrase', async () => {
    const envelope = encryptExport('right-pass', JSON.stringify(minimalPayload({ name: 'x', provider: 'y', category: 'tool', cost_model: 'flat' })));
    const importRes = mockRes();
    await importHandler({ body: { ...envelope, passphrase: 'wrong-pass' } }, importRes);
    assert.equal(importRes.statusCode, 400);
  });
});

describe('backupCrypto', () => {
  it('decrypts what it encrypted', () => {
    const plaintext = JSON.stringify({ hello: 'world' });
    const envelope = encryptExport('a passphrase', plaintext);
    assert.equal(decryptExport('a passphrase', envelope), plaintext);
  });

  it('throws on a wrong passphrase', () => {
    const envelope = encryptExport('right', JSON.stringify({ a: 1 }));
    assert.throws(() => decryptExport('wrong', envelope));
  });
});
