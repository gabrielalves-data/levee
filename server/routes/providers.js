'use strict';

const { Router } = require('express');
const { listProviders } = require('../providers');

const router = Router();

// GET /api/providers — canonical provider directory (no secrets, no fetch fns).
router.get('/', (_req, res) => {
  res.json(listProviders());
});

module.exports = router;
