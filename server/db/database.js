'use strict';

const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_DIR  = path.join(os.homedir(), '.levee');
const DB_PATH = path.join(DB_DIR, 'levee.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { mode: 0o700, recursive: true });
}

const prevMask = process.umask(0o077);
const db = new Database(DB_PATH);
process.umask(prevMask);
fs.chmodSync(DB_PATH, 0o600);

if (process.env.LEVEE_DB_KEY) {
  // The key is app-generated 32-byte hex (see encryption.js). Validate the shape
  // before interpolating into the PRAGMA so a malformed/injected value can't
  // break out of the quoted string.
  const dbKey = process.env.LEVEE_DB_KEY;
  if (!/^[0-9a-f]{64}$/.test(dbKey)) {
    throw new Error('LEVEE_DB_KEY must be 64 lowercase hex characters');
  }
  db.pragma(`key="${dbKey}"`);
  // Same-user malware could read the keychain directly anyway, so this isn't a
  // security boundary — but there's no reason to keep the key sitting in this
  // process's environment for its whole lifetime once the DB is opened.
  delete process.env.LEVEE_DB_KEY;
}

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Idempotent migration: add connector columns to pre-existing `services` tables.
// schema.sql's CREATE TABLE IF NOT EXISTS only covers fresh DBs, so ALTER any
// column that is missing on an already-created table.
const serviceColumns = new Set(
  db.prepare('PRAGMA table_info(services)').all().map((c) => c.name)
);
const serviceMigrations = [
  ["connector_type", "ALTER TABLE services ADD COLUMN connector_type TEXT NOT NULL DEFAULT 'manual' CHECK (connector_type IN ('manual','catalog','api'))"],
  ['plan_key',     'ALTER TABLE services ADD COLUMN plan_key TEXT'],
  ['last_sync_at', 'ALTER TABLE services ADD COLUMN last_sync_at TEXT'],
  ['sync_status',  'ALTER TABLE services ADD COLUMN sync_status TEXT'],
  ['sync_error',   'ALTER TABLE services ADD COLUMN sync_error TEXT'],
  ['auto_available', 'ALTER TABLE services ADD COLUMN auto_available INTEGER NOT NULL DEFAULT 0'],
  ['provider_key', 'ALTER TABLE services ADD COLUMN provider_key TEXT'],
];
const addedAutoAvailable = !serviceColumns.has('auto_available');
const addedProviderKey = !serviceColumns.has('provider_key');
for (const [col, sql] of serviceMigrations) {
  if (!serviceColumns.has(col)) db.exec(sql);
}

// Idempotent migration: add `source` to pre-existing `service_metrics` tables
// (see M5 in the review — tracks which write path last touched a metric so
// the UI can lock only the metrics automation owns).
const metricColumns = new Set(
  db.prepare('PRAGMA table_info(service_metrics)').all().map((c) => c.name)
);
if (!metricColumns.has('source')) {
  db.exec(`ALTER TABLE service_metrics ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','sync','catalog'))`);
}

// Backfill auto_available on pre-existing seed rows: every seeded service has a
// catalog plan or connector except these four, which can only be entered by hand.
if (addedAutoAvailable) {
  db.exec(`
    UPDATE services
    SET    auto_available = 1
    WHERE  is_seed = 1
      AND  name NOT IN ('GCP', 'Azure', 'Groq', 'Mistral')
  `);
}

// Backfill provider_key on pre-existing seed rows by their fixed seed id, so they
// bind to the provider directory (server/providers.js) and lose the redundant
// provider dropdown. Manual-only seeds (GCP/Azure/Groq/Mistral) stay NULL.
if (addedProviderKey) {
  const seedProviders = [
    [1, 'aws'], [4, 'vercel'], [5, 'railway'], [6, 'cloudflare'], [7, 'planetscale'],
    [8, 'claude'], [9, 'chatgpt'], [10, 'gemini'], [11, 'anthropic_api'], [12, 'openai_api'],
    [15, 'copilot'], [16, 'cursor'], [17, 'linear'], [18, 'sentry'],
  ];
  const setProviderKey = db.prepare('UPDATE services SET provider_key = ? WHERE id = ? AND is_seed = 1');
  const backfill = db.transaction((rows) => {
    for (const [id, key] of rows) setProviderKey.run(key, id);
  });
  backfill(seedProviders);
}

// One-time cleanup: drop metrics that are now redundant — the empty seed
// placeholders (current_usage/weekly_usage/limit) and the synthetic catalog
// reset_date. Live resets come from connector date metrics (e.g. weekly_reset_at).
// Guarded by an app_settings flag so it never deletes a metric a user later adds.
const cleanupV1 = db.prepare("SELECT value FROM app_settings WHERE key = 'cleanup_redundant_metrics_v1'").get();
if (!cleanupV1) {
  db.exec(`
    DELETE FROM service_metrics
    WHERE metric_key IN ('current_usage', 'weekly_usage', 'limit', 'reset_date')
  `);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('cleanup_redundant_metrics_v1', 'done')").run();
}

// One-time cleanup v2: the claude_plan connector no longer surfaces the Opus
// weekly bucket, so drop any stale row left from an earlier sync.
const cleanupV2 = db.prepare("SELECT value FROM app_settings WHERE key = 'cleanup_redundant_metrics_v2'").get();
if (!cleanupV2) {
  db.exec(`DELETE FROM service_metrics WHERE metric_key = 'weekly_opus_pct'`);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('cleanup_redundant_metrics_v2', 'done')").run();
}

const { n } = db.prepare('SELECT COUNT(*) AS n FROM services').get();
if (n === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
}

module.exports = db;
