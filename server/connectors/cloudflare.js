'use strict';

// Cloudflare connector — pulls MTD HTTP request count via GraphQL Analytics.
// GraphQL: POST https://api.cloudflare.com/client/v4/graphql
//   Query: httpRequests1dGroups on a zone for the current month.
//   Requires at least one of: zoneId (for zone-level analytics) or accountId.
// Billing: GET /client/v4/accounts/{accountId}/billing/history (if accountId present)
//   Returns the current month's total spend; requires Billing:Read permission.
// Auth: Cloudflare API token (My Profile → API Tokens).
// Config: { zoneId: 'xxx', accountId: 'yyy' }  — at least one required.
//   zoneId drives analytics; accountId drives billing. Both can be provided together.

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.cloudflare.com'];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Returns { since, until } as 'YYYY-MM-DD' strings for the current UTC month.
function monthBounds() {
  const now  = new Date();
  const y    = now.getUTCFullYear();
  const m    = now.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)); // last day of current month
  const pad  = n => String(n).padStart(2, '0');
  return {
    since: `${y}-${pad(m + 1)}-01`,
    until: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`,
  };
}

// Pure — sums requests across all httpRequests1dGroups for a zone.
function mapAnalyticsResponse(data) {
  let requestsMtd = 0;
  const zones = data?.viewer?.zones ?? [];
  for (const zone of zones) {
    for (const group of zone?.httpRequests1dGroups ?? []) {
      requestsMtd += group?.sum?.requests ?? 0;
    }
  }
  return { requestsMtd };
}

// Pure — extracts current-month total from billing history response.
// Billing history items: [{ id, type, amount, currency, occurred_at }]
// amount is a number in the account currency (USD).
function mapBillingResponse(body, since) {
  const sinceMs    = new Date(since).getTime();
  let   monthlyBill = 0;
  for (const item of body?.result ?? []) {
    const t = new Date(item?.occurred_at ?? 0).getTime();
    if (t >= sinceMs) monthlyBill += item?.amount ?? 0;
  }
  return { monthlyBill };
}

const connector = {
  label:          'Cloudflare',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey',    label: 'API token', kind: 'secret', required: true },
    { name: 'zoneId',    label: 'Zone ID',    kind: 'config', required: false, help: 'For request analytics. Provide zone ID, account ID, or both.' },
    { name: 'accountId', label: 'Account ID', kind: 'config', required: false, help: 'For billing history (needs Billing:Read).' },
  ],

  async fetch({ secrets, config }) {
    const { zoneId, accountId } = config ?? {};
    if (!zoneId && !accountId) {
      throw new Error('Config missing required field: zoneId or accountId');
    }

    const headers = {
      'Authorization': `Bearer ${secrets.apiKey}`,
      'Content-Type':  'application/json',
    };
    const { since, until } = monthBounds();

    const fetches = [];

    // Analytics via GraphQL (requires zoneId).
    if (zoneId) {
      // User-supplied zoneId/dates go through GraphQL variables, never string
      // interpolation, so they can't alter the query structure.
      const query = {
        query: `query ($zoneTag: String!, $since: String!, $until: String!) {
          viewer {
            zones(filter: { zoneTag: $zoneTag }) {
              httpRequests1dGroups(
                orderBy: [date_ASC]
                limit: 31
                filter: { date_geq: $since, date_leq: $until }
              ) {
                sum { requests }
                dimensions { date }
              }
            }
          }
        }`,
        variables: { zoneTag: zoneId, since, until },
      };
      fetches.push(
        _fetch('https://api.cloudflare.com/client/v4/graphql', { hosts: HOSTS }, {
          method: 'POST',
          headers,
          body:   JSON.stringify(query),
        })
      );
    } else {
      fetches.push(Promise.resolve(null));
    }

    // Billing history (requires accountId).
    if (accountId) {
      fetches.push(
        _fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/billing/history`,
          { hosts: HOSTS },
          { headers }
        ).catch(() => null) // billing scope optional
      );
    } else {
      fetches.push(Promise.resolve(null));
    }

    const [analyticsRes, billingRes] = await Promise.all(fetches);

    if (analyticsRes && !analyticsRes.ok) {
      throw new Error(`Cloudflare GraphQL returned ${analyticsRes.status}: ${analyticsRes.statusText}`);
    }

    const analyticsBody = analyticsRes ? await analyticsRes.json() : null;
    const billingBody   = billingRes?.ok ? await billingRes.json() : null;

    const metrics = [];

    if (analyticsBody) {
      const { requestsMtd } = mapAnalyticsResponse(analyticsBody.data ?? analyticsBody);
      metrics.push({
        metric_key: 'requests_mtd',
        label:      'HTTP Requests (MTD)',
        value_type: 'number',
        value_num:  requestsMtd,
        unit:       'requests',
      });
    }

    if (billingBody) {
      const { monthlyBill } = mapBillingResponse(billingBody, since);
      metrics.push({
        metric_key: 'monthly_bill',
        label:      'MTD Cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      });
    }

    return metrics;
  },
};

register('cloudflare', connector);

module.exports = { connector, mapAnalyticsResponse, mapBillingResponse, _setFetchForTest };
