'use strict';

// Levee's own secret storage (replaces keytar — archived/unmaintained, and its
// build-failure stub silently made encryption-enable/disable unsafe). Ciphertext
// lives in a flat file OUTSIDE the SQLite DB: the DB encryption key itself can't
// be stored inside the DB it unlocks. safeStorage is main-process-only, so this
// module is required directly by electron/main.js; server/secrets.js (running in
// the forked utility process) proxies to it over parentPort/postMessage.

const { safeStorage } = require('electron');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const STORE_DIR  = path.join(os.homedir(), '.levee');
const STORE_PATH = path.join(STORE_DIR, 'secrets.json');

function requireEncryption() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secret storage is unavailable on this machine — cannot store or read credentials.');
  }
}

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(store) {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { mode: 0o700, recursive: true });
  const prevMask = process.umask(0o077);
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store));
  } finally {
    process.umask(prevMask);
  }
  fs.chmodSync(STORE_PATH, 0o600);
}

function getSecret(account) {
  const ciphertext = readStore()[account];
  if (!ciphertext) return null;
  requireEncryption();
  return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
}

function setSecret(account, value) {
  requireEncryption();
  const store = readStore();
  store[account] = safeStorage.encryptString(value).toString('base64');
  writeStore(store);
}

function deleteSecret(account) {
  const store = readStore();
  delete store[account];
  writeStore(store);
}

module.exports = { getSecret, setSecret, deleteSecret };
