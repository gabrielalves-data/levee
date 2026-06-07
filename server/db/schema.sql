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
  icon         TEXT,
  is_seed      INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
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

CREATE INDEX IF NOT EXISTS idx_metrics_service ON service_metrics(service_id);
CREATE INDEX IF NOT EXISTS idx_services_active  ON services(active);
