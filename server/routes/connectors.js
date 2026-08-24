'use strict';

const { Router } = require('express');
const db = require('../db/database');
const { list: listConnectors, get: getConnector } = require('../connectors/registry');
const { setSecret, getSecret, deleteSecret } = require('../secrets');
const { syncService, upsertMetrics, resolveConnectorSecrets } = require('../connectors/sync');
const { syncEnabledConnectors } = require('../cron/snapshot');
const { isValidId } = require('../middleware/validate');

const router = Router();

// Authoritative rate limit for POST /sync-all below — in-memory, resets on
// restart (same lifetime as the per-launch token), which is fine since this
// only throttles how often a user can force a bulk sync within one run.
const SYNC_ALL_COOLDOWN_MS = 5 * 60 * 1000;
let syncAllNextAllowedAt = 0;

// GET /api/connectors/providers — registry metadata (no secrets, no fetch fns)
router.get('/providers', (_req, res) => {
  res.json(listConnectors());
});

// PUT /api/connectors/:serviceId — upsert service_connectors row, set connector_type='api'
router.put('/:serviceId', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!isValidId(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });

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
  if (!isValidId(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });

  const row = db.prepare(
    'SELECT provider_key FROM service_connectors WHERE service_id = ?'
  ).get(serviceId);

  db.prepare(
    'UPDATE service_connectors SET enabled = 0 WHERE service_id = ?'
  ).run(serviceId);

  // Revert to manual so the card stops offering Sync/Disconnect for a
  // connector that no longer has credentials, and clear stale sync state.
  db.prepare(`
    UPDATE services
    SET    connector_type = 'manual', last_sync_at = NULL, sync_status = NULL, sync_error = NULL
    WHERE  id = ?
  `).run(serviceId);

  if (row) {
    const connector = getConnector(row.provider_key);
    const accounts = connector?.secretAccounts ?? ['apiKey'];
    await Promise.allSettled(
      accounts.map(a => deleteSecret(`connector:${serviceId}:${a}`))
    );
  }

  res.json({ ok: true });
});

// POST /api/connectors/sync-all — forces every enabled connector to sync right
// now, bypassing each connector's own interval (unlike sync-check below) — for
// "I want to see live data right now". Gated by a single 5min cooldown shared
// across every caller (not per-connector), since forcing on demand can hit a
// metered endpoint (AWS Cost Explorer @ $0.01/request) that its own interval
// exists specifically to cap.
router.post('/sync-all', async (_req, res) => {
  const now = Date.now();
  if (now < syncAllNextAllowedAt) {
    return res.status(429).json({
      error: 'Sync all was just run — please wait before retrying.',
      retryAfterMs: syncAllNextAllowedAt - now,
    });
  }

  const result = await syncEnabledConnectors({ force: true });
  if (result.outboundDisabled) {
    return res.status(400).json({ error: 'Enable outbound connections in Settings to sync.' });
  }

  syncAllNextAllowedAt = now + SYNC_ALL_COOLDOWN_MS;
  res.json({ ok: true, nextAllowedAt: syncAllNextAllowedAt, synced: result.synced });
});

// POST /api/connectors/sync-check — runs the same due-check the 6h cron uses,
// triggered instead by the Electron main process on window focus (debounced
// there to at most once every 20min). Reuses isDueForSync/last_sync_at, so it
// never syncs a connector earlier than its own configured interval — it only
// closes the gap between "became due" and the next scheduled cron tick.
// ignoreBackoff:true additionally skips the 24h failure-backoff floor (still
// gated by each connector's own interval) — the user is actively looking at
// the app, so a connector that was failing (e.g. an expired Claude Code
// token) gets retried on its normal cadence instead of staying stuck for up
// to a day after the user has already fixed the underlying problem.
router.post('/sync-check', async (_req, res) => {
  await syncEnabledConnectors({ ignoreBackoff: true });
  res.json({ ok: true });
});

// POST /api/connectors/:serviceId/sync — manual sync trigger
router.post('/:serviceId/sync', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!isValidId(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });
  const result = await syncService(serviceId);
  res.json(result);
});

// POST /api/connectors/:serviceId/test — cheapest-read connectivity check (§6.5).
// Confirms the stored credential is alive before the first sync cycle, without
// touching service_metrics or sync_status — distinct from a real sync. Most
// connectors have no dedicated testConnection hook, so this falls back to their
// own fetch() (already the cheapest available authenticated read for that
// provider) and discards the result; AWS defines a dedicated STS-based check
// since its fetch() calls the metered Cost Explorer endpoint.
router.post('/:serviceId/test', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!isValidId(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });

  const row = db.prepare(
    'SELECT provider_key, config FROM service_connectors WHERE service_id = ? AND enabled = 1'
  ).get(serviceId);
  if (!row) return res.status(404).json({ error: 'Connector not found' });

  const connector = getConnector(row.provider_key);
  if (!connector) return res.status(400).json({ error: `Unknown provider: ${row.provider_key}` });

  try {
    const config = row.config ? JSON.parse(row.config) : {};
    const secrets = await resolveConnectorSecrets(serviceId, connector, config);
    if (typeof connector.testConnection === 'function') {
      await connector.testConnection({ secrets, config });
    } else {
      await connector.fetch({ secrets, config });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message ?? String(err) });
  }
});

// POST /api/connectors/:serviceId/audit — opt-in least-privilege credential audit.
// Only active for connectors that declare an `audit` hook (currently AWS only).
router.post('/:serviceId/audit', async (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!isValidId(serviceId)) return res.status(400).json({ error: 'Invalid serviceId' });

  const row = db.prepare(
    'SELECT provider_key FROM service_connectors WHERE service_id = ? AND enabled = 1'
  ).get(serviceId);
  if (!row) return res.status(404).json({ error: 'Connector not found' });

  const connector = getConnector(row.provider_key);
  if (!connector?.audit) {
    return res.status(400).json({ error: `Connector "${row.provider_key}" does not support an audit.` });
  }

  try {
    const secrets = {};
    for (const account of connector.secretAccounts ?? []) {
      const value = await getSecret(`connector:${serviceId}:${account}`);
      if (value == null) {
        return res.status(400).json({ error: `Missing credential "${account}" — open the service card and reconnect.` });
      }
      secrets[account] = value;
    }
    const metrics = await connector.audit({ secrets });
    upsertMetrics(serviceId, metrics);
    res.json({ ok: true, metrics });
  } catch (err) {
    res.status(500).json({ error: err.message ?? String(err) });
  }
});

module.exports = router;
