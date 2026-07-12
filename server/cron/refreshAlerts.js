'use strict';

const cron     = require('node-cron');
const notifier = require('node-notifier');
const db       = require('../db/database');

function checkBudgets() {
  const rows = db.prepare(`
    WITH budget_services AS (
      SELECT s.id, s.name, s.budget_cap
      FROM   services s
      WHERE  s.active    = 1
        AND  s.budget_cap > 0
    ),
    bills AS (
      SELECT bs.id, bs.name, sm.value_num AS monthly_bill,
             bs.budget_cap
      FROM   budget_services bs
      LEFT JOIN service_metrics sm ON sm.service_id = bs.id
                                   AND sm.metric_key = 'monthly_bill'
    )
    SELECT name, monthly_bill, budget_cap
    FROM   bills
    WHERE  monthly_bill IS NOT NULL
  `).all();

  for (const row of rows) {
    const pct = row.monthly_bill / row.budget_cap;
    if (pct >= 0.8) {
      notifier.notify({
        title:   'Levee — Budget Alert',
        message: `${row.name} is at ${Math.round(pct * 100)}% of budget ($${row.monthly_bill.toFixed(2)} / $${row.budget_cap.toFixed(2)})`,
        sound:   false,
      });
    }
  }
}

function startAlertCron() {
  // Daily at 09:00 local time
  cron.schedule('0 9 * * *', checkBudgets);
}

module.exports = { startAlertCron };
