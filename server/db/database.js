'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_DIR = path.join(os.homedir(), '.devcost');
const DB_PATH = path.join(DB_DIR, 'devcost.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { mode: 0o700, recursive: true });
}

const db = new Database(DB_PATH);

// Restrict to owner-only after first open
fs.chmodSync(DB_PATH, 0o600);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
