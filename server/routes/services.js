'use strict';

const { Router } = require('express');
const db = require('../db/database');
const { getProvider } = require('../providers');

const router = Router();

const ALLOWED_FIELDS = new Set([
  'name', 'provider', 'category', 'cost_model',
  'monthly_cost', 'budget_cap', 'billing_day', 'icon', 'active',
]);

const VALID_CATEGORY   = new Set(['cloud', 'ai_model', 'ai_api', 'tool', 'custom']);
const VALID_COST_MODEL = new Set(['flat', 'usage', 'hybrid']);

// GET /api/services          → active only
// GET /api/services?all=1    → active + inactive
router.get('/', (req, res) => {
  const all = req.query.all === '1';
  const rows = db.prepare(`
    SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
           billing_day, icon, is_seed, active, auto_available, connector_type,
           provider_key, plan_key,
           last_sync_at, sync_status, sync_error, created_at
    FROM   services
    WHERE  (? = 1 OR active = 1)
    ORDER  BY category, name
  `).all(all ? 1 : 0);
  res.json(rows);
});

// GET /api/services/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    WITH svc AS (
      SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
             billing_day, icon, is_seed, active, auto_available, connector_type,
             provider_key, plan_key,
             last_sync_at, sync_status, sync_error, created_at
      FROM   services
      WHERE  id = ?
    )
    SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
           billing_day, icon, is_seed, active, auto_available, connector_type,
           provider_key, plan_key,
           last_sync_at, sync_status, sync_error, created_at
    FROM   svc
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/services
router.post('/', (req, res) => {
  const { name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, icon, provider_key } = req.body;

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
  if (!VALID_CATEGORY.has(resolvedCategory)) {
    return res.status(400).json({ error: `Invalid category: ${resolvedCategory}` });
  }
  if (cost_model !== undefined && !VALID_COST_MODEL.has(cost_model)) {
    return res.status(400).json({ error: `Invalid cost_model: ${cost_model}` });
  }
  const result = db.prepare(`
    INSERT INTO services (name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, icon, provider_key, auto_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, provider, resolvedCategory, cost_model ?? 'flat',
         monthly_cost ?? null, budget_cap ?? null, billing_day ?? null, icon ?? null,
         provider_key ?? null, autoAvailable);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/services/:id — update only the fields present in the body
router.patch('/:id', (req, res) => {
  const fields = Object.keys(req.body).filter(k => ALLOWED_FIELDS.has(k));
  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  if (req.body.category !== undefined && !VALID_CATEGORY.has(req.body.category)) {
    return res.status(400).json({ error: `Invalid category: ${req.body.category}` });
  }
  if (req.body.cost_model !== undefined && !VALID_COST_MODEL.has(req.body.cost_model)) {
    return res.status(400).json({ error: `Invalid cost_model: ${req.body.cost_model}` });
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
