import { describe, it, expect } from 'vitest'
import { computePace } from './pace.js'

// Jan 15, 2025 — elapsedFraction = 15/31 ≈ 0.4839
const JAN_15 = new Date(2025, 0, 15)
// Jan 1, 2025  — elapsedFraction = 1/31  ≈ 0.0323
const JAN_01 = new Date(2025, 0, 1)
// Jan 31, 2025 — elapsedFraction = 31/31 = 1.0
const JAN_31 = new Date(2025, 0, 31)

describe('computePace', () => {
  it('returns null when totalBudget is 0', () => {
    expect(computePace(50, 0, JAN_15)).toBeNull()
  })

  it('returns null when totalBudget is null', () => {
    expect(computePace(50, null, JAN_15)).toBeNull()
  })

  it('returns over when spend equals budget', () => {
    expect(computePace(100, 100, JAN_15)).toBe('over')
  })

  it('returns over when spend exceeds budget', () => {
    expect(computePace(150, 100, JAN_15)).toBe('over')
  })

  it('returns over when projected spend exceeds budget', () => {
    // elapsed ≈ 48.4%, spend $60 → projected ≈ $124
    expect(computePace(60, 100, JAN_15)).toBe('over')
  })

  it('returns warning when projected spend is 90–100% of budget', () => {
    // elapsed ≈ 48.4%, spend $45 → projected ≈ $93
    expect(computePace(45, 100, JAN_15)).toBe('warning')
  })

  it('returns on_track when spend is comfortably under pace', () => {
    // elapsed ≈ 48.4%, spend $40 → projected ≈ $82.6
    expect(computePace(40, 100, JAN_15)).toBe('on_track')
  })

  it('returns on_track with zero spend at start of month', () => {
    expect(computePace(0, 100, JAN_01)).toBe('on_track')
  })

  it('returns warning at end of month when spend is 95% of budget', () => {
    // elapsed = 100%, spend $95 → projected = $95 → warning
    expect(computePace(95, 100, JAN_31)).toBe('warning')
  })
})
