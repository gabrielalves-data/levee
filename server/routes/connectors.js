'use strict';

const { Router } = require('express');
const db = require('../db/database');
const { list: listConnectors, get: getConnector } = require('../connectors/registry');
const { setSecret, deleteSecret } = require('../secrets');
const { syncService } = require('../connectors/sync');

const router = Router();

// GET /api/connectors/providers — registry metadata (no secrets, no fetch fns)
router.get('/providers', (_req, res) => {
  res.json(listConnectors());
});

// PUT /api/connectors/:serviceId — upsert service_connectors row, set connector_type='api'
router.put('/:serviceId', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });

  const { providerKey, config, secret, secrets } = req.body;

  if (!providerKey) return res.status(400).json({ error: 'providerKey required' });

  const def = getConnector(providerKey);
  if (!def) return res.status(400).json({ error: `Unknown provider: ${providerKey}` });
  if (def.authType === 'localOAuth' && config?.consentLocalToken !== true) {
    return res.status(400).json({
      error: 'This connector reads a locally stored token from another app. Explicit consent (config.consentLocalToken=true) is required.',
    });
  }

  const svc = db.prepare('SELECT id FROM services WHERE id = ?').get(serviceId);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  // Merge onto the existing config rather than replacing it wholesale — the
  // current UI always resends every field, but re-saving with only secrets
  // filled (e.g. a future "rotate credentials" form) would otherwise wipe out
  // previously saved config like tenantId/org/accountSid.
  const existing = db.prepare('SELECT config FROM service_connectors WHERE service_id = ?').get(serviceId);
  const existingConfig = existing?.config ? JSON.parse(existing.config) : {};
  const mergedConfig = { ...existingConfig, ...(config ?? {}) };

  db.prepare(`
    INSERT INTO service_connectors (service_id, provider_key, enabled, config)
    VALUES (?, ?, 1, ?)
    ON CONFLICT (service_id) DO UPDATE SET
      provider_key = excluded.provider_key,
      enabled      = 1,
      config       = excluded.config
  `).run(serviceId, providerKey, JSON.stringify(mergedConfig));

  db.prepare(`UPDATE services SET connector_type = 'api' WHERE id = ?`).run(serviceId);

  // `secrets` (object) covers multi-account connectors (e.g. AWS accessKeyId+secretAccessKey).
  // `secret` (string) is the legacy single-key path; still accepted for backward compat.
  if (secrets != null && typeof secrets === 'object') {
    await Promise.all(
      Object.entries(secrets).map(([account, value]) =>
        setSecret(`connector:${serviceId}:${account}`, value)
      )
    );
  } else if (secret != null) {
    await setSecret(`connector:${serviceId}:apiKey`, secret);
  }

  res.json({ ok: true });
});

// DELETE /api/connectors/:serviceId — disable + deleteSecret
router.delete('/:serviceId', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });

  const row = db.prepare(
    'SELECT provider_key FROM service_connectors WHERE service_id = ?'
  ).get(serviceId);

  db.prepare(
    'UPDATE service_connectors SET enabled = 0 WHERE service_id = ?'
  ).run(serviceId);

  if (row) {
    const connector = getConnector(row.provider_key);
    const accounts = connector?.secretAccounts ?? ['apiKey'];
    await Promise.allSettled(
      accounts.map(a => deleteSecret(`connector:${serviceId}:${a}`))
    );
  }

  res.json({ ok: true });
});

// POST /api/connectors/:serviceId/sync — manual sync trigger
router.post('/:serviceId/sync', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });
  const result = await syncService(serviceId);
  res.json(result);
});

module.exports = router;
