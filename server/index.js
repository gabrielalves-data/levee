'use strict';

const express = require('express');
const helmet = require('helmet');
const crypto = require('crypto');
const localGuard = require('./middleware/localGuard');
const servicesRouter = require('./routes/services');
const metricsRouter = require('./routes/metrics');
const widgetRouter = require('./routes/widget');
const { startCrons } = require('./cron/snapshot');

const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1';

// Per-launch token — held in memory only, never persisted.
// Electron main process reads this via process.env.DEVCOST_TOKEN.
const LAUNCH_TOKEN = process.env.DEVCOST_TOKEN || crypto.randomBytes(32).toString('hex');

const app = express();

app.use(helmet());
app.use(express.json());
app.use(localGuard);

app.use((req, res, next) => {
  if (req.headers['x-devcost-token'] !== LAUNCH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use('/api/services', servicesRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/widget', widgetRouter);

app.listen(PORT, HOST, () => {
  console.log(`DevCost server listening on ${HOST}:${PORT}`);
  startCrons();
});

module.exports = app;
