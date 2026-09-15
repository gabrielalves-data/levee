# Security Policy

Levee is a **solo-maintained, side-project** desktop app. It is in active
development and has not been independently audited. Please set your expectations
accordingly — including for response times.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security problem.**

Report privately through
[GitHub Security Advisories](https://github.com/gabrielalves-data/levee/security/advisories/new),
which keeps the report confidential until a fix ships.

Please include:

- What the issue is and roughly how severe you think it is
- Steps to reproduce (or a proof of concept)
- The Levee version, your OS, and whether the build was packaged or run from source

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement | within 7 days |
| Initial assessment | within 14 days |
| Fix or documented mitigation | depends on severity and my availability |

These are good-faith targets from one person working on this in spare time, not
a commercial SLA. If you have not heard back in 14 days, feel free to ping the
advisory thread.

I will credit you in the release notes for the fix unless you prefer otherwise.

## Scope

**In scope** — anything that breaks Levee's core promises:

- Credentials recoverable in plaintext from disk, logs, exports, or memory dumps
- Any outbound network call that is not a user-configured connector or a
  user-initiated update check — especially anything resembling telemetry
- A non-loopback listener, or a way to reach the local API without the
  per-launch token
- Renderer sandbox escape, or IPC that grants the renderer more than the
  preload API intends
- SQL injection, or a path where user data leaves the machine unexpectedly

**Out of scope:**

- An attacker who already has code execution as your OS user. Levee's threat
  model explicitly does not defend against this — see the Security model
  section in [README.md](README.md).
- Vulnerabilities in third-party provider APIs that Levee merely calls
- Build-time-only dependency CVEs (`electron-builder` and its tree) that are
  not shipped in the packaged app
- Missing code signing on release binaries — this is a known limitation,
  already documented in the README

## Supported versions

Only the latest release receives fixes. Levee is pre-1.0 (`0.x`); there are no
long-term support branches.
