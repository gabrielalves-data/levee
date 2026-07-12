'use strict';

// Shared AWS SigV4 request signer — used by aws_cost.js and aws_audit.js.
// No SDK dependency; signs with Node's built-in `crypto` per the SigV4 spec.
// Assumes no canonical query string (all current callers sign root-path
// requests with parameters in the POST body, or a bare GET).

const crypto = require('crypto');

// Builds the SigV4 Authorization header plus every header that must accompany
// it (host, x-amz-date, content-type). `extraHeaders` are folded into the
// signature too — e.g. `x-amz-target` for AWS JSON-protocol services.
function signAwsRequest({
  method = 'GET',
  host,
  region,
  service,
  path = '/',
  contentType,
  body = '',
  accessKeyId,
  secretAccessKey,
  extraHeaders = {},
}) {
  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const allHeaders = {
    ...(contentType ? { 'content-type': contentType } : {}),
    'host':       host,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };
  const sortedKeys    = Object.keys(allHeaders).sort();
  const canonHeaders  = sortedKeys.map(k => `${k}:${allHeaders[k]}`).join('\n') + '\n';
  const signedHeaders = sortedKeys.join(';');
  const bodyHash      = crypto.createHash('sha256').update(body).digest('hex');

  const canonReq  = `${method}\n${path}\n\n${canonHeaders}\n${signedHeaders}\n${bodyHash}`;
  const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const strToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${
    crypto.createHash('sha256').update(canonReq).digest('hex')}`;

  const hmac   = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const sigKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request');
  const sig    = crypto.createHmac('sha256', sigKey).update(strToSign).digest('hex');

  return {
    ...allHeaders,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

module.exports = { signAwsRequest };
