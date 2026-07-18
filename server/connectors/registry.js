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
 * authType       {string}
 *   Advisory label for the credential type (e.g. 'apiKey', 'awsKeyPair', 'digest',
 *   'oauthClientCredentials'). The connect form is driven by `fields` (below), not by
 *   authType — the only value the app branches on is 'localOAuth', which renders a
 *   consent checkbox instead of inputs and requires config.consentLocalToken === true.
 *   Real auth logic lives inside fetch() (e.g. aws_cost.js signs SigV4 by hand).
 *
 * secretAccounts {string[]}
 *   The <name> portion of each OS keychain account this connector uses.
 *   Full keychain account path: connector:<serviceId>:<name>
 *   e.g. ['apiKey'] → getSecret('connector:42:apiKey')
 *        ['accessKeyId','secretAccessKey'] for awsKeyPair connectors
 *   Must match the kind:'secret' entries in `fields` (a test enforces this).
 *
 * fields         {object[]}  (optional)
 *   Schema the connect form renders. Omit for a single API-token connector (the UI
 *   defaults to one required 'apiKey' secret field). Each field:
 *     name        {string}  input key; secret fields are stored in the keychain under
 *                           secretAccounts, config fields in service_connectors.config
 *     label       {string}  shown above the input
 *     kind        {'secret' | 'config'}
 *     type        {'password' | 'text' | 'select'}  (optional; default password/text)
 *     options     {string[]}  (optional; for select)
 *     required    {boolean}   (optional)
 *     placeholder {string}    (optional)
 *     help        {string}    (optional; hint shown under the input)
 *
 * hosts          {string[]}
 *   Hostname allowlist. http.js rejects any request whose URL host is not
 *   in this list. Keep it minimal — only the exact hostnames this connector
 *   needs to contact.
 *   e.g. ['api.openai.com'] or ['ce.us-east-1.amazonaws.com']
 *
 * endpoints      {{ method: string, path: RegExp }[]}  (optional)
 *   Exact-call allowlist, layered on top of `hosts`. A host allowlist alone
 *   lets a buggy mapper (or a compromised dependency) call ANY endpoint on an
 *   allowlisted host with this connector's — sometimes org-powerful — key.
 *   When present, http.js additionally requires every request's (method,
 *   url.pathname) to match one declared entry, or it throws before the
 *   request is issued. One entry per distinct request fetch()/audit()/
 *   testConnection() makes; template-interpolated path segments (an account
 *   SID, an org id) are part of the regex, not literal strings.
 *   e.g. [{ method: 'POST', path: /^\/$/ }] for a POST-to-root JSON API.
 *   Connectors without `endpoints` fall back to host-only enforcement —
 *   every connector in this registry declares them (a test enforces this).
 *
 * syncIntervalHours {number}  (optional; default 6)
 *   How often syncEnabledConnectors() (server/cron/snapshot.js) actually calls
 *   fetch() for this connector, independent of the cron's own 6-hour tick.
 *   Use this to slow down connectors whose provider bills per API call (e.g.
 *   AWS Cost Explorer at $0.01/request) — MTD cost doesn't need 4x/day freshness.
 *
 * audit          {async ({ secrets, config }) => metric[]}  (optional)
 *   Opt-in least-privilege check for this connector's credential — never
 *   called during a normal sync, only from an explicit "Audit key
 *   permissions" UI action (POST /api/connectors/:serviceId/audit). Returns
 *   metrics the same shape as fetch(). See aws_audit.js for the reference
 *   implementation (sentinel-probing IAM/S3/EC2 with calls a least-privilege
 *   key must fail).
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
 * Safe to send to the frontend. `endpoints` holds RegExp objects that
 * JSON.stringify would flatten to useless `{}` — server-internal only,
 * dropped here the same way `fetch` is.
 * @returns {object[]}
 */
function list() {
  return [...registry.values()].map(({ fetch: _f, endpoints: _e, ...meta }) => meta);
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
require('./openrouter');
require('./digitalocean');
require('./twilio');
require('./deepseek');
require('./datadog');
require('./mongodb_atlas');
require('./azure');
require('./vultr');
require('./linode');
require('./github_actions');
require('./cloudinary');
require('./elevenlabs');
require('./fastly');
require('./bunny');
require('./sendgrid');
