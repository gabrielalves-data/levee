-- Example services. Remove or extend before production use.
INSERT OR IGNORE INTO services (id, name, category, provider, billing_url, active) VALUES
  (1, 'AWS',        'cloud',    'Amazon',    'https://console.aws.amazon.com/billing/', 1),
  (2, 'Claude API', 'ai_api',   'Anthropic', 'https://console.anthropic.com/',          1),
  (3, 'GitHub',     'dev_tool', 'GitHub',    'https://github.com/settings/billing',     1);
