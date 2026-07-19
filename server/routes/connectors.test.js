'use strict';

// Run with: node --test server/routes/connectors.test.js
// §9 item 7 — PUT /api/connectors/:serviceId merges config server-side
// ({...existing, ...incoming}) instead of replacing it wholesale (M8).
//
// Route handlers invoked directly against the real db module (as
// connectors.test.js already does), scoped to a uniquely-named test service.
// Requests never include `secret`/`secrets`, so the real (Electron-only)
// secrets.js is never called — this test is only about the config-merge path.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/database');
const connectorsRouter = require('./connectors');

function getHandler(method, routePath) {
  const layer = connectorsRouter.stack.find(
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

const putHandler = getHandler('put', '/:serviceId');

const TEST_SERVICE = '__test_connectors_put__';

describe('PUT /api/connectors/:serviceId — config merge (M8)', () => {
  let serviceId;

  before(() => {
    const r = db.prepare(`
      INSERT INTO services (name, provider, category, cost_model)
      VALUES (?, ?, 'cloud', 'usage')
    `).run(TEST_SERVICE, 'Amazon');
    serviceId = r.lastInsertRowid;
  });

  after(() => {
    db.prepare('DELETE FROM services WHERE id = ?').run(serviceId);
  });

  it('saves config on first connect', async () => {
    const res = mockRes();
    await putHandler(
      { params: { serviceId: String(serviceId) }, body: { providerKey: 'aws_cost', config: { region: 'us-east-1' } } },
      res
    );
    assert.equal(res.body.ok, true);
    const row = db.prepare('SELECT config FROM service_connectors WHERE service_id = ?').get(serviceId);
    assert.deepEqual(JSON.parse(row.config), { region: 'us-east-1' });
  });

  it('merges a second PUT onto the existing config instead of replacing it', async () => {
    const res = mockRes();
    await putHandler(
      { params: { serviceId: String(serviceId) }, body: { providerKey: 'aws_cost', config: { accountId: '123456789012' } } },
      res
    );
    assert.equal(res.body.ok, true);
    const row = db.prepare('SELECT config FROM service_connectors WHERE service_id = ?').get(serviceId);
    assert.deepEqual(JSON.parse(row.config), { region: 'us-east-1', accountId: '123456789012' });
  });

  it('lets a later field overwrite an earlier one with the same key', async () => {
    const res = mockRes();
    await putHandler(
      { params: { serviceId: String(serviceId) }, body: { providerKey: 'aws_cost', config: { region: 'eu-west-1' } } },
      res
    );
    assert.equal(res.body.ok, true);
    const row = db.prepare('SELECT config FROM service_connectors WHERE service_id = ?').get(serviceId);
    assert.deepEqual(JSON.parse(row.config), { region: 'eu-west-1', accountId: '123456789012' });
  });

  it('rejects an unknown provider key', async () => {
    const res = mockRes();
    await putHandler(
      { params: { serviceId: String(serviceId) }, body: { providerKey: 'not-a-real-provider' } },
      res
    );
    assert.equal(res.statusCode, 400);
  });

  it('rejects an invalid serviceId', async () => {
    const res = mockRes();
    await putHandler({ params: { serviceId: 'nope' }, body: { providerKey: 'aws_cost' } }, res);
    assert.equal(res.statusCode, 400);
  });
});
