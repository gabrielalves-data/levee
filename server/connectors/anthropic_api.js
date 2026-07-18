'use strict';

// Anthropic Admin API connector — pulls MTD cost and token usage.
// Endpoint docs: GET /v1/organizations/cost_report  (amount in cents as decimal string)
//                GET /v1/organizations/usage_report/messages
// Requires an Admin API key (not a user-scoped key).

const http = require('./http');
const { register } = require('./registry');

const ANTHROPIC_VERSION = '2023-06-01';
const HOSTS = ['api.anthropic.com'];
const ENDPOINTS = [
  { method: 'GET', path: /^\/v1\/organizations\/cost_report$/ },
  { method: 'GET', path: /^\/v1\/organizations\/usage_report\/messages$/ },
];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Returns UTC month boundaries as RFC 3339 strings.
function monthBounds() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    starting_at: new Date(Date.UTC(y, m, 1)).toISOString(),
    ending_at:   new Date(Date.UTC(y, m + 1, 1)).toISOString(),
  };
}

// Collects all pages of a paginated Anthropic response.
async function fetchAllPages(baseUrl, params, headers) {
  const buckets = [];
  let nextPage = null;
  do {
    const qp = new URLSearchParams(params);
    if (nextPage) qp.set('page', nextPage);
    const res = await _fetch(`${baseUrl}?${qp}`, { hosts: HOSTS, endpoints: ENDPOINTS }, { headers });
    if (!res.ok) {
      throw new Error(`Anthropic API returned ${res.status}: ${res.statusText}`);
    }
    const body = await res.json();
    buckets.push(...(body.data ?? []));
    nextPage = body.has_more ? body.next_page : null;
  } while (nextPage);
  return buckets;
}

// Pure — maps cost_report data buckets to { totalUSD, currency }.
// amount is in lowest currency units (cents), so divide by 100.
function mapCostReport(data) {
  let cents = 0;
  let currency = 'USD';
  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      cents += parseFloat(r.amount ?? '0');
      if (r.currency) currency = r.currency;
    }
  }
  return { totalUSD: cents / 100, currency };
}

// Pure — maps usage_report/messages data buckets to token totals.
// input_tokens_mtd = uncached + cache_read (both consume context window).
function mapUsageReport(data) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      inputTokens  += (r.uncached_input_tokens  ?? 0) + (r.cache_read_input_tokens ?? 0);
      outputTokens += (r.output_tokens ?? 0);
    }
  }
  return { inputTokens, outputTokens };
}

const connector = {
  label:          'Anthropic API',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'Admin API key', kind: 'secret', required: true,
      help: 'Admin API keys are org-powerful (no read-only scope exists yet) — Levee only calls the cost/usage report endpoints, never anything else.' },
  ],

  async fetch({ secrets }) {
    const { starting_at, ending_at } = monthBounds();
    const headers = {
      'x-api-key':         secrets.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
    const params = { starting_at, ending_at, bucket_width: '1d' };

    const [costData, usageData] = await Promise.all([
      fetchAllPages('https://api.anthropic.com/v1/organizations/cost_report',          params, headers),
      fetchAllPages('https://api.anthropic.com/v1/organizations/usage_report/messages', params, headers),
    ]);

    const { totalUSD, currency } = mapCostReport(costData);
    const { inputTokens, outputTokens } = mapUsageReport(usageData);

    return [
      {
        metric_key: 'monthly_bill',
        label:      'MTD Cost',
        value_type: 'currency',
        value_num:  totalUSD,
        unit:       currency,
      },
      {
        metric_key: 'input_tokens_mtd',
        label:      'Input Tokens (MTD)',
        value_type: 'number',
        value_num:  inputTokens,
        unit:       'tokens',
      },
      {
        metric_key: 'output_tokens_mtd',
        label:      'Output Tokens (MTD)',
        value_type: 'number',
        value_num:  outputTokens,
        unit:       'tokens',
      },
    ];
  },
};

register('anthropic_api', connector);

module.exports = { connector, mapCostReport, mapUsageReport, _setFetchForTest };
