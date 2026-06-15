'use strict';

/**
 * Tier-2 Connector Registry
 *
 * A connector describes how Levee pulls live metrics from a provider API.
 * Register connectors at module load time with `register(key, def)`.
 * The server never instantiates connectors itself — callers resolve a key,
 * fetch the definition, resolve secrets from the OS keychain, then call
 * def.fetch({ secrets, config }).
 *
 * ─── Contract ────────────────────────────────────────────────────────────────
 *
 * provider_key   {string}
 *   Unique slug stored in service_connectors.provider_key.
 *   e.g. 'aws', 'openai'. Snake-case, lowercase.
 *
 * label          {string}
 *   Human-readable display name shown in the UI.
 *
 * tier           {string}
 *   Always 'api' for Tier-2 connectors (live API pull).
 *
 * authType       {'apiKey' | 'awsKeyPair' | 'oauth' | 'localOAuth'}
 *   Tells the UI which credential form to render.
 *     apiKey     — single secret, e.g. an API token
 *     awsKeyPair — access key ID + secret access key pair
 *     oauth      — OAuth bearer token (refresh flow TBD)
 *     localOAuth — reads a token another local app already stores; no secret entry in UI, requires config.consentLocalToken === true
 *
 * secretAccounts {string[]}
 *   The <name> portion of each OS keychain account this connector uses.
 *   Full keychain account path: connector:<serviceId>:<name>
 *   e.g. ['apiKey'] → getSecret('connector:42:apiKey')
 *        ['accessKeyId','secretAccessKey'] for awsKeyPair connectors
 *
 * hosts          {string[]}
 *   Hostname allowlist. http.js rejects any request whose URL host is not
 *   in this list. Keep it minimal — only the exact hostnames this connector
 *   needs to contact.
 *   e.g. ['api.openai.com'] or ['ce.us-east-1.amazonaws.com']
 *
 * fetch          {async ({ secrets, config }) => metric[]}
 *   Pull current metrics from the provider.
 *
 *   Inputs:
 *     secrets  {Object<string,string>}  resolved from keychain, keyed by
 *                                       the names listed in secretAccounts
 *     config   {object}                parsed JSON from service_connectors.config,
 *                                       or {} if null
 *
 *   Returns: metric[]  where each metric is:
 *     metric_key  {string}  unique key within this service (snake_case)
 *     label       {string}  human-readable metric name
 *     value_type  {string}  'number' | 'percent' | 'currency' | 'date' | 'text'
 *     value_num   {number}  (optional) numeric value
 *     value_text  {string}  (optional) text value
 *     unit        {string}  (optional) e.g. 'USD', 'requests', '%'
 *
 *   Errors:
 *     Throw a descriptive Error on auth failure or API error.
 *     NEVER include raw secret values in the error message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * Register a connector. Each connector module calls this once at load time.
 * @param {string} key
 * @param {{ label, tier, authType, secretAccounts, hosts, fetch }} def
 */
function register(key, def) {
  if (registry.has(key)) {
    throw new Error(`Connector "${key}" is already registered.`);
  }
  registry.set(key, { ...def, provider_key: key });
}

/**
 * Retrieve a registered connector definition by provider key.
 * @param {string} key
 * @returns {object | undefined}
 */
function get(key) {
  return registry.get(key);
}

/**
 * All registered connectors as a serialisable array (fetch fn excluded).
 * Safe to send to the frontend.
 * @returns {object[]}
 */
function list() {
  return [...registry.values()].map(({ fetch: _f, ...meta }) => meta);
}

module.exports = { registry, register, get, list };

// Self-registering connectors — each module calls register() on load.
require('./anthropic_api');
require('./claude_plan');
require('./openai_api');
require('./aws_cost');
require('./github_copilot');
require('./vercel');
require('./sentry');
require('./railway');
require('./planetscale');
require('./cloudflare');
require('./linear');
