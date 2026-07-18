'use strict';

// SendGrid connector — pulls the email credit balance.
// Endpoint: GET https://api.sendgrid.com/v3/user/credits
// Auth: SendGrid API key (Bearer).
// Config: none.
//
// credits_remaining: remain  (number of sending credits left this cycle)
// credits_used:      used    (number of credits used this cycle)
// SendGrid bills in credits, not direct dollars — no monthly_bill; pair with a catalog
// plan for the flat price.

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.sendgrid.com'];
const ENDPOINT = 'https://api.sendgrid.com/v3/user/credits';
const ENDPOINTS = [{ method: 'GET', path: /^\/v3\/user\/credits$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /v3/user/credits response to { creditsRemaining, creditsUsed }.
function mapCreditsResponse(body) {
  const creditsRemaining = Number(body?.remain ?? 0);
  const creditsUsed      = Number(body?.used ?? 0);
  return { creditsRemaining, creditsUsed };
}

const connector = {
  label:          'SendGrid',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API key', kind: 'secret', required: true,
      help: 'Create a Restricted Access API key with only the Billing → Read Access permission enabled.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'Authorization': `Bearer ${secrets.apiKey}`,
        'Accept':        'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`SendGrid API returned ${res.status}: ${res.statusText}`);
    }
    const { creditsRemaining, creditsUsed } = mapCreditsResponse(await res.json());

    return [
      {
        metric_key: 'credits_remaining',
        label:      'Credits remaining',
        value_type: 'number',
        value_num:  creditsRemaining,
        unit:       'credits',
      },
      {
        metric_key: 'credits_used',
        label:      'Credits used',
        value_type: 'number',
        value_num:  creditsUsed,
        unit:       'credits',
      },
    ];
  },
};

register('sendgrid', connector);

module.exports = { connector, mapCreditsResponse, _setFetchForTest };
