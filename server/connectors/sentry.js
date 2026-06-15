'use strict';

// Sentry connector — pulls MTD accepted error count and subscription cost.
// Error count: GET /api/0/organizations/{org}/stats_v2/
//   Params: category=error, outcome=accepted, field=sum(quantity), interval=1d
//   Response: { groups: [{ by: { outcome }, totals: { 'sum(quantity)': N } }] }
// Billing: GET /api/0/subscriptions/{org}/
//   Response: { planDetails: { totalPrice: N } } (price in USD cents; requires billing:read scope)
//   Falls back gracefully if the scope is not granted.
// Auth: Sentry auth token (Settings → Developer Settings → Auth Tokens).
// Config: { org: 'my-org-slug' }  — required.

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['sentry.io'];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Returns ISO date strings for the first and last day of the current UTC month.
function monthBounds() {
  const now  = new Date();
  const y    = now.getUTCFullYear();
  const m    = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end   = new Date(Date.UTC(y, m + 1, 1));
  return {
    start: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    end:   end.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

// Pure — extracts total accepted errors from a stats_v2 response.
function mapStatsResponse(body) {
  let total = 0;
  for (const group of body?.groups ?? []) {
    // outcome filter is applied server-side; sum all groups returned.
    total += group?.totals?.['sum(quantity)'] ?? 0;
  }
  return { errorsMtd: Math.round(total) };
}

// Pure — extracts monthly cost (USD) from a subscriptions response.
// totalPrice is in USD cents; returns null if not present (scope not granted).
function mapSubscriptionResponse(body) {
  const cents = body?.planDetails?.totalPrice;
  return cents != null ? cents / 100 : null;
}

const connector = {
  label:          'Sentry',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey', label: 'Auth token',        kind: 'secret', required: true },
    { name: 'org',    label: 'Organization slug', kind: 'config', required: true, placeholder: 'my-org-slug' },
  ],

  async fetch({ secrets, config }) {
    const org = config?.org;
    if (!org) throw new Error('Config missing required field: org');

    const headers = { 'Authorization': `Bearer ${secrets.apiKey}` };
    const { start, end } = monthBounds();

    const statsParams = new URLSearchParams({
      category:  'error',
      outcome:   'accepted',
      field:     'sum(quantity)',
      interval:  '1d',
      start,
      end,
    });

    // Fetch error stats and subscription info in parallel; billing 403 is non-fatal.
    const [statsRes, subRes] = await Promise.all([
      _fetch(
        `https://sentry.io/api/0/organizations/${encodeURIComponent(org)}/stats_v2/?${statsParams}`,
        { hosts: HOSTS },
        { headers }
      ),
      _fetch(
        `https://sentry.io/api/0/subscriptions/${encodeURIComponent(org)}/`,
        { hosts: HOSTS },
        { headers }
      ).catch(() => null), // billing endpoint optional; missing scope → skip
    ]);

    if (!statsRes.ok) {
      throw new Error(`Sentry stats API returned ${statsRes.status}: ${statsRes.statusText}`);
    }

    const [statsBody, subBody] = await Promise.all([
      statsRes.json(),
      subRes?.ok ? subRes.json() : Promise.resolve(null),
    ]);

    const { errorsMtd } = mapStatsResponse(statsBody);
    const monthlyBill   = subBody != null ? mapSubscriptionResponse(subBody) : null;

    const metrics = [
      {
        metric_key: 'errors_mtd',
        label:      'Errors (MTD)',
        value_type: 'number',
        value_num:  errorsMtd,
        unit:       'errors',
      },
    ];

    if (monthlyBill !== null) {
      metrics.push({
        metric_key: 'monthly_bill',
        label:      'Monthly Subscription',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      });
    }

    return metrics;
  },
};

register('sentry', connector);

module.exports = { connector, mapStatsResponse, mapSubscriptionResponse, _setFetchForTest };
