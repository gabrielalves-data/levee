'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');
const db     = require('../db/database');
const { getSecret, setSecret, deleteSecret } = require('../secrets');

const router  = Router();
const CFG_DIR  = path.join(os.homedir(), '.devcost');
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
      db.pragma(`rekey="${passphrase}"`);
      await setSecret('db-encryption-key', passphrase);
      writeConfig({ dbEncrypted: true });
    } else {
      const passphrase = await getSecret('db-encryption-key');
      if (!passphrase) return res.status(500).json({ error: 'No encryption key found in keychain' });
      db.pragma(`rekey=""`);
      await deleteSecret('db-encryption-key');
      writeConfig({ dbEncrypted: false });
    }
    res.json({ ok: true, encrypted: enable });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
