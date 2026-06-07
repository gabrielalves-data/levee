'use strict';

const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_DIR  = path.join(os.homedir(), '.devcost');
const DB_PATH = path.join(DB_DIR, 'devcost.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { mode: 0o700, recursive: true });
}

const prevMask = process.umask(0o077);
const db = new Database(DB_PATH);
process.umask(prevMask);
fs.chmodSync(DB_PATH, 0o600);

if (process.env.DEVCOST_DB_KEY) {
  db.pragma(`key="${process.env.DEVCOST_DB_KEY}"`);
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
];
for (const [col, sql] of serviceMigrations) {
  if (!serviceColumns.has(col)) db.exec(sql);
}

const { n } = db.prepare('SELECT COUNT(*) AS n FROM services').get();
if (n === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
}

module.exports = db;
