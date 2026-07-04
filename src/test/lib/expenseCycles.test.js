import { describe, it, expect } from 'vitest'
import {
  getNextDueDate,
  toMonthlyCost,
  fromMonthlyCost,
  cycleAmountFromPerPaycheck,
  monthlyFromPerPaycheck,
  perPaycheckFromCycle,
  buildAdvancedEditPayload,
} from '../../lib/expense.js'
import { toLocalIso } from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────
// getNextDueDate — §15.C5 countdown tiles
// ─────────────────────────────────────────────────────────────

describe('getNextDueDate', () => {
  const expense = (meta) => ({ billingMeta: meta })
  const iso = (d) => toLocalIso(d)

  it('returns null without billingMeta, anchor date, or a positive amount', () => {
    expect(getNextDueDate({}, new Date())).toBeNull()
    expect(getNextDueDate(null, new Date())).toBeNull()
    expect(getNextDueDate(expense({ amount: 50 }), new Date())).toBeNull()
    expect(getNextDueDate(expense({ amount: 0, effectiveFrom: '2026-05-01' }), new Date())).toBeNull()
  })

  it('returns the anchor itself when today is on or before it', () => {
    const e = expense({ amount: 50, cycle: 'every30days', effectiveFrom: '2026-05-10' })
    expect(iso(getNextDueDate(e, new Date(2026, 4, 10, 12)))).toBe('2026-05-10')
    expect(iso(getNextDueDate(e, new Date(2026, 3, 1)))).toBe('2026-05-10')
  })

  it('advances a 30-day cycle to the first due date on/after today', () => {
    const e = expense({ amount: 50, cycle: 'every30days', effectiveFrom: '2026-05-01' })
    // 2026-05-15 → next 30-day boundary from May 1 is May 31
    expect(iso(getNextDueDate(e, new Date(2026, 4, 15)))).toBe('2026-05-31')
  })

  it('advances weekly and yearly cycles', () => {
    const weekly = expense({ amount: 20, cycle: 'weekly', effectiveFrom: '2026-05-01' })
    expect(iso(getNextDueDate(weekly, new Date(2026, 4, 10)))).toBe('2026-05-15')
    const yearly = expense({ amount: 300, cycle: 'yearly', effectiveFrom: '2026-05-01' })
    expect(iso(getNextDueDate(yearly, new Date(2026, 5, 1)))).toBe('2027-05-01')
  })

  it('never returns a past date', () => {
    const e = expense({ amount: 50, cycle: 'biweekly', effectiveFrom: '2026-01-02' })
    const today = new Date(2026, 6, 4)
    expect(getNextDueDate(e, today).getTime()).toBeGreaterThanOrEqual(today.getTime())
  })

  it('treats an unknown cycle as every30days (normalizeCycle fallback)', () => {
    const e = expense({ amount: 50, cycle: 'fortnightly', effectiveFrom: '2026-05-01' })
    expect(iso(getNextDueDate(e, new Date(2026, 4, 15)))).toBe('2026-05-31')
  })

  it('returns null for an unparseable anchor date', () => {
    const e = expense({ amount: 50, cycle: 'weekly', effectiveFrom: 'not-a-date' })
    expect(getNextDueDate(e, new Date())).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// toMonthlyCost / fromMonthlyCost — cycle conversions
// ─────────────────────────────────────────────────────────────

describe('toMonthlyCost / fromMonthlyCost', () => {
  it.each([
    ['weekly', 100, 400],
    ['biweekly', 100, 200],
    ['every30days', 100, 100],
    ['yearly', 1200, 100],
  ])('toMonthlyCost converts %s $%d → $%d/month', (cycle, amount, monthly) => {
    expect(toMonthlyCost(amount, cycle)).toBeCloseTo(monthly, 5)
  })

  it.each(['weekly', 'biweekly', 'every30days', 'yearly'])(
    'fromMonthlyCost inverts toMonthlyCost for %s',
    (cycle) => {
      expect(fromMonthlyCost(toMonthlyCost(137, cycle), cycle)).toBeCloseTo(137, 5)
    }
  )

  it('unknown cycles normalize to every30days (identity)', () => {
    expect(toMonthlyCost(85, 'daily')).toBe(85)
    expect(fromMonthlyCost(85, 'daily')).toBe(85)
  })
})

describe('cycleAmountFromPerPaycheck / monthlyFromPerPaycheck', () => {
  it('recovers the cycle amount from a stored weekly reserve', () => {
    // $400/month bill stored as $100/wk reserve
    expect(cycleAmountFromPerPaycheck(100, 'every30days')).toBeCloseTo(400)
    expect(cycleAmountFromPerPaycheck(100, 'weekly')).toBeCloseTo(100)
    expect(cycleAmountFromPerPaycheck(100, 'biweekly')).toBeCloseTo(200)
    expect(cycleAmountFromPerPaycheck(100, 'yearly')).toBeCloseTo(4800)
  })

  it('round-trips with perPaycheckFromCycle on quarter-dollar amounts', () => {
    for (const cycle of ['weekly', 'biweekly', 'every30days', 'yearly']) {
      const reserve = perPaycheckFromCycle(120, cycle)
      expect(cycleAmountFromPerPaycheck(reserve, cycle)).toBeCloseTo(120, 5)
    }
  })

  it('monthlyFromPerPaycheck is reserve × 4 rounded to the quarter', () => {
    expect(monthlyFromPerPaycheck(100)).toBe(400)
    expect(monthlyFromPerPaycheck(87.56)).toBeCloseTo(350.25, 5)
  })
})

// ─────────────────────────────────────────────────────────────
// buildAdvancedEditPayload — BulkEditPanel save logic
// ─────────────────────────────────────────────────────────────

describe('buildAdvancedEditPayload', () => {
  const MONTH_ISO = '2026-05-01'
  const PHASE = 1 // May = Q2
  const baseExpense = {
    id: 'exp-1',
    label: 'Internet',
    history: [{ effectiveFrom: '2026-01-05', weekly: [20, 20, 20, 20] }],
    billingMeta: { amount: 80, cycle: 'every30days', byPhase: {} },
  }
  const emptyArgs = { edits: {}, deletions: {}, additions: [], expenses: [baseExpense], monthIso: MONTH_ISO, phaseIdx: PHASE, cpm: 4 }

  it('returns empty patches and additions for empty input', () => {
    expect(buildAdvancedEditPayload(emptyArgs)).toEqual({ patches: [], additions: [] })
  })

  it('cascading edit writes one patch with the new amount from the phase forward', () => {
    const { patches } = buildAdvancedEditPayload({
      ...emptyArgs,
      edits: { 'exp-1': { amount: '120', cycle: 'every30days', scope: 'forward' } },
    })
    expect(patches).toHaveLength(1)
    expect(patches[0].expId).toBe('exp-1')
    expect(patches[0].effectiveFrom).toBe(MONTH_ISO)
    // $120/30d → $30/wk reserve; Q1 base preserved, Q2+ cascaded
    expect(patches[0].newWeekly).toEqual([20, 30, 30, 30])
    expect(patches[0].newByPhase[PHASE]).toEqual({ amount: 120, cycle: 'every30days', effectiveFrom: MONTH_ISO })
  })

  it('month-only edit writes a this-month patch plus a next-month revert patch', () => {
    const { patches } = buildAdvancedEditPayload({
      ...emptyArgs,
      edits: { 'exp-1': { amount: '120', cycle: 'every30days', scope: 'month-only' } },
    })
    expect(patches).toHaveLength(2)
    expect(patches[0]).toMatchObject({ effectiveFrom: MONTH_ISO, newWeekly: [20, 30, 20, 20] })
    expect(patches[1]).toMatchObject({ effectiveFrom: '2026-06-01', newWeekly: [20, 20, 20, 20] })
  })

  it('cascading edit respects existing byPhase overrides in later quarters', () => {
    const withOverride = {
      ...baseExpense,
      billingMeta: { ...baseExpense.billingMeta, byPhase: { 3: { amount: 60, cycle: 'every30days' } } },
    }
    const { patches } = buildAdvancedEditPayload({
      ...emptyArgs,
      expenses: [withOverride],
      edits: { 'exp-1': { amount: '120', cycle: 'every30days', scope: 'forward' } },
    })
    // Q4 keeps its base value because the user customized it explicitly
    expect(patches[0].newWeekly).toEqual([20, 30, 30, 20])
  })

  it('forward deletion zeroes the phase onward and records a $0 byPhase entry', () => {
    const { patches } = buildAdvancedEditPayload({ ...emptyArgs, deletions: { 'exp-1': 'forward' } })
    expect(patches).toHaveLength(1)
    expect(patches[0].newWeekly).toEqual([20, 0, 0, 0])
    expect(patches[0].newByPhase[PHASE].amount).toBe(0)
  })

  it('month-only deletion zeroes just this month and reverts next month', () => {
    const { patches } = buildAdvancedEditPayload({ ...emptyArgs, deletions: { 'exp-1': 'month-only' } })
    expect(patches).toHaveLength(2)
    expect(patches[0]).toMatchObject({ effectiveFrom: MONTH_ISO, newWeekly: [20, 0, 20, 20] })
    expect(patches[1]).toMatchObject({ effectiveFrom: '2026-06-01', newWeekly: [20, 20, 20, 20] })
  })

  it('skips edits and deletions for unknown expense ids', () => {
    const { patches } = buildAdvancedEditPayload({
      ...emptyArgs,
      edits: { ghost: { amount: '50', cycle: 'weekly', scope: 'forward' } },
      deletions: { phantom: 'forward' },
    })
    expect(patches).toEqual([])
  })

  it('additions fill the current phase onward and zero earlier phases', () => {
    const { additions } = buildAdvancedEditPayload({
      ...emptyArgs,
      additions: [{ label: 'Gym', category: 'personal', cycle: 'every30days', amount: '40' }],
    })
    expect(additions).toHaveLength(1)
    expect(additions[0]).toMatchObject({
      label: 'Gym',
      category: 'personal',
      amount: 40,
      effectiveFrom: MONTH_ISO,
      phaseIdx: PHASE,
      weekly: [0, 10, 10, 10],
    })
  })

  it('unparseable addition amounts fall back to 0', () => {
    const { additions } = buildAdvancedEditPayload({
      ...emptyArgs,
      additions: [{ label: 'Mystery', category: 'other', cycle: 'weekly', amount: 'abc' }],
    })
    expect(additions[0].amount).toBe(0)
    expect(additions[0].weekly).toEqual([0, 0, 0, 0])
  })
})
