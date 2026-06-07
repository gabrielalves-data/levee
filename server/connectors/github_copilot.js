'use strict';

// GitHub Copilot (org) connector — pulls seat count and estimated monthly cost.
// Endpoint: GET /orgs/{org}/copilot/billing
// Auth: GitHub PAT with manage_billing:copilot scope.
// Config: { org: 'my-github-org', plan: 'business' }
//   plan: 'business' ($19/seat/mo) | 'enterprise' ($39/seat/mo) — used to derive monthly_bill.
//   Defaults to 'business' if omitted.
// Note: Individual Copilot has no org billing API — leave it as a Tier-1 catalog entry.

const http = require('./http');
const { register } = require('./registry');

const HOSTS      = ['api.github.com'];
const GH_VERSION = '2022-11-28';
const SEAT_PRICES = { business: 19, enterprise: 39 };

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /orgs/{org}/copilot/billing response to { seats, monthlyBill }.
function mapBillingResponse(body, plan) {
  const seats        = body?.seat_breakdown?.total ?? 0;
  const pricePerSeat = SEAT_PRICES[plan] ?? SEAT_PRICES.business;
  return { seats, monthlyBill: seats * pricePerSeat };
}

const connector = {
  label:          'GitHub Copilot (Org)',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,

  async fetch({ secrets, config }) {
    const org = config?.org;
    if (!org) throw new Error('Config missing required field: org');
    const plan = (config?.plan ?? 'business').toLowerCase();

    const res = await _fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/copilot/billing`,
      { hosts: HOSTS },
      {
        headers: {
          'Authorization':        `Bearer ${secrets.apiKey}`,
          'Accept':               'application/vnd.github+json',
          'X-GitHub-Api-Version': GH_VERSION,
        },
      }
    );
    if (!res.ok) {
      throw new Error(`GitHub Copilot API returned ${res.status}: ${res.statusText}`);
    }
    const body = await res.json();
    const { seats, monthlyBill } = mapBillingResponse(body, plan);

    return [
      {
        metric_key: 'seats',
        label:      'Copilot Seats',
        value_type: 'number',
        value_num:  seats,
        unit:       'seats',
      },
      {
        metric_key: 'monthly_bill',
        label:      'Estimated Monthly Cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       'USD',
      },
    ];
  },
};

register('github_copilot', connector);

module.exports = { connector, mapBillingResponse, _setFetchForTest };
