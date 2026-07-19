'use strict';

const express = require('express');
const helmet = require('helmet');
const { localGuard, setLaunchToken } = require('./middleware/localGuard');
const servicesRouter    = require('./routes/services');
const metricsRouter     = require('./routes/metrics');
const widgetRouter      = require('./routes/widget');
const snapshotsRouter   = require('./routes/snapshots');
const settingsRouter    = require('./routes/settings');
const backupRouter      = require('./routes/backup');
const encryptionRouter  = require('./routes/encryption');
const catalogRouter     = require('./routes/catalog');
const connectorsRouter  = require('./routes/connectors');
const providersRouter   = require('./routes/providers');
const { startCrons } = require('./cron/snapshot');

// Load all connectors so they self-register on startup.
require('./connectors/registry');

// Dev (npm run dev:server / Electron dev) passes a fixed PORT so the Vite
// proxy target resolves. Packaged Electron omits it, so the OS assigns an
// ephemeral port — reported back to the parent over the utilityProcess
// message channel, closing the window where a squatter could bind the port
// first (see startServer() in electron/main.js).
const PORT = process.env.PORT ? Number(process.env.PORT) : 0;
const HOST = '127.0.0.1';

const app = express();

app.use(helmet());
app.use(localGuard);

// Backup import/export needs a larger body limit than the rest of the API:
// months of snapshots plus metrics history can exceed the 256kb global cap,
// which would 413 a user trying to restore their own backup.
app.use('/api/backup', express.json({ limit: '10mb' }), backupRouter);

app.use(express.json({ limit: '256kb' }));

app.use('/api/services',    servicesRouter);
app.use('/api/metrics',     metricsRouter);
app.use('/api/widget',      widgetRouter);
app.use('/api/snapshots',   snapshotsRouter);
app.use('/api/settings',    settingsRouter);
app.use('/api/encryption',  encryptionRouter);
app.use('/api/catalog',     catalogRouter);
app.use('/api/connectors',  connectorsRouter);
app.use('/api/providers',   providersRouter);

// Catches errors thrown by route handlers (e.g. a SQLite CHECK-constraint
// violation that slipped past validation) so the raw constraint text never
// reaches the client — just a generic message. Must be registered last and
// keep all four args so Express recognizes it as error-handling middleware.
app.use((err, req, res, next) => {
  console.error('[levee] unhandled route error:', err.message);
  res.status(500).json({ error: 'internal error' });
});

function startListening() {
  const server = app.listen(PORT, HOST, () => {
    const { port } = server.address();
    console.log(`[levee] listening on ${HOST}:${port}`);
    console.log('[levee] server ready (token set)');
    if (process.parentPort) process.parentPort.postMessage({ type: 'ready', port });
    startCrons();
  });
  // Without this, an unhandled 'error' event (e.g. EADDRINUSE on the dev fixed
  // port) throws and crashes with a raw stack trace rather than a clean exit —
  // and the parent (electron/main.js) never learns the server failed to start.
  server.on('error', (err) => {
    console.error('[levee] server failed to start:', err.message);
    process.exitCode = 1;
    process.exit(1);
  });
}

if (process.parentPort) {
  // Packaged builds receive the real launch token over the utilityProcess
  // message channel (see electron/main.js) instead of this child process's
  // env — never in /proc/<pid>/environ. Wait for it before the server starts
  // accepting any connections. Dev (`node server/index.js`, no Electron
  // parent) has no parentPort and keeps the LEVEE_TOKEN env fallback in
  // localGuard.js.
  process.parentPort.once('message', (e) => {
    const msg = e?.data ?? e;
    if (msg?.type === 'token' && typeof msg.token === 'string') {
      setLaunchToken(msg.token);
    }
    startListening();
  });
} else {
  startListening();
}

module.exports = app;
