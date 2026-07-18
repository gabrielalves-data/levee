'use strict';

// Twilio connector — pulls month-to-date spend and remaining account balance.
// Endpoints (HTTP Basic auth):
//   GET /2010-04-01/Accounts/{Sid}/Usage/Records/ThisMonth.json?Category=totalprice
//   GET /2010-04-01/Accounts/{Sid}/Balance.json
// Auth: standard API Key SID + Secret (Twilio Console → Account → API keys), NOT the
//   account Auth Token — the Auth Token is Twilio's root credential (full account
//   control) and is overkill for read-only usage/balance calls; a Standard API key is
//   revocable and non-root. The Account SID is not secret and is held in config. Header:
//     Authorization: Basic base64("{apiKeySid}:{apiKeySecret}")
// Config: { accountSid: 'ACxxxx' }  — required.
//
// monthly_bill: usage_records[0].price  (USD, month-to-date total across all usage)
// balance:      Balance.balance         (USD, remaining prepaid balance)

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.twilio.com'];
// {Sid} is the interpolated Account SID — part of the path pattern, not literal.
const ENDPOINTS = [
  { method: 'GET', path: /^\/2010-04-01\/Accounts\/[^/]+\/Usage\/Records\/ThisMonth\.json$/ },
  { method: 'GET', path: /^\/2010-04-01\/Accounts\/[^/]+\/Balance\.json$/ },
];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — total month-to-date spend from a Usage Records (totalprice) response.
function mapUsageResponse(body) {
  const record      = (body?.usage_records ?? [])[0];
  const monthlyBill = parseFloat(record?.price ?? '0');
  const currency    = (record?.price_unit ?? 'usd').toUpperCase();
  return { monthlyBill, currency };
}

// Pure — remaining balance from a Balance.json response.
function mapBalanceResponse(body) {
  const balance  = parseFloat(body?.balance ?? '0');
  const currency = (body?.currency ?? 'usd').toUpperCase();
  return { balance, currency };
}

const connector = {
  label:          'Twilio',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKeySid', 'apiKeySecret'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  fields: [
    { name: 'accountSid',    label: 'Account SID',    kind: 'config', required: true, placeholder: 'ACxxxxxxxx' },
    { name: 'apiKeySid',     label: 'API key SID',    kind: 'secret', required: true, placeholder: 'SKxxxxxxxx' },
    { name: 'apiKeySecret',  label: 'API key secret', kind: 'secret', required: true,
      help: 'Create a Standard API key in Twilio Console → Account → API keys. Do not use the account Auth Token.' },
  ],

  // One-release back-compat: pre-H4 installs stored the account Auth Token as
  // a single `apiKey` secret and authenticated as accountSid:authToken. Feed
  // those into the apiKeySid/apiKeySecret slots fetch() already reads so its
  // Basic-auth line needs no special-casing — accountSid:authToken and
  // apiKeySid:apiKeySecret are both just "Basic base64(user:pass)" pairs.
  async resolveSecrets({ serviceId, secrets, missing, config, getSecret }) {
    if (!missing.includes('apiKeySid') && !missing.includes('apiKeySecret')) return;
    const legacyToken = await getSecret(`connector:${serviceId}:apiKey`);
    if (legacyToken == null) {
      throw new Error(`Missing credential "${missing[0]}" — open the service card and reconnect.`);
    }
    if (!config?.accountSid) throw new Error('Config missing required field: accountSid');
    secrets.apiKeySid = config.accountSid;
    secrets.apiKeySecret = legacyToken;
  },

  async fetch({ secrets, config }) {
    const accountSid = config?.accountSid;
    if (!accountSid) throw new Error('Config missing required field: accountSid');

    const auth    = Buffer.from(`${secrets.apiKeySid}:${secrets.apiKeySecret}`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}` };
    const base    = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;

    const usageRes = await _fetch(
      `${base}/Usage/Records/ThisMonth.json?Category=totalprice`,
      { hosts: HOSTS, endpoints: ENDPOINTS },
      { headers }
    );
    if (!usageRes.ok) {
      throw new Error(`Twilio API returned ${usageRes.status}: ${usageRes.statusText}`);
    }
    const { monthlyBill, currency } = mapUsageResponse(await usageRes.json());

    const metrics = [
      {
        metric_key: 'monthly_bill',
        label:      'Month-to-date spend',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       currency,
      },
    ];

    // Balance is a best-effort add-on; don't fail the whole sync if it 4xxs.
    const balRes = await _fetch(`${base}/Balance.json`, { hosts: HOSTS, endpoints: ENDPOINTS }, { headers });
    if (balRes.ok) {
      const { balance, currency: balCurrency } = mapBalanceResponse(await balRes.json());
      metrics.push({
        metric_key: 'balance',
        label:      'Account balance',
        value_type: 'currency',
        value_num:  balance,
        unit:       balCurrency,
      });
    }

    return metrics;
  },
};

register('twilio', connector);

module.exports = { connector, mapUsageResponse, mapBalanceResponse, _setFetchForTest };
