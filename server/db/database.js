'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_DIR  = path.join(os.homedir(), '.devcost');
const DB_PATH = path.join(DB_DIR, 'devcost.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { mode: 0o700, recursive: true });
}

const db = new Database(DB_PATH);
fs.chmodSync(DB_PATH, 0o600);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const { n } = db.prepare('SELECT COUNT(*) AS n FROM services').get();
if (n === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
}

module.exports = db;
