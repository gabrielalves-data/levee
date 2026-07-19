'use strict';

// Shared validation primitives — enum sets and small checks that used to be
// redefined ad hoc per route (services.js, backup.js, widget.js, connectors.js,
// catalog.js each had their own copy). Single source of truth; behavior-
// preserving versus each route's original inline copy.

const db = require('../db/database');

const CATEGORY       = new Set(['cloud', 'ai_model', 'ai_api', 'tool', 'custom']);
const COST_MODEL     = new Set(['flat', 'usage', 'hybrid']);
const VALUE_TYPE      = new Set(['number', 'percent', 'currency', 'date', 'text']);
const CONNECTOR_TYPE = new Set(['manual', 'catalog', 'api']);
const BILLING_PERIOD = new Set(['monthly', 'quarterly', 'yearly']);

// ISO 4217 alpha-3 code, e.g. 'USD', 'EUR' — not a full ISO list, just the shape;
// an unrecognized-but-well-formed code fails soft in display (Intl.NumberFormat).
const CURRENCY_RE = /^[A-Z]{3}$/;
function isValidCurrency(v) {
  return CURRENCY_RE.test(v);
}

function isValidId(v) {
  return Number.isInteger(v);
}

function isValidSlotIndex(v) {
  return Number.isInteger(v) && v >= 0 && v <= 3;
}

const serviceExistsStmt = db.prepare('SELECT id FROM services WHERE id = ?');
function serviceExists(id) {
  return !!serviceExistsStmt.get(id);
}

module.exports = {
  CATEGORY, COST_MODEL, VALUE_TYPE, CONNECTOR_TYPE, BILLING_PERIOD,
  isValidId, isValidSlotIndex, isValidCurrency, serviceExists,
};
