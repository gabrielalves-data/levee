'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

const ALLOWED_FIELDS = new Set([
  'name', 'provider', 'category', 'cost_model',
  'monthly_cost', 'budget_cap', 'billing_day', 'icon', 'active',
]);

// GET /api/services          → active only
// GET /api/services?all=1    → active + inactive
router.get('/', (req, res) => {
  const all = req.query.all === '1';
  const rows = db.prepare(`
    SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
           billing_day, icon, is_seed, active, created_at
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
             billing_day, icon, is_seed, active, created_at
      FROM   services
      WHERE  id = ?
    )
    SELECT id, name, provider, category, cost_model, monthly_cost, budget_cap,
           billing_day, icon, is_seed, active, created_at
    FROM   svc
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/services
router.post('/', (req, res) => {
  const { name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, icon } = req.body;
  if (!name || !provider || !category) {
    return res.status(400).json({ error: 'name, provider, category required' });
  }
  const result = db.prepare(`
    INSERT INTO services (name, provider, category, cost_model, monthly_cost, budget_cap, billing_day, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, provider, category, cost_model ?? 'flat',
         monthly_cost ?? null, budget_cap ?? null, billing_day ?? null, icon ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH /api/services/:id — update only the fields present in the body
router.patch('/:id', (req, res) => {
  const fields = Object.keys(req.body).filter(k => ALLOWED_FIELDS.has(k));
  if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

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
