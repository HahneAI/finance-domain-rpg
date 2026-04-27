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
    expect(result.monthlyOverrides['2026-10']).toEqual(expect.objectContaining({ perPaycheck: 50, amount: 200, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-11']).toEqual(expect.objectContaining({ perPaycheck: 50, amount: 200, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-12']).toEqual(expect.objectContaining({ perPaycheck: 50, amount: 200, cycle: 'every30days' }))
  })

  it('does not write months before the selected month', () => {
    const result = applyMonthEditForward(base, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-09']).toBeUndefined()
  })

  it('always writes the selected month even if an override exists', () => {
    const exp = { ...base, monthlyOverrides: { '2026-10': { perPaycheck: 999, amount: 999, cycle: 'every30days' } } }
    const result = applyMonthEditForward(exp, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-10']).toEqual(expect.objectContaining({ perPaycheck: 50, amount: 200, cycle: 'every30days' }))
  })

  it('skips future months that already have a custom override', () => {
    const exp = {
      ...base,
      monthlyOverrides: { '2026-11': { perPaycheck: 999, amount: 999, cycle: 'every30days' } },
    }
    const result = applyMonthEditForward(exp, '2026-10', 50, 200, 'every30days')
    expect(result.monthlyOverrides['2026-10']).toEqual(expect.objectContaining({ perPaycheck: 50, amount: 200, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-11']).toEqual({ perPaycheck: 999, amount: 999, cycle: 'every30days' })
    expect(result.monthlyOverrides['2026-12']).toEqual(expect.objectContaining({ perPaycheck: 50, amount: 200, cycle: 'every30days' }))
  })

  it('stamps lastEditedAt on all written months', () => {
    const editedAt = '2026-04-26T10:00:00.000Z'
    const result = applyMonthEditForward(base, '2026-10', 50, 200, 'every30days', 2026, editedAt)
    expect(result.monthlyOverrides['2026-10'].lastEditedAt).toBe(editedAt)
    expect(result.monthlyOverrides['2026-11'].lastEditedAt).toBe(editedAt)
    expect(result.monthlyOverrides['2026-12'].lastEditedAt).toBe(editedAt)
  })

  it('defaults lastEditedAt to a valid ISO string when not supplied', () => {
    const before = Date.now()
    const result = applyMonthEditForward(base, '2026-10', 50, 200, 'every30days')
    const after = Date.now()
    const ts = new Date(result.monthlyOverrides['2026-10'].lastEditedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

// clearMonth
// ─────────────────────────────────────────────────────────────

describe('clearMonth', () => {
  it('sets perPaycheck to 0 for the target month', () => {
    const result = clearMonth(base, '2026-05')
    expect(result.monthlyOverrides['2026-05']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
  })

  it('does not touch other months', () => {
    const result = clearMonth(base, '2026-05')
    expect(result.monthlyOverrides['2026-04']).toBeUndefined()
    expect(result.monthlyOverrides['2026-06']).toBeUndefined()
  })

  it('stamps lastEditedAt on the zeroed month', () => {
    const editedAt = '2026-04-26T10:00:00.000Z'
    const result = clearMonth(base, '2026-05', editedAt)
    expect(result.monthlyOverrides['2026-05'].lastEditedAt).toBe(editedAt)
  })
})

// clearMonthForward
// ─────────────────────────────────────────────────────────────

describe('clearMonthForward', () => {
  it('zeros from the selected month through December', () => {
    const result = clearMonthForward(base, '2026-10')
    expect(result.monthlyOverrides['2026-10']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-11']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-12']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
  })

  it('does not zero months before the selected month', () => {
    const result = clearMonthForward(base, '2026-10')
    expect(result.monthlyOverrides['2026-09']).toBeUndefined()
  })

  it('stamps lastEditedAt on all zeroed months', () => {
    const editedAt = '2026-04-26T10:00:00.000Z'
    const result = clearMonthForward(base, '2026-10', 2026, editedAt)
    expect(result.monthlyOverrides['2026-10'].lastEditedAt).toBe(editedAt)
    expect(result.monthlyOverrides['2026-11'].lastEditedAt).toBe(editedAt)
    expect(result.monthlyOverrides['2026-12'].lastEditedAt).toBe(editedAt)
  })
})

// clearQuarterMonths
// ─────────────────────────────────────────────────────────────

describe('clearQuarterMonths', () => {
  it('zeros exactly the 3 months of Q1 (phaseIdx 0)', () => {
    const result = clearQuarterMonths(base, 0)
    expect(result.monthlyOverrides['2026-01']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-02']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-03']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-04']).toBeUndefined()
  })

  it('zeros exactly the 3 months of Q2 (phaseIdx 1)', () => {
    const result = clearQuarterMonths(base, 1)
    expect(result.monthlyOverrides['2026-04']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-05']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-06']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-03']).toBeUndefined()
    expect(result.monthlyOverrides['2026-07']).toBeUndefined()
  })

  it('zeros exactly the 3 months of Q4 (phaseIdx 3)', () => {
    const result = clearQuarterMonths(base, 3)
    expect(result.monthlyOverrides['2026-10']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-11']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-12']).toEqual(expect.objectContaining({ perPaycheck: 0, amount: 0, cycle: 'every30days' }))
    expect(result.monthlyOverrides['2026-09']).toBeUndefined()
  })

  it('does not mutate the original expense', () => {
    clearQuarterMonths(base, 1)
    expect(base.monthlyOverrides).toBeUndefined()
  })

  it('stamps lastEditedAt on all zeroed quarter months', () => {
    const editedAt = '2026-04-26T10:00:00.000Z'
    const result = clearQuarterMonths(base, 1, 2026, editedAt)
    expect(result.monthlyOverrides['2026-04'].lastEditedAt).toBe(editedAt)
    expect(result.monthlyOverrides['2026-05'].lastEditedAt).toBe(editedAt)
    expect(result.monthlyOverrides['2026-06'].lastEditedAt).toBe(editedAt)
  })
})
