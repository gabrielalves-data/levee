'use strict';

/**
 * Provider directory — the mapping layer between a service and its data source.
 *
 * A "provider" is the canonical identity a user picks once when creating a service
 * (e.g. Claude, AWS). Each provider declares the connection methods it supports:
 *   catalogKey — indexes server/catalog/plans.json (static plan-price tracking)
 *   apiKey     — indexes the connector registry  (live API pull)
 * A provider may have one or both. The UI uses this to render the right Connect
 * inputs without ever asking the user to choose a provider a second time.
 */

const { get: getConnector } = require('./connectors/registry');
const catalog = require('./catalog/plans.json');

/** @type {{ key, label, category, catalogKey?, apiKey? }[]} */
const PROVIDERS = [
  // AI models / subscriptions
  { key: 'claude',        label: 'Claude',         category: 'ai_model', catalogKey: 'claude',  apiKey: 'claude_plan' },
  { key: 'chatgpt',       label: 'ChatGPT',        category: 'ai_model', catalogKey: 'chatgpt' },
  { key: 'gemini',        label: 'Gemini',         category: 'ai_model', catalogKey: 'gemini' },
  { key: 'perplexity',    label: 'Perplexity',     category: 'ai_model', catalogKey: 'perplexity' },
  { key: 'midjourney',    label: 'Midjourney',     category: 'ai_model', catalogKey: 'midjourney' },
  { key: 'mistral_lechat', label: 'Mistral Le Chat', category: 'ai_model', catalogKey: 'mistral_lechat' },
  // AI APIs (usage-based)
  { key: 'anthropic_api', label: 'Anthropic API',  category: 'ai_api',   apiKey: 'anthropic_api' },
  { key: 'openai_api',    label: 'OpenAI API',     category: 'ai_api',   apiKey: 'openai_api' },
  { key: 'openrouter',    label: 'OpenRouter',     category: 'ai_api',   apiKey: 'openrouter' },
  { key: 'deepseek',      label: 'DeepSeek',       category: 'ai_api',   apiKey: 'deepseek' },
  // Cloud
  { key: 'aws',           label: 'AWS',            category: 'cloud',    apiKey: 'aws_cost' },
  { key: 'vercel',        label: 'Vercel',         category: 'cloud',    apiKey: 'vercel' },
  { key: 'railway',       label: 'Railway',        category: 'cloud',    apiKey: 'railway' },
  { key: 'cloudflare',    label: 'Cloudflare',     category: 'cloud',    apiKey: 'cloudflare' },
  { key: 'planetscale',   label: 'PlanetScale',    category: 'cloud',    apiKey: 'planetscale' },
  { key: 'digitalocean',  label: 'DigitalOcean',   category: 'cloud',    apiKey: 'digitalocean' },
  { key: 'azure',         label: 'Azure',          category: 'cloud',    apiKey: 'azure' },
  { key: 'mongodb_atlas', label: 'MongoDB Atlas',  category: 'cloud',    apiKey: 'mongodb_atlas' },
  // Dev tools
  { key: 'copilot',       label: 'GitHub Copilot', category: 'tool',     catalogKey: 'copilot', apiKey: 'github_copilot' },
  { key: 'cursor',        label: 'Cursor',         category: 'tool',     catalogKey: 'cursor' },
  { key: 'linear',        label: 'Linear',         category: 'tool',     apiKey: 'linear' },
  { key: 'sentry',        label: 'Sentry',         category: 'tool',     apiKey: 'sentry' },
  { key: 'twilio',        label: 'Twilio',         category: 'tool',     apiKey: 'twilio' },
  { key: 'datadog',       label: 'Datadog',        category: 'tool',     apiKey: 'datadog' },
  { key: 'v0',            label: 'v0',             category: 'tool',     catalogKey: 'v0' },
];

// Enrich an entry with the live-connector authType (so the UI knows whether to
// render a token field or a localOAuth consent box) without leaking the fetch fn.
function decorate(p) {
  const out = { key: p.key, label: p.label, category: p.category };
  if (p.catalogKey && catalog[p.catalogKey]) out.catalogKey = p.catalogKey;
  if (p.apiKey) {
    const def = getConnector(p.apiKey);
    if (def) {
      out.apiKey = p.apiKey;
      out.authType = def.authType;
      if (def.fields) out.fields = def.fields;
    }
  }
  return out;
}

/** All providers, serialisable and safe to send to the frontend. */
function listProviders() {
  return PROVIDERS.map(decorate);
}

/** Resolve a single provider by its canonical key, or undefined. */
function getProvider(key) {
  const p = PROVIDERS.find((x) => x.key === key);
  return p ? decorate(p) : undefined;
}

module.exports = { listProviders, getProvider };
