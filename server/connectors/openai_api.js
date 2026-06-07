'use strict';

// OpenAI Organization API connector — pulls MTD cost and token usage.
// Endpoint docs: GET /v1/organization/costs           (amount.value already in USD dollars)
//                GET /v1/organization/usage/completions
// Requires an Admin API key with org-level read permissions.

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.openai.com'];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Returns Unix timestamps for the start of the current UTC month and now.
function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    start_time: Math.floor(start.getTime() / 1000),
    end_time:   Math.floor(Date.now() / 1000),
  };
}

// Collects all pages of a paginated OpenAI response.
async function fetchAllPages(baseUrl, params, headers) {
  const buckets = [];
  let nextPage = null;
  do {
    const qp = new URLSearchParams(
      Object.entries({ ...params, ...(nextPage ? { page: nextPage } : {}) })
        .map(([k, v]) => [k, String(v)])
    );
    const res = await _fetch(`${baseUrl}?${qp}`, { hosts: HOSTS }, { headers });
    if (!res.ok) {
      throw new Error(`OpenAI API returned ${res.status}: ${res.statusText}`);
    }
    const body = await res.json();
    buckets.push(...(body.data ?? []));
    nextPage = body.has_more ? body.next_page : null;
  } while (nextPage);
  return buckets;
}

// Pure — maps /organization/costs buckets to { totalUSD, currency }.
// amount.value is already in USD (no unit conversion needed).
function mapCostReport(buckets) {
  let totalUSD = 0;
  let currency = 'USD';
  for (const bucket of buckets) {
    for (const r of bucket.results ?? []) {
      totalUSD += r.amount?.value ?? 0;
      if (r.amount?.currency) currency = r.amount.currency.toUpperCase();
    }
  }
  return { totalUSD, currency };
}

// Pure — maps /organization/usage/completions buckets to token totals.
function mapUsageReport(buckets) {
  let inputTokens  = 0;
  let outputTokens = 0;
  for (const bucket of buckets) {
    for (const r of bucket.results ?? []) {
      inputTokens  += r.input_tokens  ?? 0;
      outputTokens += r.output_tokens ?? 0;
    }
  }
  return { inputTokens, outputTokens };
}

const connector = {
  label:          'OpenAI API',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,

  async fetch({ secrets }) {
    const { start_time, end_time } = monthBounds();
    const headers = {
      'Authorization': `Bearer ${secrets.apiKey}`,
    };
    const params = { start_time, end_time, bucket_width: '1d' };

    const [costBuckets, usageBuckets] = await Promise.all([
      fetchAllPages('https://api.openai.com/v1/organization/costs',                params, headers),
      fetchAllPages('https://api.openai.com/v1/organization/usage/completions',    params, headers),
    ]);

    const { totalUSD, currency } = mapCostReport(costBuckets);
    const { inputTokens, outputTokens } = mapUsageReport(usageBuckets);

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

register('openai_api', connector);

module.exports = { connector, mapCostReport, mapUsageReport, _setFetchForTest };
