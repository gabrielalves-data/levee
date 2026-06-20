'use strict';

// GitHub Actions / Packages / Storage connector — pulls org billing usage.
// Auth: GitHub PAT. Classic token needs admin:org (or repo); a fine-grained token needs
//   the org "Plan"/"Administration" read permission.
// Config: { org } — required.
//
// Two endpoints, preferred first:
//   1. Enhanced billing (dollars): GET /organizations/{org}/settings/billing/usage
//        → usageItems[] { netAmount, ... }   → monthly_bill = Σ netAmount (USD)
//   2. Classic (minutes only):     GET /orgs/{org}/settings/billing/actions
//        → { total_minutes_used }             → actions_minutes_mtd (number)
// Enhanced-billing availability varies; on a 404 we fall back to minutes rather than
// failing the whole sync. Any other non-2xx is a real error and throws.

const http = require('./http');
const { register } = require('./registry');

const HOSTS      = ['api.github.com'];
const GH_VERSION = '2022-11-28';

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — sums dollar usage from the enhanced-billing response.
function mapUsageResponse(body) {
  const items = body?.usageItems ?? [];
  const monthlyBill = items.reduce((acc, it) => acc + Number(it?.netAmount ?? 0), 0);
  return { monthlyBill };
}

// Pure — extracts Actions minutes from the classic billing response.
function mapActionsResponse(body) {
  const minutesUsed = Number(body?.total_minutes_used ?? 0);
  return { minutesUsed };
}

const connector = {
  label:          'GitHub Actions',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey', label: 'GitHub PAT',   kind: 'secret', required: true, help: 'Org billing read: admin:org (classic) or the org Plan/Administration permission (fine-grained).' },
    { name: 'org',    label: 'Organization', kind: 'config', required: true, placeholder: 'my-github-org' },
  ],

  async fetch({ secrets, config }) {
    const org = config?.org;
    if (!org) throw new Error('Config missing required field: org');

    const headers = {
      'Authorization':        `Bearer ${secrets.apiKey}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': GH_VERSION,
    };

    // Preferred: enhanced billing in dollars.
    const usageRes = await _fetch(
      `https://api.github.com/organizations/${encodeURIComponent(org)}/settings/billing/usage`,
      { hosts: HOSTS },
      { headers }
    );
    if (usageRes.ok) {
      const { monthlyBill } = mapUsageResponse(await usageRes.json());
      return [
        {
          metric_key: 'monthly_bill',
          label:      'Month-to-date spend',
          value_type: 'currency',
          value_num:  monthlyBill,
          unit:       'USD',
        },
      ];
    }
    if (usageRes.status !== 404) {
      throw new Error(`GitHub billing API returned ${usageRes.status}: ${usageRes.statusText}`);
    }

    // Fallback: classic Actions minutes only.
    const actRes = await _fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/settings/billing/actions`,
      { hosts: HOSTS },
      { headers }
    );
    if (!actRes.ok) {
      throw new Error(`GitHub billing API returned ${actRes.status}: ${actRes.statusText}`);
    }
    const { minutesUsed } = mapActionsResponse(await actRes.json());

    return [
      {
        metric_key: 'actions_minutes_mtd',
        label:      'Actions minutes (MTD)',
        value_type: 'number',
        value_num:  minutesUsed,
        unit:       'minutes',
      },
    ];
  },
};

register('github_actions', connector);

module.exports = { connector, mapUsageResponse, mapActionsResponse, _setFetchForTest };
