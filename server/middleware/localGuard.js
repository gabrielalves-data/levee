'use strict';

const crypto = require('crypto');

// Per-launch token — generated once at module load, never persisted.
// Electron main can pre-set DEVCOST_TOKEN so it knows the value before spawning.
const LAUNCH_TOKEN = process.env.DEVCOST_TOKEN || crypto.randomBytes(32).toString('hex');

const LOOPBACK      = new Set(['127.0.0.1', 'localhost', '::1']);
// Allowed origins: loopback-only, any port (covers Vite :5173 in dev and file:// in Electron)
const ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function localGuard(req, res, next) {
  const host = (req.headers['host'] || '').split(':')[0];

  if (!LOOPBACK.has(host)) {
    return res.status(403).json({ error: 'Forbidden: non-loopback host' });
  }

  // Allow omitted Origin (curl, Electron file://, same-origin GET) and
  // loopback Origins (http://127.0.0.1[:port], http://localhost[:port]).
  // Reject anything else — DNS-rebinding defence.
  const origin = req.headers['origin'];
  if (origin && !ORIGIN_RE.test(origin)) {
    return res.status(403).json({ error: 'Forbidden: untrusted origin' });
  }

  if (req.headers['x-devcost-token'] !== LAUNCH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = { localGuard, LAUNCH_TOKEN };
