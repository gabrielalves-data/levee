# Levee

Privacy-first, local-only desktop app for tracking developer costs — cloud, AI models,
AI APIs, dev tools. No cloud sync, no accounts, no telemetry, zero outbound network calls
by default. Supports both static catalog plans and live API-pulled metrics.

## Setup

```sh
cd server && npm install   # install server deps
npm run dev                # starts server + client + electron concurrently
```

## Architecture

| Layer      | Tech                               | Notes                          |
|------------|------------------------------------|--------------------------------|
| Frontend   | React + Vite, Tailwind, Recharts   | Main window + overlay widget   |
| Backend    | Express.js (loopback only)         | REST API on 127.0.0.1:3001     |
| Desktop    | Electron                           | Tray, hotkey, overlay          |
| DB         | better-sqlite3                     | ~/.devcost/devcost.db (0600)   |
| Secrets    | keytar                             | OS keychain, never in DB       |
| Connectors | Per-provider modules               | Live API pull, secrets in OS keychain |

## Data retrieval modes

Each tracked service uses one of three connector types:

| Mode      | How it works |
|-----------|-------------|
| `manual`  | Costs entered by hand — no API calls |
| `catalog` | Pick a fixed plan from `server/catalog/plans.json`; metrics set automatically |
| `api`     | Live pull via a registered connector; secrets stored in OS keychain |

### Catalog plans

Catalog covers fixed-price subscriptions. Apply a plan via `POST /api/catalog/apply`
and DevCost sets the monthly bill, plan label, and next reset date automatically.

Supported providers: Claude, ChatGPT, Gemini, Cursor, GitHub Copilot.

### API connectors

Live connectors pull real metrics from provider APIs on demand and on the hourly cron.
Each connector declares the exact hostnames it may contact — the HTTP client rejects
all other outbound requests.

| Connector key    | Provider          | Auth type       |
|------------------|-------------------|-----------------|
| `anthropic`      | Anthropic API     | apiKey          |
| `openai`         | OpenAI API        | apiKey          |
| `aws`            | AWS Cost Explorer | awsKeyPair      |
| `github_copilot` | GitHub Copilot    | apiKey          |
| `vercel`         | Vercel            | apiKey          |
| `sentry`         | Sentry            | apiKey          |
| `railway`        | Railway           | apiKey          |
| `planetscale`    | PlanetScale       | apiKey          |
| `cloudflare`     | Cloudflare        | apiKey          |
| `linear`         | Linear            | apiKey          |
| `claude_plan`    | Claude Pro/Max plan usage | localOAuth (reads Claude Code's token) |

## Security model

- Express binds to `127.0.0.1` only; all requests require a per-launch random token in `x-devcost-token`
- DNS-rebinding protection: non-loopback `Host` rejected; **any** `Origin` header rejected
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP
- DB file and directory have restrictive OS permissions (0600 / 0700)
- API secrets stored in OS keychain via keytar — never written to SQLite or exports
- Connector HTTP client enforces a per-connector hostname allowlist; no other outbound calls permitted
- `localOAuth` connectors read a token another app already stores locally (explicit per-service consent required); the token is held in memory only during sync and never persisted

## Global hotkey

`Ctrl+Shift+G` (Windows/Linux) / `Cmd+Shift+G` (macOS) toggles the overlay widget.

---

## API routes

### Services

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/services` | List active services (`?all=1` includes inactive) |
| GET | `/api/services/:id` | Single service |
| POST | `/api/services` | Create service |
| PATCH | `/api/services/:id` | Update fields |
| DELETE | `/api/services/:id` | Soft-archive (sets active=0) |

### Metrics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/metrics/:serviceId` | All metrics for a service |
| PUT | `/api/metrics/:serviceId/:metricKey` | Upsert a metric value |
| DELETE | `/api/metrics/:serviceId/:metricKey` | Remove a metric |

### Widget

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/widget` | All widget slots with joined data |
| PUT | `/api/widget/:slotIndex` | Assign/update a slot |
| DELETE | `/api/widget/:slotIndex` | Clear a slot |

### Catalog

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/catalog` | Full plan catalog |
| POST | `/api/catalog/apply` | Apply a catalog plan to a service |

### Connectors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connectors/providers` | List registered connector metadata |
| PUT | `/api/connectors/:serviceId` | Configure connector + store secret(s) in keychain |
| DELETE | `/api/connectors/:serviceId` | Disable connector + remove secret(s) from keychain |
| POST | `/api/connectors/:serviceId/sync` | Trigger a manual sync |

### Snapshots

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/snapshots` | List cost snapshots (monthly rollups) |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/:key` | Read an app setting (e.g. `allow_outbound`) |
| PUT | `/api/settings/:key` | Write an app setting (secrets blocked by key pattern) |

### Backup

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backup/export` | Export all data to JSON (secrets excluded) |
| POST | `/api/backup/import` | Import a previously exported JSON backup |

### Encryption

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/encryption/status` | Check whether at-rest DB encryption is active |
| POST | `/api/encryption/toggle` | Enable or disable DB encryption (key in OS keychain) |

---

## Security guard verification

Start the server and note the token printed to stdout:

```
[devcost] LAUNCH_TOKEN=<TOKEN>
```

Set it as a shell variable for the snippets below:

```sh
TOKEN=<paste token here>
```

### ✓ Valid request — should return 200

```sh
curl -s http://127.0.0.1:3001/api/services \
  -H "x-devcost-token: $TOKEN"
```

### ✗ Missing token — should return 401

```sh
curl -s http://127.0.0.1:3001/api/services
# {"error":"Unauthorized"}
```

### ✗ Wrong token — should return 401

```sh
curl -s http://127.0.0.1:3001/api/services \
  -H "x-devcost-token: wrong"
# {"error":"Unauthorized"}
```

### ✗ Origin header present — should return 403

```sh
curl -s http://127.0.0.1:3001/api/services \
  -H "x-devcost-token: $TOKEN" \
  -H "Origin: http://127.0.0.1:5173"
# {"error":"Forbidden: origin header present"}
```

### ✗ Non-loopback Host — should return 403

```sh
curl -s http://127.0.0.1:3001/api/services \
  -H "x-devcost-token: $TOKEN" \
  -H "Host: evil.example.com"
# {"error":"Forbidden: non-loopback host"}
```

### Sample write operations

```sh
# Apply a catalog plan (Claude Pro = $20/month)
curl -s -X POST http://127.0.0.1:3001/api/catalog/apply \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serviceId":1,"providerKey":"claude","planKey":"Pro"}'

# Configure an API connector (e.g. Anthropic)
curl -s -X PUT http://127.0.0.1:3001/api/connectors/8 \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerKey":"anthropic","secret":"sk-ant-..."}'

# Trigger a manual sync
curl -s -X POST http://127.0.0.1:3001/api/connectors/8/sync \
  -H "x-devcost-token: $TOKEN"

# Create a custom service
curl -s -X POST http://127.0.0.1:3001/api/services \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My VPS","provider":"Hetzner","category":"cloud","cost_model":"flat","monthly_cost":5.99}'

# Assign widget slot 0 to a metric
curl -s -X PUT http://127.0.0.1:3001/api/widget/0 \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"service_id":8,"metric_key":"monthly_bill"}'
```
