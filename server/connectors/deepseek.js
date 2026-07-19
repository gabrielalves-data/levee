'use strict';

// DeepSeek connector — pulls remaining account balance.
// Endpoint: GET https://api.deepseek.com/user/balance
// Auth: DeepSeek API key (Bearer).
// Config: none.
//
// balance: balance_infos[0].total_balance  (remaining balance, NOT spend)
//
// DeepSeek exposes no spend/usage endpoint, so only the remaining balance is tracked
// — hence no 'monthly_bill' metric.

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.deepseek.com'];
const ENDPOINT = 'https://api.deepseek.com/user/balance';
const ENDPOINTS = [{ method: 'GET', path: /^\/user\/balance$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /user/balance response to { balance, currency }.
function mapBalanceResponse(body) {
  const info     = (body?.balance_infos ?? [])[0];
  const balance  = parseFloat(info?.total_balance ?? '0');
  const currency = (info?.currency ?? 'USD').toUpperCase();
  return { balance, currency };
}

const connector = {
  label:          'DeepSeek',
  method:         'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API key', kind: 'secret', required: true,
      help: 'DeepSeek keys are account-wide — no narrower scope exists; use a key dedicated to Levee.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'Authorization': `Bearer ${secrets.apiKey}`,
        'Accept':        'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`DeepSeek API returned ${res.status}: ${res.statusText}`);
    }
    const { balance, currency } = mapBalanceResponse(await res.json());

    return [
      {
        metric_key: 'balance',
        label:      'Account balance',
        value_type: 'currency',
        value_num:  balance,
        unit:       currency,
      },
    ];
  },
};

register('deepseek', connector);

module.exports = { connector, mapBalanceResponse, _setFetchForTest };
