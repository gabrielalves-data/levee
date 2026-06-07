'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

// Summary payload for the always-on-top overlay widget
router.get('/', (req, res) => {
  const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const byCategory = db.prepare(`
    WITH monthly AS (
      SELECT
        s.category,
        SUM(m.cost_usd) AS total_usd
      FROM   metrics  m
      JOIN   services s ON s.id = m.service_id
      WHERE  m.period = ?
      GROUP  BY s.category
    )
    SELECT category, total_usd
    FROM   monthly
    ORDER  BY total_usd DESC
  `).all(period);

  const total = byCategory.reduce((acc, r) => acc + r.total_usd, 0);

  res.json({ period, total_usd: total, by_category: byCategory });
});

module.exports = router;
