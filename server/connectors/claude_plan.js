'use strict';

// Claude subscription (Pro/Max) plan-usage connector.
// Reads the OAuth access token Claude Code stores locally and calls the
// (unofficial) usage endpoint — same data as claude.ai/settings/usage.
// The token is read at sync time, kept in memory only, never persisted.

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const http = require('./http');
const { register } = require('./registry');

const HOSTS = ['api.anthropic.com'];
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';

// Reads Claude Code's locally stored OAuth credentials and returns ONLY the
// access token. The refresh token is never read. The token and raw file
// contents are never included in any thrown error.
async function readLocalOAuthToken() {
  let raw = null;

  if (process.platform === 'darwin') {
    try {
      raw = await require('keytar').getPassword(
        'Claude Code-credentials',
        os.userInfo().username
      );
    } catch {
      raw = null;
    }
  }

  if (raw == null) {
    const file = path.join(os.homedir(), '.claude', '.credentials.json');
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch {
      throw new Error(
        'Claude Code credentials not found. Install and log in to Claude Code first.'
      );
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Claude Code credentials are not valid JSON.');
  }

  const oauth = parsed?.claudeAiOauth ?? {};
  const accessToken = oauth.accessToken;
  const expiresAt = oauth.expiresAt;

  if (!accessToken) {
    throw new Error('No OAuth token in Claude Code credentials.');
  }
  if (typeof expiresAt === 'number' && expiresAt <= Date.now()) {
    throw new Error(
      'Claude Code OAuth token is expired. Open Claude Code to refresh it, then sync again.'
    );
  }

  return accessToken;
}

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }
let _readToken = readLocalOAuthToken;
function _setTokenReaderForTest(fn) { _readToken = fn; }

// Pure — maps the usage endpoint body to the metric array. Tolerates missing
// fields: a metric is emitted only when its source field exists and its
// utilization is a finite number.
function mapUsageResponse(body) {
  const metrics = [];

  const pct = [
    { field: body?.five_hour,      metric_key: 'session_pct',     label: 'Session Limit (5h)' },
    { field: body?.seven_day,      metric_key: 'weekly_pct',      label: 'Weekly Limit' },
    { field: body?.seven_day_opus, metric_key: 'weekly_opus_pct', label: 'Weekly Opus Limit' },
  ];

  for (const { field, metric_key, label } of pct) {
    const util = field?.utilization;
    if (Number.isFinite(util)) {
      metrics.push({
        metric_key,
        label,
        value_type: 'percent',
        value_num:  util,
        unit:       '%',
      });
    }
  }

  const resetsAt = body?.seven_day?.resets_at;
  if (typeof resetsAt === 'string' && resetsAt.length > 0) {
    metrics.push({
      metric_key: 'weekly_reset_at',
      label:      'Weekly Reset',
      value_type: 'date',
      value_text: resetsAt,
    });
  }

  if (metrics.length === 0) {
    throw new Error(
      'Usage endpoint returned no recognizable data (endpoint may have changed).'
    );
  }

  return metrics;
}

const connector = {
  label:          'Claude Plan Usage (local OAuth)',
  tier:           'api',
  authType:       'localOAuth',
  secretAccounts: [],            // no keychain entries owned by DevCost
  hosts:          HOSTS,

  async fetch() {
    const token = await _readToken();
    const res = await _fetch(USAGE_URL, { hosts: HOSTS }, {
      headers: {
        Authorization:     `Bearer ${token}`,
        'anthropic-beta':  OAUTH_BETA,
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Anthropic rejected the OAuth token. Open Claude Code to refresh it, then sync again.');
    }
    if (!res.ok) {
      throw new Error(`Usage endpoint returned ${res.status}: ${res.statusText}`);
    }
    return mapUsageResponse(await res.json());
  },
};

register('claude_plan', connector);

module.exports = { connector, mapUsageResponse, readLocalOAuthToken, _setFetchForTest, _setTokenReaderForTest };
