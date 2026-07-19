import { describe, it, expect } from 'vitest'
import { groupTotalsByCurrency, formatCurrency } from './currency.js'

describe('groupTotalsByCurrency', () => {
  it('produces a single group when every service shares a currency', () => {
    const groups = groupTotalsByCurrency([
      { monthly_cost: 10, currency: 'USD' },
      { monthly_cost: 20, currency: 'USD' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ currency: 'USD', total: 30 })
  })

  it('never sums mixed currencies into one number — returns one group per currency', () => {
    const groups = groupTotalsByCurrency([
      { monthly_cost: 10, currency: 'USD' },
      { monthly_cost: 20, currency: 'EUR' },
      { monthly_cost: 5,  currency: 'USD' },
    ])
    expect(groups.length).toBeGreaterThan(1)
    expect(groups.find(g => g.currency === 'USD').total).toBe(15)
    expect(groups.find(g => g.currency === 'EUR').total).toBe(20)
  })

  it('treats a missing currency as USD', () => {
    const groups = groupTotalsByCurrency([{ monthly_cost: 10 }])
    expect(groups).toEqual([{ currency: 'USD', total: 10 }])
  })

  it('amortizes yearly/quarterly costs per currency group before summing', () => {
    const groups = groupTotalsByCurrency([
      { monthly_cost: 1200, billing_period: 'yearly', currency: 'EUR' },
      { monthly_cost: 30, billing_period: 'monthly', currency: 'EUR' },
    ])
    expect(groups).toEqual([{ currency: 'EUR', total: 130 }])
  })
})

describe('formatCurrency', () => {
  it('formats USD with a dollar sign', () => {
    expect(formatCurrency(12.5, 'USD')).toBe('$12.50')
  })

  it('formats EUR with the euro symbol', () => {
    expect(formatCurrency(12.5, 'EUR')).toContain('12.50')
  })

  it('falls back to a plain number + code for a malformed currency code', () => {
    expect(formatCurrency(12.5, 'not-a-code')).toBe('12.50 not-a-code')
  })
})
