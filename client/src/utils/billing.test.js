import { describe, it, expect } from 'vitest'
import { amortizedMonthly } from './billing.js'

describe('amortizedMonthly', () => {
  it('passes monthly cost through unchanged', () => {
    expect(amortizedMonthly({ monthly_cost: 30, billing_period: 'monthly' })).toBe(30)
  })

  it('divides yearly cost by 12', () => {
    expect(amortizedMonthly({ monthly_cost: 1200, billing_period: 'yearly' })).toBe(100)
  })

  it('divides quarterly cost by 3', () => {
    expect(amortizedMonthly({ monthly_cost: 90, billing_period: 'quarterly' })).toBe(30)
  })

  it('treats a missing billing_period as monthly', () => {
    expect(amortizedMonthly({ monthly_cost: 30 })).toBe(30)
  })

  it('treats a missing monthly_cost as zero', () => {
    expect(amortizedMonthly({ billing_period: 'yearly' })).toBe(0)
  })
})
