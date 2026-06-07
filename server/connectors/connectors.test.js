'use strict';

// Run with: node --test server/connectors/connectors.test.js
// Uses only Node.js built-ins (node:test, node:assert) — no extra deps.

const { describe, it, before } = require('node:test');
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

// Guard: tests must never hit real network.
before(() => {
  anthropicSetFetch(async () => { throw new Error('[test] no real HTTP allowed'); });
  openaiSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  awsSetFetch(async      () => { throw new Error('[test] no real HTTP allowed'); });
  copilotSetFetch(async  () => { throw new Error('[test] no real HTTP allowed'); });
  vercelSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  sentrySetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
  railwaySetFetch(async  () => { throw new Error('[test] no real HTTP allowed'); });
  psSetFetch(async       () => { throw new Error('[test] no real HTTP allowed'); });
  cfSetFetch(async       () => { throw new Error('[test] no real HTTP allowed'); });
  linearSetFetch(async   () => { throw new Error('[test] no real HTTP allowed'); });
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
