'use strict';

const cron = require('node-cron');
const db = require('../db/database');
const { startAlertCron } = require('./refreshAlerts');

function takeSnapshot(period) {
  const breakdown = db.prepare(`
    WITH cost_by_service AS (
      SELECT
        s.id,
        s.name,
        s.category,
        SUM(m.cost_usd) AS total_usd
      FROM   metrics  m
      JOIN   services s ON s.id = m.service_id
      WHERE  m.period = ?
      GROUP  BY s.id, s.name, s.category
    )
    SELECT id, name, category, total_usd
    FROM   cost_by_service
  `).all(period);

  const total = breakdown.reduce((acc, r) => acc + r.total_usd, 0);

  db.prepare(`
    INSERT OR REPLACE INTO snapshots (period, total_usd, payload)
    VALUES (?, ?, ?)
  `).run(period, total, JSON.stringify(breakdown));
}

function startCrons() {
  // Snapshot previous month on the 1st at midnight
  cron.schedule('0 0 1 * *', () => {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    takeSnapshot(prev.toISOString().slice(0, 7));
  });

  startAlertCron();
}

module.exports = { startCrons, takeSnapshot };
