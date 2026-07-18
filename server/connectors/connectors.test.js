'use strict';

// Run with: node --test server/connectors/connectors.test.js
// Uses only Node.js built-ins (node:test, node:assert) — no extra deps.

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Import connectors directly. Each module self-registers on first require();
// subsequent requires return the cached module, so register() is not called twice.
const {
  mapCostReport: anthropicMapCost,
  mapUsageReport: anthropicMapUsage,
  _setFetchForTest: anthropicSetFetch,
  connector: anthropicConnector,
} = require('./anthropic_api');

const {
  mapCostReport: openaiMapCost,
  mapUsageReport: openaiMapUsage,
  _setFetchForTest: openaiSetFetch,
  connector: openaiConnector,
} = require('./openai_api');

const {
  mapResponse: awsMapResponse,
  _setFetchForTest: awsSetFetch,
  connector: awsConnector,
} = require('./aws_cost');

const {
  auditAwsKey,
  _setFetchForTest: awsAuditSetFetch,
} = require('./aws_audit');

const {
  mapBillingResponse: copilotMapBilling,
  _setFetchForTest: copilotSetFetch,
  connector: copilotConnector,
} = require('./github_copilot');

const {
  mapBillingResponse: vercelMapBilling,
  _setFetchForTest: vercelSetFetch,
  connector: vercelConnector,
} = require('./vercel');

const {
  mapStatsResponse: sentryMapStats,
  mapSubscriptionResponse: sentryMapSub,
  _setFetchForTest: sentrySetFetch,
  connector: sentryConnector,
} = require('./sentry');

const {
  mapGraphQLResponse: railwayMapGQL,
  _setFetchForTest: railwaySetFetch,
  connector: railwayConnector,
} = require('./railway');

const {
  mapBillingResponse: psMapBilling,
  _setFetchForTest: psSetFetch,
  connector: psConnector,
} = require('./planetscale');

const {
  mapAnalyticsResponse: cfMapAnalytics,
  mapBillingResponse: cfMapBilling,
  _setFetchForTest: cfSetFetch,
  connector: cfConnector,
} = require('./cloudflare');

const {
  mapGraphQLResponse: linearMapGQL,
  _setFetchForTest: linearSetFetch,
  connector: linearConnector,
} = require('./linear');

const {
  mapUsageResponse: claudePlanMapUsage,
  _setFetchForTest: claudePlanSetFetch,
  _setTokenReaderForTest: claudePlanSetTokenReader,
  connector: claudePlanConnector,
} = require('./claude_plan');

const {
  mapCreditsResponse: openrouterMapCredits,
  _setFetchForTest: openrouterSetFetch,
  connector: openrouterConnector,
} = require('./openrouter');

const {
  mapBalanceResponse: doMapBalance,
  _setFetchForTest: doSetFetch,
  connector: doConnector,
} = require('./digitalocean');

const {
  mapUsageResponse: twilioMapUsage,
  mapBalanceResponse: twilioMapBalance,
  _setFetchForTest: twilioSetFetch,
  connector: twilioConnector,
} = require('./twilio');

const {
  mapBalanceResponse: deepseekMapBalance,
  _setFetchForTest: deepseekSetFetch,
  connector: deepseekConnector,
} = require('./deepseek');

const {
  mapEstimatedCost: datadogMapCost,
  _setFetchForTest: datadogSetFetch,
  connector: datadogConnector,
} = require('./datadog');

const {
  mapInvoiceResponse: atlasMapInvoice,
  parseDigestChallenge: atlasParseChallenge,
  _setFetchForTest: atlasSetFetch,
  connector: atlasConnector,
} = require('./mongodb_atlas');

const {
  mapQueryResponse: azureMapQuery,
  _setFetchForTest: azureSetFetch,
  connector: azureConnector,
} = require('./azure');

const {
  mapAccountResponse: vultrMapAccount,
  _setFetchForTest: vultrSetFetch,
  connector: vultrConnector,
} = require('./vultr');

const {
  mapAccountResponse: linodeMapAccount,
  _setFetchForTest: linodeSetFetch,
  connector: linodeConnector,
} = require('./linode');

const {
  mapUsageResponse: ghaMapUsage,
  mapActionsResponse: ghaMapActions,
  _setFetchForTest: ghaSetFetch,
  connector: ghaConnector,
} = require('./github_actions');

const {
  mapUsageResponse: cloudinaryMapUsage,
  _setFetchForTest: cloudinarySetFetch,
  connector: cloudinaryConnector,
} = require('./cloudinary');

const {
  mapSubscriptionResponse: elevenMapSub,
  _setFetchForTest: elevenSetFetch,
  connector: elevenConnector,
} = require('./elevenlabs');

const {
  mapInvoiceResponse: fastlyMapInvoice,
  _setFetchForTest: fastlySetFetch,
  connector: fastlyConnector,
} = require('./fastly');

const {
  mapBillingResponse: bunnyMapBilling,
  _setFetchForTest: bunnySetFetch,
  connector: bunnyConnector,
} = require('./bunny');

const {
  mapCreditsResponse: sendgridMapCredits,
  _setFetchForTest: sendgridSetFetch,
  connector: sendgridConnector,
} = require('./sendgrid');

// Guard: tests must never hit real network.
before(() => {
  anthropicSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  openaiSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  awsSetFetch(async      () => { throw new Error('[test] no real HTTP allowed'); });
  awsAuditSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  copilotSetFetch(async  () => { throw new Error('[test] no real HTTP allowed'); });
  vercelSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  sentrySetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  railwaySetFetch(async  () => { throw new Error('[test] no real HTTP allowed'); });
  psSetFetch(async       () => { throw new Error('[test] no real HTTP allowed'); });
  cfSetFetch(async       () => { throw new Error('[test] no real HTTP allowed'); });
  linearSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  claudePlanSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  openrouterSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  doSetFetch(async       () => { throw new Error('[test] no real HTTP allowed'); });
  twilioSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  deepseekSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  datadogSetFetch(async  () => { throw new Error('[test] no real HTTP allowed'); });
  atlasSetFetch(async    () => { throw new Error('[test] no real HTTP allowed'); });
  azureSetFetch(async    () => { throw new Error('[test] no real HTTP allowed'); });
  vultrSetFetch(async    () => { throw new Error('[test] no real HTTP allowed'); });
  linodeSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  ghaSetFetch(async      () => { throw new Error('[test] no real HTTP allowed'); });
  cloudinarySetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  elevenSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  fastlySetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  bunnySetFetch(async    () => { throw new Error('[test] no real HTTP allowed'); });
  sendgridSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
});

// ─── Anthropic ────────────────────────────────────────────────────────────────

describe('anthropic_api — mapCostReport', () => {
  it('converts cents to USD and sums across buckets', () => {
    const data = [
      { results: [{ amount: '1000.00', currency: 'USD' }] },
      { results: [{ amount: '500.50',  currency: 'USD' }] },
    ];
    const { totalUSD, currency } = anthropicMapCost(data);
    // 1000.00 + 500.50 = 1500.50 cents → $15.005
    assert.equal(totalUSD, 15.005);
    assert.equal(currency, 'USD');
  });

  it('sums multiple results within one bucket', () => {
    const data = [
      {
        results: [
          { amount: '300.00', currency: 'USD' },
          { amount: '200.00', currency: 'USD' },
        ],
      },
    ];
    const { totalUSD } = anthropicMapCost(data);
    assert.equal(totalUSD, 5.00);
  });

  it('returns zero for empty data', () => {
    const { totalUSD } = anthropicMapCost([]);
    assert.equal(totalUSD, 0);
  });

  it('returns zero for buckets with empty results', () => {
    const { totalUSD } = anthropicMapCost([{ results: [] }]);
    assert.equal(totalUSD, 0);
  });
});

describe('anthropic_api — mapUsageReport', () => {
  it('sums uncached + cache_read as inputTokens', () => {
    const data = [
      { results: [{ uncached_input_tokens: 100, cache_read_input_tokens: 50,  output_tokens: 30 }] },
      { results: [{ uncached_input_tokens: 200, cache_read_input_tokens: 0,   output_tokens: 60 }] },
    ];
    const { inputTokens, outputTokens } = anthropicMapUsage(data);
    assert.equal(inputTokens, 350);   // (100+50) + (200+0)
    assert.equal(outputTokens, 90);
  });

  it('returns zeros for empty data', () => {
    const { inputTokens, outputTokens } = anthropicMapUsage([]);
    assert.equal(inputTokens, 0);
    assert.equal(outputTokens, 0);
  });
});

describe('anthropic_api — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    anthropicSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => anthropicConnector.fetch({ secrets: { apiKey: 'sk-test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns correct metrics from fixture data', async () => {
    const costBody = {
      data: [{ results: [{ amount: '500.00', currency: 'USD' }] }],
      has_more: false,
    };
    const usageBody = {
      data: [{ results: [{ uncached_input_tokens: 1000, cache_read_input_tokens: 200, output_tokens: 300 }] }],
      has_more: false,
    };
    anthropicSetFetch(async (url) => ({
      ok: true,
      json: async () => (url.includes('cost_report') ? costBody : usageBody),
    }));

    const metrics = await anthropicConnector.fetch({ secrets: { apiKey: 'sk-test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.equal(bill.value_num,  5.00);   // 500 cents → $5.00
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit,       'USD');

    const input = metrics.find(m => m.metric_key === 'input_tokens_mtd');
    assert.equal(input.value_num, 1200);   // 1000 + 200

    const output = metrics.find(m => m.metric_key === 'output_tokens_mtd');
    assert.equal(output.value_num, 300);
  });

  it('paginates until has_more is false', async () => {
    let callCount = 0;
    anthropicSetFetch(async (url) => {
      callCount++;
      if (url.includes('cost_report')) {
        // First cost page has has_more=true, second page ends it.
        const page1 = {
          data: [{ results: [{ amount: '100.00', currency: 'USD' }] }],
          has_more: true,
          next_page: 'cursor-p2',
        };
        const page2 = {
          data: [{ results: [{ amount: '200.00', currency: 'USD' }] }],
          has_more: false,
        };
        return { ok: true, json: async () => (url.includes('page=cursor-p2') ? page2 : page1) };
      }
      // usage always single page
      return {
        ok: true,
        json: async () => ({
          data: [{ results: [{ uncached_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 }] }],
          has_more: false,
        }),
      };
    });

    const metrics = await anthropicConnector.fetch({ secrets: { apiKey: 'sk-test' } });
    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.equal(bill.value_num, 3.00);  // (100 + 200) cents → $3.00
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    anthropicSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => anthropicConnector.fetch({ secrets: { apiKey: 'sk-secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /sk-secret/);
        return true;
      }
    );
  });
});

