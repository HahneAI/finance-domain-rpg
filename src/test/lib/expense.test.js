import { describe, it, expect } from 'vitest'
import {
  applyMonthEdit,
  applyMonthEditForward,
  clearMonth,
  clearMonthForward,
  clearQuarterMonths,
} from '../../lib/expense.js'

const base = {
  id: 'exp_1',
  history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }],
}

// applyMonthEdit
// ─────────────────────────────────────────────────────────────

describe('applyMonthEdit', () => {
  it('writes a single month override', () => {
    const result = applyMonthEdit(base, '2026-05', 87.5, 350, 'every30days')
    expect(result.monthlyOverrides['2026-05']).toEqual({ perPaycheck: 87.5, amount: 350, cycle: 'every30days' })
  })

  it('does not touch other months', () => {
    const result = applyMonthEdit(base, '2026-05', 87.5, 350, 'every30days')
    expect(result.monthlyOverrides['2026-04']).toBeUndefined()
    expect(result.monthlyOverrides['2026-06']).toBeUndefined()
  })

  it('merges with existing overrides', () => {
    const exp = { ...base, monthlyOverrides: { '2026-04': { perPaycheck: 50, amount: 200, cycle: 'every30days' } } }
    const result = applyMonthEdit(exp, '2026-05', 87.5, 350, 'every30days')
    expect(result.monthlyOverrides['2026-04']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-05']).toEqual({ perPaycheck: 87.5, amount: 350, cycle: 'every30days' })
  })

  it('does not mutate the original expense', () => {
    applyMonthEdit(base, '2026-05', 87.5, 350, 'every30days')
    expect(base.monthlyOverrides).toBeUndefined()
  })
})

// applyMonthEditForward
// ─────────────────────────────────────────────────────────────

describe('applyMonthEditForward', () => {
  it('writes from the selected month through December', () => {
    const result = applyMonthEditForward(base, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-10']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-11']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-12']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
  })

  it('does not write months before the selected month', () => {
    const result = applyMonthEditForward(base, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-09']).toBeUndefined()
  })

  it('always writes the selected month even if an override exists', () => {
    const exp = { ...base, monthlyOverrides: { '2026-10': { perPaycheck: 999, amount: 999, cycle: 'every30days' } } }
    const result = applyMonthEditForward(exp, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-10']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
  })

  it('skips future months that already have a custom override', () => {
    const exp = {
      ...base,
      monthlyOverrides: { '2026-11': { perPaycheck: 999, amount: 999, cycle: 'every30days' } },
    }
    const result = applyMonthEditForward(exp, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-10']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-11']).toEqual({ perPaycheck: 999, amount: 999, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-12']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
  })
})

// clearMonth
// ─────────────────────────────────────────────────────────────

describe('clearMonth', () => {
  it('sets perPaycheck to 0 for the target month', () => {
    const result = clearMonth(base, '2026-05')
    expect(result.monthlyOverrides['2026-05']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
  })

  it('does not touch other months', () => {
    const result = clearMonth(base, '2026-05')
    expect(result.monthlyOverrides['2026-04']).toBeUndefined()
    expect(result.monthlyOverrides['2026-06']).toBeUndefined()
  })
})

// clearMonthForward
// ─────────────────────────────────────────────────────────────

describe('clearMonthForward', () => {
  it('zeros from the selected month through December', () => {
    const result = clearMonthForward(base, '2026-10')
    expect(result.monthlyOverrides['2026-10']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-11']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-12']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
  })

  it('does not zero months before the selected month', () => {
    const result = clearMonthForward(base, '2026-10')
    expect(result.monthlyOverrides['2026-09']).toBeUndefined()
  })
})

// clearQuarterMonths
// ─────────────────────────────────────────────────────────────

describe('clearQuarterMonths', () => {
  it('zeros exactly the 3 months of Q1 (phaseIdx 0)', () => {
    const result = clearQuarterMonths(base, 0)
    expect(result.monthlyOverrides['2026-01']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-02']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-03']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-04']).toBeUndefined()
  })

  it('zeros exactly the 3 months of Q2 (phaseIdx 1)', () => {
    const result = clearQuarterMonths(base, 1)
    expect(result.monthlyOverrides['2026-04']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-05']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-06']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-03']).toBeUndefined()
    expect(result.monthlyOverrides['2026-07']).toBeUndefined()
  })

  it('zeros exactly the 3 months of Q4 (phaseIdx 3)', () => {
    const result = clearQuarterMonths(base, 3)
    expect(result.monthlyOverrides['2026-10']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-11']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-12']).toEqual({ perPaycheck: 0, amount: 0, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-09']).toBeUndefined()
  })

  it('does not mutate the original expense', () => {
    clearQuarterMonths(base, 1)
    expect(base.monthlyOverrides).toBeUndefined()
  })
})
