'use strict';

const { Router } = require('express');
const db = require('../db/database');
const { getProvider } = require('../providers');
const { CATEGORY, COST_MODEL, BILLING_PERIOD } = require('../middleware/validate');

const router = Router();

const ALLOWED_FIELDS = new Set([
  'name', 'provider', 'category', 'cost_model',
  'monthly_cost', 'budget_cap', 'billing_day', 'billing_period', 'billing_month', 'icon', 'active',
]);

// GET /api/services          → active only
// GET /api/services?all=1    → active + inactive
router.get('/', (req, res) => {
  const all = req.query.all === '1';
  const rows = db.prepare(`
    WITH svc AS (
      SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
             billing_day, billing_period, billing_month, icon, is_seed, active, auto_available, connector_type,
             provider_key, plan_key,
             last_sync_at, sync_status, sync_error, created_at
      FROM   services
      WHERE  (? = 1 OR active = 1)
    )
    SELECT svc.id, svc.name, svc.provider, svc.category, svc.cost_model, svc.monthly_cost, svc.budget_cap,
           svc.billing_day, svc.billing_period, svc.billing_month, svc.icon, svc.is_seed, svc.active, svc.auto_available, svc.connector_type,
           svc.provider_key, svc.plan_key,
           svc.last_sync_at, svc.sync_status, svc.sync_error, svc.created_at,
           sc.consecutive_failures
    FROM   svc
    LEFT JOIN service_connectors sc ON sc.service_id = svc.id
    ORDER  BY svc.category, svc.name
  `).all(all ? 1 : 0);
  res.json(rows);
});

// GET /api/services/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    WITH svc AS (
      SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
             billing_day, billing_period, billing_month, icon, is_seed, active, auto_available, connector_type,
             provider_key, plan_key,
             last_sync_at, sync_status, sync_error, created_at
      FROM   services
      WHERE  id = ?
    )
    SELECT svc.id, svc.name, svc.provider, svc.category, svc.cost_model, svc.monthly_cost, svc.budget_cap,
           svc.billing_day, svc.billing_period, svc.billing_month, svc.icon, svc.is_seed, svc.active, svc.auto_available, svc.connector_type,
           svc.provider_key, svc.plan_key,
           svc.last_sync_at, svc.sync_status, svc.sync_error, svc.created_at,
           sc.consecutive_failures
    FROM   svc
    LEFT JOIN service_connectors sc ON sc.service_id = svc.id
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/services
router.post('/', (req, res) => {
  const { name, provider, category, cost_model, monthly_cost, budget_cap, billing_day,
          billing_period, billing_month, icon, provider_key } = req.body;

  // Provider-first path: a known provider_key binds the service to the directory,
  // makes auto-retrieval available, and supplies a default category.
  let resolvedCategory = category;
  let autoAvailable = 0;
  if (provider_key != null) {
    const provider_def = getProvider(provider_key);
    if (!provider_def) {
      return res.status(400).json({ error: `Unknown provider_key: ${provider_key}` });
    }
    resolvedCategory = category ?? provider_def.category;
    autoAvailable = 1;
  }

  if (!name || !provider || !resolvedCategory) {
    return res.status(400).json({ error: 'name, provider, category required' });
  }
  if (!CATEGORY.has(resolvedCategory)) {
    return res.status(400).json({ error: `Invalid category: ${resolvedCategory}` });
  }
  if (cost_model !== undefined && !COST_MODEL.has(cost_model)) {
    return res.status(400).json({ error: `Invalid cost_model: ${cost_model}` });
  }
  if (billing_period !== undefined && !BILLING_PERIOD.has(billing_period)) {
    return res.status(400).json({ error: `Invalid billing_period: ${billing_period}` });
  }
  const result = db.prepare(`
    INSERT INTO services (name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, billing_period, billing_month, icon, provider_key, auto_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, provider, resolvedCategory, cost_model ?? 'flat',
         monthly_cost ?? null, budget_cap ?? null, billing_day ?? null,
         billing_period ?? 'monthly', billing_month ?? null, icon ?? null,
         provider_key ?? null, autoAvailable);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/services/:id — update only the fields present in the body
router.patch('/:id', (req, res) => {
  const fields = Object.keys(req.body).filter(k => ALLOWED_FIELDS.has(k));
  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  if (req.body.category !== undefined && !CATEGORY.has(req.body.category)) {
    return res.status(400).json({ error: `Invalid category: ${req.body.category}` });
  }
  if (req.body.cost_model !== undefined && !COST_MODEL.has(req.body.cost_model)) {
    return res.status(400).json({ error: `Invalid cost_model: ${req.body.cost_model}` });
  }
  if (req.body.billing_period !== undefined && !BILLING_PERIOD.has(req.body.billing_period)) {
    return res.status(400).json({ error: `Invalid billing_period: ${req.body.billing_period}` });
  }

  // Column names come from the whitelist, never from raw user input — safe to interpolate.
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values    = fields.map(f => req.body[f] !== undefined ? req.body[f] : null);

  db.prepare(`UPDATE services SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/services/:id — soft-archive
router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE services SET active = 0 WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
