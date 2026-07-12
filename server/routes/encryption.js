'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const db     = require('../db/database');
const { getSecret, setSecret, deleteSecret } = require('../secrets');

const router  = Router();
const CFG_DIR  = path.join(os.homedir(), '.levee');
const CFG_PATH = path.join(CFG_DIR, 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch { return {}; }
}

function writeConfig(patch) {
  const cfg = { ...readConfig(), ...patch };
  fs.writeFileSync(CFG_PATH, JSON.stringify(cfg), { mode: 0o600 });
}

// GET /api/encryption/status
router.get('/status', (req, res) => {
  const { dbEncrypted = false } = readConfig();
  res.json({ encrypted: !!dbEncrypted });
});

// POST /api/encryption/toggle  { enable: true | false }
router.post('/toggle', async (req, res) => {
  const { enable } = req.body;
  if (typeof enable !== 'boolean') {
    return res.status(400).json({ error: 'enable must be a boolean' });
  }

  const { dbEncrypted = false } = readConfig();

  if (enable && dbEncrypted) return res.json({ ok: true, encrypted: true });
  if (!enable && !dbEncrypted) return res.json({ ok: true, encrypted: false });

  try {
    if (enable) {
      // Hex passphrase — safe to use in PRAGMA; no user input involved.
      const passphrase = crypto.randomBytes(32).toString('hex');
      // Write to the keychain and verify the round-trip BEFORE rekeying the
      // DB: if this were done after rekey and the keychain write failed
      // (locked keychain, keytar unavailable), the DB would end up encrypted
      // with a key that exists nowhere — permanent data loss on next launch.
      await setSecret('db-encryption-key', passphrase);
      const check = await getSecret('db-encryption-key');
      if (check !== passphrase) {
        await deleteSecret('db-encryption-key');
        throw new Error('Keychain verification failed; encryption not enabled.');
      }
      try {
        // SQLite3MultipleCiphers cannot rekey a WAL-mode database.
        db.pragma('journal_mode = DELETE');
        db.pragma(`rekey="${passphrase}"`);
        db.pragma('journal_mode = WAL');
      } catch (err) {
        await deleteSecret('db-encryption-key'); // don't leave a dangling key
        throw err;
      }
      writeConfig({ dbEncrypted: true });
    } else {
      const passphrase = await getSecret('db-encryption-key');
      if (!passphrase) return res.status(500).json({ error: 'No encryption key found in keychain' });
      // Rekey to plaintext first; only drop the keychain entry once that
      // succeeds, so a failed rekey never leaves an encrypted DB with no key.
      db.pragma('journal_mode = DELETE');
      db.pragma(`rekey=""`);
      db.pragma('journal_mode = WAL');
      await deleteSecret('db-encryption-key');
      writeConfig({ dbEncrypted: false });
    }
    res.json({ ok: true, encrypted: enable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
