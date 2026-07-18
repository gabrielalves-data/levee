-- DevCost schema. CTEs preferred everywhere; no subqueries.

CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  provider     TEXT    NOT NULL,
  category     TEXT    NOT NULL CHECK (category IN ('cloud','ai_model','ai_api','tool','custom')),
  cost_model   TEXT    NOT NULL DEFAULT 'flat' CHECK (cost_model IN ('flat','usage','hybrid')),
  monthly_cost REAL,
  budget_cap   REAL,
  billing_day  INTEGER,
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','quarterly','yearly')),
  -- Calendar month (1-12) the real charge lands in; only meaningful when
  -- billing_period != 'monthly' (a quarterly plan repeats every 3 months
  -- from this anchor). NULL for monthly services.
  billing_month INTEGER CHECK (billing_month IS NULL OR (billing_month BETWEEN 1 AND 12)),
  icon         TEXT,
  is_seed      INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  -- 1 when a catalog plan or API connector exists for this service; 0 means
  -- values can only be entered manually (no auto data retrieval available).
  auto_available INTEGER NOT NULL DEFAULT 0,
  connector_type TEXT  NOT NULL DEFAULT 'manual' CHECK (connector_type IN ('manual','catalog','api')),
  -- Canonical provider directory key (see server/providers.js); NULL for manual services.
  provider_key TEXT,
  plan_key     TEXT,
  last_sync_at TEXT,
  sync_status  TEXT,
  sync_error   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_connectors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id   INTEGER NOT NULL UNIQUE REFERENCES services(id) ON DELETE CASCADE,
  provider_key TEXT    NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 0,
  config       TEXT,
  -- Consecutive sync failures; reset to 0 on success. At 3+, the connector
  -- is backed off to a 24h floor regardless of its configured syncIntervalHours.
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  metric_key  TEXT    NOT NULL,
  label       TEXT    NOT NULL,
  value_type  TEXT    NOT NULL CHECK (value_type IN ('number','percent','currency','date','text')),
  value_num   REAL,
  value_text  TEXT,
  unit        TEXT,
  -- Which write path last touched this metric — lets the UI lock only the
  -- metrics automation owns instead of every metric on a connected service.
  source      TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','sync','catalog')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (service_id, metric_key)
);

CREATE TABLE IF NOT EXISTS widget_slots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_index     INTEGER NOT NULL UNIQUE,
  service_id     INTEGER REFERENCES services(id) ON DELETE SET NULL,
  metric_key     TEXT,
  label_override TEXT,
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  total_spend REAL    NOT NULL,
  breakdown   TEXT    NOT NULL,
  captured_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, month)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_metrics_service ON service_metrics(service_id);
CREATE INDEX IF NOT EXISTS idx_services_active  ON services(active);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('allow_outbound', 'false');
