'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(req.params.key);
  res.json({ value: row?.value ?? null });
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(req.params.key, String(value));
  res.json({ ok: true });
});

module.exports = router;
