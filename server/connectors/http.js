'use strict';

// All outbound HTTP calls from connectors MUST go through connectorFetch.
// Two security gates are enforced before any network I/O occurs:
//   1. app_settings.allow_outbound must be 'true' (user opt-in, default false)
//   2. The target URL's hostname must appear in the connector's hosts allowlist
// Secrets must never appear in error messages or logs.

const db = require('../db/database');

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'Levee/0.1';

const getAllowOutbound = db.prepare(
  "SELECT value FROM app_settings WHERE key = 'allow_outbound'"
);

/**
 * Fetch a URL on behalf of a connector with security enforcement.
 *
 * @param {string} url - Full URL to fetch.
 * @param {{ hosts: string[] }} connector - Must include the connector's hosts allowlist.
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {object} [options.headers={}]  - Extra headers. Do NOT log these; may contain auth.
 * @param {string|null} [options.body]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Response>}
 */
async function connectorFetch(url, connector, options = {}) {
  // Gate 1: outbound network must be explicitly enabled by the user.
  const row = getAllowOutbound.get();
  if (row?.value !== 'true') {
    throw new Error(
      'Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.'
    );
  }

  // Gate 2: target host must be in this connector's allowlist.
  const { hostname } = new URL(url);
  if (!Array.isArray(connector.hosts) || !connector.hosts.includes(hostname)) {
    throw new Error(
      `Host "${hostname}" is not in this connector's allowlist. ` +
      `Allowed: [${(connector.hosts || []).join(', ')}]`
    );
  }

  const { method = 'GET', headers = {}, body, timeoutMs = TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      body: body ?? undefined,
      signal: controller.signal,
      redirect: 'manual', // the host allowlist must hold for every hop
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error('Connector received a redirect; refusing to follow.');
    }
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Connector request timed out after ${timeoutMs}ms.`);
    }
    // Re-throw without including any header/body content that could leak secrets.
    throw new Error(`Connector request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { connectorFetch };
