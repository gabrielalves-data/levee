'use strict';

const crypto = require('crypto');

// Per-launch token — never persisted. Packaged builds receive the real value
// over parentPort (see setLaunchToken, called from index.js before the server
// starts accepting connections) so it never sits in the child process's env
// (readable via /proc/<pid>/environ on Linux). This placeholder is only live
// for dev (`node server/index.js` with no Electron parent) or the brief
// window before the parentPort message arrives.
let LAUNCH_TOKEN = process.env.LEVEE_TOKEN || crypto.randomBytes(32).toString('hex');

const LOOPBACK      = new Set(['127.0.0.1', 'localhost']);
// Allowed origins: loopback-only, any port (covers Vite :5173 in dev and file:// in Electron)
const ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function localGuard(req, res, next) {
  const host = (req.headers['host'] || '').split(':')[0];

  if (!LOOPBACK.has(host)) {
    return res.status(403).json({ error: 'Forbidden: non-loopback host' });
  }

  // Allow omitted Origin (curl, same-origin GET), the opaque 'null' Origin sent
  // by the packaged app's file:// renderer, and loopback Origins
  // (http://127.0.0.1[:port], http://localhost[:port]). Reject anything else —
  // DNS-rebinding defence. The per-launch token below is the real gate; a
  // remote page can reach 'null'/loopback Origin but cannot read the token.
  const origin = req.headers['origin'];
  if (origin && origin !== 'null' && !ORIGIN_RE.test(origin)) {
    return res.status(403).json({ error: 'Forbidden: untrusted origin' });
  }

  if (!tokenMatches(req.headers['x-levee-token'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Constant-time comparison over fixed-length digests so a request's validity
// can't be inferred from response timing. Hashing first sidesteps the
// equal-length requirement of timingSafeEqual.
let TOKEN_DIGEST = crypto.createHash('sha256').update(LAUNCH_TOKEN).digest();
function tokenMatches(provided) {
  if (typeof provided !== 'string') return false;
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(TOKEN_DIGEST, providedDigest);
}

// Called once from index.js after receiving the real token over parentPort,
// before the server starts accepting connections.
function setLaunchToken(token) {
  LAUNCH_TOKEN = token;
  TOKEN_DIGEST = crypto.createHash('sha256').update(LAUNCH_TOKEN).digest();
}

module.exports = { localGuard, LAUNCH_TOKEN, setLaunchToken };
