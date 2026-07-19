'use strict';

// MongoDB Atlas connector — pulls the current (pending) invoice's running total.
// Endpoint: GET https://cloud.mongodb.com/api/atlas/v2/orgs/{orgId}/invoices/pending
// Auth: Atlas API key pair (public + private) via HTTP Digest, computed here with the
//   stdlib `crypto` module — same "auth inside fetch()" approach as the AWS connector.
//   Two calls: the first returns 401 + a WWW-Authenticate challenge, the second carries
//   the computed Digest Authorization header.
// Config: { orgId } — required.
//
// monthly_bill: subtotalCents (fallback: summed lineItems[].totalPriceCents) / 100

const crypto = require('crypto');
const http = require('./http');
const { register } = require('./registry');

const HOSTS  = ['cloud.mongodb.com'];
const ACCEPT = 'application/vnd.atlas.2023-11-15+json';
// {orgId} is interpolated — same path is hit twice (unauth challenge, then
// the authenticated retry with the Digest header).
const ENDPOINTS = [{ method: 'GET', path: /^\/api\/atlas\/v2\/orgs\/[^/]+\/invoices\/pending$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

const md5 = s => crypto.createHash('md5').update(s).digest('hex');

// Parse a WWW-Authenticate: Digest challenge into a key→value map.
function parseDigestChallenge(header) {
  const out = {};
  const body = (header || '').replace(/^\s*Digest\s+/i, '');
  for (const m of body.matchAll(/(\w+)=(?:"([^"]*)"|([^,]*))/g)) {
    out[m[1]] = m[2] !== undefined ? m[2] : (m[3] ?? '').trim();
  }
  return out;
}

// Build the Digest Authorization header value for one request (qop=auth).
function buildDigestHeader({ username, password, method, uri, challenge }) {
  const { realm, nonce, opaque, qop, algorithm } = challenge;
  const cnonce = crypto.randomBytes(8).toString('hex');
  const nc     = '00000001';
  const ha1      = md5(`${username}:${realm}:${password}`);
  const ha2      = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  if (algorithm) parts.push(`algorithm=${algorithm}`);
  return `Digest ${parts.join(', ')}`;
}

// Pure — maps a pending-invoice response to { monthlyBill }.
// Prefer subtotalCents; fall back to summing line items. Amounts are in USD cents.
function mapInvoiceResponse(body) {
  let cents = body?.subtotalCents;
  if (cents == null) {
    cents = (body?.lineItems ?? []).reduce((acc, li) => acc + (li?.totalPriceCents ?? 0), 0);
  }
  return { monthlyBill: (cents ?? 0) / 100 };
}

const connector = {
  label:          'MongoDB Atlas',
  method:         'api',
  authType:       'digest',
  secretAccounts: ['publicKey', 'privateKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'publicKey',  label: 'Public key',  kind: 'secret', required: true,
      help: 'Org API key with only the Organization Billing Viewer role.' },
    { name: 'privateKey', label: 'Private key', kind: 'secret', required: true },
    { name: 'orgId',      label: 'Organization ID', kind: 'config', required: true },
  ],

  async fetch({ secrets, config }) {
    const orgId = config?.orgId;
    if (!orgId) throw new Error('Config missing required field: orgId');

    const uri = `/api/atlas/v2/orgs/${encodeURIComponent(orgId)}/invoices/pending`;
    const url = `https://cloud.mongodb.com${uri}`;
    const headers = { 'Accept': ACCEPT };

    // 1. Unauthenticated request to obtain the Digest challenge.
    const challengeRes = await _fetch(url, { hosts: HOSTS, endpoints: ENDPOINTS }, { headers });
    if (challengeRes.status !== 401) {
      if (!challengeRes.ok) {
        throw new Error(`MongoDB Atlas returned ${challengeRes.status}: ${challengeRes.statusText}`);
      }
      // Unexpected: no auth challenge but a 2xx — use whatever body came back.
      return [toBillMetric(mapInvoiceResponse(await challengeRes.json()))];
    }

    const challenge = parseDigestChallenge(challengeRes.headers.get('www-authenticate'));
    const authHeader = buildDigestHeader({
      username: secrets.publicKey,
      password: secrets.privateKey,
      method:   'GET',
      uri,
      challenge,
    });

    // 2. Authenticated retry.
    const res = await _fetch(url, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: { ...headers, 'Authorization': authHeader },
    });
    if (!res.ok) {
      throw new Error(`MongoDB Atlas returned ${res.status}: ${res.statusText}`);
    }
    return [toBillMetric(mapInvoiceResponse(await res.json()))];
  },
};

function toBillMetric({ monthlyBill }) {
  return {
    metric_key: 'monthly_bill',
    label:      'Pending invoice (MTD)',
    value_type: 'currency',
    value_num:  monthlyBill,
    unit:       'USD',
  };
}

register('mongodb_atlas', connector);

module.exports = { connector, mapInvoiceResponse, parseDigestChallenge, buildDigestHeader, _setFetchForTest };
