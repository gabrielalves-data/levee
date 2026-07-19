'use strict';

// DigitalOcean connector — pulls month-to-date usage from the customer balance API.
// Endpoint: GET https://api.digitalocean.com/v2/customers/my/balance
// Auth: DigitalOcean personal access token (API → Tokens; read scope is enough).
// Config: none.
//
// monthly_bill:    month_to_date_usage  (USD, true month-to-date spend)
// account_balance: account_balance      (USD; positive = owed, negative = credit)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.digitalocean.com'];
const ENDPOINT = 'https://api.digitalocean.com/v2/customers/my/balance';
const ENDPOINTS = [{ method: 'GET', path: /^\/v2\/customers\/my\/balance$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /customers/my/balance response to { monthlyBill, accountBalance }.
// DigitalOcean returns amounts as USD strings (e.g. "12.34").
function mapBalanceResponse(body) {
  const monthlyBill    = parseFloat(body?.month_to_date_usage ?? '0');
  const accountBalance = parseFloat(body?.account_balance     ?? '0');
  return { monthlyBill, accountBalance };
}

const connector = {
  label:          'DigitalOcean',
  method:         'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'Personal access token', kind: 'secret', required: true,
      help: 'Create a scoped token with only billing:read access (Read-only) — no write access needed.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'Authorization': `Bearer ${secrets.apiKey}`,
        'Content-Type':  'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`DigitalOcean API returned ${res.status}: ${res.statusText}`);
    }
    const { monthlyBill, accountBalance } = mapBalanceResponse(await res.json());

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

register('digitalocean', connector);

module.exports = { connector, mapBalanceResponse, _setFetchForTest };