// ─── OpenAI ───────────────────────────────────────────────────────────────────

describe('openai_api — mapCostReport', () => {
  it('sums amount.value across buckets and results', () => {
    const buckets = [
      { results: [{ amount: { value: 1.50, currency: 'usd' } }] },
      { results: [{ amount: { value: 2.75, currency: 'usd' } }] },
    ];
    const { totalUSD, currency } = openaiMapCost(buckets);
    // floating-point: 1.50 + 2.75 = 4.25
    assert.ok(Math.abs(totalUSD - 4.25) < 1e-10);
    assert.equal(currency, 'USD');
  });

  it('returns zero for empty buckets', () => {
    const { totalUSD } = openaiMapCost([]);
    assert.equal(totalUSD, 0);
  });
});

describe('openai_api — mapUsageReport', () => {
  it('sums input_tokens and output_tokens across buckets', () => {
    const buckets = [
      { results: [{ input_tokens: 500,  output_tokens: 100 }] },
      { results: [{ input_tokens: 700,  output_tokens: 150 }] },
    ];
    const { inputTokens, outputTokens } = openaiMapUsage(buckets);
    assert.equal(inputTokens, 1200);
    assert.equal(outputTokens, 250);
  });

  it('returns zeros for empty buckets', () => {
    const { inputTokens, outputTokens } = openaiMapUsage([]);
    assert.equal(inputTokens, 0);
    assert.equal(outputTokens, 0);
  });
});

describe('openai_api — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    openaiSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => openaiConnector.fetch({ secrets: { apiKey: 'sk-test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns correct metrics from fixture data', async () => {
    const costsBody = {
      data: [{ results: [{ amount: { value: 12.34, currency: 'usd' }, line_item: null, project_id: null }] }],
      has_more: false,
    };
    const usageBody = {
      data: [{ results: [{ input_tokens: 1000, output_tokens: 400 }] }],
      has_more: false,
    };
    openaiSetFetch(async (url) => ({
      ok: true,
      json: async () => (url.includes('/organization/costs') ? costsBody : usageBody),
    }));

    const metrics = await openaiConnector.fetch({ secrets: { apiKey: 'sk-test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 12.34) < 1e-10);
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit,       'USD');

    const input = metrics.find(m => m.metric_key === 'input_tokens_mtd');
    assert.equal(input.value_num, 1000);

    const output = metrics.find(m => m.metric_key === 'output_tokens_mtd');
    assert.equal(output.value_num, 400);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    openaiSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    await assert.rejects(
      () => openaiConnector.fetch({ secrets: { apiKey: 'sk-secret' } }),
      (err) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /sk-secret/);
        return true;
      }
    );
  });
});

// ─── AWS ─────────────────────────────────────────────────────────────────────

describe('aws_cost — mapResponse', () => {
  it('extracts MTD and prior-month costs from ResultsByTime', () => {
    const data = {
      ResultsByTime: [
        { Total: { UnblendedCost: { Amount: '123.45', Unit: 'USD' } }, Estimated: false },
        { Total: { UnblendedCost: { Amount: '67.89',  Unit: 'USD' } }, Estimated: true  },
      ],
    };
    const { monthlyBill, lastBill, currency } = awsMapResponse(data);
    assert.ok(Math.abs(monthlyBill - 67.89)  < 1e-10);
    assert.ok(Math.abs(lastBill   - 123.45) < 1e-10);
    assert.equal(currency, 'USD');
  });

  it('returns zeros for empty ResultsByTime', () => {
    const { monthlyBill, lastBill } = awsMapResponse({ ResultsByTime: [] });
    assert.equal(monthlyBill, 0);
    assert.equal(lastBill, 0);
  });

  it('returns zero lastBill when only one period is present', () => {
    const data = {
      ResultsByTime: [
        { Total: { UnblendedCost: { Amount: '50.00', Unit: 'USD' } }, Estimated: true },
      ],
    };
    const { monthlyBill, lastBill } = awsMapResponse(data);
    assert.ok(Math.abs(monthlyBill - 50.00) < 1e-10);
    assert.equal(lastBill, 0);
  });
});

describe('aws_cost — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    awsSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => awsConnector.fetch({ secrets: { accessKeyId: 'AKIA', secretAccessKey: 'secret' } }),
      /Outbound network is disabled/
    );
  });

  it('returns correct metrics from fixture data', async () => {
    awsSetFetch(async () => ({
      ok: true,
      json: async () => ({
        ResultsByTime: [
          { Total: { UnblendedCost: { Amount: '99.00', Unit: 'USD' } }, Estimated: false },
          { Total: { UnblendedCost: { Amount: '45.50', Unit: 'USD' } }, Estimated: true  },
        ],
      }),
    }));

    const metrics = await awsConnector.fetch({
      secrets: { accessKeyId: 'AKIATEST', secretAccessKey: 'topsecret' },
    });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 45.50) < 1e-10);
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit, 'USD');

    const last = metrics.find(m => m.metric_key === 'last_bill');
    assert.ok(Math.abs(last.value_num - 99.00) < 1e-10);
  });

  it('throws a clean error (no credentials) on non-200 response', async () => {
    awsSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    await assert.rejects(
      () => awsConnector.fetch({ secrets: { accessKeyId: 'AKIA', secretAccessKey: 'xsecret' } }),
      (err) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /xsecret/);
        return true;
      }
    );
  });

  it('is wired to the connector as the optional audit hook', () => {
    assert.equal(awsConnector.audit, auditAwsKey);
  });

  it('defaults to a 24-hour sync interval (Cost Explorer bills per request)', () => {
    assert.equal(awsConnector.syncIntervalHours, 24);
  });
});

describe('aws_cost — testConnection (§6.5, STS GetCallerIdentity)', () => {
  it('resolves without throwing on a 2xx STS response', async () => {
    let capturedUrl;
    awsSetFetch(async (url) => { capturedUrl = url; return { ok: true, status: 200 }; });
    await awsConnector.testConnection({
      secrets: { accessKeyId: 'AKIA', secretAccessKey: 'secret' },
    });
    assert.equal(capturedUrl, 'https://sts.amazonaws.com/');
  });

  it('throws a clean error (no credentials) on a non-2xx STS response', async () => {
    awsSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    await assert.rejects(
      () => awsConnector.testConnection({ secrets: { accessKeyId: 'AKIA', secretAccessKey: 'xsecret' } }),
      (err) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /xsecret/);
        return true;
      }
    );
  });

  it('never calls the metered Cost Explorer host', async () => {
    let calledHost;
    awsSetFetch(async (url) => { calledHost = new URL(url).hostname; return { ok: true, status: 200 }; });
    await awsConnector.testConnection({ secrets: { accessKeyId: 'AKIA', secretAccessKey: 'secret' } });
    assert.equal(calledHost, 'sts.amazonaws.com');
  });
});

describe('aws_audit — auditAwsKey (sentinel probing)', () => {
  const secrets = { accessKeyId: 'AKIA', secretAccessKey: 'xsecret' };

  it('reports no over-privilege when every probe is denied', async () => {
    awsAuditSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    const metrics = await auditAwsKey({ secrets });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'key_privilege_audit');
    assert.equal(metrics[0].value_type, 'text');
    assert.equal(metrics[0].value_text, 'no over-privilege detected across IAM/S3/EC2');
  });

  it('flags over-privilege when a probe unexpectedly succeeds', async () => {
    awsAuditSetFetch(async (url) => ({
      ok: url.includes('s3.amazonaws.com'),
      status: url.includes('s3.amazonaws.com') ? 200 : 403,
      statusText: 'OK',
    }));
    const metrics = await auditAwsKey({ secrets });
    assert.match(metrics[0].value_text, /^⚠ over-privileged:/);
    assert.match(metrics[0].value_text, /s3:ListBuckets/);
  });

  it('never leaks the secret access key into the audit result', async () => {
    awsAuditSetFetch(async () => ({ ok: true, status: 200, statusText: 'OK' }));
    const metrics = await auditAwsKey({ secrets });
    assert.doesNotMatch(metrics[0].value_text, /xsecret/);
  });
});

// ─── GitHub Copilot ───────────────────────────────────────────────────────────

describe('github_copilot — mapBillingResponse', () => {
  it('derives seats and monthlyBill from seat_breakdown.total (business plan)', () => {
    const body = { seat_breakdown: { total: 10, active_this_cycle: 8 } };
    const { seats, monthlyBill } = copilotMapBilling(body, 'business');
    assert.equal(seats, 10);
    assert.equal(monthlyBill, 190); // 10 × $19
  });

  it('uses enterprise price when plan is enterprise', () => {
    const body = { seat_breakdown: { total: 5 } };
    const { monthlyBill } = copilotMapBilling(body, 'enterprise');
    assert.equal(monthlyBill, 195); // 5 × $39
  });

  it('returns zero seats for missing seat_breakdown', () => {
    const { seats, monthlyBill } = copilotMapBilling({}, 'business');
    assert.equal(seats, 0);
    assert.equal(monthlyBill, 0);
  });

  it('falls back to business pricing for unknown plan', () => {
    const body = { seat_breakdown: { total: 3 } };
    const { monthlyBill } = copilotMapBilling(body, 'unknown');
    assert.equal(monthlyBill, 57); // 3 × $19
  });
});

