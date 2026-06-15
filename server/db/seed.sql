-- Catalog seed — is_seed=1 marks these as editable/archivable, never re-seeded.

-- auto_available = 1 when a catalog plan or API connector exists for the service;
-- 0 means the service has no auto data retrieval and is filled in by hand.

-- Cloud
INSERT OR IGNORE INTO services (id, name, provider, category, cost_model, is_seed, auto_available) VALUES
  (1,  'AWS',         'Amazon',      'cloud', 'usage',  1, 1),
  (2,  'GCP',         'Google',      'cloud', 'usage',  1, 0),
  (3,  'Azure',       'Microsoft',   'cloud', 'usage',  1, 0),
  (4,  'Vercel',      'Vercel',      'cloud', 'hybrid', 1, 1),
  (5,  'Railway',     'Railway',     'cloud', 'usage',  1, 1),
  (6,  'Cloudflare',  'Cloudflare',  'cloud', 'hybrid', 1, 1),
  (7,  'PlanetScale', 'PlanetScale', 'cloud', 'usage',  1, 1);

-- AI Models (subscription plans)
INSERT OR IGNORE INTO services (id, name, provider, category, cost_model, is_seed, auto_available) VALUES
  (8,  'Claude',  'Anthropic', 'ai_model', 'flat', 1, 1),
  (9,  'ChatGPT', 'OpenAI',    'ai_model', 'flat', 1, 1),
  (10, 'Gemini',  'Google',    'ai_model', 'flat', 1, 1);

-- AI APIs (usage-based)
INSERT OR IGNORE INTO services (id, name, provider, category, cost_model, is_seed, auto_available) VALUES
  (11, 'Anthropic API', 'Anthropic', 'ai_api', 'usage', 1, 1),
  (12, 'OpenAI API',    'OpenAI',    'ai_api', 'usage', 1, 1),
  (13, 'Groq',          'Groq',      'ai_api', 'usage', 1, 0),
  (14, 'Mistral',       'Mistral',   'ai_api', 'usage', 1, 0);

-- Dev Tools
INSERT OR IGNORE INTO services (id, name, provider, category, cost_model, is_seed, auto_available) VALUES
  (15, 'GitHub Copilot', 'GitHub',    'tool', 'flat',   1, 1),
  (16, 'Cursor',         'Anysphere', 'tool', 'flat',   1, 1),
  (17, 'Linear',         'Linear',    'tool', 'flat',   1, 1),
  (18, 'Sentry',         'Sentry',    'tool', 'hybrid', 1, 1);

-- Representative metrics per service (values left NULL — filled by user)

-- Claude (id=8): live usage % comes from the claude_plan connector; only the
-- bill is tracked manually/via catalog.
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (8, 'monthly_bill',   'Monthly bill',      'currency');

-- ChatGPT (id=9)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (9, 'monthly_bill', 'Monthly bill', 'currency');

-- Gemini (id=10)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (10, 'monthly_bill', 'Monthly bill', 'currency');

-- Anthropic API (id=11)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (11, 'monthly_bill',       'Month-to-date spend', 'currency'),
  (11, 'input_tokens_mtd',   'Input tokens MTD',    'number'),
  (11, 'output_tokens_mtd',  'Output tokens MTD',   'number');

-- OpenAI API (id=12)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (12, 'monthly_bill',       'Month-to-date spend', 'currency'),
  (12, 'input_tokens_mtd',   'Input tokens MTD',    'number'),
  (12, 'output_tokens_mtd',  'Output tokens MTD',   'number');

-- Groq (id=13)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (13, 'monthly_bill', 'Month-to-date spend', 'currency'),
  (13, 'tokens_mtd',   'Tokens MTD',          'number');

-- Mistral (id=14)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (14, 'monthly_bill', 'Month-to-date spend', 'currency'),
  (14, 'tokens_mtd',   'Tokens MTD',          'number');

-- AWS (id=1)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (1, 'monthly_bill', 'Month-to-date spend', 'currency'),
  (1, 'last_bill',    'Last month total',    'currency');

-- GCP (id=2)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (2, 'monthly_bill', 'Month-to-date spend', 'currency'),
  (2, 'last_bill',    'Last month total',    'currency');

-- Azure (id=3)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (3, 'monthly_bill', 'Month-to-date spend', 'currency'),
  (3, 'last_bill',    'Last month total',    'currency');

-- Vercel (id=4)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (4, 'monthly_bill',  'Monthly bill',   'currency'),
  (4, 'bandwidth_gb',  'Bandwidth used', 'number');

-- Railway (id=5)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (5, 'monthly_bill',  'Month-to-date spend', 'currency'),
  (5, 'credits_used',  'Credits used',        'number');

-- Cloudflare (id=6)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (6, 'monthly_bill',  'Monthly bill',  'currency'),
  (6, 'requests_mtd',  'Requests MTD',  'number');

-- PlanetScale (id=7)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (7, 'monthly_bill',   'Monthly bill',   'currency'),
  (7, 'rows_read_mtd',  'Rows read MTD',  'number');

-- GitHub Copilot (id=15)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (15, 'monthly_bill', 'Monthly bill', 'currency'),
  (15, 'seats',        'Seats',        'number');

-- Cursor (id=16)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (16, 'monthly_bill', 'Monthly bill', 'currency'),
  (16, 'plan',         'Plan',         'text');

-- Linear (id=17)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (17, 'monthly_bill', 'Monthly bill', 'currency'),
  (17, 'seats',        'Seats',        'number');

-- Sentry (id=18)
INSERT OR IGNORE INTO service_metrics (service_id, metric_key, label, value_type) VALUES
  (18, 'monthly_bill', 'Monthly bill', 'currency'),
  (18, 'errors_mtd',   'Errors MTD',   'number'),
  (18, 'plan',         'Plan',         'text');
