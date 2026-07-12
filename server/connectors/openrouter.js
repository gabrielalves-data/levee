'use strict';

// OpenRouter connector — pulls account spend and remaining prepaid credits.
// Endpoint: GET https://openrouter.ai/api/v1/credits
// Auth: OpenRouter API key (Keys page in the OpenRouter dashboard).
// Config: none.
//
// total_spend:       data.total_usage                      (USD, lifetime usage)
// credits_remaining: data.total_credits - data.total_usage (USD)
//
// OpenRouter exposes lifetime totals only — there is no month-to-date endpoint — so
// the spend metric is intentionally NOT 'monthly_bill' (which the dashboard sums into
// the monthly total). Naming it 'monthly_bill' would inflate that total with a
// lifetime figure.

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['openrouter.ai'];
const ENDPOINT = 'https://openrouter.ai/api/v1/credits';

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /credits response to { totalSpend, creditsRemaining }.
function mapCreditsResponse(body) {
  const totalCredits     = body?.data?.total_credits ?? 0;
  const totalUsage       = body?.data?.total_usage   ?? 0;
  const creditsRemaining = totalCredits - totalUsage;
  return { totalSpend: totalUsage, creditsRemaining };
}

const connector = {
  label:          'OpenRouter',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey', label: 'API key', kind: 'secret', required: true,
      help: 'OpenRouter keys are account-wide — set a credit limit on the key and use one dedicated to Levee.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS }, {
      headers: { 'Authorization': `Bearer ${secrets.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`OpenRouter API returned ${res.status}: ${res.statusText}`);
    }
    const { totalSpend, creditsRemaining } = mapCreditsResponse(await res.json());

    return [
      {
        metric_key: 'total_spend',
        label:      'Total spend',
        value_type: 'currency',
        value_num:  totalSpend,
        unit:       'USD',
      },
      {
        metric_key: 'credits_remaining',
        label:      'Credits remaining',
        value_type: 'currency',
        value_num:  creditsRemaining,
        unit:       'USD',
      },
    ];
  },
};

register('openrouter', connector);

module.exports = { connector, mapCreditsResponse, _setFetchForTest };
