'use strict';

// Twilio connector — pulls month-to-date spend and remaining account balance.
// Endpoints (HTTP Basic auth):
//   GET /2010-04-01/Accounts/{Sid}/Usage/Records/ThisMonth.json?Category=totalprice
//   GET /2010-04-01/Accounts/{Sid}/Balance.json
// Auth: Account SID + Auth Token (Twilio Console). The SID is not secret and is held
//   in config; the Auth Token is the apiKey secret. Header:
//     Authorization: Basic base64("{accountSid}:{authToken}")
// Config: { accountSid: 'ACxxxx' }  — required.
//
// monthly_bill: usage_records[0].price  (USD, month-to-date total across all usage)
// balance:      Balance.balance         (USD, remaining prepaid balance)

const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.twilio.com'];

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
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'accountSid', label: 'Account SID', kind: 'config', required: true, placeholder: 'ACxxxxxxxx' },
    { name: 'apiKey',     label: 'Auth token',  kind: 'secret', required: true },
  ],

  async fetch({ secrets, config }) {
    const accountSid = config?.accountSid;
    if (!accountSid) throw new Error('Config missing required field: accountSid');

    const auth    = Buffer.from(`${accountSid}:${secrets.apiKey}`).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}` };
    const base    = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;

    const usageRes = await _fetch(
      `${base}/Usage/Records/ThisMonth.json?Category=totalprice`,
      { hosts: HOSTS },
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
    const balRes = await _fetch(`${base}/Balance.json`, { hosts: HOSTS }, { headers });
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
