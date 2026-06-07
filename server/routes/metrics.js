'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

// GET /api/metrics?period=2025-06
router.get('/', (req, res) => {
  const { period } = req.query;
  const rows = db.prepare(`
    WITH period_data AS (
      SELECT
        m.service_id,
        m.period,
        m.cost_usd,
        m.usage_units,
        m.unit_label,
        s.name     AS service_name,
        s.category
      FROM   metrics  m
      JOIN   services s ON s.id = m.service_id
      WHERE  (? IS NULL OR m.period = ?)
    )
    SELECT service_id, period, cost_usd, usage_units, unit_label, service_name, category
    FROM   period_data
    ORDER  BY period DESC, cost_usd DESC
  `).all(period ?? null, period ?? null);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { service_id, period, cost_usd, usage_units, unit_label } = req.body;
  const result = db.prepare(`
    INSERT INTO metrics (service_id, period, cost_usd, usage_units, unit_label)
    VALUES (?, ?, ?, ?, ?)
  `).run(service_id, period, cost_usd, usage_units ?? null, unit_label ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
