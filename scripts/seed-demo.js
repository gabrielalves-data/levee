'use strict';

// Fills a THROWAWAY Levee database with realistic demo numbers for the
// landing-page screenshots (scripts/capture.js). Never run against a real
// profile: it refuses unless LEVEE_DEMO_HOME is set and os.homedir() already
// resolves to it, so ~/.levee/levee.db can't be touched by accident.
//
// Must run under Electron's Node (better-sqlite3 is built for Electron's ABI):
//   ELECTRON_RUN_AS_NODE=1 USERPROFILE=<tmp> HOME=<tmp> LEVEE_DEMO_HOME=<tmp> electron scripts/seed-demo.js
// capture.js does this for you.

const os = require('os');
const path = require('path');

const demoHome = process.env.LEVEE_DEMO_HOME;
if (!demoHome || path.resolve(os.homedir()) !== path.resolve(demoHome)) {
  console.error('[seed-demo] refusing to run: os.homedir() is not LEVEE_DEMO_HOME');
  process.exit(1);
}

// Creates the schema and runs seed.sql (catalog services, NULL metric values).
const db = require('../server/db/database');

const now = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

// Seed ids from server/db/seed.sql. Everything else is switched off so the
// dashboard shows a plausible single-developer stack, not 26 empty rows.
const SERVICES = [
  { id: 11, cost: 142.37, cap: 400, connector: 'api',     syncedAgo: 2 * HOUR,  lastMonth: 261.8 },
  { id: 12, cost: 48.12,  cap: 120, connector: 'api',     syncedAgo: 2 * HOUR,  lastMonth: 94.3 },
  { id: 8,  cost: 100,    cap: 150, connector: 'api',     syncedAgo: 4 * MIN,   lastMonth: 100 },
  { id: 6,  cost: 25,     cap: 60,  connector: 'manual',  syncedAgo: null,      lastMonth: 25 },
  { id: 4,  cost: 20,     cap: 50,  connector: 'api',     syncedAgo: 5 * HOUR,  lastMonth: 20 },
  { id: 16, cost: 20,     cap: 40,  connector: 'catalog', plan: 'Pro',        lastMonth: 20 },
  { id: 15, cost: 10,     cap: 20,  connector: 'catalog', plan: 'Individual', lastMonth: 10 },
  { id: 18, cost: 26,     cap: 80,  connector: 'manual',  syncedAgo: null,      lastMonth: 26 },
];

// [serviceId, metricKey, label, valueType, valueNum, valueText, unit, source]
// Labels/keys match what the real connectors write (server/connectors/*.js).
const METRICS = [
  [11, 'monthly_bill',      'MTD Cost',            'currency', 142.37,     null, null, 'sync'],
  [11, 'input_tokens_mtd',  'Input Tokens (MTD)',  'number',   38_420_000, null, null, 'sync'],
  [11, 'output_tokens_mtd', 'Output Tokens (MTD)', 'number',   6_910_000,  null, null, 'sync'],
  [12, 'monthly_bill',      'MTD Cost',            'currency', 48.12,      null, null, 'sync'],
  [12, 'input_tokens_mtd',  'Input Tokens (MTD)',  'number',   11_250_000, null, null, 'sync'],
  [12, 'output_tokens_mtd', 'Output Tokens (MTD)', 'number',   2_180_000,  null, null, 'sync'],
  [8,  'monthly_bill',      'Monthly bill',        'currency', 100,        null, null, 'manual'],
  [8,  'session_pct',       'Session Usage (5h)',  'percent',  38,         null, '%',  'sync'],
  [8,  'session_reset_at',  'Session Reset',       'date',     null, iso(now + 2 * HOUR + 40 * MIN), null, 'sync'],
  [8,  'weekly_pct',        'Weekly Usage',        'percent',  61,         null, '%',  'sync'],
  [8,  'weekly_reset_at',   'Weekly Reset',        'date',     null, iso(now + 3 * DAY + 4 * HOUR), null, 'sync'],
  [6,  'monthly_bill',      'Monthly bill',        'currency', 25,         null, null, 'manual'],
  [6,  'requests_mtd',      'Requests MTD',        'number',   4_812_330,  null, null, 'manual'],
  [4,  'monthly_bill',      'MTD Cost',            'currency', 20,         null, null, 'sync'],
  [4,  'bandwidth_gb',      'Bandwidth (MTD)',     'number',   38.6,       null, 'GB', 'sync'],
  [16, 'monthly_bill',      'Monthly bill',        'currency', 20,         null, null, 'catalog'],
  [16, 'plan',              'Plan',                'text',     null,       'Pro', null, 'catalog'],
  [15, 'monthly_bill',      'Monthly bill',        'currency', 10,         null, null, 'catalog'],
  [15, 'seats',             'Seats',               'number',   1,          null, null, 'manual'],
  [18, 'monthly_bill',      'Monthly bill',        'currency', 26,         null, null, 'manual'],
  [18, 'errors_mtd',        'Errors MTD',          'number',   1_284,      null, null, 'manual'],
  [18, 'plan',              'Plan',                'text',     null,       'Team', null, 'manual'],
];

// Oldest → newest growth for the six closed months before this one; usage-based
// bills ramp up, flat subscriptions stay constant.
const TREND = [0.62, 0.7, 0.78, 0.85, 0.93, 1];
const USAGE_IDS = new Set([11, 12]);

const deactivateOthers = db.prepare(`UPDATE services SET active = 0 WHERE id NOT IN (${SERVICES.map(() => '?').join(', ')})`);
const updateService = db.prepare(`
  UPDATE services
  SET    active = 1, monthly_cost = ?, budget_cap = ?, connector_type = ?, plan_key = ?,
         last_sync_at = ?, sync_status = ?, sync_error = NULL
  WHERE  id = ?
`);
const upsertMetric = db.prepare(`
  INSERT INTO service_metrics
    (service_id, metric_key, label, value_type, value_num, value_text, unit, source, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT (service_id, metric_key) DO UPDATE SET
    label      = excluded.label,
    value_type = excluded.value_type,
    value_num  = excluded.value_num,
    value_text = excluded.value_text,
    unit       = excluded.unit,
    source     = excluded.source,
    updated_at = datetime('now')
`);
const selectService = db.prepare('SELECT id, name, category FROM services WHERE id = ?');
const upsertSnapshot = db.prepare(`
  INSERT OR REPLACE INTO monthly_snapshots (year, month, total_spend, breakdown, captured_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);

db.transaction(() => {
  deactivateOthers.run(...SERVICES.map((s) => s.id));

  for (const s of SERVICES) {
    const synced = s.connector === 'api' ? iso(now - s.syncedAgo) : null;
    updateService.run(s.cost, s.cap, s.connector, s.plan ?? null, synced, synced ? 'ok' : null, s.id);
  }

  for (const m of METRICS) upsertMetric.run(...m);

  const today = new Date(now);
  TREND.forEach((factor, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (TREND.length - i), 1);
    const breakdown = SERVICES.map((s) => {
      const { id, name, category } = selectService.get(s.id);
      const bill = USAGE_IDS.has(s.id) ? Math.round(s.lastMonth * factor * 100) / 100 : s.lastMonth;
      return { id, name, category, monthly_bill: bill };
    });
    const total = Math.round(breakdown.reduce((sum, r) => sum + r.monthly_bill, 0) * 100) / 100;
    upsertSnapshot.run(d.getFullYear(), d.getMonth() + 1, total, JSON.stringify(breakdown));
  });
})();

db.close();
console.log(`[seed-demo] seeded ${SERVICES.length} services, ${METRICS.length} metrics, ${TREND.length} snapshots`);
