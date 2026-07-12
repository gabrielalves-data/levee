'use strict';

// ElevenLabs connector — pulls character usage against the subscription quota.
// Endpoint: GET https://api.elevenlabs.io/v1/user/subscription
// Auth: xi-api-key header.
// Config: none.
//
// characters_used_mtd: character_count  (number, used this billing cycle)
// characters_limit:    character_limit  (number, cycle quota)
// tier:                tier             (text)
// Flat plan price → catalog, not monthly_bill.

const http = require('./http');
const { register } = require('./registry');

const HOSTS    = ['api.elevenlabs.io'];
const ENDPOINT = 'https://api.elevenlabs.io/v1/user/subscription';

// Injectable for tests — never reassigned in production code.
let _fetch = (...args) => http.connectorFetch(...args);
function _setFetchForTest(fn) { _fetch = fn; }

// Pure — maps /v1/user/subscription response to { charactersUsed, charactersLimit, tier }.
function mapSubscriptionResponse(body) {
  const charactersUsed  = Number(body?.character_count ?? 0);
  const charactersLimit = Number(body?.character_limit ?? 0);
  const tier            = body?.tier ?? null;
  return { charactersUsed, charactersLimit, tier };
}

const connector = {
  label:          'ElevenLabs',
  tier:           'api',
  authType:       'apiKey',
  secretAccounts: ['apiKey'],
  hosts:          HOSTS,
  fields: [
    { name: 'apiKey', label: 'API key', kind: 'secret', required: true,
      help: 'If your plan supports key permissions, restrict this key to read-only access.' },
  ],

  async fetch({ secrets }) {
    const res = await _fetch(ENDPOINT, { hosts: HOSTS }, {
      headers: {
        'xi-api-key': secrets.apiKey,
        'Accept':     'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`ElevenLabs API returned ${res.status}: ${res.statusText}`);
    }
    const { charactersUsed, charactersLimit, tier } = mapSubscriptionResponse(await res.json());

    const metrics = [
      {
        metric_key: 'characters_used_mtd',
        label:      'Characters used',
        value_type: 'number',
        value_num:  charactersUsed,
        unit:       'characters',
      },
      {
        metric_key: 'characters_limit',
        label:      'Character limit',
        value_type: 'number',
        value_num:  charactersLimit,
        unit:       'characters',
      },
    ];

    if (tier != null) {
      metrics.push({
        metric_key: 'tier',
        label:      'Tier',
        value_type: 'text',
        value_text: tier,
      });
    }

    return metrics;
  },
};

register('elevenlabs', connector);

module.exports = { connector, mapSubscriptionResponse, _setFetchForTest };
