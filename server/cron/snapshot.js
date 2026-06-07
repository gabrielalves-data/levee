'use strict';

const cron = require('node-cron');
const db = require('../db/database');
const { startAlertCron } = require('./refreshAlerts');
const { syncService } = require('../connectors/sync');

function takeSnapshot(year, month) {
  const rows = db.prepare(`
    WITH active_bills AS (
      SELECT
        s.id,
        s.name,
        s.category,
        sm.value_num AS monthly_bill
      FROM   services        s
      LEFT JOIN service_metrics sm ON sm.service_id = s.id
                                   AND sm.metric_key = 'monthly_bill'
      WHERE  s.active = 1
        AND  sm.value_num IS NOT NULL
    )
    SELECT id, name, category, monthly_bill
    FROM   active_bills
  `).all();

  const total = rows.reduce((acc, r) => acc + r.monthly_bill, 0);

  db.prepare(`
    INSERT OR REPLACE INTO monthly_snapshots (year, month, total_spend, breakdown, captured_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(year, month, total, JSON.stringify(rows));
}

async function syncEnabledConnectors() {
  const setting = db.prepare(
    `SELECT value FROM app_settings WHERE key = 'allow_outbound'`
  ).get();
  if (setting?.value !== 'true') return;

  const rows = db.prepare(`
    WITH enabled_api AS (
      SELECT sc.service_id
      FROM   service_connectors sc
      JOIN   services s ON s.id = sc.service_id
      WHERE  sc.enabled = 1
        AND  s.connector_type = 'api'
        AND  s.active = 1
    )
    SELECT service_id FROM enabled_api
  `).all();

  for (const { service_id } of rows) {
    await syncService(service_id);
  }
}

function startCrons() {
  // Snapshot previous month on the 1st at midnight
  cron.schedule('0 0 1 * *', () => {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    takeSnapshot(prev.getFullYear(), prev.getMonth() + 1);
  });

  // Sync enabled API connectors every 6 hours (only when allow_outbound=true)
  cron.schedule('0 */6 * * *', () => {
    syncEnabledConnectors().catch(err => {
      console.error('[devcost] connector sync error:', err.message);
    });
  });

  startAlertCron();
}

module.exports = { startCrons, takeSnapshot, syncEnabledConnectors };
