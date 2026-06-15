'use strict';

const express = require('express');
const helmet = require('helmet');
const { localGuard, LAUNCH_TOKEN } = require('./middleware/localGuard');
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

const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use(localGuard);

app.use('/api/services',    servicesRouter);
app.use('/api/metrics',     metricsRouter);
app.use('/api/widget',      widgetRouter);
app.use('/api/snapshots',   snapshotsRouter);
app.use('/api/settings',    settingsRouter);
app.use('/api/backup',      backupRouter);
app.use('/api/encryption',  encryptionRouter);
app.use('/api/catalog',     catalogRouter);
app.use('/api/connectors',  connectorsRouter);
app.use('/api/providers',   providersRouter);

app.listen(PORT, HOST, () => {
  console.log(`[levee] listening on ${HOST}:${PORT}`);
  console.log('[levee] server ready (token set)');
  startCrons();
});

module.exports = app;
