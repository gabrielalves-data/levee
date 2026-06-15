'use strict';

// Azure connector — pulls month-to-date actual cost via the Cost Management Query API.
// Auth: Azure AD service principal (client-credentials flow), done inside fetch() like
//   the AWS connector signs its own requests — no SDK dependency.
//   1. POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token  → access token
//   2. POST https://management.azure.com/subscriptions/{subscriptionId}/providers/
//           Microsoft.CostManagement/query?api-version=2023-11-01  (Bearer token)
// Secret: clientSecret. Config: { tenantId, clientId, subscriptionId } — all required.
//
// monthly_bill: summed Cost column across properties.rows (currency from the Currency column)

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['login.microsoftonline.com', 'management.azure.com'];
const API_VER  = '2023-11-01';

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps a Cost Management query response to { monthlyBill, currency }.
// Columns are self-describing; locate Cost/Currency by name rather than by index.
function mapQueryResponse(body) {
  const cols = body?.properties?.columns ?? [];
  const costIdx = cols.findIndex(c => ['Cost', 'PreTaxCost', 'CostUSD'].includes(c?.name));
  const curIdx  = cols.findIndex(c => c?.name === 'Currency');

  let monthlyBill = 0;
  let currency = 'USD';
  for (const row of body?.properties?.rows ?? []) {
    if (costIdx >= 0) monthlyBill += Number(row[costIdx]) || 0;
    if (curIdx >= 0 && row[curIdx]) currency = row[curIdx];
  }
  return { monthlyBill, currency };
}

const connector = {
  label:          'Azure',
  tier:           'api',
  authType:       'oauthClientCredentials',
  secretAccounts: ['clientSecret'],
  hosts:          HOSTS,
  fields: [
    { name: 'tenantId',       label: 'Tenant ID',       kind: 'config', required: true },
    { name: 'clientId',       label: 'Client ID',       kind: 'config', required: true },
    { name: 'subscriptionId', label: 'Subscription ID', kind: 'config', required: true },
    { name: 'clientSecret',   label: 'Client secret',   kind: 'secret', required: true },
  ],

  async fetch({ secrets, config }) {
    const { tenantId, clientId, subscriptionId } = config ?? {};
    if (!tenantId || !clientId || !subscriptionId) {
      throw new Error('Config missing required field: tenantId, clientId, subscriptionId');
    }

    // 1. Client-credentials token exchange.
    const tokenBody = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: secrets.clientSecret,
      scope:         'https://management.azure.com/.default',
    });
    const tokenRes = await _fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      { hosts: HOSTS },
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    tokenBody.toString(),
      }
    );
    if (!tokenRes.ok) {
      throw new Error(`Azure AD token request returned ${tokenRes.status}: ${tokenRes.statusText}`);
    }
    const accessToken = (await tokenRes.json())?.access_token;
    if (!accessToken) throw new Error('Azure AD token response did not include an access token.');

    // 2. Month-to-date actual cost query.
    const queryBody = {
      type:      'ActualCost',
      timeframe: 'MonthToDate',
      dataset:   { granularity: 'None', aggregation: { totalCost: { name: 'Cost', function: 'Sum' } } },
    };
    const queryRes = await _fetch(
      `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/providers/Microsoft.CostManagement/query?api-version=${API_VER}`,
      { hosts: HOSTS },
      {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(queryBody),
      }
    );
    if (!queryRes.ok) {
      throw new Error(`Azure Cost Management returned ${queryRes.status}: ${queryRes.statusText}`);
    }
    const { monthlyBill, currency } = mapQueryResponse(await queryRes.json());

    return [
      {
        metric_key: 'monthly_bill',
        label:      'Month-to-date spend',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       currency,
      },
    ];
  },
};

register('azure', connector);

module.exports = { connector, mapQueryResponse, _setFetchForTest };
