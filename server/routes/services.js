'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, category, provider, billing_url, notes, active, created_at
    FROM   services
    WHERE  active = 1
    ORDER  BY category, name
  `).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, category, provider, billing_url, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO services (name, category, provider, billing_url, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, category, provider, billing_url ?? null, notes ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/:id', (req, res) => {
  const { name, category, provider, billing_url, notes, active } = req.body;
  db.prepare(`
    UPDATE services
    SET    name        = COALESCE(?, name),
           category    = COALESCE(?, category),
           provider    = COALESCE(?, provider),
           billing_url = COALESCE(?, billing_url),
           notes       = COALESCE(?, notes),
           active      = COALESCE(?, active),
           updated_at  = datetime('now')
    WHERE  id = ?
  `).run(name ?? null, category ?? null, provider ?? null,
         billing_url ?? null, notes ?? null, active ?? null,
         req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE services SET active = 0, updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
