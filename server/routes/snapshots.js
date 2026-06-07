'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

// GET /api/snapshots/last?n=2 — most-recent N monthly snapshots, oldest-first
router.get('/last', (req, res) => {
  const n = Math.min(Math.max(1, parseInt(req.query.n ?? '2', 10)), 12);
  const rows = db.prepare(`
    WITH recent AS (
      SELECT year, month, total_spend, breakdown, captured_at
      FROM   monthly_snapshots
      ORDER  BY year DESC, month DESC
      LIMIT  ?
    )
    SELECT year, month, total_spend, breakdown, captured_at
    FROM   recent
    ORDER  BY year ASC, month ASC
  `).all(n);
  res.json(rows.map(r => ({ ...r, breakdown: JSON.parse(r.breakdown || '[]') })));
});

module.exports = router;
