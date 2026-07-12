'use strict';

// AWS least-privilege audit — issues a handful of cheap, read-only AWS calls
// that a key scoped to only ce:GetCostAndUsage MUST fail with 403 AccessDenied.
// Any 2xx response means the key can reach more than Levee asked for.
//
// Opt-in only: triggered by the "Audit key permissions" button, never during a
// normal sync. Uses its own host allowlist (AUDIT_HOSTS below), kept separate
// from aws_cost.js's standing Cost Explorer allowlist, so the allowlist used
// by every regular sync stays minimal.
//
// Heuristic, not a permissions dump: a key scoped to e.g. lambda:* would pass
// all three probes below. Extend PROBES over time to narrow the blind spot.

const http = require('./http');
const { signAwsRequest } = require('./aws_sigv4');

const AUDIT_HOSTS = ['iam.amazonaws.com', 's3.amazonaws.com', 'ec2.us-east-1.amazonaws.com'];

const PROBES = [
  { label: 'iam:GetUser',          host: 'iam.amazonaws.com',           service: 'iam', region: 'us-east-1', method: 'POST', body: 'Action=GetUser&Version=2010-05-08' },
  { label: 's3:ListBuckets',       host: 's3.amazonaws.com',            service: 's3',  region: 'us-east-1', method: 'GET',  body: '' },
  { label: 'ec2:DescribeInstances', host: 'ec2.us-east-1.amazonaws.com', service: 'ec2', region: 'us-east-1', method: 'POST', body: 'Action=DescribeInstances&Version=2016-11-15' },
];

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Issues the probe set and returns the labels of any probe that unexpectedly
// succeeded. A least-privilege key (ce:GetCostAndUsage only) gets 403 on all
// three; a 2xx on any of them means the key reaches a service it shouldn't.
async function runProbes(secrets) {
  const over = [];
  for (const probe of PROBES) {
    const headers = signAwsRequest({
      method:          probe.method,
      host:            probe.host,
      region:          probe.region,
      service:         probe.service,
      contentType:     probe.body ? 'application/x-www-form-urlencoded; charset=utf-8' : undefined,
      body:            probe.body,
      accessKeyId:     secrets.accessKeyId,
      secretAccessKey: secrets.secretAccessKey,
    });
    const res = await _fetch(`https://${probe.host}/`, { hosts: AUDIT_HOSTS }, {
      method:  probe.method,
      headers,
      body:    probe.body || undefined,
    });
    if (res.ok) over.push(probe.label);
  }
  return over;
}

// Returns a single text metric summarizing the audit result. Honest framing
// per design: never claim the key IS minimal, only that no over-privilege was
// detected across the probes actually run.
async function auditAwsKey({ secrets }) {
  const over = await runProbes(secrets);
  return [
    {
      metric_key: 'key_privilege_audit',
      label:      'Key privilege audit',
      value_type: 'text',
      value_text: over.length
        ? `⚠ over-privileged: ${over.join(', ')}`
        : 'no over-privilege detected across IAM/S3/EC2',
    },
  ];
}

module.exports = { auditAwsKey, runProbes, PROBES, AUDIT_HOSTS, _setFetchForTest };
