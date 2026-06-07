'use strict';

const { Router } = require('express');
const db = require('../db/database');

const router = Router();

// GET /api/metrics/:serviceId — all metrics for a service
router.get('/:serviceId', (req, res) => {
  const rows = db.prepare(`
    WITH svc_metrics AS (
      SELECT id, service_id, metric_key, label, value_type, value_num, value_text, unit, updated_at
      FROM   service_metrics
      WHERE  service_id = ?
    )
    SELECT id, service_id, metric_key, label, value_type, value_num, value_text, unit, updated_at
    FROM   svc_metrics
    ORDER  BY metric_key
  `).all(req.params.serviceId);
  res.json(rows);
});

// PUT /api/metrics/:serviceId/:metricKey — upsert a metric value
router.put('/:serviceId/:metricKey', (req, res) => {
  const { label, value_type, value_num, value_text, unit } = req.body;
  if (!label || !value_type) {
    return res.status(400).json({ error: 'label and value_type required' });
  }
  db.prepare(`
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
  `).run(req.params.serviceId, req.params.metricKey, label, value_type,
         value_num ?? null, value_text ?? null, unit ?? null);
  res.json({ ok: true });
});

// DELETE /api/metrics/:serviceId/:metricKey
router.delete('/:serviceId/:metricKey', (req, res) => {
  db.prepare(`
    DELETE FROM service_metrics WHERE service_id = ? AND metric_key = ?
  `).run(req.params.serviceId, req.params.metricKey);
  res.json({ ok: true });
});

module.exports = router;