describe('github_copilot — connector.fetch (mocked HTTP)', () => {
  it('throws when org is missing from config', async () => {
    await assert.rejects(
      () => copilotConnector.fetch({ secrets: { apiKey: 'ghp_test' }, config: {} }),
      /org/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    copilotSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => copilotConnector.fetch({ secrets: { apiKey: 'ghp_test' }, config: { org: 'acme' } }),
      /Outbound network is disabled/
    );
  });

  it('returns correct metrics from fixture data', async () => {
    copilotSetFetch(async () => ({
      ok: true,
      json: async () => ({
        seat_breakdown: { total: 8, active_this_cycle: 6, inactive_this_cycle: 2 },
        seat_management_setting: 'assign_selected',
      }),
    }));

    const metrics = await copilotConnector.fetch({
      secrets: { apiKey: 'ghp_test' },
      config:  { org: 'acme', plan: 'business' },
    });

    const seats = metrics.find(m => m.metric_key === 'seats');
    assert.equal(seats.value_num,  8);
    assert.equal(seats.value_type, 'number');

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.equal(bill.value_num,  152); // 8 × $19
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit,       'USD');
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    copilotSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => copilotConnector.fetch({ secrets: { apiKey: 'ghp_secret' }, config: { org: 'acme' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /ghp_secret/);
        return true;
      }
    );
  });
});

// ─── Vercel ───────────────────────────────────────────────────────────────────

describe('vercel — mapBillingResponse', () => {
  it('converts cents to USD and extracts bandwidth from invoiceItems', () => {
    const body = {
      amount: 4500,
      currency: 'usd',
      invoiceItems: [
        { type: 'base',      quantity: 1,    unit: 'month' },
        { type: 'bandwidth', quantity: 12.5, unit: 'GB'    },
      ],
    };
    const { monthlyBill, bandwidthGb, currency } = vercelMapBilling(body);
    assert.equal(monthlyBill,  45);
    assert.equal(bandwidthGb,  12.5);
    assert.equal(currency,    'USD');
  });

  it('returns null bandwidthGb when no bandwidth invoiceItem exists', () => {
    const body = { amount: 2000, currency: 'usd', invoiceItems: [] };
    const { bandwidthGb } = vercelMapBilling(body);
    assert.equal(bandwidthGb, null);
  });

  it('returns zero monthlyBill for empty body', () => {
    const { monthlyBill } = vercelMapBilling({});
    assert.equal(monthlyBill, 0);
  });
});

describe('vercel — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    vercelSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => vercelConnector.fetch({ secrets: { apiKey: 'vt_test' }, config: {} }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill and bandwidth_gb when both present', async () => {
    vercelSetFetch(async () => ({
      ok: true,
      json: async () => ({
        amount: 9900,
        currency: 'usd',
        invoiceItems: [{ type: 'bandwidth', quantity: 7.3 }],
      }),
    }));

    const metrics = await vercelConnector.fetch({ secrets: { apiKey: 'vt_test' }, config: {} });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.equal(bill.value_num,  99);
    assert.equal(bill.unit,      'USD');

    const bw = metrics.find(m => m.metric_key === 'bandwidth_gb');
    assert.ok(Math.abs(bw.value_num - 7.3) < 1e-10);
    assert.equal(bw.unit, 'GB');
  });

  it('omits bandwidth_gb metric when not in response', async () => {
    vercelSetFetch(async () => ({
      ok: true,
      json: async () => ({ amount: 2000, currency: 'usd', invoiceItems: [] }),
    }));

    const metrics = await vercelConnector.fetch({ secrets: { apiKey: 'vt_test' }, config: {} });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'monthly_bill');
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    vercelSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => vercelConnector.fetch({ secrets: { apiKey: 'vt_secret' }, config: {} }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /vt_secret/);
        return true;
      }
    );
  });
});

// ─── Sentry ───────────────────────────────────────────────────────────────────

describe('sentry — mapStatsResponse', () => {
  it('sums sum(quantity) across all returned groups', () => {
    const body = {
      groups: [
        { by: { outcome: 'accepted' }, totals: { 'sum(quantity)': 4200 } },
        { by: { outcome: 'accepted' }, totals: { 'sum(quantity)': 800  } },
      ],
    };
    const { errorsMtd } = sentryMapStats(body);
    assert.equal(errorsMtd, 5000);
  });

  it('returns zero for empty groups', () => {
    const { errorsMtd } = sentryMapStats({ groups: [] });
    assert.equal(errorsMtd, 0);
  });
});

describe('sentry — mapSubscriptionResponse', () => {
  it('converts cents to USD', () => {
    const monthlyBill = sentryMapSub({ planDetails: { totalPrice: 2600 } });
    assert.equal(monthlyBill, 26);
  });

  it('returns null when totalPrice is absent', () => {
    assert.equal(sentryMapSub({}), null);
    assert.equal(sentryMapSub(null), null);
  });
});

describe('sentry — connector.fetch (mocked HTTP)', () => {
  it('throws when org is missing from config', async () => {
    await assert.rejects(
      () => sentryConnector.fetch({ secrets: { apiKey: 'sntr_test' }, config: {} }),
      /org/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    sentrySetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => sentryConnector.fetch({ secrets: { apiKey: 'sntr_test' }, config: { org: 'acme' } }),
      /Outbound network is disabled/
    );
  });

  it('returns errors_mtd and monthly_bill when billing scope granted', async () => {
    sentrySetFetch(async (url) => {
      if (url.includes('stats_v2')) {
        return {
          ok: true,
          json: async () => ({
            groups: [{ by: { outcome: 'accepted' }, totals: { 'sum(quantity)': 9876 } }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ planDetails: { totalPrice: 2900 } }),
      };
    });

    const metrics = await sentryConnector.fetch({
      secrets: { apiKey: 'sntr_test' },
      config:  { org: 'acme' },
    });

    const errors = metrics.find(m => m.metric_key === 'errors_mtd');
    assert.equal(errors.value_num, 9876);

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.equal(bill.value_num, 29);
    assert.equal(bill.unit, 'USD');
  });

  it('returns only errors_mtd when billing endpoint returns non-2xx', async () => {
    sentrySetFetch(async (url) => {
      if (url.includes('stats_v2')) {
        return {
          ok: true,
          json: async () => ({ groups: [{ totals: { 'sum(quantity)': 100 } }] }),
        };
      }
      return { ok: false, status: 403, statusText: 'Forbidden' };
    });

    const metrics = await sentryConnector.fetch({
      secrets: { apiKey: 'sntr_test' },
      config:  { org: 'acme' },
    });

    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'errors_mtd');
  });

  it('throws a clean error (no token) when stats API returns non-2xx', async () => {
    sentrySetFetch(async (url) => {
      if (url.includes('stats_v2')) return { ok: false, status: 401, statusText: 'Unauthorized' };
      return { ok: true, json: async () => ({}) };
    });
    await assert.rejects(
      () => sentryConnector.fetch({ secrets: { apiKey: 'sntr_secret' }, config: { org: 'acme' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /sntr_secret/);
        return true;
      }
    );
  });
});

// ─── Railway ──────────────────────────────────────────────────────────────────

describe('railway — mapGraphQLResponse', () => {
  it('extracts monthlyBill and zeroes creditsUsed when balance is positive', () => {
    const data = { me: { creditBalance: 5.00, usage: { estimatedMonthlyUsageCost: 12.34 } } };
    const { monthlyBill, creditsUsed } = railwayMapGQL(data);
    assert.ok(Math.abs(monthlyBill - 12.34) < 1e-10);
    assert.equal(creditsUsed, 0); // positive balance = credits still available
  });

  it('sets creditsUsed to absolute value when balance is negative', () => {
    const data = { me: { creditBalance: -3.50, usage: { estimatedMonthlyUsageCost: 20.00 } } };
    const { creditsUsed } = railwayMapGQL(data);
    assert.ok(Math.abs(creditsUsed - 3.50) < 1e-10);
  });

  it('returns zeros for missing data', () => {
    const { monthlyBill, creditsUsed } = railwayMapGQL({});
    assert.equal(monthlyBill, 0);
    assert.equal(creditsUsed, 0);
  });
});

describe('railway — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    railwaySetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => railwayConnector.fetch({ secrets: { apiKey: 'rw_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns correct metrics from fixture data', async () => {
    railwaySetFetch(async () => ({
      ok: true,
      json: async () => ({
        data: {
          me: {
            creditBalance: -1.25,
            usage: { estimatedMonthlyUsageCost: 8.75 },
          },
        },
      }),
    }));

    const metrics = await railwayConnector.fetch({ secrets: { apiKey: 'rw_test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 8.75) < 1e-10);
    assert.equal(bill.unit, 'USD');

    const credits = metrics.find(m => m.metric_key === 'credits_used');
    assert.ok(Math.abs(credits.value_num - 1.25) < 1e-10);
  });

  it('throws when GraphQL returns errors', async () => {
    railwaySetFetch(async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: 'Not authenticated' }] }),
    }));
    await assert.rejects(
      () => railwayConnector.fetch({ secrets: { apiKey: 'rw_test' } }),
      /Not authenticated/
    );
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    railwaySetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => railwayConnector.fetch({ secrets: { apiKey: 'rw_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /rw_secret/);
        return true;
      }
    );
  });
});

// ─── PlanetScale ──────────────────────────────────────────────────────────────

