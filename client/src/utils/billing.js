// Amortized monthly share of a service's cost, for dashboard totals/pace —
// a yearly/quarterly plan's real cash hit lands in one month (see server/cron
// snapshot.js's takeSnapshot), but every month should still show its fair
// share for budgeting purposes.
export function amortizedMonthly(service) {
  const cost = service.monthly_cost ?? 0
  switch (service.billing_period) {
    case 'yearly':    return cost / 12
    case 'quarterly': return cost / 3
    default:          return cost
  }
}
