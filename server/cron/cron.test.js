'use strict';

// Run with: node --test server/cron/cron.test.js
// Only exercises the pure isDueForSync() helper — never touches the real DB
// or app_settings, unlike syncEnabledConnectors() itself.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isDueForSync } = require('./snapshot');

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
