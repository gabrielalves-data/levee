'use strict';

const { Router } = require('express');
const db = require('../db/database');
const { get: getConnectorDef } = require('../connectors/registry');
const { getSecret } = require('../secrets');
const { CATEGORY, COST_MODEL, VALUE_TYPE, CONNECTOR_TYPE, BILLING_PERIOD } = require('../middleware/validate');

const router = Router();

const EXPORT_VERSION = 1;

// Matches app_settings keys AND service_connectors.config keys that could hold
// something secret-shaped. Config is meant to hold non-secret values only
// (tenantId, org, accountSid, ...) but this is a belt-and-braces filter so a
// misconfigured connector can never leak a credential into an export file.
const FORBIDDEN_KEY_RE = /secret|key|token|password|credential/i;

// GET /api/backup/export
// Returns a secrets-free JSON snapshot of all user data.
router.get('/export', (req, res) => {
  const services = db.prepare(`
    WITH svc AS (
      SELECT id, name, provider, category, cost_model, monthly_cost,
             budget_cap, billing_day, billing_period, billing_month, icon, active,
             provider_key, plan_key, connector_type, auto_available
      FROM   services
    )
    SELECT id, name, provider, category, cost_model, monthly_cost,
           budget_cap, billing_day, billing_period, billing_month, icon, active,
           provider_key, plan_key, connector_type, auto_available
    FROM   svc
    ORDER  BY category, name
  `).all();

  const metricsStmt = db.prepare(`
    SELECT metric_key, label, value_type, value_num, value_text, unit
    FROM   service_metrics
    WHERE  service_id = ?
    ORDER  BY metric_key
  `);

  const servicesWithMetrics = services.map(({ id, ...svc }) => ({
    ...svc,
    metrics: metricsStmt.all(id),
  }));

  const widgetSlots = db.prepare(`
    WITH ws AS (
      SELECT slot_index, service_id, metric_key, label_override
      FROM   widget_slots
      ORDER  BY slot_index
    )
    SELECT slot_index, service_id, metric_key, label_override
    FROM   ws
  `).all();

  const monthlySnapshots = db.prepare(`
    SELECT year, month, total_spend, breakdown, captured_at
    FROM   monthly_snapshots
    ORDER  BY year DESC, month DESC
  `).all();

  const appSettings = db.prepare(`
    SELECT key, value
    FROM   app_settings
    ORDER  BY key
  `).all();

  const connectorRows = db.prepare(`
    WITH sc AS (
      SELECT service_id, provider_key, enabled, config
      FROM   service_connectors
    )
    SELECT s.name, s.provider, sc.provider_key, sc.enabled, sc.config
    FROM   sc
    JOIN   services s ON s.id = sc.service_id
    ORDER  BY s.name
  `).all();

  // Connector config never holds secrets by design (those live in the OS
  // keychain, keyed by service id) — this sweep is a second line of defence.
  const connectors = connectorRows.map(({ name, provider, provider_key, enabled, config }) => {
    const parsed = config ? JSON.parse(config) : {};
    const safeConfig = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!FORBIDDEN_KEY_RE.test(k)) safeConfig[k] = v;
    }
    return { service: name, provider, provider_key, enabled: !!enabled, config: safeConfig };
  });

  res.json({
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    services: servicesWithMetrics,
    connectors,
    widget_slots: widgetSlots,
    monthly_snapshots: monthlySnapshots,
    app_settings: appSettings,
  });
});

