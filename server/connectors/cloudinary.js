'use strict';

// Cloudinary connector — pulls current credit usage.
// Endpoint: GET https://api.cloudinary.com/v1_1/{cloudName}/usage
// Auth: HTTP Basic — base64("{api_key}:{api_secret}"). api_key isn't secret-grade but
//   both are kept in the keychain for simplicity.
// Config: { cloudName } — required.
//
// credits_used:     credits.usage        (number — Cloudinary bills in credits, not dollars)
// credits_used_pct: credits.used_percent (percent)
// No monthly_bill — pair with a catalog plan for the dollar price.

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.cloudinary.com'];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /usage response to { creditsUsed, creditsUsedPct }.
function mapUsageResponse(body) {
  const credits        = body?.credits ?? {};
  const creditsUsed    = Number(credits.usage ?? 0);
  const creditsUsedPct = Number(credits.used_percent ?? 0);
  return { creditsUsed, creditsUsedPct };
}

const connector = {
  label:          'Cloudinary',
  tier:           'api',
  authType:       'basicAuth',
  secretAccounts: ['apiKey', 'apiSecret'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey',    label: 'API key',    kind: 'secret', required: true,
      help: 'Cloudinary keys are account-wide — no narrower scope exists; use a key dedicated to Levee.' },
    { name: 'apiSecret', label: 'API secret', kind: 'secret', required: true },
    { name: 'cloudName', label: 'Cloud name', kind: 'config', required: true, placeholder: 'my-cloud' },
  ],

  async fetch({ secrets, config }) {
    const cloudName = config?.cloudName;
    if (!cloudName) throw new Error('Config missing required field: cloudName');

    const auth = Buffer.from(`${secrets.apiKey}:${secrets.apiSecret}`).toString('base64');
    const res = await _fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/usage`,
      { hosts: HOSTS },
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept':        'application/json',
        },
      }
    );
    if (!res.ok) {
      throw new Error(`Cloudinary API returned ${res.status}: ${res.statusText}`);
    }
    const { creditsUsed, creditsUsedPct } = mapUsageResponse(await res.json());

    return [
      {
        metric_key: 'credits_used',
        label:      'Credits used',
        value_type: 'number',
        value_num:  creditsUsed,
        unit:       'credits',
      },
      {
        metric_key: 'credits_used_pct',
        label:      'Credits used',
        value_type: 'percent',
        value_num:  creditsUsedPct,
        unit:       '%',
      },
    ];
  },
};

register('cloudinary', connector);

module.exports = { connector, mapUsageResponse, _setFetchForTest };
