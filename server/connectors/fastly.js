'use strict';

// Fastly connector — pulls the month-to-date invoice total.
// Endpoint: GET https://api.fastly.com/billing/v3/invoices/month-to-date
// Auth: Fastly API token, sent in the Fastly-Key header.
// Config: none.
//
// monthly_bill: monthly_transaction_amount  (USD string, MTD billable total)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.fastly.com'];
const ENDPOINT = 'https://api.fastly.com/billing/v3/invoices/month-to-date';
const ENDPOINTS = [{ method: 'GET', path: /^\/billing\/v3\/invoices\/month-to-date$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps the MtdInvoice response to { monthlyBill }.
// Fastly returns the amount as a string; no currency field, so USD is assumed.
function mapInvoiceResponse(body) {
  const monthlyBill = parseFloat(body?.monthly_transaction_amount ?? '0');
  return { monthlyBill };
}

const connector = {
  label:          'Fastly',
  method:         'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API token', kind: 'secret', required: true,
      help: 'Create the token for a user with only the Billing role — read-only invoice access, no service config access.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      headers: {
        'Fastly-Key': secrets.apiKey,
        'Accept':     'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Fastly API returned ${res.status}: ${res.statusText}`);
    }
    const { monthlyBill } = mapInvoiceResponse(await res.json());

    return [
      {
        metric_key: 'monthly_bill',
        label:      'Month-to-date spend',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      },
    ];
  },
};

register('fastly', connector);

module.exports = { connector, mapInvoiceResponse, _setFetchForTest };
