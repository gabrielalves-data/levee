'use strict';

// Datadog connector — pulls the current month's estimated cost.
// Endpoint: GET https://api.<site>/api/v2/usage/estimated_cost?view=summary&start_month=<RFC3339>
// Auth: two keys sent as headers — DD-API-KEY (API key) + DD-APPLICATION-KEY (app key).
//   The app key needs the usage_read permission.
// Config: { site } — Datadog site domain (default 'datadoghq.com'); selects the API host.
//
// monthly_bill: summed data[].attributes.total_cost  (USD, month-to-date estimate)

const http = require('./http');
const { register } = require('./registry');

// Allowlist every supported Datadog site host; the connector calls exactly one of them.
const SITES = ['datadoghq.com', 'us3.datadoghq.com', 'us5.datadoghq.com', 'datadoghq.eu', 'ap1.datadoghq.com'];
const HOSTS = SITES.map(s => `api.${s}`);
const ENDPOINTS = [{ method: 'GET', path: /^\/api\/v2\/usage\/estimated_cost$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// First day of the current UTC month as RFC3339 (Datadog's start_month param).
function startOfMonth() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01T00:00:00+00:00`;
}

// Pure — sums total_cost across the returned estimated-cost buckets.
function mapEstimatedCost(body) {
  let monthlyBill = 0;
  for (const row of body?.data ?? []) {
    monthlyBill += row?.attributes?.total_cost ?? 0;
  }
  return { monthlyBill };
}

const connector = {
  label:          'Datadog',
  tier:           'api',
  authType:       'apiKeyPair',
  secretAccounts: ['apiKey', 'appKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'apiKey', label: 'API key',         kind: 'secret', required: true,
      help: 'API keys have no scoping — use a key dedicated to Levee so it can be revoked independently.' },
    { name: 'appKey', label: 'Application key', kind: 'secret', required: true, help: 'Needs the usage_read permission.' },
    { name: 'site',   label: 'Datadog site',    kind: 'config', type: 'select', options: SITES, required: false },
  ],

  async fetch({ secrets, config }) {
    const site = config?.site || 'datadoghq.com';
    const host = `api.${site}`;
    if (!HOSTS.includes(host)) throw new Error(`Unsupported Datadog site: ${site}`);

    const params = new URLSearchParams({ view: 'summary', start_month: startOfMonth() });
    const res = await _fetch(
      `https://${host}/api/v2/usage/estimated_cost?${params}`,
      { hosts: HOSTS, endpoints: ENDPOINTS },
      {
        headers: {
          'DD-API-KEY':         secrets.apiKey,
          'DD-APPLICATION-KEY': secrets.appKey,
          'Accept':             'application/json',
        },
      }
    );
    if (!res.ok) {
      throw new Error(`Datadog API returned ${res.status}: ${res.statusText}`);
    }
    const { monthlyBill } = mapEstimatedCost(await res.json());

    return [
      {
        metric_key: 'monthly_bill',
        label:      'Estimated MTD cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      },
    ];
  },
};

register('datadog', connector);

module.exports = { connector, mapEstimatedCost, _setFetchForTest };
