<h1 align="center">Levee</h1>

<p align="center">
  <strong>Track what your cloud, AI and developer tools actually cost you — entirely on your own machine.</strong>
</p>

<p align="center">
  No cloud sync. No accounts. No telemetry. Zero outbound network calls unless you switch them on.
</p>

<p align="center">
  <img alt="status: active development" src="https://img.shields.io/badge/status-active%20development-orange">
  <img alt="not feature complete" src="https://img.shields.io/badge/stability-not%20feature--complete-yellow">
  <img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey">
</p>

> **Status: active development — not yet feature-complete.**
> Levee is a pre-1.0 side project, maintained by one person. Expect rough edges,
> incomplete connectors, and breaking changes between versions. It has not been
> independently security-audited. Read [Security model](#security-model) and
> [Known limitations](#known-limitations) before trusting it with real API keys.

---

<!-- TODO: replace with a real screenshot of the dashboard + overlay -->
<p align="center">
  <img src="docs/screenshot.png" alt="Levee dashboard and floating overlay" width="800">
  <br>
  <em><strong>TODO</strong> — screenshot placeholder. Add <code>docs/screenshot.png</code>.</em>
</p>

---

## What it does

- **Tracks spend across cloud, AI APIs, AI plans and dev tools** in one place — AWS, Azure, Anthropic, OpenAI, DeepSeek, Cloudflare, Vercel, GitHub, Datadog, Sentry, Twilio and more than a dozen others, alongside services you enter by hand.
- **Pulls real numbers from provider billing APIs** when you connect one, using a read-only credential you supply. Everything else can be tracked manually — no connector required.
- **Shows a floating always-on-top overlay** with your current burn, toggled with a global hotkey (<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) and hidden from screen shares by default.
- **Keeps history locally** — daily snapshots, budget caps, and per-service alerts when you're pacing over budget.
- **Stores everything in one SQLite file on your disk** that you can open, inspect, back up, or delete yourself.

## Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron (tray, always-on-top overlay, global hotkey, launch-at-login) |
| Frontend | React + Vite, Tailwind CSS, Recharts, React Query, lucide-react |
| Backend | Express — bound to `127.0.0.1` only — with helmet and node-cron |
| Storage | SQLite via `better-sqlite3-multiple-ciphers` |

The Express server runs as an Electron `utilityProcess`, so a packaged build needs no system Node install.

## Where your data lives

This is the whole point of the project, so here is exactly where everything goes.
All of it is under `~/.levee/` — `C:\Users\<you>\.levee\` on Windows.

| File | Contains | Protection |
|---|---|---|
| `~/.levee/levee.db` | All cost data, services, snapshots, settings | File mode `0600`, directory `0700` (POSIX). Optional at-rest encryption — see below |
| `~/.levee/secrets.json` | The database encryption key, if you enable encryption | Encrypted with Electron `safeStorage` (OS-backed: DPAPI / Keychain / libsecret). Never plaintext |
| `~/.levee/config.json` | Window and overlay preferences | Mode `0600`. No credentials |
| `~/.levee/overlay-bounds.json` | Overlay position on screen | No credentials |
| **OS credential store** | Your connector API keys | Windows Credential Manager / macOS Keychain / Linux libsecret, via `keytar`. **Never written to the database, logs, or exports** |

**Verify it yourself:**

```bash
ls -la ~/.levee/                       # everything Levee persists
sqlite3 ~/.levee/levee.db .tables      # inspect the schema (unencrypted DBs)
sqlite3 ~/.levee/levee.db "SELECT * FROM app_settings;"
```

There is no other location. Deleting `~/.levee/` and removing the `levee` entries
from your OS credential store removes every trace of your data.

### Outbound network

Levee makes **no network calls by default.** Outbound traffic is gated behind a
setting that ships as `false` ([`schema.sql`](server/db/schema.sql)):

```sql
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('allow_outbound', 'false');
```

Until you enable **Settings → Privacy → Allow outbound connections**, every
connector request throws before any socket opens. Once enabled, a connector may
only reach hosts on its own hardcoded allowlist, and only the specific
`(method, path)` endpoints it declares — enforced centrally in
[`server/connectors/http.js`](server/connectors/http.js), with redirects refused
so the allowlist holds on every hop.

The **only** non-connector destination is GitHub Releases, reached solely when
you click *Check for updates* in Settings. There is no check on launch.

**There is no telemetry, no analytics, and no crash reporting.** No usage data,
error report, or ping ever leaves your machine. (Sentry appears in the connector
list only as a service whose *bill* Levee can read — not as error reporting.)

## Install / run from source

**Requirements:** Node.js 20+, npm, and a toolchain able to build native modules
(Visual Studio Build Tools on Windows, Xcode CLT on macOS, `build-essential` on Linux).

```bash
git clone https://github.com/gabrielalves-data/levee.git
cd levee
npm install          # postinstall rebuilds native modules against Electron's ABI
npm run dev          # Vite dev server + Electron
```

`npm run dev` starts the Vite client and Electron together; Electron spawns the
Express server itself on port 3001 in development.

**Build a distributable:**

```bash
npm run build        # bundle the renderer
npm run pack         # unpacked build, for local testing
npm run dist         # full installer for your platform
```

**Tests:**

```bash
npm test             # renderer unit tests (vitest) — 21 tests
```

> Server-side tests (`npm run test:connectors`) currently fail to run after a
> normal install: `postinstall` builds `better-sqlite3-multiple-ciphers` against
> Electron's ABI, which plain `node --test` cannot load
> (`ERR_DLOPEN_FAILED`). Tracked as a known limitation below.

## Security model

Levee's threat model is **a local-only app holding third-party billing credentials
on a single-user machine.** Here is what that does and does not cover.

### What is protected

- **The local API is not reachable from the network.** Express binds `127.0.0.1` explicitly — never `0.0.0.0` — and rejects any request whose `Host` header is not loopback.
- **Every API request needs a per-launch token.** 32 random bytes generated at startup, held in memory only, never written to disk. It is delivered to the server over an Electron `utilityProcess` message channel rather than an environment variable, so it never appears in `/proc/<pid>/environ`. Comparison is constant-time over SHA-256 digests.
- **DNS-rebinding defence.** Browser `Origin` headers that aren't loopback are rejected outright.
- **Credentials never touch the database.** Connector keys live in the OS credential store. Backup exports additionally refuse any config key matching `/secret|key|token|password|credential/i`, so a misconfigured connector cannot leak one into an export file.
- **Nothing sensitive reaches logs.** Error paths log only `err.message`; request headers and bodies are never logged, and connector errors are re-wrapped to strip content.
- **Renderer is sandboxed.** Both windows run `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload exposes a fixed, explicit list of methods over `contextBridge` — no raw `ipcRenderer`, no `require`. Navigation is restricted by `will-navigate`, and renderer-opened windows are denied outright.
- **Strict CSP, no `unsafe-eval`.** Packaged builds run `script-src 'self'` with `connect-src` pinned to the server's actual port. No remote content is ever loaded.
- **Packaged binaries have Electron fuses flipped** — `RunAsNode` disabled, `OnlyLoadAppFromAsar` and embedded ASAR integrity validation enabled ([`build/afterPack.js`](build/afterPack.js)).
- **Optional database encryption at rest,** with the key held in `safeStorage`, deliberately stored outside the database it unlocks.
- **Overlay is excluded from screen capture** by default, so billing figures don't leak into screen shares or recordings.
- **Least-privilege guidance per connector.** Every connector documents the narrowest credential scope that works, and says so plainly when a provider offers no read-only option. The AWS connector ships an opt-in audit that probes whether the key you supplied is over-scoped.

### What is *not* protected

- **An attacker running code as your OS user.** They can read the launch token from memory, call the local API, and ask the OS credential store for your keys — exactly as Levee itself does. Levee does not defend against this and cannot.
- **File modes are POSIX-only.** `0600`/`0700` are enforced via `chmod`, which is largely a no-op on Windows; there, `~/.levee/` inherits your user profile's ACL instead.
- **Release binaries are unsigned.** See below.
- **Credential scope is your responsibility.** Levee tells you the minimum scope per provider but cannot enforce it. Some providers — Anthropic admin keys, Bunny, Cloudinary, DeepSeek, Linear, Railway — offer no read-only billing scope at all; for those, use a key dedicated to Levee and nothing else.
- **No independent audit.** One person wrote this. Review the code before trusting it with production credentials.

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Known limitations

These are known, accepted, and tracked as post-release work:

| Limitation | Impact |
|---|---|
| **Release binaries are not code-signed or notarized** | Windows SmartScreen and macOS Gatekeeper will warn on install. Requires paid certificates |
| **`keytar` is archived and unmaintained** | Still the store for connector credentials. It does not leak plaintext — a build failure makes it throw, never fall back to disk — but it should migrate to `safeStorage`, which the DB key already uses |
| **Two separate secret stores** | Connector keys use `keytar`; the DB encryption key uses `safeStorage`. Working but inconsistent, and the `parentPort` secret proxy in `electron/main.js` is currently unused |
| **Server test suite cannot run under plain Node** | Native modules are built for Electron's ABI; `npm run test:connectors` fails with `ERR_DLOPEN_FAILED`. Needs an Electron test runner or a dual-ABI setup |
| **Build-time dependency CVEs** | `electron-builder`'s tree carries high/critical advisories (`tar`, `node-gyp`). Build-time only — not shipped in the app. Fixing needs a major-version bump |
| **File permissions are weaker on Windows** | `chmod 0600` does not meaningfully restrict access there |
| **Renderer bundle is large** | ~843 kB main chunk, no code splitting yet |
| **Connector coverage is uneven** | Some providers expose no usable billing API and remain manual-entry only |

Runtime dependencies currently report **0 vulnerabilities** (`npm audit --omit=dev`).

## Contributing

Issues and pull requests are welcome, but please open an issue before starting
anything substantial — this is a side project and I'd rather not waste your time
on a direction I won't merge. Do not report security issues publicly; use
[SECURITY.md](SECURITY.md) instead.

## License

[MIT](LICENSE) © 2026 Gabriel Alves
