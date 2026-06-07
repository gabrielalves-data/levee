# DevCost

Privacy-first, local-only desktop app for tracking developer costs — cloud, AI models,
AI APIs, dev tools. No cloud sync, no accounts, no telemetry, zero outbound network calls.

## Setup

```sh
npm install
npm run dev       # starts server + client + electron concurrently
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
- DNS-rebinding protection: non-loopback `Host` and `Origin` headers are rejected
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP
- DB file and directory have restrictive OS permissions (0600 / 0700)
- API secrets stored in OS keychain via keytar — never written to SQLite or exports

## Global hotkey

`Ctrl+Shift+D` (Windows/Linux) / `Cmd+Shift+D` (macOS) toggles the main window.