describe('planetscale — mapBillingResponse', () => {
  it('extracts rows_read and parses cost.total as USD', () => {
    const body = { rows_read: 1_500_000, rows_written: 200_000, cost: { total: '18.75' } };
    const { rowsReadMtd, monthlyBill } = psMapBilling(body);
    assert.equal(rowsReadMtd, 1_500_000);
    assert.ok(Math.abs(monthlyBill - 18.75) < 1e-10);
  });

  it('returns zeros for empty body', () => {
    const { rowsReadMtd, monthlyBill } = psMapBilling({});
    assert.equal(rowsReadMtd, 0);
    assert.equal(monthlyBill, 0);
  });
});

describe('planetscale — connector.fetch (mocked HTTP)', () => {
  it('throws when org is missing from config', async () => {
    await assert.rejects(
      () => psConnector.fetch({ secrets: { apiKey: 'ps_test' }, config: {} }),
      /org/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    psSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => psConnector.fetch({ secrets: { apiKey: 'ps_test' }, config: { org: 'acme' } }),
      /Outbound network is disabled/
    );
  });

  it('returns correct metrics from fixture data', async () => {
    psSetFetch(async () => ({
      ok: true,
      json: async () => ({
        rows_read:    9_000_000,
        rows_written: 1_000_000,
        cost: { total: '29.99' },
      }),
    }));

    const metrics = await psConnector.fetch({
      secrets: { apiKey: 'pscale_tkn_xxx' },
      config:  { org: 'acme' },
    });

    const rows = metrics.find(m => m.metric_key === 'rows_read_mtd');
    assert.equal(rows.value_num, 9_000_000);
    assert.equal(rows.unit, 'rows');

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 29.99) < 1e-10);
    assert.equal(bill.unit, 'USD');
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    psSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    await assert.rejects(
      () => psConnector.fetch({ secrets: { apiKey: 'ps_secret' }, config: { org: 'acme' } }),
      (err) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /ps_secret/);
        return true;
      }
    );
  });
});

// ─── Cloudflare ───────────────────────────────────────────────────────────────

describe('cloudflare — mapAnalyticsResponse', () => {
  it('sums requests across all zones and groups', () => {
    const data = {
      viewer: {
        zones: [
          {
            httpRequests1dGroups: [
              { sum: { requests: 100_000 }, dimensions: { date: '2026-06-01' } },
              { sum: { requests: 200_000 }, dimensions: { date: '2026-06-02' } },
            ],
          },
        ],
      },
    };
    const { requestsMtd } = cfMapAnalytics(data);
    assert.equal(requestsMtd, 300_000);
  });

  it('returns zero for empty zones', () => {
    const { requestsMtd } = cfMapAnalytics({ viewer: { zones: [] } });
    assert.equal(requestsMtd, 0);
  });
});

describe('cloudflare — mapBillingResponse', () => {
  it('sums billing history items within the current month', () => {
    const since = '2026-06-01';
    const body = {
      result: [
        { occurred_at: '2026-05-15T00:00:00Z', amount: 5.00 }, // prior month — excluded
        { occurred_at: '2026-06-03T00:00:00Z', amount: 12.50 },
        { occurred_at: '2026-06-10T00:00:00Z', amount: 7.25  },
      ],
    };
    const { monthlyBill } = cfMapBilling(body, since);
    assert.ok(Math.abs(monthlyBill - 19.75) < 1e-10);
  });

  it('returns zero for empty result', () => {
    const { monthlyBill } = cfMapBilling({ result: [] }, '2026-06-01');
    assert.equal(monthlyBill, 0);
  });
});

describe('cloudflare — connector.fetch (mocked HTTP)', () => {
  it('throws when neither zoneId nor accountId is in config', async () => {
    await assert.rejects(
      () => cfConnector.fetch({ secrets: { apiKey: 'cf_test' }, config: {} }),
      /zoneId or accountId/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    cfSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => cfConnector.fetch({ secrets: { apiKey: 'cf_test' }, config: { zoneId: 'z1' } }),
      /Outbound network is disabled/
    );
  });

  it('returns requests_mtd from analytics when only zoneId is set', async () => {
    cfSetFetch(async () => ({
      ok: true,
      json: async () => ({
        data: {
          viewer: {
            zones: [{ httpRequests1dGroups: [{ sum: { requests: 500_000 } }] }],
          },
        },
      }),
    }));

    const metrics = await cfConnector.fetch({
      secrets: { apiKey: 'cf_test' },
      config:  { zoneId: 'zone123' },
    });

    assert.equal(metrics.length, 1);
    const req = metrics.find(m => m.metric_key === 'requests_mtd');
    assert.equal(req.value_num, 500_000);
    assert.equal(req.unit, 'requests');
  });

  it('returns requests_mtd and monthly_bill when both zoneId and accountId set', async () => {
    cfSetFetch(async (url) => {
      if (url.includes('graphql')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              viewer: {
                zones: [{ httpRequests1dGroups: [{ sum: { requests: 1_000_000 } }] }],
              },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          result: [{ occurred_at: '2026-06-05T00:00:00Z', amount: 20.00 }],
        }),
      };
    });

    const metrics = await cfConnector.fetch({
      secrets: { apiKey: 'cf_test' },
      config:  { zoneId: 'zone123', accountId: 'acc456' },
    });

    const req  = metrics.find(m => m.metric_key === 'requests_mtd');
    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.equal(req.value_num, 1_000_000);
    assert.ok(bill != null);
  });

  it('throws a clean error (no token) on non-200 analytics response', async () => {
    cfSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    await assert.rejects(
      () => cfConnector.fetch({ secrets: { apiKey: 'cf_secret' }, config: { zoneId: 'z1' } }),
      (err) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /cf_secret/);
        return true;
      }
    );
  });
});

// ─── Linear ───────────────────────────────────────────────────────────────────

describe('linear — mapGraphQLResponse', () => {
  it('extracts seats and plan from subscription', () => {
    const data = { organization: { subscription: { seats: 15, plan: 'plus' } } };
    const { seats, plan } = linearMapGQL(data);
    assert.equal(seats, 15);
    assert.equal(plan,  'plus');
  });

  it('returns zero seats and null plan for missing subscription', () => {
    const { seats, plan } = linearMapGQL({ organization: {} });
    assert.equal(seats, 0);
    assert.equal(plan,  null);
  });

  it('returns zeros for empty data', () => {
    const { seats } = linearMapGQL({});
    assert.equal(seats, 0);
  });
});

describe('linear — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    linearSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => linearConnector.fetch({ secrets: { apiKey: 'lin_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns seats metric and plan metric from fixture data', async () => {
    linearSetFetch(async () => ({
      ok: true,
      json: async () => ({
        data: {
          organization: {
            subscription: { seats: 12, plan: 'business+' },
          },
        },
      }),
    }));

    const metrics = await linearConnector.fetch({ secrets: { apiKey: 'lin_test' } });

    const seats = metrics.find(m => m.metric_key === 'seats');
    assert.equal(seats.value_num,  12);
    assert.equal(seats.value_type, 'number');

    const plan = metrics.find(m => m.metric_key === 'plan');
    assert.equal(plan.value_text,  'business+');
    assert.equal(plan.value_type,  'text');
  });

  it('omits plan metric when subscription has no plan', async () => {
    linearSetFetch(async () => ({
      ok: true,
      json: async () => ({
        data: { organization: { subscription: { seats: 5, plan: null } } },
      }),
    }));

    const metrics = await linearConnector.fetch({ secrets: { apiKey: 'lin_test' } });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'seats');
  });

  it('throws when GraphQL returns errors', async () => {
    linearSetFetch(async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: 'Authentication required' }] }),
    }));
    await assert.rejects(
      () => linearConnector.fetch({ secrets: { apiKey: 'lin_test' } }),
      /Authentication required/
    );
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    linearSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => linearConnector.fetch({ secrets: { apiKey: 'lin_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /lin_secret/);
        return true;
      }
    );
  });
});

// ─── Claude Plan (local OAuth) ──────────────────────────────────────────────────

const claudePlanFullBody = {
  five_hour:      { utilization: 34, resets_at: '2026-06-10T18:00:00Z' },
  seven_day:      { utilization: 61, resets_at: '2026-06-14T00:00:00Z' },
  seven_day_opus: { utilization: 12, resets_at: '2026-06-14T00:00:00Z' },
};

describe('claude_plan — mapUsageResponse', () => {
  it('maps the session + weekly windows (% and reset), ignoring other buckets', () => {
    const metrics = claudePlanMapUsage(claudePlanFullBody);
    assert.equal(metrics.length, 4);

    const session = metrics.find(m => m.metric_key === 'session_pct');
    assert.equal(session.value_num,  34);
    assert.equal(session.value_type, 'percent');
    assert.equal(session.unit,       '%');

    const sessionReset = metrics.find(m => m.metric_key === 'session_reset_at');
    assert.equal(sessionReset.value_type, 'date');
    assert.equal(sessionReset.value_text, '2026-06-10T18:00:00Z');

    const weekly = metrics.find(m => m.metric_key === 'weekly_pct');
    assert.equal(weekly.value_num, 61);

    const reset = metrics.find(m => m.metric_key === 'weekly_reset_at');
    assert.equal(reset.value_type, 'date');
    assert.equal(reset.value_text, '2026-06-14T00:00:00Z');

    // seven_day_opus is no longer surfaced.
    assert.equal(metrics.some(m => m.metric_key === 'weekly_opus_pct'), false);
  });

  it('emits a single metric when only five_hour utilization is present', () => {
    const metrics = claudePlanMapUsage({ five_hour: { utilization: 50 } });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'session_pct');
    assert.equal(metrics[0].value_num,  50);
  });

  it('always reports extra_usage status and shows credits only when enabled', () => {
    const disabled = claudePlanMapUsage({
      five_hour:   { utilization: 10 },
      extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null },
    });
    const offStatus = disabled.find(m => m.metric_key === 'extra_usage_enabled');
    assert.equal(offStatus.value_text, 'Disabled');
    assert.equal(disabled.some(m => m.metric_key === 'extra_used_credits'), false);

    const enabled = claudePlanMapUsage({
      five_hour:   { utilization: 10 },
      extra_usage: {
        is_enabled: true, utilization: 40,
        used_credits: 420, monthly_limit: 3500,
        currency: 'USD', decimal_places: 2,
      },
    });
    assert.equal(enabled.find(m => m.metric_key === 'extra_usage_enabled').value_text, 'Enabled');
    assert.equal(enabled.find(m => m.metric_key === 'extra_usage_pct').value_num, 40);

    const used = enabled.find(m => m.metric_key === 'extra_used_credits');
    assert.equal(used.value_type, 'currency');
    assert.equal(used.value_num,  4.2);   // 420 minor units, decimal_places 2
    assert.equal(used.unit,       'USD');

    const limit = enabled.find(m => m.metric_key === 'extra_monthly_limit');
    assert.equal(limit.value_num, 35);
  });

  it('throws on an empty body (no recognizable data)', () => {
    assert.throws(() => claudePlanMapUsage({}), /no recognizable data/);
  });

  it('never emits a monthly_bill metric', () => {
    const metrics = claudePlanMapUsage(claudePlanFullBody);
    assert.equal(metrics.some(m => m.metric_key === 'monthly_bill'), false);
  });
});

