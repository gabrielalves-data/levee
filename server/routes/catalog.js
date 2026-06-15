'use strict';

const { Router } = require('express');
const db = require('../db/database');
const catalog = require('../catalog/plans.json');

const router = Router();

const upsertMetric = db.prepare(`
  INSERT INTO service_metrics
    (service_id, metric_key, label, value_type, value_num, value_text, unit, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT (service_id, metric_key) DO UPDATE SET
    label      = excluded.label,
    value_type = excluded.value_type,
    value_num  = excluded.value_num,
    value_text = excluded.value_text,
    unit       = excluded.unit,
    updated_at = datetime('now')
`);

const setServicePlan = db.prepare(`
  UPDATE services
  SET    connector_type = 'catalog', plan_key = ?, monthly_cost = ?
  WHERE  id = ?
`);

const applyPlan = db.transaction((serviceId, plan, planKey) => {
  setServicePlan.run(planKey, plan.price, serviceId);
  upsertMetric.run(serviceId, 'plan', 'Plan', 'text', null, plan.label, null);
  upsertMetric.run(serviceId, 'monthly_bill', 'Monthly Bill', 'currency', plan.price, null, plan.currency);
});

// GET /api/catalog — the parsed plan catalog (no secrets stored here).
router.get('/', (req, res) => {
  res.json(catalog);
});

// POST /api/catalog/apply — apply a catalog plan to a service.
router.post('/apply', (req, res) => {
  const { serviceId, providerKey, planKey } = req.body;
  if (!serviceId || !providerKey || !planKey) {
    return res.status(400).json({ error: 'serviceId, providerKey, planKey required' });
  }

  const provider = catalog[providerKey];
  const plan = provider && provider.plans ? provider.plans[planKey] : undefined;
  if (!plan) {
    return res.status(404).json({ error: 'Unknown providerKey or planKey' });
  }

  const exists = db.prepare('SELECT id FROM services WHERE id = ?').get(serviceId);
  if (!exists) return res.status(404).json({ error: 'Service not found' });

  applyPlan(serviceId, plan, planKey);
  res.json({ ok: true, serviceId, planKey, monthly_bill: plan.price });
});

module.exports = router;
