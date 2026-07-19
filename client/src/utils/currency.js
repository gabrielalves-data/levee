import { amortizedMonthly } from './billing'

// Never sum mixed currencies into one number — group amortized monthly totals
// per service currency instead. Returns e.g. [{ currency: 'USD', total: 42.5 }],
// sorted with the largest group first.
export function groupTotalsByCurrency(services) {
  const totals = new Map()
  for (const s of services) {
    const currency = s.currency || 'USD'
    totals.set(currency, (totals.get(currency) ?? 0) + amortizedMonthly(s))
  }
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => b.total - a.total)
}

export function formatCurrency(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}