describe('claude_plan — connector.fetch (mocked HTTP + token reader)', () => {
  it('reads the token, sends OAuth headers, and returns metrics', async () => {
    claudePlanSetTokenReader(async () => 'tok_test');
    let seenInit = null;
    claudePlanSetFetch(async (url, opts, init) => {
      seenInit = init;
      return { ok: true, status: 200, json: async () => claudePlanFullBody };
    });

    const config = { consentLocalToken: true };
    const metrics = await claudePlanConnector.fetch({ config });
    assert.equal(metrics.length, 4);
    assert.equal(seenInit.headers.Authorization, 'Bearer tok_test');
    assert.equal(seenInit.headers['anthropic-beta'], 'oauth-2025-04-20');
  });

  it('throws a clean error (no token leak) on a 401 response', async () => {
    claudePlanSetTokenReader(async () => 'tok_test');
    claudePlanSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => claudePlanConnector.fetch({ config: { consentLocalToken: true } }),
      (err) => {
        assert.doesNotMatch(err.message, /tok_test/);
        return true;
      }
    );
  });

  it('propagates the expired-token error from the token reader', async () => {
    const expiredMsg = 'Claude Code OAuth token is expired. Open Claude Code to refresh it, then sync again.';
    claudePlanSetTokenReader(async () => { throw new Error(expiredMsg); });
    await assert.rejects(
      () => claudePlanConnector.fetch({ config: { consentLocalToken: true } }),
      /token is expired/
    );
  });

  it('rejects without reading the token if consent was not recorded', async () => {
    let tokenReaderCalled = false;
    claudePlanSetTokenReader(async () => { tokenReaderCalled = true; return 'tok_test'; });
    await assert.rejects(() => claudePlanConnector.fetch({ config: {} }), /consent/);
    await assert.rejects(() => claudePlanConnector.fetch(), /consent/);
    assert.equal(tokenReaderCalled, false);
  });
});

describe('claude_plan — connector shape', () => {
  it('owns no Levee secret accounts and locks to the Anthropic host', () => {
    assert.deepEqual(claudePlanConnector.secretAccounts, []);
    assert.deepEqual(claudePlanConnector.hosts, ['api.anthropic.com']);
  });
});

// ─── OpenRouter ───────────────────────────────────────────────────────────────

describe('openrouter — mapCreditsResponse', () => {
  it('returns lifetime spend and remaining credits', () => {
    const { totalSpend, creditsRemaining } = openrouterMapCredits({
      data: { total_credits: 50, total_usage: 12.5 },
    });
    assert.ok(Math.abs(totalSpend - 12.5) < 1e-10);
    assert.ok(Math.abs(creditsRemaining - 37.5) < 1e-10);
  });

  it('returns zeros for empty body', () => {
    const { totalSpend, creditsRemaining } = openrouterMapCredits({});
    assert.equal(totalSpend, 0);
    assert.equal(creditsRemaining, 0);
  });
});

describe('openrouter — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    openrouterSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => openrouterConnector.fetch({ secrets: { apiKey: 'or_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns total_spend and credits_remaining from fixture data', async () => {
    openrouterSetFetch(async () => ({
      ok: true,
      json: async () => ({ data: { total_credits: 100, total_usage: 28.4 } }),
    }));

    const metrics = await openrouterConnector.fetch({ secrets: { apiKey: 'or_test' } });

    const spend = metrics.find(m => m.metric_key === 'total_spend');
    assert.ok(Math.abs(spend.value_num - 28.4) < 1e-10);
    assert.equal(spend.unit, 'USD');

    const credits = metrics.find(m => m.metric_key === 'credits_remaining');
    assert.ok(Math.abs(credits.value_num - 71.6) < 1e-10);

    // Lifetime totals must never roll into the monthly dashboard total.
    assert.equal(metrics.some(m => m.metric_key === 'monthly_bill'), false);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    openrouterSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => openrouterConnector.fetch({ secrets: { apiKey: 'or_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /or_secret/);
        return true;
      }
    );
  });
});

// ─── DigitalOcean ─────────────────────────────────────────────────────────────

describe('digitalocean — mapBalanceResponse', () => {
  it('parses string amounts into MTD spend and account balance', () => {
    const { monthlyBill, accountBalance } = doMapBalance({
      month_to_date_usage: '23.44',
      account_balance: '-5.00',
    });
    assert.ok(Math.abs(monthlyBill - 23.44) < 1e-10);
    assert.ok(Math.abs(accountBalance - -5.00) < 1e-10);
  });

  it('returns zeros for empty body', () => {
    const { monthlyBill, accountBalance } = doMapBalance({});
    assert.equal(monthlyBill, 0);
    assert.equal(accountBalance, 0);
  });
});

describe('digitalocean — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    doSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => doConnector.fetch({ secrets: { apiKey: 'dop_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill and account_balance from fixture data', async () => {
    doSetFetch(async () => ({
      ok: true,
      json: async () => ({ month_to_date_usage: '41.10', account_balance: '0.00' }),
    }));

    const metrics = await doConnector.fetch({ secrets: { apiKey: 'dop_test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 41.10) < 1e-10);
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit, 'USD');
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    doSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => doConnector.fetch({ secrets: { apiKey: 'dop_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /dop_secret/);
        return true;
      }
    );
  });
});

// ─── Twilio ───────────────────────────────────────────────────────────────────

describe('twilio — mapUsageResponse', () => {
  it('reads the totalprice record price and currency', () => {
    const { monthlyBill, currency } = twilioMapUsage({
      usage_records: [{ category: 'totalprice', price: '7.85', price_unit: 'usd' }],
    });
    assert.ok(Math.abs(monthlyBill - 7.85) < 1e-10);
    assert.equal(currency, 'USD');
  });

  it('returns zero for empty usage_records', () => {
    const { monthlyBill } = twilioMapUsage({ usage_records: [] });
    assert.equal(monthlyBill, 0);
  });
});

describe('twilio — mapBalanceResponse', () => {
  it('parses balance and uppercases currency', () => {
    const { balance, currency } = twilioMapBalance({ balance: '12.00', currency: 'usd' });
    assert.ok(Math.abs(balance - 12.00) < 1e-10);
    assert.equal(currency, 'USD');
  });
});

describe('twilio — connector.fetch (mocked HTTP)', () => {
  it('throws when accountSid is missing from config', async () => {
    await assert.rejects(
      () => twilioConnector.fetch({ secrets: { apiKeySid: 'SKxxx', apiKeySecret: 'tw_test' }, config: {} }),
      /accountSid/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    twilioSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => twilioConnector.fetch({ secrets: { apiKeySid: 'SKxxx', apiKeySecret: 'tw_test' }, config: { accountSid: 'ACxxx' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill and balance when both calls succeed', async () => {
    twilioSetFetch(async (url) => {
      if (url.includes('Usage/Records')) {
        return { ok: true, json: async () => ({ usage_records: [{ price: '15.00', price_unit: 'usd' }] }) };
      }
      return { ok: true, json: async () => ({ balance: '4.50', currency: 'usd' }) };
    });

    const metrics = await twilioConnector.fetch({
      secrets: { apiKeySid: 'SKxxx', apiKeySecret: 'tw_test' },
      config:  { accountSid: 'ACxxx' },
    });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 15.00) < 1e-10);
    assert.equal(bill.unit, 'USD');

    const balance = metrics.find(m => m.metric_key === 'balance');
    assert.ok(Math.abs(balance.value_num - 4.50) < 1e-10);
  });

  it('omits balance metric when the balance call fails', async () => {
    twilioSetFetch(async (url) => {
      if (url.includes('Usage/Records')) {
        return { ok: true, json: async () => ({ usage_records: [{ price: '9.00', price_unit: 'usd' }] }) };
      }
      return { ok: false, status: 403, statusText: 'Forbidden' };
    });

    const metrics = await twilioConnector.fetch({
      secrets: { apiKeySid: 'SKxxx', apiKeySecret: 'tw_test' },
      config:  { accountSid: 'ACxxx' },
    });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'monthly_bill');
  });

  it('throws a clean error (no token) when the usage call fails', async () => {
    twilioSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => twilioConnector.fetch({ secrets: { apiKeySid: 'SKxxx', apiKeySecret: 'tw_secret' }, config: { accountSid: 'ACxxx' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /tw_secret/);
        return true;
      }
    );
  });
});

// ─── DeepSeek ─────────────────────────────────────────────────────────────────

describe('deepseek — mapBalanceResponse', () => {
  it('reads the first balance_infos entry', () => {
    const { balance, currency } = deepseekMapBalance({
      balance_infos: [{ currency: 'USD', total_balance: '18.20' }],
    });
    assert.ok(Math.abs(balance - 18.20) < 1e-10);
    assert.equal(currency, 'USD');
  });

  it('returns zero for empty balance_infos', () => {
    const { balance } = deepseekMapBalance({ balance_infos: [] });
    assert.equal(balance, 0);
  });
});

describe('deepseek — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    deepseekSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => deepseekConnector.fetch({ secrets: { apiKey: 'ds_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns balance from fixture data and no monthly_bill', async () => {
    deepseekSetFetch(async () => ({
      ok: true,
      json: async () => ({ balance_infos: [{ currency: 'USD', total_balance: '33.33' }] }),
    }));

    const metrics = await deepseekConnector.fetch({ secrets: { apiKey: 'ds_test' } });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].metric_key, 'balance');
    assert.ok(Math.abs(metrics[0].value_num - 33.33) < 1e-10);
    assert.equal(metrics.some(m => m.metric_key === 'monthly_bill'), false);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    deepseekSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => deepseekConnector.fetch({ secrets: { apiKey: 'ds_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /ds_secret/);
        return true;
      }
    );
  });
});

