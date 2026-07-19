'use strict';

const cron = require('node-cron');
const db = require('../db/database');
const { startAlertCron } = require('./refreshAlerts');
const { syncService } = require('../connectors/sync');
const { get: getConnector } = require('../connectors/registry');

const DEFAULT_SYNC_INTERVAL_HOURS = 6;
const BACKOFF_THRESHOLD_FAILURES  = 3;
const BACKOFF_FLOOR_HOURS         = 24;

// Pure — true if a connector last synced more than intervalHours ago (or never).
function isDueForSync(lastSyncAt, intervalHours, now = new Date()) {
  if (!lastSyncAt) return true;
  const elapsedHours = (now.getTime() - new Date(lastSyncAt).getTime()) / 3_600_000;
  return elapsedHours >= intervalHours;
}

// Pure — once a connector has failed 3+ syncs in a row, it's backed off to a
// 24h floor (never faster) until a success resets consecutive_failures to 0,
// regardless of how aggressive its configured syncIntervalHours is.
function effectiveIntervalHours(intervalHours, consecutiveFailures) {
  return consecutiveFailures >= BACKOFF_THRESHOLD_FAILURES
    ? Math.max(intervalHours, BACKOFF_FLOOR_HOURS)
    : intervalHours;
}

// Pure — true if `month` (1-12) is when a quarterly/yearly service's real
// charge lands. Quarterly repeats every 3 months from billing_month; monthly
// always bills. A service missing billing_month (not yet configured) is
// treated as billing every month, same as 'monthly', so existing data keeps
// showing up in snapshots until the user sets an anchor.
function isBillingMonth(billingPeriod, billingMonth, month) {
  if (billingPeriod === 'monthly' || billingMonth == null) return true;
  if (billingPeriod === 'yearly') return month === billingMonth;
  if (billingPeriod === 'quarterly') return ((month - billingMonth) % 3 + 3) % 3 === 0;
  return true;
}

function takeSnapshot(year, month) {
  const rows = db.prepare(`
    WITH active_bills AS (
      SELECT
        s.id,
        s.name,
        s.category,
        s.billing_period,
        s.billing_month,
        sm.value_num AS monthly_bill
      FROM   services        s
      LEFT JOIN service_metrics sm ON sm.service_id = s.id
                                   AND sm.metric_key = 'monthly_bill'
      WHERE  s.active = 1
        AND  sm.value_num IS NOT NULL
    )
    SELECT id, name, category, billing_period, billing_month, monthly_bill
    FROM   active_bills
  `).all();

  // Quarterly/yearly services only contribute their real charge in the month
  // it actually bills — every other month they record $0 here even though
  // the dashboard still shows an amortized share (client/src/utils/billing.js)
  // for budgeting purposes.
  const billedRows = rows.map(({ billing_period, billing_month, ...r }) => ({
    ...r,
    monthly_bill: isBillingMonth(billing_period, billing_month, month) ? r.monthly_bill : 0,
  }));

  const total = billedRows.reduce((acc, r) => acc + r.monthly_bill, 0);

  db.prepare(`
    INSERT OR REPLACE INTO monthly_snapshots (year, month, total_spend, breakdown, captured_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(year, month, total, JSON.stringify(billedRows));
}

// force=true (the "Sync all" button) skips the isDueForSync gate entirely and
// syncs every enabled connector regardless of cadence — the caller (the
// sync-all route) is responsible for its own rate limiting, since forcing a
// metered connector (e.g. AWS Cost Explorer @ $0.01/request) on demand has a
// real cost the interval would otherwise cap.
async function syncEnabledConnectors({ force = false } = {}) {
  const setting = db.prepare(
    `SELECT value FROM app_settings WHERE key = 'allow_outbound'`
  ).get();
  if (setting?.value !== 'true') return { synced: 0, outboundDisabled: true };

  const rows = db.prepare(`
    WITH enabled_api AS (
      SELECT sc.service_id, sc.provider_key, sc.consecutive_failures, s.last_sync_at
      FROM   service_connectors sc
      JOIN   services s ON s.id = sc.service_id
      WHERE  sc.enabled = 1
        AND  s.connector_type = 'api'
        AND  s.active = 1
    )
    SELECT service_id, provider_key, consecutive_failures, last_sync_at FROM enabled_api
  `).all();

  let synced = 0;
  for (const { service_id, provider_key, consecutive_failures, last_sync_at } of rows) {
    if (!force) {
      const intervalHours = getConnector(provider_key)?.syncIntervalHours ?? DEFAULT_SYNC_INTERVAL_HOURS;
      const effectiveHours = effectiveIntervalHours(intervalHours, consecutive_failures);
      if (!isDueForSync(last_sync_at, effectiveHours)) continue;
    }
    await syncService(service_id);
    synced++;
  }
  return { synced, outboundDisabled: false };
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
  // at 00:00" job would land on the same minute as the sync cron below
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

  // Check enabled API connectors on a 6h tick, offset 10 minutes past the hour
  // so it never lands on the same minute as the snapshot cron above (only
  // matters on the 28th-31st at 23:50, but keeping them apart is free).
  // This is just the check cadence — each connector only actually syncs once
  // its own syncIntervalHours has elapsed (default 6h; claude_plan overrides
  // to 0.5h since its usage window resets every 5h), or the 24h backoff floor
  // once it's failed 3+ times in a row (effectiveIntervalHours above).
  cron.schedule('10 */6 * * *', () => {
    syncEnabledConnectors().catch(err => {
      console.error('[levee] connector sync error:', err.message);
    });
  });

  startAlertCron();
  catchUpMissedSnapshot();

  // Run once on every launch (in addition to the 6h tick above) so data that
  // fell due while the app was closed syncs immediately instead of waiting
  // up to 6h after reopening. isDueForSync/effectiveIntervalHours inside
  // syncEnabledConnectors() still gate each connector individually, so this
  // is a no-op for anything that already synced within its own cadence.
  syncEnabledConnectors().catch(err => {
    console.error('[levee] connector sync error:', err.message);
  });
}

module.exports = { startCrons, takeSnapshot, syncEnabledConnectors, isDueForSync, effectiveIntervalHours, isBillingMonth };
