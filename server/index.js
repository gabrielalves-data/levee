'use strict';

const express = require('express');
const helmet = require('helmet');
const { localGuard, LAUNCH_TOKEN } = require('./middleware/localGuard');
const servicesRouter   = require('./routes/services');
const metricsRouter    = require('./routes/metrics');
const widgetRouter     = require('./routes/widget');
const snapshotsRouter  = require('./routes/snapshots');
const settingsRouter   = require('./routes/settings');
const { startCrons } = require('./cron/snapshot');

const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '256kb' }));
app.use(localGuard);

app.use('/api/services',   servicesRouter);
app.use('/api/metrics',    metricsRouter);
app.use('/api/widget',     widgetRouter);
app.use('/api/snapshots',  snapshotsRouter);
app.use('/api/settings',   settingsRouter);

app.listen(PORT, HOST, () => {
  console.log(`[devcost] listening on ${HOST}:${PORT}`);
  console.log('[devcost] server ready (token set)');
  startCrons();
});

module.exports = app;
