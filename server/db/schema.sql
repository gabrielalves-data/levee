-- DevCost schema. CTEs preferred everywhere; no subqueries.

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL CHECK (category IN ('cloud','ai_model','ai_api','dev_tool')),
  provider    TEXT    NOT NULL,
  billing_url TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  period      TEXT    NOT NULL,  -- ISO month: '2025-06'
  cost_usd    REAL    NOT NULL,
  usage_units REAL,
  unit_label  TEXT,
  recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_service_period ON metrics(service_id, period);

CREATE TABLE IF NOT EXISTS snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  period     TEXT NOT NULL UNIQUE,
  total_usd  REAL NOT NULL,
  payload    TEXT NOT NULL,  -- JSON: per-service breakdown
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id  INTEGER REFERENCES services(id) ON DELETE CASCADE,
  threshold   REAL    NOT NULL,
  period_type TEXT    NOT NULL DEFAULT 'monthly',
  triggered   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
