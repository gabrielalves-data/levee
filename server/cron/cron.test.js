'use strict';

// Run with: node --test server/cron/cron.test.js
// Only exercises the pure isDueForSync() helper — never touches the real DB
// or app_settings, unlike syncEnabledConnectors() itself.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isDueForSync, effectiveIntervalHours, isBillingMonth } = require('./snapshot');

describe('isDueForSync — per-connector sync cadence', () => {
  it('is due when the connector has never synced', () => {
    assert.equal(isDueForSync(null, 24), true);
  });

  it('is not due when last synced less than intervalHours ago', () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const lastSyncAt = new Date('2026-07-12T02:00:00Z').toISOString(); // 10h ago
    assert.equal(isDueForSync(lastSyncAt, 24, now), false);
  });

  it('is due once intervalHours have elapsed', () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const lastSyncAt = new Date('2026-07-11T12:00:00Z').toISOString(); // exactly 24h ago
    assert.equal(isDueForSync(lastSyncAt, 24, now), true);
  });

  it('falls back to the default 6-hour cadence behavior when called with it directly', () => {
    const now = new Date('2026-07-12T12:00:00Z');
    const lastSyncAt = new Date('2026-07-12T07:00:00Z').toISOString(); // 5h ago
    assert.equal(isDueForSync(lastSyncAt, 6, now), false);
    assert.equal(isDueForSync(lastSyncAt, 4, now), true);
  });
});

describe('effectiveIntervalHours — §5.4 backoff', () => {
  it('passes through the configured interval below the failure threshold', () => {
    assert.equal(effectiveIntervalHours(6, 0), 6);
    assert.equal(effectiveIntervalHours(6, 2), 6);
  });

  it('floors to 24h once 3+ consecutive failures have occurred', () => {
    assert.equal(effectiveIntervalHours(6, 3), 24);
    assert.equal(effectiveIntervalHours(0.5, 3), 24);
  });

  it('never speeds up a connector whose own interval already exceeds the floor', () => {
    assert.equal(effectiveIntervalHours(48, 3), 48);
  });
});

describe('isBillingMonth — §5.2 real-cash-hit anchoring', () => {
  it('always bills for monthly services', () => {
    assert.equal(isBillingMonth('monthly', null, 3), true);
    assert.equal(isBillingMonth('monthly', 7, 3), true);
  });

  it('treats a missing billing_month as billing every month', () => {
    assert.equal(isBillingMonth('yearly', null, 5), true);
    assert.equal(isBillingMonth('quarterly', null, 9), true);
  });

  it('yearly bills only in its anchor month', () => {
    assert.equal(isBillingMonth('yearly', 3, 3), true);
    assert.equal(isBillingMonth('yearly', 3, 4), false);
  });

  it('quarterly bills every 3 months from its anchor, wrapping across year end', () => {
    assert.equal(isBillingMonth('quarterly', 2, 2), true);
    assert.equal(isBillingMonth('quarterly', 2, 5), true);
    assert.equal(isBillingMonth('quarterly', 2, 8), true);
    assert.equal(isBillingMonth('quarterly', 2, 11), true);
    assert.equal(isBillingMonth('quarterly', 2, 12), false);
    assert.equal(isBillingMonth('quarterly', 11, 2), true); // wraps: 11 -> 2 is +3 mod 12
  });
});
