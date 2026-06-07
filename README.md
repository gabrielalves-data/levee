# DevCost

Privacy-first, local-only desktop app for tracking developer costs — cloud, AI models,
AI APIs, dev tools. No cloud sync, no accounts, no telemetry, zero outbound network calls.

## Setup

```sh
cd server && npm install   # install server deps
npm run dev                # starts server + client + electron concurrently
```

## Architecture

| Layer    | Tech                               | Notes                          |
|----------|------------------------------------|--------------------------------|
| Frontend | React + Vite, Tailwind, Recharts   | Main window + overlay widget   |
| Backend  | Express.js (loopback only)         | REST API on 127.0.0.1:3001     |
| Desktop  | Electron                           | Tray, hotkey, overlay          |
| DB       | better-sqlite3                     | ~/.devcost/devcost.db (0600)   |
| Secrets  | keytar                             | OS keychain, never in DB       |

## Security model

- Express binds to `127.0.0.1` only; all requests require a per-launch random token in `x-devcost-token`
- DNS-rebinding protection: non-loopback `Host` rejected; **any** `Origin` header rejected
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP
- DB file and directory have restrictive OS permissions (0600 / 0700)
- API secrets stored in OS keychain via keytar — never written to SQLite or exports

## Global hotkey

`Ctrl+Shift+D` (Windows/Linux) / `Cmd+Shift+D` (macOS) toggles the main window.

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/services` | List active services (`?all=1` includes inactive) |
| GET | `/api/services/:id` | Single service |
| POST | `/api/services` | Create service |
| PATCH | `/api/services/:id` | Update fields |
| DELETE | `/api/services/:id` | Soft-archive (sets active=0) |
| GET | `/api/metrics/:serviceId` | All metrics for a service |
| PUT | `/api/metrics/:serviceId/:metricKey` | Upsert a metric value |
| DELETE | `/api/metrics/:serviceId/:metricKey` | Remove a metric |
| GET | `/api/widget` | All widget slots with joined data |
| PUT | `/api/widget/:slotIndex` | Assign/update a slot |
| DELETE | `/api/widget/:slotIndex` | Clear a slot |

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
# Create a custom service
curl -s -X POST http://127.0.0.1:3001/api/services \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My VPS","provider":"Hetzner","category":"cloud","cost_model":"flat","monthly_cost":5.99}'

# Set a metric value (e.g. Claude monthly bill = $20)
curl -s -X PUT http://127.0.0.1:3001/api/metrics/8/monthly_bill \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Monthly bill","value_type":"currency","value_num":20.00,"unit":"USD"}'

# Assign widget slot 0 to Claude monthly_bill
curl -s -X PUT http://127.0.0.1:3001/api/widget/0 \
  -H "x-devcost-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"service_id":8,"metric_key":"monthly_bill"}'

# Read the widget
curl -s http://127.0.0.1:3001/api/widget \
  -H "x-devcost-token: $TOKEN"
```
