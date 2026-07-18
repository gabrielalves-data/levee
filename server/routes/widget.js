'use strict';

const { Router } = require('express');
const db = require('../db/database');
const { isValidSlotIndex, serviceExists } = require('../middleware/validate');

const router = Router();

// GET /api/widget — all slots with joined service + metric data
router.get('/', (req, res) => {
  const rows = db.prepare(`
    WITH slot_data AS (
      SELECT
        ws.id,
        ws.slot_index,
        ws.service_id,
        ws.metric_key,
        ws.label_override,
        ws.updated_at,
        s.name        AS service_name,
        sm.label      AS metric_label,
        sm.value_type,
        sm.value_num,
        sm.value_text,
        sm.unit
      FROM      widget_slots    ws
      LEFT JOIN services        s  ON s.id  = ws.service_id
      LEFT JOIN service_metrics sm ON sm.service_id = ws.service_id
                                   AND sm.metric_key = ws.metric_key
    )
    SELECT id, slot_index, service_id, metric_key, label_override, updated_at,
           service_name, metric_label, value_type, value_num, value_text, unit
    FROM   slot_data
    ORDER  BY slot_index
  `).all();
  res.json(rows);
});

// PUT /api/widget/:slotIndex — assign or update a slot
router.put('/:slotIndex', (req, res) => {
  const slotIndex = Number(req.params.slotIndex);
  if (!isValidSlotIndex(slotIndex)) {
    return res.status(400).json({ error: 'slotIndex must be an integer between 0 and 3' });
  }

  const { service_id, metric_key, label_override } = req.body;
  if (service_id != null && !serviceExists(service_id)) {
    return res.status(400).json({ error: `Unknown service_id: ${service_id}` });
  }

  db.prepare(`
    INSERT INTO widget_slots (slot_index, service_id, metric_key, label_override, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT (slot_index) DO UPDATE SET
      service_id     = excluded.service_id,
      metric_key     = excluded.metric_key,
      label_override = excluded.label_override,
      updated_at     = datetime('now')
  `).run(slotIndex, service_id ?? null, metric_key ?? null, label_override ?? null);
  res.json({ ok: true });
});

// DELETE /api/widget/:slotIndex — clear a slot (nulls service/metric, keeps the row)
router.delete('/:slotIndex', (req, res) => {
  const slotIndex = Number(req.params.slotIndex);
  if (!isValidSlotIndex(slotIndex)) {
    return res.status(400).json({ error: 'slotIndex must be an integer between 0 and 3' });
  }
  db.prepare(`
    UPDATE widget_slots
    SET service_id = NULL, metric_key = NULL, label_override = NULL, updated_at = datetime('now')
    WHERE slot_index = ?
  `).run(slotIndex);
  res.json({ ok: true });
});

module.exports = router;