// ─── Datadog ──────────────────────────────────────────────────────────────────

describe('datadog — mapEstimatedCost', () => {
  it('sums total_cost across buckets', () => {
    const { monthlyBill } = datadogMapCost({
      data: [
        { attributes: { total_cost: 40.0 } },
        { attributes: { total_cost: 2.5 } },
      ],
    });
    assert.ok(Math.abs(monthlyBill - 42.5) < 1e-10);
  });

  it('returns zero for empty data', () => {
    assert.equal(datadogMapCost({}).monthlyBill, 0);
  });
});

describe('datadog — connector.fetch (mocked HTTP)', () => {
  it('rejects an unsupported site', async () => {
    await assert.rejects(
      () => datadogConnector.fetch({ secrets: { apiKey: 'dd', appKey: 'app' }, config: { site: 'evil.com' } }),
      /Unsupported Datadog site/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    datadogSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => datadogConnector.fetch({ secrets: { apiKey: 'dd', appKey: 'app' }, config: {} }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill from fixture data', async () => {
    datadogSetFetch(async () => ({
      ok: true,
      json: async () => ({ data: [{ attributes: { total_cost: 123.45 } }] }),
    }));

    const metrics = await datadogConnector.fetch({ secrets: { apiKey: 'dd', appKey: 'app' }, config: {} });
    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 123.45) < 1e-10);
    assert.equal(bill.unit, 'USD');
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    datadogSetFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }));
    await assert.rejects(
      () => datadogConnector.fetch({ secrets: { apiKey: 'dd_secret', appKey: 'app_secret' }, config: {} }),
      (err) => {
        assert.match(err.message, /403/);
        assert.doesNotMatch(err.message, /dd_secret/);
        assert.doesNotMatch(err.message, /app_secret/);
        return true;
      }
    );
  });
});

// ─── MongoDB Atlas (HTTP Digest) ────────────────────────────────────────────────

describe('mongodb_atlas — parseDigestChallenge', () => {
  it('parses quoted and bare directives', () => {
    const c = atlasParseChallenge('Digest realm="MMS Public API", nonce="abc123", qop="auth", algorithm=MD5, stale=false');
    assert.equal(c.realm, 'MMS Public API');
    assert.equal(c.nonce, 'abc123');
    assert.equal(c.qop, 'auth');
    assert.equal(c.algorithm, 'MD5');
  });
});

describe('mongodb_atlas — mapInvoiceResponse', () => {
  it('prefers subtotalCents', () => {
    assert.ok(Math.abs(atlasMapInvoice({ subtotalCents: 4599 }).monthlyBill - 45.99) < 1e-10);
  });

  it('falls back to summing line items', () => {
    const { monthlyBill } = atlasMapInvoice({ lineItems: [{ totalPriceCents: 1000 }, { totalPriceCents: 250 }] });
    assert.ok(Math.abs(monthlyBill - 12.5) < 1e-10);
  });

  it('returns zero for empty body', () => {
    assert.equal(atlasMapInvoice({}).monthlyBill, 0);
  });
});

describe('mongodb_atlas — connector.fetch (mocked digest handshake)', () => {
  it('throws when orgId is missing from config', async () => {
    await assert.rejects(
      () => atlasConnector.fetch({ secrets: { publicKey: 'pub', privateKey: 'priv' }, config: {} }),
      /orgId/
    );
  });

  it('does the 401 challenge then authenticated retry', async () => {
    let call = 0;
    let secondAuthHeader = null;
    atlasSetFetch(async (url, opts, init) => {
      call++;
      if (call === 1) {
        return {
          status: 401,
          ok: false,
          headers: { get: (k) => (k.toLowerCase() === 'www-authenticate'
            ? 'Digest realm="MMS Public API", nonce="abc123", qop="auth", opaque="op42", algorithm=MD5'
            : null) },
        };
      }
      secondAuthHeader = init.headers.Authorization;
      return { ok: true, status: 200, json: async () => ({ subtotalCents: 8800 }) };
    });

    const metrics = await atlasConnector.fetch({
      secrets: { publicKey: 'pub', privateKey: 'priv' },
      config:  { orgId: '5abc' },
    });

    assert.equal(call, 2);
    assert.match(secondAuthHeader, /^Digest /);
    assert.match(secondAuthHeader, /response="[a-f0-9]{32}"/);
    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 88.0) < 1e-10);
  });

  it('throws a clean error (no key) when the retry fails', async () => {
    let call = 0;
    atlasSetFetch(async () => {
      call++;
      if (call === 1) {
        return { status: 401, ok: false, headers: { get: () => 'Digest realm="r", nonce="n", qop="auth"' } };
      }
      return { ok: false, status: 401, statusText: 'Unauthorized' };
    });
    await assert.rejects(
      () => atlasConnector.fetch({ secrets: { publicKey: 'pub', privateKey: 'priv_secret' }, config: { orgId: '5abc' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /priv_secret/);
        return true;
      }
    );
  });
});

// ─── Azure (AAD client-credentials) ─────────────────────────────────────────────

describe('azure — mapQueryResponse', () => {
  it('locates Cost/Currency columns by name and sums rows', () => {
    const { monthlyBill, currency } = azureMapQuery({
      properties: {
        columns: [{ name: 'Cost' }, { name: 'Currency' }],
        rows: [[10.5, 'USD'], [4.5, 'USD']],
      },
    });
    assert.ok(Math.abs(monthlyBill - 15.0) < 1e-10);
    assert.equal(currency, 'USD');
  });

  it('returns zero/default for empty body', () => {
    const { monthlyBill, currency } = azureMapQuery({});
    assert.equal(monthlyBill, 0);
    assert.equal(currency, 'USD');
  });
});

describe('azure — connector.fetch (mocked HTTP)', () => {
  it('throws when required config is missing', async () => {
    await assert.rejects(
      () => azureConnector.fetch({ secrets: { clientSecret: 'cs' }, config: { tenantId: 't' } }),
      /tenantId, clientId, subscriptionId/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    azureSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => azureConnector.fetch({
        secrets: { clientSecret: 'cs' },
        config:  { tenantId: 't', clientId: 'c', subscriptionId: 's' },
      }),
      /Outbound network is disabled/
    );
  });

  it('exchanges a token then queries cost', async () => {
    azureSetFetch(async (url) => {
      if (url.includes('login.microsoftonline.com')) {
        return { ok: true, json: async () => ({ access_token: 'tok_xyz' }) };
      }
      return {
        ok: true,
        json: async () => ({
          properties: { columns: [{ name: 'Cost' }, { name: 'Currency' }], rows: [[77.7, 'USD']] },
        }),
      };
    });

    const metrics = await azureConnector.fetch({
      secrets: { clientSecret: 'cs' },
      config:  { tenantId: 't', clientId: 'c', subscriptionId: 's' },
    });
    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 77.7) < 1e-10);
    assert.equal(bill.unit, 'USD');
  });

  it('throws a clean error (no secret) when the token request fails', async () => {
    azureSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => azureConnector.fetch({
        secrets: { clientSecret: 'cs_secret' },
        config:  { tenantId: 't', clientId: 'c', subscriptionId: 's' },
      }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /cs_secret/);
        return true;
      }
    );
  });
});

// ─── Vultr ────────────────────────────────────────────────────────────────────

describe('vultr — mapAccountResponse', () => {
  it('reads pending_charges and balance from the nested account object', () => {
    const { monthlyBill, accountBalance } = vultrMapAccount({
      account: { pending_charges: 3.51, balance: -10.00 },
    });
    assert.ok(Math.abs(monthlyBill - 3.51) < 1e-10);
    assert.ok(Math.abs(accountBalance - -10.00) < 1e-10);
  });

  it('tolerates a flat shape and returns zeros for empty body', () => {
    assert.ok(Math.abs(vultrMapAccount({ pending_charges: 2 }).monthlyBill - 2) < 1e-10);
    const { monthlyBill, accountBalance } = vultrMapAccount({});
    assert.equal(monthlyBill, 0);
    assert.equal(accountBalance, 0);
  });
});

describe('vultr — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    vultrSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => vultrConnector.fetch({ secrets: { apiKey: 'vl_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill and account_balance from fixture data', async () => {
    vultrSetFetch(async () => ({
      ok: true,
      json: async () => ({ account: { pending_charges: 7.25, balance: 0 } }),
    }));

    const metrics = await vultrConnector.fetch({ secrets: { apiKey: 'vl_test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 7.25) < 1e-10);
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit, 'USD');

    const bal = metrics.find(m => m.metric_key === 'account_balance');
    assert.equal(bal.value_num, 0);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    vultrSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => vultrConnector.fetch({ secrets: { apiKey: 'vl_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /vl_secret/);
        return true;
      }
    );
  });
});