// POST /api/backup/import
// Validates shape then upserts all data. Services matched by name+provider.
router.post('/import', async (req, res) => {
  const payload = req.body;

  if (!payload || payload.version !== EXPORT_VERSION) {
    return res.status(400).json({ error: 'Invalid or unsupported backup version' });
  }
  if (!Array.isArray(payload.services)) {
    return res.status(400).json({ error: 'Missing services array' });
  }
  if (payload.connectors !== undefined && !Array.isArray(payload.connectors)) {
    return res.status(400).json({ error: 'connectors must be an array' });
  }

  const REQUIRED_SVC  = ['name', 'provider', 'category', 'cost_model'];
  const REQUIRED_MET  = ['metric_key', 'label', 'value_type'];
  const REQUIRED_CONN = ['service', 'provider', 'provider_key'];

  for (const svc of payload.services) {
    for (const f of REQUIRED_SVC) {
      if (!svc[f]) return res.status(400).json({ error: `Service missing field: ${f}` });
    }
    if (!CATEGORY.has(svc.category))   return res.status(400).json({ error: `Invalid category: ${svc.category}` });
    if (!COST_MODEL.has(svc.cost_model)) return res.status(400).json({ error: `Invalid cost_model: ${svc.cost_model}` });
    if (svc.connector_type !== undefined && !CONNECTOR_TYPE.has(svc.connector_type)) {
      return res.status(400).json({ error: `Invalid connector_type: ${svc.connector_type}` });
    }
    if (svc.billing_period !== undefined && !BILLING_PERIOD.has(svc.billing_period)) {
      return res.status(400).json({ error: `Invalid billing_period: ${svc.billing_period}` });
    }
    for (const m of svc.metrics ?? []) {
      for (const f of REQUIRED_MET) {
        if (!m[f]) return res.status(400).json({ error: `Metric missing field: ${f}` });
      }
      if (!VALUE_TYPE.has(m.value_type)) return res.status(400).json({ error: `Invalid value_type: ${m.value_type}` });
    }
  }

  for (const c of payload.connectors ?? []) {
    for (const f of REQUIRED_CONN) {
      if (!c[f]) return res.status(400).json({ error: `Connector missing field: ${f}` });
    }
  }

  const findSvc = db.prepare(`
    SELECT id FROM services WHERE name = ? AND provider = ?
  `);

  const patchSvc = db.prepare(`
    UPDATE services
    SET category = ?, cost_model = ?, monthly_cost = ?, budget_cap = ?,
        billing_day = ?, billing_period = ?, billing_month = ?, icon = ?, active = ?,
        provider_key = ?, plan_key = ?, connector_type = ?, auto_available = ?
    WHERE id = ?
  `);

  const upsertConnector = db.prepare(`
    INSERT INTO service_connectors (service_id, provider_key, enabled, config)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (service_id) DO UPDATE SET
      provider_key = excluded.provider_key,
      enabled      = excluded.enabled,
      config       = excluded.config
  `);

  const upsertMetric = db.prepare(`
    INSERT INTO service_metrics (service_id, metric_key, label, value_type, value_num, value_text, unit, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (service_id, metric_key) DO UPDATE SET
      label      = excluded.label,
      value_type = excluded.value_type,
      value_num  = excluded.value_num,
      value_text = excluded.value_text,
      unit       = excluded.unit,
      updated_at = excluded.updated_at
  `);

  const upsertSlot = db.prepare(`
    INSERT INTO widget_slots (slot_index, service_id, metric_key, label_override, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT (slot_index) DO UPDATE SET
      service_id     = excluded.service_id,
      metric_key     = excluded.metric_key,
      label_override = excluded.label_override,
      updated_at     = excluded.updated_at
  `);

  const upsertSnapshot = db.prepare(`
    INSERT INTO monthly_snapshots (year, month, total_spend, breakdown, captured_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (year, month) DO UPDATE SET
      total_spend = excluded.total_spend,
      breakdown   = excluded.breakdown,
      captured_at = excluded.captured_at
  `);

  const upsertSetting = db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `);

  let imported = { services: 0, metrics: 0, connectors: 0, slots: 0, snapshots: 0, settings: 0 };

  const doImport = db.transaction(() => {
    for (const svc of payload.services) {
      let existing = findSvc.get(svc.name, svc.provider);
      let svcId;

      if (existing) {
        patchSvc.run(svc.category, svc.cost_model, svc.monthly_cost ?? null,
                     svc.budget_cap ?? null, svc.billing_day ?? null,
                     svc.billing_period ?? 'monthly', svc.billing_month ?? null,
                     svc.icon ?? null, svc.active ?? 1,
                     svc.provider_key ?? null, svc.plan_key ?? null,
                     svc.connector_type ?? 'manual', svc.auto_available ?? 0,
                     existing.id);
        svcId = existing.id;
      } else {
        const r = db.prepare(`
          INSERT INTO services (name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, billing_period, billing_month, icon, active, provider_key, plan_key, connector_type, auto_available)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(svc.name, svc.provider, svc.category, svc.cost_model,
               svc.monthly_cost ?? null, svc.budget_cap ?? null,
               svc.billing_day ?? null, svc.billing_period ?? 'monthly', svc.billing_month ?? null,
               svc.icon ?? null, svc.active ?? 1,
               svc.provider_key ?? null, svc.plan_key ?? null,
               svc.connector_type ?? 'manual', svc.auto_available ?? 0);
        svcId = r.lastInsertRowid;
      }
      imported.services++;

      for (const m of svc.metrics ?? []) {
        upsertMetric.run(svcId, m.metric_key, m.label, m.value_type,
                         m.value_num ?? null, m.value_text ?? null, m.unit ?? null);
        imported.metrics++;
      }
    }

    for (const c of payload.connectors ?? []) {
      const svc = findSvc.get(c.service, c.provider);
      if (!svc) continue; // no matching service in this import
      upsertConnector.run(svc.id, c.provider_key, c.enabled ? 1 : 0, JSON.stringify(c.config ?? {}));
      imported.connectors++;
    }

    for (const slot of payload.widget_slots ?? []) {
      upsertSlot.run(slot.slot_index, slot.service_id ?? null,
                     slot.metric_key ?? null, slot.label_override ?? null);
      imported.slots++;
    }

    for (const snap of payload.monthly_snapshots ?? []) {
      upsertSnapshot.run(snap.year, snap.month, snap.total_spend,
                         typeof snap.breakdown === 'string'
                           ? snap.breakdown
                           : JSON.stringify(snap.breakdown),
                         snap.captured_at);
      imported.snapshots++;
    }

    for (const setting of payload.app_settings ?? []) {
      if (FORBIDDEN_KEY_RE.test(setting.key)) continue;
      upsertSetting.run(setting.key, setting.value);
      imported.settings++;
    }
  });

  const flagMissingCreds = db.prepare(`
    UPDATE services SET sync_status = 'error', sync_error = ? WHERE id = ?
  `);

  try {
    doImport();

    // Secrets never travel in a backup (they stay in the OS keychain, keyed
    // by service id) — restoring on a new machine, or restoring services
    // that get new ids, leaves the keychain lookup empty. Flag those now
    // instead of leaving the service silently un-synced until the next sync
    // cron tick surfaces the same error (see sync.js).
    for (const c of payload.connectors ?? []) {
      if (!c.enabled) continue;
      const def = getConnectorDef(c.provider_key);
      if (!def) continue;
      const svc = findSvc.get(c.service, c.provider);
      if (!svc) continue;
      for (const account of def.secretAccounts ?? []) {
        const value = await getSecret(`connector:${svc.id}:${account}`);
        if (value == null) {
          flagMissingCreds.run('Reconnect: credentials not found', svc.id);
          break;
        }
      }
    }

    res.json({ ok: true, imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
