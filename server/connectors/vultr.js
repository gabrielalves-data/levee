'use strict';

// Vultr connector — pulls accrued month-to-date spend and account balance.
// Endpoint: GET https://api.vultr.com/v2/account
// Auth: Vultr API key (Account → API), Authorization: Bearer.
// Config: none.
//
// monthly_bill:    pending_charges  (USD, charges accrued so far this cycle)
// account_balance: balance          (USD; negative = credit on file)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.vultr.com'];
const ENDPOINT = 'https://api.vultr.com/v2/account';
const ENDPOINTS = [{ method: 'GET', path: /^\/v2\/account$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /v2/account response to { monthlyBill, accountBalance }.
// Vultr nests the figures under `account`; tolerate a flat shape too.
function mapAccountResponse(body) {
  const acct          = body?.account ?? body ?? {};
  const monthlyBill   = Number(acct.pending_charges ?? 0);
  const accountBalance = Number(acct.balance ?? 0);
  return { monthlyBill, accountBalance };
}

const connector = {
  label:          'Vultr',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API key', kind: 'secret', required: true,
      help: 'Vultr API keys are account-wide — no narrower scope exists; restrict the key to your IP if possible.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'Authorization': `Bearer ${secrets.apiKey}`,
        'Accept':        'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Vultr API returned ${res.status}: ${res.statusText}`);
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

register('vultr', connector);

module.exports = { connector, mapAccountResponse, _setFetchForTest };
