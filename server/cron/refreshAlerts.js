'use strict';

const cron = require('node-cron');
const db = require('../db/database');

function checkAlerts() {
  const period = new Date().toISOString().slice(0, 7);

  const breached = db.prepare(`
    WITH period_costs AS (
      SELECT service_id, SUM(cost_usd) AS total_usd
      FROM   metrics
      WHERE  period = ?
      GROUP  BY service_id
    )
    SELECT
      a.id        AS alert_id,
      a.service_id,
      a.threshold,
      pc.total_usd
    FROM   alerts       a
    JOIN   period_costs pc ON pc.service_id = a.service_id
    WHERE  pc.total_usd >= a.threshold
      AND  a.triggered = 0
  `).all(period);

  if (breached.length === 0) return breached;

  const mark = db.prepare(`UPDATE alerts SET triggered = 1 WHERE id = ?`);
  db.transaction((rows) => rows.forEach((r) => mark.run(r.alert_id)))(breached);

  return breached;
}

function startAlertCron() {
  cron.schedule('0 * * * *', () => {
    const breached = checkAlerts();
    if (breached.length > 0) {
      // TODO: emit to electron main via IPC for system notification
      console.log('[alerts] thresholds breached:', breached.length);
    }
  });
}

module.exports = { startAlertCron, checkAlerts };
