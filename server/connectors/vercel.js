'use strict';

// Vercel connector — pulls MTD cost and bandwidth from the billing API.
// Endpoint: GET /v2/billing (personal) or GET /v2/billing?teamId={teamId} (team)
// Auth: Vercel personal access token (Settings → Tokens in the Vercel dashboard).
// Config: { teamId: 'team_xxx' }  — optional; omit for personal accounts.
//
// monthly_bill: body.amount / 100 (Vercel returns cents)
// bandwidth_gb: derived from invoiceItems where type === 'bandwidth', if present;
//               omitted when not available for the account's plan.

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.vercel.com'];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /v2/billing response to { monthlyBill, bandwidthGb, currency }.
function mapBillingResponse(body) {
  // amount is in cents; currency is lowercase (e.g. 'usd').
  const monthlyBill = (body?.amount ?? 0) / 100;
  const currency    = (body?.currency ?? 'usd').toUpperCase();

  // Bandwidth shows up as an invoiceItem with type 'bandwidth'; quantity is in GB.
  const bwItem     = (body?.invoiceItems ?? []).find(i => i?.type === 'bandwidth');
  const bandwidthGb = bwItem?.quantity ?? null;

  return { monthlyBill, bandwidthGb, currency };
}

const connector = {
  label:          'Vercel',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey', label: 'Access token', kind: 'secret', required: true,
      help: 'Vercel tokens are account-wide — no narrower billing-only scope exists; use a token dedicated to Levee.' },
    { name: 'teamId', label: 'Team ID',      kind: 'config', required: false, placeholder: 'team_xxx (omit for personal)' },
  ],

  async fetch({ secrets, config }) {
    const teamId = config?.teamId;
    const url    = teamId
      ? `https://api.vercel.com/v2/billing?teamId=${encodeURIComponent(teamId)}`
      : 'https://api.vercel.com/v2/billing';

    const res = await _fetch(url, { hosts: HOSTS }, {
      headers: { 'Authorization': `Bearer ${secrets.apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Vercel API returned ${res.status}: ${res.statusText}`);
    }
    const body = await res.json();
    const { monthlyBill, bandwidthGb, currency } = mapBillingResponse(body);

    const metrics = [
      {
        metric_key: 'monthly_bill',
        label:      'MTD Cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       currency,
      },
    ];

    if (bandwidthGb !== null) {
      metrics.push({
        metric_key: 'bandwidth_gb',
        label:      'Bandwidth (MTD)',
        value_type: 'number',
        value_num:  bandwidthGb,
        unit:       'GB',
      });
    }

    return metrics;
  },
};

register('vercel', connector);

module.exports = { connector, mapBillingResponse, _setFetchForTest };
