'use strict';

// AWS Cost Explorer connector — pulls MTD unblended cost and prior-month total.
// Protocol: AWS JSON 1.1 — POST https://ce.us-east-1.amazonaws.com/ with SigV4 auth.
// Signs requests with Node.js built-in `crypto` — no SDK dependency needed.
// IAM permissions required: ce:GetCostAndUsage
//
// GCP billing: requires a BigQuery billing-export query + service account — opt-in only.
// Azure billing: requires a service principal + Cost Management Query API — opt-in only.

const http   = require('./http');
const { register } = require('./registry');
const { signAwsRequest } = require('./aws_sigv4');
const { auditAwsKey } = require('./aws_audit');

const HOSTS   = ['ce.us-east-1.amazonaws.com'];
const HOST    = 'ce.us-east-1.amazonaws.com';
const REGION  = 'us-east-1';
const SERVICE = 'ce';
const TARGET  = 'AWSInsightsIndexService.GetCostAndUsage';
const ENDPOINTS = [{ method: 'POST', path: /^\/$/ }];

// STS GetCallerIdentity needs zero IAM permissions and costs nothing, unlike
// Cost Explorer ($0.01/request) — used only for the "Test connection" button
// (§6.5), never during a normal sync. Own host/endpoint pair, kept separate
// from the standing Cost Explorer allowlist, same pattern as aws_audit.js.
const STS_HOST      = 'sts.amazonaws.com';
const STS_HOSTS     = [STS_HOST];
const STS_ENDPOINTS = [{ method: 'POST', path: /^\/$/ }];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Returns [firstDayOfPrevMonth, firstDayOfNextMonth] as 'YYYY-MM-DD'.
// Date.UTC handles month underflow/overflow (month = -1 → Dec of prev year).
// MONTHLY granularity returns one bucket per calendar month; requesting prev+current
// lets us surface last_bill (prior complete month) alongside monthly_bill (current MTD).
function monthRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10),
    end:   new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10),
  };
}

// Pure — maps GetCostAndUsage response to { monthlyBill, lastBill, currency }.
// ResultsByTime is ordered chronologically: last entry = current MTD, second-to-last = prior month.
function mapResponse(data) {
  const periods = data.ResultsByTime ?? [];
  const extract = p => ({
    amount:   parseFloat(p?.Total?.UnblendedCost?.Amount ?? '0'),
    currency: p?.Total?.UnblendedCost?.Unit ?? 'USD',
  });
  const curr = extract(periods[periods.length - 1]);
  const prev = extract(periods[periods.length - 2]);
  return {
    monthlyBill: curr.amount,
    lastBill:    prev.amount,
    currency:    curr.currency || prev.currency || 'USD',
  };
}

const connector = {
  label:          'AWS',
  tier:           'api',
  authType:       'awsKeyPair',
  secretAccounts: ['accessKeyId', 'secretAccessKey'],
  hosts:          HOSTS,
  endpoints:      ENDPOINTS,
  // Cost Explorer bills $0.01/request; MTD cost doesn't need 4x/day freshness.
  syncIntervalHours: 24,
  fields: [
    { name: 'accessKeyId',     label: 'Access key ID',     kind: 'secret', required: true,
      help: 'Use an IAM user/role with only ce:GetCostAndUsage — see the policy in the connect help.' },
    { name: 'secretAccessKey', label: 'Secret access key',  kind: 'secret', required: true },
  ],

  async fetch({ secrets }) {
    const { start, end } = monthRange();
    const body = JSON.stringify({
      TimePeriod: { Start: start, End: end },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
    });

    const headers = signAwsRequest({
      method:          'POST',
      host:            HOST,
      region:          REGION,
      service:         SERVICE,
      contentType:     'application/x-amz-json-1.1',
      body,
      accessKeyId:     secrets.accessKeyId,
      secretAccessKey: secrets.secretAccessKey,
      extraHeaders:    { 'x-amz-target': TARGET },
    });
    const res = await _fetch(`https://${HOST}/`, { hosts: HOSTS, endpoints: ENDPOINTS }, {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) {
      throw new Error(`AWS Cost Explorer returned ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    const { monthlyBill, lastBill, currency } = mapResponse(data);

    return [
      {
        metric_key: 'monthly_bill',
        label:      'MTD Cost',
        value_type: 'currency',
        value_num:  monthlyBill,
        unit:       currency,
      },
      {
        metric_key: 'last_bill',
        label:      'Last Month Cost',
        value_type: 'currency',
        value_num:  lastBill,
        unit:       currency,
      },
    ];
  },

  // Opt-in sentinel-probe audit (see aws_audit.js) — never called during a
  // normal sync, only from the "Audit key permissions" button.
  audit: auditAwsKey,

  // "Test connection" (§6.5) — cheapest possible authenticated call: STS
  // GetCallerIdentity needs no IAM permissions and isn't billed, so it
  // confirms the key is alive without touching Cost Explorer's paid endpoint.
  async testConnection({ secrets }) {
    const body = 'Action=GetCallerIdentity&Version=2011-06-15';
    const headers = signAwsRequest({
      method:          'POST',
      host:            STS_HOST,
      region:          REGION,
      service:         'sts',
      contentType:     'application/x-www-form-urlencoded; charset=utf-8',
      body,
      accessKeyId:     secrets.accessKeyId,
      secretAccessKey: secrets.secretAccessKey,
    });
    const res = await _fetch(`https://${STS_HOST}/`, { hosts: STS_HOSTS, endpoints: STS_ENDPOINTS }, {
      method: 'POST',
      headers,
      body,
    });
    if (!res.ok) {
      throw new Error(`AWS STS returned ${res.status}: ${res.statusText}`);
    }
  },
};

register('aws_cost', connector);

module.exports = { connector, mapResponse, _setFetchForTest };
