'use strict';

// Linear connector — pulls seat count from the workspace subscription.
// Endpoint: POST https://api.linear.app/graphql
// Auth: Linear API key (Settings → API → Personal API keys).
//   Note: Linear uses the bare key — NOT a Bearer prefix — in the Authorization header.
// Config: none required — the key scopes to the authenticated user's workspace.
//
// seats: organization.subscription.seats (the purchased seat count)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.linear.app'];
const ENDPOINT = 'https://api.linear.app/graphql';
const ENDPOINTS = [{ method: 'POST', path: /^\/graphql$/ }];

const QUERY = `{
  organization {
    subscription {
      seats
      plan
    }
  }
}`;

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps GraphQL data to { seats, plan }.
function mapGraphQLResponse(data) {
  const sub  = data?.organization?.subscription ?? {};
  const seats = sub?.seats ?? 0;
  const plan  = sub?.plan  ?? null;
  return { seats, plan };
}

const connector = {
  label:          'Linear',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'Personal API key', kind: 'secret', required: true,
      help: 'Linear personal API keys are full-account scope — no narrower read-only option; use a key dedicated to Levee.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      method:  'POST',
      headers: {
        'Authorization': secrets.apiKey, // Linear uses bare key, no "Bearer" prefix
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ query: QUERY }),
    });
    if (!res.ok) {
      throw new Error(`Linear API returned ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
    }
    const { seats, plan } = mapGraphQLResponse(json.data);

    const metrics = [
      {
        metric_key: 'seats',
        label:      'Linear Seats',
        value_type: 'number',
        value_num:  seats,
        unit:       'seats',
      },
    ];

    if (plan) {
      metrics.push({
        metric_key: 'plan',
        label:      'Plan',
        value_type: 'text',
        value_text: plan,
      });
    }

    return metrics;
  },
};

register('linear', connector);

module.exports = { connector, mapGraphQLResponse, _setFetchForTest };
