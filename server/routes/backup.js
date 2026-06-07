'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

const EXPORT_VERSION = 1;

// GET /api/backup/export
// Returns a secrets-free JSON snapshot of all user data.
router.get('/export', (req, res) => {
  const services = db.prepare(`
    WITH svc AS (
      SELECT id, name, provider, category, cost_model, monthly_cost,
             budget_cap, billing_day, icon, active
      FROM   services
    )
    SELECT id, name, provider, category, cost_model, monthly_cost,
           budget_cap, billing_day, icon, active
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

  res.json({
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    services: servicesWithMetrics,
    widget_slots: widgetSlots,
    monthly_snapshots: monthlySnapshots,
    app_settings: appSettings,
  });
});

// POST /api/backup/import
// Validates shape then upserts all data. Services matched by name+provider.
router.post('/import', (req, res) => {
  const payload = req.body;

  if (!payload || payload.version !== EXPORT_VERSION) {
    return res.status(400).json({ error: 'Invalid or unsupported backup version' });
  }
  if (!Array.isArray(payload.services)) {
    return res.status(400).json({ error: 'Missing services array' });
  }

  const REQUIRED_SVC  = ['name', 'provider', 'category', 'cost_model'];
  const REQUIRED_MET  = ['metric_key', 'label', 'value_type'];
  const VALID_CAT     = new Set(['cloud', 'ai_model', 'ai_api', 'tool', 'custom']);
  const VALID_MODEL   = new Set(['flat', 'usage', 'hybrid']);
  const VALID_VTYPE   = new Set(['number', 'percent', 'currency', 'date', 'text']);

  for (const svc of payload.services) {
    for (const f of REQUIRED_SVC) {
      if (!svc[f]) return res.status(400).json({ error: `Service missing field: ${f}` });
    }
    if (!VALID_CAT.has(svc.category))   return res.status(400).json({ error: `Invalid category: ${svc.category}` });
    if (!VALID_MODEL.has(svc.cost_model)) return res.status(400).json({ error: `Invalid cost_model: ${svc.cost_model}` });
    for (const m of svc.metrics ?? []) {
      for (const f of REQUIRED_MET) {
        if (!m[f]) return res.status(400).json({ error: `Metric missing field: ${f}` });
      }
      if (!VALID_VTYPE.has(m.value_type)) return res.status(400).json({ error: `Invalid value_type: ${m.value_type}` });
    }
  }

  const upsertSvc = db.prepare(`
    INSERT INTO services (name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, icon, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (rowid) DO NOTHING
  `);

  const findSvc = db.prepare(`
    SELECT id FROM services WHERE name = ? AND provider = ?
  `);

  const patchSvc = db.prepare(`
    UPDATE services
    SET category = ?, cost_model = ?, monthly_cost = ?, budget_cap = ?,
        billing_day = ?, icon = ?, active = ?
    WHERE id = ?
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

  const FORBIDDEN_KEY_RE = /secret|key|token|password|credential/i;

  let imported = { services: 0, metrics: 0, slots: 0, snapshots: 0, settings: 0 };

  const doImport = db.transaction(() => {
    for (const svc of payload.services) {
      let existing = findSvc.get(svc.name, svc.provider);
      let svcId;

      if (existing) {
        patchSvc.run(svc.category, svc.cost_model, svc.monthly_cost ?? null,
                     svc.budget_cap ?? null, svc.billing_day ?? null,
                     svc.icon ?? null, svc.active ?? 1, existing.id);
        svcId = existing.id;
      } else {
        const r = db.prepare(`
          INSERT INTO services (name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, icon, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(svc.name, svc.provider, svc.category, svc.cost_model,
               svc.monthly_cost ?? null, svc.budget_cap ?? null,
               svc.billing_day ?? null, svc.icon ?? null, svc.active ?? 1);
        svcId = r.lastInsertRowid;
      }
      imported.services++;

      for (const m of svc.metrics ?? []) {
        upsertMetric.run(svcId, m.metric_key, m.label, m.value_type,
                         m.value_num ?? null, m.value_text ?? null, m.unit ?? null);
        imported.metrics++;
      }
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

  try {
    doImport();
    res.json({ ok: true, imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