// ─── Linode ───────────────────────────────────────────────────────────────────

describe('linode — mapAccountResponse', () => {
  it('reads balance_uninvoiced and balance', () => {
    const { monthlyBill, accountBalance } = linodeMapAccount({
      balance_uninvoiced: 14.20, balance: 5.00,
    });
    assert.ok(Math.abs(monthlyBill - 14.20) < 1e-10);
    assert.ok(Math.abs(accountBalance - 5.00) < 1e-10);
  });

  it('returns zeros for empty body', () => {
    const { monthlyBill, accountBalance } = linodeMapAccount({});
    assert.equal(monthlyBill, 0);
    assert.equal(accountBalance, 0);
  });
});

describe('linode — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    linodeSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => linodeConnector.fetch({ secrets: { apiKey: 'ln_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill and account_balance from fixture data', async () => {
    linodeSetFetch(async () => ({
      ok: true,
      json: async () => ({ balance_uninvoiced: 31.99, balance: 0 }),
    }));

    const metrics = await linodeConnector.fetch({ secrets: { apiKey: 'ln_test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 31.99) < 1e-10);
    assert.equal(bill.unit, 'USD');
  });

  it('throws a clean error (no token) on non-200 response', async () => {
    linodeSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => linodeConnector.fetch({ secrets: { apiKey: 'ln_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /ln_secret/);
        return true;
      }
    );
  });
});

// ─── GitHub Actions ─────────────────────────────────────────────────────────────

describe('github_actions — mapUsageResponse', () => {
  it('sums netAmount across usageItems', () => {
    const { monthlyBill } = ghaMapUsage({
      usageItems: [{ netAmount: 4.50 }, { netAmount: 1.25 }],
    });
    assert.ok(Math.abs(monthlyBill - 5.75) < 1e-10);
  });

  it('returns zero for missing usageItems', () => {
    assert.equal(ghaMapUsage({}).monthlyBill, 0);
  });
});

describe('github_actions — mapActionsResponse', () => {
  it('reads total_minutes_used', () => {
    assert.equal(ghaMapActions({ total_minutes_used: 1234 }).minutesUsed, 1234);
  });

  it('returns zero for empty body', () => {
    assert.equal(ghaMapActions({}).minutesUsed, 0);
  });
});

describe('github_actions — connector.fetch (mocked HTTP)', () => {
  it('throws when org is missing from config', async () => {
    await assert.rejects(
      () => ghaConnector.fetch({ secrets: { apiKey: 'ghp_test' }, config: {} }),
      /org/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    ghaSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => ghaConnector.fetch({ secrets: { apiKey: 'ghp_test' }, config: { org: 'acme' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill from the enhanced billing endpoint', async () => {
    ghaSetFetch(async () => ({
      ok: true,
      json: async () => ({ usageItems: [{ netAmount: 12.00 }, { netAmount: 3.00 }] }),
    }));

    const metrics = await ghaConnector.fetch({
      secrets: { apiKey: 'ghp_test' },
      config:  { org: 'acme' },
    });

    assert.equal(metrics.length, 1);
    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 15.00) < 1e-10);
    assert.equal(bill.unit, 'USD');
  });

  it('falls back to actions_minutes_mtd when enhanced billing 404s', async () => {
    ghaSetFetch(async (url) => {
      if (url.includes('/settings/billing/usage')) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return { ok: true, json: async () => ({ total_minutes_used: 4200 }) };
    });

    const metrics = await ghaConnector.fetch({
      secrets: { apiKey: 'ghp_test' },
      config:  { org: 'acme' },
    });

    assert.equal(metrics.length, 1);
    const mins = metrics.find(m => m.metric_key === 'actions_minutes_mtd');
    assert.equal(mins.value_num, 4200);
    assert.equal(mins.value_type, 'number');
    assert.equal(mins.unit, 'minutes');
  });

  it('throws a clean error (no token) on a non-404 enhanced billing error', async () => {
    ghaSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => ghaConnector.fetch({ secrets: { apiKey: 'ghp_secret' }, config: { org: 'acme' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /ghp_secret/);
        return true;
      }
    );
  });
});

// ─── Cloudinary ─────────────────────────────────────────────────────────────────

describe('cloudinary — mapUsageResponse', () => {
  it('reads usage and used_percent from credits', () => {
    const { creditsUsed, creditsUsedPct } = cloudinaryMapUsage({
      credits: { usage: 7.5, limit: 25, used_percent: 30 },
    });
    assert.ok(Math.abs(creditsUsed - 7.5) < 1e-10);
    assert.equal(creditsUsedPct, 30);
  });

  it('returns zeros for empty body', () => {
    const { creditsUsed, creditsUsedPct } = cloudinaryMapUsage({});
    assert.equal(creditsUsed, 0);
    assert.equal(creditsUsedPct, 0);
  });
});

describe('cloudinary — connector.fetch (mocked HTTP)', () => {
  it('throws when cloudName is missing from config', async () => {
    await assert.rejects(
      () => cloudinaryConnector.fetch({ secrets: { apiKey: 'k', apiSecret: 's' }, config: {} }),
      /cloudName/
    );
  });

  it('propagates the allow_outbound gate error', async () => {
    cloudinarySetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => cloudinaryConnector.fetch({
        secrets: { apiKey: 'k', apiSecret: 's' },
        config:  { cloudName: 'demo' },
      }),
      /Outbound network is disabled/
    );
  });

  it('returns credits_used and credits_used_pct (no monthly_bill)', async () => {
    cloudinarySetFetch(async () => ({
      ok: true,
      json: async () => ({ credits: { usage: 4.2, limit: 25, used_percent: 16.8 } }),
    }));

    const metrics = await cloudinaryConnector.fetch({
      secrets: { apiKey: 'k', apiSecret: 's' },
      config:  { cloudName: 'demo' },
    });

    const used = metrics.find(m => m.metric_key === 'credits_used');
    assert.ok(Math.abs(used.value_num - 4.2) < 1e-10);
    assert.equal(used.unit, 'credits');

    const pct = metrics.find(m => m.metric_key === 'credits_used_pct');
    assert.ok(Math.abs(pct.value_num - 16.8) < 1e-10);
    assert.equal(pct.value_type, 'percent');

    assert.equal(metrics.some(m => m.metric_key === 'monthly_bill'), false);
  });

  it('throws a clean error (no secret) on non-200 response', async () => {
    cloudinarySetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => cloudinaryConnector.fetch({
        secrets: { apiKey: 'k', apiSecret: 'topsecret' },
        config:  { cloudName: 'demo' },
      }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /topsecret/);
        return true;
      }
    );
  });
});

// ─── ElevenLabs ─────────────────────────────────────────────────────────────────

describe('elevenlabs — mapSubscriptionResponse', () => {
  it('reads character usage, limit and tier', () => {
    const { charactersUsed, charactersLimit, tier } = elevenMapSub({
      tier: 'creator', character_count: 12000, character_limit: 100000,
    });
    assert.equal(charactersUsed, 12000);
    assert.equal(charactersLimit, 100000);
    assert.equal(tier, 'creator');
  });

  it('returns zeros and null tier for empty body', () => {
    const { charactersUsed, charactersLimit, tier } = elevenMapSub({});
    assert.equal(charactersUsed, 0);
    assert.equal(charactersLimit, 0);
    assert.equal(tier, null);
  });
});

describe('elevenlabs — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    elevenSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => elevenConnector.fetch({ secrets: { apiKey: 'xi_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns characters and tier metrics (no monthly_bill)', async () => {
    elevenSetFetch(async () => ({
      ok: true,
      json: async () => ({ tier: 'pro', character_count: 55000, character_limit: 500000 }),
    }));

    const metrics = await elevenConnector.fetch({ secrets: { apiKey: 'xi_test' } });

    const used = metrics.find(m => m.metric_key === 'characters_used_mtd');
    assert.equal(used.value_num, 55000);
    assert.equal(used.unit, 'characters');

    const tier = metrics.find(m => m.metric_key === 'tier');
    assert.equal(tier.value_text, 'pro');
    assert.equal(tier.value_type, 'text');

    assert.equal(metrics.some(m => m.metric_key === 'monthly_bill'), false);
  });

  it('omits tier metric when absent', async () => {
    elevenSetFetch(async () => ({
      ok: true,
      json: async () => ({ character_count: 100, character_limit: 1000 }),
    }));

    const metrics = await elevenConnector.fetch({ secrets: { apiKey: 'xi_test' } });
    assert.equal(metrics.some(m => m.metric_key === 'tier'), false);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    elevenSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => elevenConnector.fetch({ secrets: { apiKey: 'xi_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /xi_secret/);
        return true;
      }
    );
  });
});

// ─── Fastly ───────────────────────────────────────────────────────────────────

describe('fastly — mapInvoiceResponse', () => {
  it('parses monthly_transaction_amount string into USD', () => {
    const { monthlyBill } = fastlyMapInvoice({ monthly_transaction_amount: '142.07' });
    assert.ok(Math.abs(monthlyBill - 142.07) < 1e-10);
  });

  it('returns zero for empty body', () => {
    assert.equal(fastlyMapInvoice({}).monthlyBill, 0);
  });
});

