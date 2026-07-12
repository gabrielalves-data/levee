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

// If the machine was asleep/off at month-end, the 23:50 job below never fired.
// On every start, back-fill last month's snapshot from current monthly_bill
// values, but only for the first couple of days — past that, API-connected
// services have likely already synced into the new month's MTD and the
// numbers would no longer reflect the month that closed.
function catchUpMissedSnapshot() {
  const now = new Date();
  if (now.getDate() > 2) return;
  const prev = new Date(now);
  prev.setMonth(prev.getMonth() - 1);
  const year = prev.getFullYear();
  const month = prev.getMonth() + 1;
  const existing = db.prepare(
    `SELECT 1 FROM monthly_snapshots WHERE year = ? AND month = ?`
  ).get(year, month);
  if (!existing) takeSnapshot(year, month);
}

function startCrons() {
  // Snapshot the closing month at 23:50 on its last possible day (28-31),
  // firing only when tomorrow rolls over to the 1st. A "snapshot on the 1st
  // at 00:00" job would land on the same minute as the 6-hour sync cron below
  // and race it: depending on ordering, the snapshot would record either a
  // stale value or the new month's near-zero MTD instead of the month that
  // just closed.
  cron.schedule('50 23 28-31 * *', () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (tomorrow.getDate() !== 1) return;
    takeSnapshot(now.getFullYear(), now.getMonth() + 1);
  });

  // Sync enabled API connectors every 6 hours (only when allow_outbound=true)
  cron.schedule('0 */6 * * *', () => {
    syncEnabledConnectors().catch(err => {
      console.error('[levee] connector sync error:', err.message);
    });
  });

  startAlertCron();
  catchUpMissedSnapshot();
}

module.exports = { startCrons, takeSnapshot, syncEnabledConnectors };
