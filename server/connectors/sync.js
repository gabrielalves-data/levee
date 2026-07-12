'use strict';

const db = require('../db/database');
const { get: getConnector } = require('./registry');
const { getSecret } = require('../secrets');

const upsertMetric = db.prepare(`
  INSERT INTO service_metrics
    (service_id, metric_key, label, value_type, value_num, value_text, unit, source, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'sync', datetime('now'))
  ON CONFLICT (service_id, metric_key) DO UPDATE SET
    label      = excluded.label,
    value_type = excluded.value_type,
    value_num  = excluded.value_num,
    value_text = excluded.value_text,
    unit       = excluded.unit,
    source     = excluded.source,
    updated_at = datetime('now')
`);

const updateSyncResult = db.prepare(`
  UPDATE services
  SET    last_sync_at = ?,
         sync_status  = ?,
         sync_error   = ?
  WHERE  id = ?
`);

const runUpsertMetrics = db.transaction((serviceId, metrics) => {
  for (const m of metrics) {
    upsertMetric.run(
      serviceId, m.metric_key, m.label, m.value_type,
      m.value_num ?? null, m.value_text ?? null, m.unit ?? null,
    );
  }
});

async function syncService(serviceId) {
  const row = db.prepare(`
    WITH sc AS (
      SELECT service_id, provider_key, enabled, config
      FROM   service_connectors
      WHERE  service_id = ?
    )
    SELECT sc.service_id, sc.provider_key, sc.enabled, sc.config,
           s.connector_type
    FROM   sc
    JOIN   services s ON s.id = sc.service_id
  `).get(serviceId);

  if (!row || !row.enabled || row.connector_type !== 'api') {
    return { sync_status: null, sync_error: null, last_sync_at: null };
  }

  const connector = getConnector(row.provider_key);
  if (!connector) {
    const msg = `Unknown provider: ${row.provider_key}`;
    const now = new Date().toISOString();
    updateSyncResult.run(now, 'error', msg, serviceId);
    return { sync_status: 'error', sync_error: msg, last_sync_at: now };
  }

  const now = new Date().toISOString();
  try {
    const secrets = {};
    for (const account of connector.secretAccounts ?? []) {
      const value = await getSecret(`connector:${serviceId}:${account}`);
      if (value == null) {
        throw new Error(`Missing credential "${account}" — open the service card and reconnect.`);
      }
      secrets[account] = value;
    }
    const config = row.config ? JSON.parse(row.config) : {};
    const metrics = await connector.fetch({ secrets, config });
    runUpsertMetrics(serviceId, metrics);
    updateSyncResult.run(now, 'ok', null, serviceId);
    return { sync_status: 'ok', sync_error: null, last_sync_at: now };
  } catch (err) {
    const msg = err.message ?? String(err);
    updateSyncResult.run(now, 'error', msg, serviceId);
    return { sync_status: 'error', sync_error: msg, last_sync_at: now };
  }
}

module.exports = { syncService };
