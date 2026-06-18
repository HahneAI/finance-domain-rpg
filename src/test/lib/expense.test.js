import { describe, it, expect } from 'vitest'
import {
  applyMonthEdit,
  applyMonthEditForward,
  clearMonth,
  clearMonthForward,
  clearQuarterMonths,
  onwardStartMonthKey,
  applyQuarterForward,
  applyAllQuarters,
} from '../../lib/expense.js'
import { getEffectiveAmountForMonth } from '../../lib/finance.js'

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

// onwardStartMonthKey (Decision 2 — "onward" never rewrites elapsed months)
// ─────────────────────────────────────────────────────────────

describe('onwardStartMonthKey', () => {
  it('clamps the current quarter to the current month (Q2 viewed in June)', () => {
    // Q2 first month is April, but June has elapsed — start at June, not April.
    expect(onwardStartMonthKey('2026-04', '2026-06')).toBe('2026-06')
  })

  it('uses the quarter first month for a future quarter (Q3 viewed in June)', () => {
    expect(onwardStartMonthKey('2026-07', '2026-06')).toBe('2026-07')
  })

  it('clamps a past quarter forward to the current month', () => {
    expect(onwardStartMonthKey('2026-01', '2026-06')).toBe('2026-06')
  })
})

// applyQuarterForward (Q[n]+ Onward — overwrites in range, Decision 1)
// ─────────────────────────────────────────────────────────────

describe('applyQuarterForward', () => {
  it('writes an override for every month from the start key through December', () => {
    const result = applyQuarterForward(base, '2026-06', 70, 280, 'every30days')
    for (const key of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']) {
      expect(result.monthlyOverrides[key]).toEqual({ perPaycheck: 70, amount: 280, cycle: 'every30days' })
    }
  })

  it('does not write months before the start key (elapsed months untouched)', () => {
    const result = applyQuarterForward(base, '2026-06', 70, 280, 'every30days')
    expect(result.monthlyOverrides['2026-04']).toBeUndefined()
    expect(result.monthlyOverrides['2026-05']).toBeUndefined()
  })

  it('OVERWRITES a finer override already in range (Decision 1)', () => {
    const exp = { ...base, monthlyOverrides: { '2026-08': { perPaycheck: 999, amount: 999, cycle: 'weekly' } } }
    const result = applyQuarterForward(exp, '2026-06', 70, 280, 'every30days')
    expect(result.monthlyOverrides['2026-08']).toEqual({ perPaycheck: 70, amount: 280, cycle: 'every30days' })
  })

  it('preserves out-of-range overrides before the start key', () => {
    const exp = { ...base, monthlyOverrides: { '2026-04': { perPaycheck: 50, amount: 200, cycle: 'every30days' } } }
    const result = applyQuarterForward(exp, '2026-06', 70, 280, 'every30days')
    expect(result.monthlyOverrides['2026-04']).toEqual({ perPaycheck: 50, amount: 200, cycle: 'every30days' })
  })

  it('does not mutate the original expense', () => {
    applyQuarterForward(base, '2026-06', 70, 280, 'every30days')
    expect(base.monthlyOverrides).toBeUndefined()
  })
})

// applyAllQuarters (All Qtrs — full year, includes elapsed months)
// ─────────────────────────────────────────────────────────────

describe('applyAllQuarters', () => {
  it('writes an override for all 12 months of the fiscal year', () => {
    const result = applyAllQuarters(base, 60, 240, 'every30days')
    for (let m = 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, '0')}`
      expect(result.monthlyOverrides[key]).toEqual({ perPaycheck: 60, amount: 240, cycle: 'every30days' })
    }
  })

  it('overwrites any pre-existing override, elapsed or future', () => {
    const exp = { ...base, monthlyOverrides: { '2026-02': { perPaycheck: 999, amount: 999, cycle: 'weekly' } } }
    const result = applyAllQuarters(exp, 60, 240, 'every30days')
    expect(result.monthlyOverrides['2026-02']).toEqual({ perPaycheck: 60, amount: 240, cycle: 'every30days' })
  })

  it('does not mutate the original expense', () => {
    applyAllQuarters(base, 60, 240, 'every30days')
    expect(base.monthlyOverrides).toBeUndefined()
  })
})

// Integration: save → resolver → reload round-trip
// ─────────────────────────────────────────────────────────────

describe('quarter saves resolve correctly through getEffectiveAmountForMonth', () => {
  // Gas-like expense: $100/check baseline via history, no overrides yet.
  const gas = { id: 'gas', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] }

  it('Q2+ Onward in June: new value applies June→Dec, elapsed months keep the old value (Bug 1)', () => {
    const startKey = onwardStartMonthKey('2026-04', '2026-06') // → 2026-06
    const saved = applyQuarterForward(gas, startKey, 70, 280, 'every30days')
    // Onward window: 70
    expect(getEffectiveAmountForMonth(saved, '2026-06', 1)).toBe(70)
    expect(getEffectiveAmountForMonth(saved, '2026-09', 2)).toBe(70)
    expect(getEffectiveAmountForMonth(saved, '2026-12', 3)).toBe(70)
    // Elapsed months in the quarter: still the history baseline
    expect(getEffectiveAmountForMonth(saved, '2026-04', 1)).toBe(100)
    expect(getEffectiveAmountForMonth(saved, '2026-05', 1)).toBe(100)
  })

  it('a broad save overwrites a finer in-range override at the resolver level', () => {
    const withFiner = applyMonthEdit(gas, '2026-08', 12.5, 50, 'every30days')
    expect(getEffectiveAmountForMonth(withFiner, '2026-08', 2)).toBe(12.5)
    const flattened = applyQuarterForward(withFiner, '2026-06', 70, 280, 'every30days')
    expect(getEffectiveAmountForMonth(flattened, '2026-08', 2)).toBe(70)
  })

  it('survives a save → reload round-trip (JSON serialize) unchanged', () => {
    const saved = applyQuarterForward(gas, '2026-06', 70, 280, 'every30days')
    const reloaded = JSON.parse(JSON.stringify(saved))
    expect(getEffectiveAmountForMonth(reloaded, '2026-06', 1)).toBe(70)
    expect(getEffectiveAmountForMonth(reloaded, '2026-12', 3)).toBe(70)
    expect(getEffectiveAmountForMonth(reloaded, '2026-04', 1)).toBe(100)
  })

  it('All Qtrs makes a brand-new (history-less) expense non-zero every month (Bug 2 data path)', () => {
    const fresh = { id: 'new', history: [] }
    const saved = applyAllQuarters(fresh, 60, 240, 'every30days')
    for (let m = 1; m <= 12; m++) {
      expect(getEffectiveAmountForMonth(saved, `2026-${String(m).padStart(2, '0')}`, Math.floor((m - 1) / 3))).toBe(60)
    }
  })
})
