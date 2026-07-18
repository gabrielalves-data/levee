'use strict';

// Bunny.net connector — pulls current-month charges and prepaid balance.
// Endpoint: GET https://api.bunny.net/billing
// Auth: Bunny API key, sent in the AccessKey header.
// Config: none.
//
// monthly_bill:    ThisMonthCharges  (USD, charges accrued this month)
// account_balance: Balance           (USD, remaining prepaid balance)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.bunny.net'];
const ENDPOINT = 'https://api.bunny.net/billing';
const ENDPOINTS = [{ method: 'GET', path: /^\/billing$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps the BillingSummary response to { monthlyBill, accountBalance }.
function mapBillingResponse(body) {
  const monthlyBill    = Number(body?.ThisMonthCharges ?? 0);
  const accountBalance = Number(body?.Balance ?? 0);
  return { monthlyBill, accountBalance };
}

const connector = {
  label:          'Bunny.net',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API key', kind: 'secret', required: true,
      help: 'Bunny.net account API keys are account-wide — no narrower scope exists; use a key dedicated to Levee.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'AccessKey': secrets.apiKey,
        'Accept':    'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Bunny.net API returned ${res.status}: ${res.statusText}`);
    }
    const { monthlyBill, accountBalance } = mapBillingResponse(await res.json());

    return [
      {
        metric_key: 'monthly_bill',
        label:      'Month-to-date spend',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      },
      {
        metric_key: 'account_balance',
        label:      'Account balance',
        value_type: 'currency',
        value_num:  accountBalance,
        unit:       'USD',
      },
    ];
  },
};

register('bunny', connector);

module.exports = { connector, mapBillingResponse, _setFetchForTest };
