'use strict';

// DNS-rebinding defence: reject requests with a non-loopback Host header,
// and reject any browser Origin that doesn't resolve to loopback.
module.exports = function localGuard(req, res, next) {
  const host = (req.headers['host'] || '').split(':')[0];
  const origin = req.headers['origin'];

  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

  if (!loopbackHosts.has(host)) {
    return res.status(403).json({ error: 'Forbidden: non-loopback host' });
  }

  if (origin) {
    const isLoopbackOrigin =
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('http://localhost');
    if (!isLoopbackOrigin) {
      return res.status(403).json({ error: 'Forbidden: invalid origin' });
    }
  }

  next();
};
