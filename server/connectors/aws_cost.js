'use strict';

// AWS Cost Explorer connector — pulls MTD unblended cost and prior-month total.
// Protocol: AWS JSON 1.1 — POST https://ce.us-east-1.amazonaws.com/ with SigV4 auth.
// Signs requests with Node.js built-in `crypto` — no SDK dependency needed.
// IAM permissions required: ce:GetCostAndUsage
//
// GCP billing: requires a BigQuery billing-export query + service account — opt-in only.
// Azure billing: requires a service principal + Cost Management Query API — opt-in only.

const crypto = require('crypto');
const http   = require('./http');
const { register } = require('./registry');

const HOSTS   = ['ce.us-east-1.amazonaws.com'];
const HOST    = 'ce.us-east-1.amazonaws.com';
const REGION  = 'us-east-1';
const SERVICE = 'ce';
const TARGET  = 'AWSInsightsIndexService.GetCostAndUsage';

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

// Builds AWS SigV4 Authorization and required headers for a POST to Cost Explorer.
function sigV4Headers(body, accessKeyId, secretAccessKey) {
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const allHeaders = {
    'content-type': 'application/x-amz-json-1.1',
    'host':          HOST,
    'x-amz-date':   amzDate,
    'x-amz-target': TARGET,
  };
  const sortedKeys    = Object.keys(allHeaders).sort();
  const canonHeaders  = sortedKeys.map(k => `${k}:${allHeaders[k]}`).join('\n') + '\n';
  const signedHeaders = sortedKeys.join(';');
  const bodyHash      = crypto.createHash('sha256').update(body).digest('hex');

  const canonReq   = `POST\n/\n\n${canonHeaders}\n${signedHeaders}\n${bodyHash}`;
  const credScope  = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const strToSign  = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${
    crypto.createHash('sha256').update(canonReq).digest('hex')}`;

  const hmac   = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const sigKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), REGION), SERVICE), 'aws4_request');
  const sig    = crypto.createHmac('sha256', sigKey).update(strToSign).digest('hex');

  return {
    ...allHeaders,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
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

  async fetch({ secrets }) {
    const { start, end } = monthRange();
    const body = JSON.stringify({
      TimePeriod: { Start: start, End: end },
      Granularity: 'MONTHLY',
      Metrics: ['UnblendedCost'],
    });

    const headers = sigV4Headers(body, secrets.accessKeyId, secrets.secretAccessKey);
    const res = await _fetch(`https://${HOST}/`, { hosts: HOSTS }, {
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
};

register('aws_cost', connector);

module.exports = { connector, mapResponse, _setFetchForTest };
