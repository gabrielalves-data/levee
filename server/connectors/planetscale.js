'use strict';

// PlanetScale connector — pulls MTD rows read and estimated monthly cost.
// Endpoint: GET /v1/organizations/{org}/billing/current_period
//   Returns: { rows_read, rows_written, storage_gib, cost: { total } }
//   cost.total is a string like "12.34" (USD).
// Auth: PlanetScale service token (Settings → Service Tokens).
//   Token format: "{token_id}:{token_secret}" stored as a single apiKey secret.
//   Sent as: Authorization: {token_id}:{token_secret}
// Config: { org: 'my-org' }  — required.

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.planetscale.com'];
const ENDPOINTS = [{ method: 'GET', path: /^\/v1\/organizations\/[^/]+\/billing\/current_period$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /billing/current_period response to { rowsReadMtd, monthlyBill }.
function mapBillingResponse(body) {
  const rowsReadMtd = body?.rows_read ?? 0;
  const monthlyBill = parseFloat(body?.cost?.total ?? '0');
  return { rowsReadMtd, monthlyBill };
}

const connector = {
  label:          'PlanetScale',
  method:         'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'Service token', kind: 'secret', required: true, placeholder: 'tokenId:tokenSecret',
      help: 'Create a service token scoped to organization-level read access only — no database resources.' },
    { name: 'org',    label: 'Organization',  kind: 'config', required: true },
  ],

  async fetch({ secrets, config }) {
    const org = config?.org;
    if (!org) throw new Error('Config missing required field: org');

    const res = await _fetch(
      `https://api.planetscale.com/v1/organizations/${encodeURIComponent(org)}/billing/current_period`,
      { hosts: HOSTS, endpoints: ENDPOINTS },
      {
        headers: {
          'Authorization': secrets.apiKey, // format: "{tokenId}:{tokenSecret}"
          'Accept':        'application/json',
        },
      }
    );
    if (!res.ok) {
      throw new Error(`PlanetScale API returned ${res.status}: ${res.statusText}`);
    }
    const body = await res.json();
    const { rowsReadMtd, monthlyBill } = mapBillingResponse(body);

    return [
      {
        metric_key: 'rows_read_mtd',
        label:      'Rows Read (MTD)',
        value_type: 'number',
        value_num:  rowsReadMtd,
        unit:       'rows',
      },
      {
        metric_key: 'monthly_bill',
        label:      'MTD Cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      },
    ];
  },
};

register('planetscale', connector);

module.exports = { connector, mapBillingResponse, _setFetchForTest };
