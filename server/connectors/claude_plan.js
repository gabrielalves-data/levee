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

// Emits a percent metric for a window bucket's `utilization` and a date metric
// for its `resets_at`, when each is present.
function pushWindow(metrics, bucket, { pctKey, pctLabel, resetKey, resetLabel }) {
  if (Number.isFinite(bucket?.utilization)) {
    metrics.push({
      metric_key: pctKey,
      label:      pctLabel,
      value_type: 'percent',
      value_num:  bucket.utilization,
      unit:       '%',
    });
  }
  const resetsAt = bucket?.resets_at;
  if (typeof resetsAt === 'string' && resetsAt.length > 0) {
    metrics.push({
      metric_key: resetKey,
      label:      resetLabel,
      value_type: 'date',
      value_text: resetsAt,
    });
  }
}

// Pure — maps the usage endpoint body to the metric array. We surface a fixed
// set: the 5-hour session window and the 7-day rolling window (each as a
// utilization % plus its reset time), and the optional pay-as-you-go "extra
// usage" pool. Extra usage always reports an Enabled/Disabled status; its credit
// figures are emitted only while it's enabled.
function mapUsageResponse(body) {
  const metrics = [];

  pushWindow(metrics, body?.five_hour, {
    pctKey: 'session_pct',   pctLabel: 'Session Usage (5h)',
    resetKey: 'session_reset_at', resetLabel: 'Session Reset',
  });
  pushWindow(metrics, body?.seven_day, {
    pctKey: 'weekly_pct',    pctLabel: 'Weekly Usage',
    resetKey: 'weekly_reset_at',  resetLabel: 'Weekly Reset',
  });

  const extra = body?.extra_usage;
  if (extra && typeof extra === 'object') {
    const enabled = extra.is_enabled === true;
    metrics.push({
      metric_key: 'extra_usage_enabled',
      label:      'Extra Usage',
      value_type: 'text',
      value_text: enabled ? 'Enabled' : 'Disabled',
    });
    if (enabled) {
      if (Number.isFinite(extra.utilization)) {
        metrics.push({
          metric_key: 'extra_usage_pct',
          label:      'Extra Usage Used',
          value_type: 'percent',
          value_num:  extra.utilization,
          unit:       '%',
        });
      }
      // `used_credits`/`monthly_limit` are integer minor units; `decimal_places`
      // says how many to shift to get the major-unit amount (e.g. 2 → cents).
      const places = Number.isFinite(extra.decimal_places) ? extra.decimal_places : 0;
      const scale = 10 ** places;
      const currency = typeof extra.currency === 'string' ? extra.currency : null;
      if (Number.isFinite(extra.used_credits)) {
        metrics.push({
          metric_key: 'extra_used_credits',
          label:      'Extra Credits Used',
          value_type: 'currency',
          value_num:  extra.used_credits / scale,
          unit:       currency,
        });
      }
      if (Number.isFinite(extra.monthly_limit)) {
        metrics.push({
          metric_key: 'extra_monthly_limit',
          label:      'Extra Limit',
          value_type: 'currency',
          value_num:  extra.monthly_limit / scale,
          unit:       currency,
        });
      }
    }
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
  secretAccounts: [],            // no keychain entries owned by Levee
  hosts:          HOSTS,

  async fetch({ config } = {}) {
    // Consent is also checked in the PUT /api/connectors route when the
    // connector is first saved, but re-checking here means a future code
    // path that calls fetch() directly can never touch the token without it.
    if (config?.consentLocalToken !== true) {
      throw new Error('Local-token consent not granted for this service.');
    }
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