describe('fastly — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    fastlySetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => fastlyConnector.fetch({ secrets: { apiKey: 'fa_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill from fixture data', async () => {
    fastlySetFetch(async () => ({
      ok: true,
      json: async () => ({ monthly_transaction_amount: '88.50' }),
    }));

    const metrics = await fastlyConnector.fetch({ secrets: { apiKey: 'fa_test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 88.50) < 1e-10);
    assert.equal(bill.value_type, 'currency');
    assert.equal(bill.unit, 'USD');
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    fastlySetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => fastlyConnector.fetch({ secrets: { apiKey: 'fa_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /fa_secret/);
        return true;
      }
    );
  });
});

// ─── Bunny.net ──────────────────────────────────────────────────────────────────

describe('bunny — mapBillingResponse', () => {
  it('reads ThisMonthCharges and Balance', () => {
    const { monthlyBill, accountBalance } = bunnyMapBilling({
      ThisMonthCharges: 3.74, Balance: 6700.42,
    });
    assert.ok(Math.abs(monthlyBill - 3.74) < 1e-10);
    assert.ok(Math.abs(accountBalance - 6700.42) < 1e-10);
  });

  it('returns zeros for empty body', () => {
    const { monthlyBill, accountBalance } = bunnyMapBilling({});
    assert.equal(monthlyBill, 0);
    assert.equal(accountBalance, 0);
  });
});

describe('bunny — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    bunnySetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => bunnyConnector.fetch({ secrets: { apiKey: 'bn_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns monthly_bill and account_balance from fixture data', async () => {
    bunnySetFetch(async () => ({
      ok: true,
      json: async () => ({ ThisMonthCharges: 12.34, Balance: 50.00 }),
    }));

    const metrics = await bunnyConnector.fetch({ secrets: { apiKey: 'bn_test' } });

    const bill = metrics.find(m => m.metric_key === 'monthly_bill');
    assert.ok(Math.abs(bill.value_num - 12.34) < 1e-10);
    assert.equal(bill.unit, 'USD');

    const bal = metrics.find(m => m.metric_key === 'account_balance');
    assert.ok(Math.abs(bal.value_num - 50.00) < 1e-10);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    bunnySetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => bunnyConnector.fetch({ secrets: { apiKey: 'bn_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /bn_secret/);
        return true;
      }
    );
  });
});

// ─── SendGrid ───────────────────────────────────────────────────────────────────

describe('sendgrid — mapCreditsResponse', () => {
  it('reads remain and used', () => {
    const { creditsRemaining, creditsUsed } = sendgridMapCredits({
      remain: 8000, total: 10000, used: 2000, overage: 0,
    });
    assert.equal(creditsRemaining, 8000);
    assert.equal(creditsUsed, 2000);
  });

  it('returns zeros for empty body', () => {
    const { creditsRemaining, creditsUsed } = sendgridMapCredits({});
    assert.equal(creditsRemaining, 0);
    assert.equal(creditsUsed, 0);
  });
});

describe('sendgrid — connector.fetch (mocked HTTP)', () => {
  it('propagates the allow_outbound gate error', async () => {
    sendgridSetFetch(async () => {
      throw new Error('Outbound network is disabled. Enable "Allow outbound connections" in Settings → Privacy.');
    });
    await assert.rejects(
      () => sendgridConnector.fetch({ secrets: { apiKey: 'sg_test' } }),
      /Outbound network is disabled/
    );
  });

  it('returns credit metrics (no monthly_bill)', async () => {
    sendgridSetFetch(async () => ({
      ok: true,
      json: async () => ({ remain: 4500, total: 5000, used: 500, overage: 0 }),
    }));

    const metrics = await sendgridConnector.fetch({ secrets: { apiKey: 'sg_test' } });

    const remain = metrics.find(m => m.metric_key === 'credits_remaining');
    assert.equal(remain.value_num, 4500);
    assert.equal(remain.unit, 'credits');

    const used = metrics.find(m => m.metric_key === 'credits_used');
    assert.equal(used.value_num, 500);

    assert.equal(metrics.some(m => m.metric_key === 'monthly_bill'), false);
  });

  it('throws a clean error (no key) on non-200 response', async () => {
    sendgridSetFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized' }));
    await assert.rejects(
      () => sendgridConnector.fetch({ secrets: { apiKey: 'sg_secret' } }),
      (err) => {
        assert.match(err.message, /401/);
        assert.doesNotMatch(err.message, /sg_secret/);
        return true;
      }
    );
  });
});

// ─── Connector self-description consistency ──────────────────────────────────────

const { list: listAllConnectors } = require('./registry');

describe('connector fields ↔ secretAccounts consistency', () => {
  it('every secret-kind field maps to a declared secret account (and vice versa)', () => {
    for (const def of listAllConnectors()) {
      if (!def.fields) continue;
      const secretFields = def.fields.filter(f => f.kind === 'secret').map(f => f.name).sort();
      const accounts = [...(def.secretAccounts ?? [])].sort();
      assert.deepEqual(secretFields, accounts, `${def.provider_key}: secret fields must match secretAccounts`);
    }
  });
});

const { listProviders, getProvider } = require('../providers');
const { get: getRegisteredConnector } = require('./registry');
const catalogPlans = require('../catalog/plans.json');

describe('provider directory', () => {
  it('binds Claude to both a catalog plan and the live local-OAuth connector', () => {
    const claude = getProvider('claude');
    assert.equal(claude.catalogKey, 'claude');
    assert.equal(claude.apiKey, 'claude_plan');
    assert.equal(claude.authType, 'localOAuth');
    assert.equal(claude.category, 'ai_model');
  });

  it('returns undefined for an unknown provider key', () => {
    assert.equal(getProvider('nope'), undefined);
  });

  it('every declared catalogKey/apiKey resolves to a real catalog plan / connector', () => {
    for (const p of listProviders()) {
      assert.ok(p.catalogKey || p.apiKey, `${p.key} must offer at least one connection method`);
      if (p.catalogKey) assert.ok(catalogPlans[p.catalogKey], `missing catalog plans for ${p.catalogKey}`);
      if (p.apiKey) assert.ok(getRegisteredConnector(p.apiKey), `missing connector for ${p.apiKey}`);
    }
  });
});

// ─── connectorFetch — redirect handling (host-allowlist bypass guard) ─────────

const { connectorFetch } = require('./http');
const fetchGateDb = require('../db/database');
const getAllowOutboundRow = fetchGateDb.prepare(
  "SELECT value FROM app_settings WHERE key = 'allow_outbound'"
);
const setAllowOutboundRow = fetchGateDb.prepare(
  "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('allow_outbound', ?)"
);

describe('connectorFetch — redirect handling', () => {
  let originalAllowOutbound;
  let originalFetch;

  before(() => {
    originalAllowOutbound = getAllowOutboundRow.get()?.value ?? 'false';
    setAllowOutboundRow.run('true');
  });

  after(() => {
    setAllowOutboundRow.run(originalAllowOutbound);
  });

  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('requests with redirect: manual so allowlisted hops cannot be hopped away from', async () => {
    let captured;
    global.fetch = async (url, options) => { captured = options; return { status: 200 }; };
    await connectorFetch('https://example.com/x', { hosts: ['example.com'] });
    assert.equal(captured.redirect, 'manual');
  });

  it('throws instead of returning a 3xx response to the caller', async () => {
    global.fetch = async () => ({ status: 302 });
    await assert.rejects(
      () => connectorFetch('https://example.com/x', { hosts: ['example.com'] }),
      /redirect/i
    );
  });

  it('passes through non-redirect responses unchanged', async () => {
    global.fetch = async () => ({ status: 200, ok: true });
    const res = await connectorFetch('https://example.com/x', { hosts: ['example.com'] });
    assert.equal(res.status, 200);
  });
});

// ─── connectorFetch — path-level egress allowlist (§6.4) ──────────────────────

describe('connectorFetch — endpoint allowlist', () => {
  let originalAllowOutbound;
  let originalFetch;

  before(() => {
    originalAllowOutbound = getAllowOutboundRow.get()?.value ?? 'false';
    setAllowOutboundRow.run('true');
  });

  after(() => {
    setAllowOutboundRow.run(originalAllowOutbound);
  });

  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  const ENDPOINTS = [{ method: 'GET', path: /^\/v1\/allowed$/ }];

  it('throws on an allowlisted host but a path not in the declared endpoints', async () => {
    global.fetch = async () => ({ status: 200, ok: true });
    await assert.rejects(
      () => connectorFetch('https://example.com/v1/not-allowed', { hosts: ['example.com'], endpoints: ENDPOINTS }),
      /not a declared endpoint/i
    );
  });

  it('throws on the right path but the wrong method', async () => {
    global.fetch = async () => ({ status: 200, ok: true });
    await assert.rejects(
      () => connectorFetch('https://example.com/v1/allowed', { hosts: ['example.com'], endpoints: ENDPOINTS }, { method: 'POST' }),
      /not a declared endpoint/i
    );
  });

  it('allows a request matching a declared (method, path) pair', async () => {
    global.fetch = async () => ({ status: 200, ok: true });
    const res = await connectorFetch('https://example.com/v1/allowed', { hosts: ['example.com'], endpoints: ENDPOINTS });
    assert.equal(res.status, 200);
  });

  it('falls back to host-only enforcement when a connector declares no endpoints', async () => {
    global.fetch = async () => ({ status: 200, ok: true });
    const res = await connectorFetch('https://example.com/anything', { hosts: ['example.com'] });
    assert.equal(res.status, 200);
  });
});

describe('connector endpoint declarations (§6.4)', () => {
  it('every registered connector declares a non-empty endpoints array', () => {
    // Uses the raw registry, not list() — list() strips `endpoints` before
    // sending connector metadata to the frontend (RegExp doesn't serialize).
    const { registry: rawRegistry } = require('./registry');
    for (const def of rawRegistry.values()) {
      assert.ok(
        Array.isArray(def.endpoints) && def.endpoints.length > 0,
        `${def.provider_key}: must declare endpoints (see server/connectors/registry.js contract)`
      );
      for (const e of def.endpoints) {
        assert.equal(typeof e.method, 'string', `${def.provider_key}: endpoint method must be a string`);
        assert.ok(e.path instanceof RegExp, `${def.provider_key}: endpoint path must be a RegExp`);
      }
    }
  });
});
