'use strict';

// Railway connector — pulls estimated monthly cost and credit balance via GraphQL.
// Endpoint: POST https://backboard.railway.app/graphql/v2
// Auth: Railway API token (Account → API Tokens in the Railway dashboard).
// Config: none required — the token gives access to the authenticated user's workspace.
//
// monthly_bill:  me.usage.estimatedMonthlyUsageCost  (USD, float)
// credits_used:  me.creditBalance negated when negative, or 0 if positive (credits remaining)
//
// Railway credits: positive balance = unused prepaid credits; negative = overage owed.

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['backboard.railway.app'];
const ENDPOINT = 'https://backboard.railway.app/graphql/v2';
const ENDPOINTS = [{ method: 'POST', path: /^\/graphql\/v2$/ }];

const QUERY = `{
  me {
    creditBalance
    usage {
      estimatedMonthlyUsageCost
    }
  }
}`;

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps GraphQL data to { monthlyBill, creditsUsed }.
// creditBalance is the remaining pre-paid credit; negative means overage.
function mapGraphQLResponse(data) {
  const me            = data?.me ?? {};
  const monthlyBill   = me?.usage?.estimatedMonthlyUsageCost ?? 0;
  const creditBalance = me?.creditBalance ?? 0;
  // Expose how much has been consumed: positive balance → 0 used, negative → |balance| overdue.
  const creditsUsed   = creditBalance < 0 ? Math.abs(creditBalance) : 0;
  return { monthlyBill, creditsUsed };
}

const connector = {
  label:          'Railway',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API token', kind: 'secret', required: true,
      help: 'Railway tokens are account-wide — no narrower billing-only scope exists; use a token dedicated to Levee.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${secrets.apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) {
      throw new Error(`Railway API returned ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Railway GraphQL error: ${json.errors[0].message}`);
    }
    const { monthlyBill, creditsUsed } = mapGraphQLResponse(json.data);

    return [
      {
        metric_key: 'monthly_bill',
        label:      'Estimated Monthly Cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      },
      {
        metric_key: 'credits_used',
        label:      'Credits Overdue',
        value_type: 'currency',
        value_num:  creditsUsed,
        unit:       'USD',
      },
    ];
  },
};

register('railway', connector);

module.exports = { connector, mapGraphQLResponse, _setFetchForTest };
