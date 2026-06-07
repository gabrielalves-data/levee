'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(req.params.key);
  res.json({ value: row?.value ?? null });
});

const FORBIDDEN_KEY_RE = /secret|key|token|password|credential/i;

router.put('/:key', (req, res) => {
  if (FORBIDDEN_KEY_RE.test(req.params.key)) {
    return res.status(400).json({ error: 'Use the secrets API for credentials' });
  }
  const { value } = req.body;
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(req.params.key, String(value));
  res.json({ ok: true });
});

module.exports = router;
