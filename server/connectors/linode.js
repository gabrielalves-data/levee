'use strict';

// Linode / Akamai connector — pulls uninvoiced month-to-date spend and balance.
// Endpoint: GET https://api.linode.com/v4/account
// Auth: Linode personal access token (read_only is enough), Authorization: Bearer.
// Config: none.
//
// monthly_bill:    balance_uninvoiced  (USD, accrued but not yet invoiced this cycle)
// account_balance: balance             (USD; positive = owed, negative = credit)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.linode.com'];
const ENDPOINT = 'https://api.linode.com/v4/account';
const ENDPOINTS = [{ method: 'GET', path: /^\/v4\/account$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /v4/account response to { monthlyBill, accountBalance }.
function mapAccountResponse(body) {
  const monthlyBill    = Number(body?.balance_uninvoiced ?? 0);
  const accountBalance = Number(body?.balance ?? 0);
  return { monthlyBill, accountBalance };
}

const connector = {
  label:          'Linode',
  method:         'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'Personal access token', kind: 'secret', required: true,
      help: 'Create a token with the Account scope set to Read Only — no other resource access needed.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'Authorization': `Bearer ${secrets.apiKey}`,
        'Accept':        'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Linode API returned ${res.status}: ${res.statusText}`);
    }
    const { monthlyBill, accountBalance } = mapAccountResponse(await res.json());

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

register('linode', connector);

module.exports = { connector, mapAccountResponse, _setFetchForTest };
