'use strict';

const crypto = require('crypto');

// Per-launch token — generated once at module load, never persisted.
// Electron main can pre-set DEVCOST_TOKEN so it knows the value before spawning.
const LAUNCH_TOKEN = process.env.DEVCOST_TOKEN || crypto.randomBytes(32).toString('hex');

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function localGuard(req, res, next) {
  const host = (req.headers['host'] || '').split(':')[0];

  if (!LOOPBACK.has(host)) {
    return res.status(403).json({ error: 'Forbidden: non-loopback host' });
  }

  // Reject ALL Origin headers. Browsers set this on cross-origin requests;
  // non-browser callers (Electron preload via node http, curl) do not.
  if (req.headers['origin']) {
    return res.status(403).json({ error: 'Forbidden: origin header present' });
  }

  if (req.headers['x-devcost-token'] !== LAUNCH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = { localGuard, LAUNCH_TOKEN };
