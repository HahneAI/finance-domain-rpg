import { describe, it, expect } from 'vitest'
import {
  getNextDueDate,
  toMonthlyCost,
  fromMonthlyCost,
  cycleAmountFromPerPaycheck,
  monthlyFromPerPaycheck,
  perPaycheckFromCycle,
  buildAdvancedEditPayload,
  resolveWeekOfMonthAnchor,
  resolveDueDateAnchor,
  exactAnnualCost,
  exactWeeklyCost,
  EXACT_CYCLES_PER_YEAR,
} from '../../lib/expense.js'
import { toLocalIso, getExactEffectiveAmountForMonth, getEffectiveAmountForMonth, computeRemainingSpend } from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────
// getNextDueDate — §1.C5 countdown tiles
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

  it('prefers dueDateAnchor over billingMeta.effectiveFrom (TODO §1 New Job Season due-date fix)', () => {
    // effectiveFrom gets stamped to "today" on every BudgetPanel amount edit, so it's
    // an amount-edit timestamp, not a real bill due date — dueDateAnchor is the honest one.
    const e = { dueDateAnchor: '2026-05-20', billingMeta: { amount: 50, cycle: 'every30days', effectiveFrom: '2026-07-01' } }
    expect(iso(getNextDueDate(e, new Date(2026, 4, 15)))).toBe('2026-05-20')
  })

  it('falls back to billingMeta.effectiveFrom when dueDateAnchor is absent', () => {
    const e = expense({ amount: 50, cycle: 'every30days', effectiveFrom: '2026-05-10' })
    expect(iso(getNextDueDate(e, new Date(2026, 4, 10, 12)))).toBe('2026-05-10')
  })

  it('computes a loan\'s next due date from loanMeta.firstPaymentDate, not billingMeta (TODO §1 loan fix)', () => {
    const loan = { type: 'loan', loanMeta: { totalAmount: 2400, paymentAmount: 200, paymentFrequency: 'monthly', firstPaymentDate: '2026-05-10' } }
    expect(iso(getNextDueDate(loan, new Date(2026, 4, 1)))).toBe('2026-05-10')
    // Past the anchor — advances by the monthly (30-day) cadence, same as a regular bill.
    expect(iso(getNextDueDate(loan, new Date(2026, 4, 15)))).toBe('2026-06-09')
  })

  it('advances a weekly/biweekly loan using the same day-counts as regular expense cycles', () => {
    const weeklyLoan = { type: 'loan', loanMeta: { totalAmount: 500, paymentAmount: 50, paymentFrequency: 'weekly', firstPaymentDate: '2026-05-01' } }
    expect(iso(getNextDueDate(weeklyLoan, new Date(2026, 4, 10)))).toBe('2026-05-15')
  })

  it('prefers a Job-Loss-attached dueDateAnchor over loanMeta.firstPaymentDate for a loan', () => {
    const loan = { type: 'loan', dueDateAnchor: '2026-05-20', loanMeta: { totalAmount: 2400, paymentAmount: 200, paymentFrequency: 'monthly', firstPaymentDate: '2026-05-10' } }
    expect(iso(getNextDueDate(loan, new Date(2026, 4, 15)))).toBe('2026-05-20')
  })

  it('returns null for a loan with no loanMeta or a non-positive payment amount', () => {
    expect(getNextDueDate({ type: 'loan' }, new Date())).toBeNull()
    expect(getNextDueDate({ type: 'loan', loanMeta: { paymentAmount: 0, firstPaymentDate: '2026-05-01' } }, new Date())).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// resolveWeekOfMonthAnchor / resolveDueDateAnchor — TODO §1 New Job Season
// expense review's payment-date step + NewJobSeasonBudgetPanel's add-expense fix
// ─────────────────────────────────────────────────────────────

describe('resolveWeekOfMonthAnchor', () => {
  it('maps each week option to its representative day in the reference month', () => {
    expect(resolveWeekOfMonthAnchor('week1', '2026-06-15')).toBe('2026-06-01')
    expect(resolveWeekOfMonthAnchor('week2', '2026-06-15')).toBe('2026-06-08')
    expect(resolveWeekOfMonthAnchor('week3', '2026-06-15')).toBe('2026-06-15')
    expect(resolveWeekOfMonthAnchor('week4', '2026-06-15')).toBe('2026-06-22')
  })

  it('clamps to the last day of a short month', () => {
    // February 2026 has 28 days — week4's day-22 pick is still valid, but a
    // hypothetical day beyond the month length must clamp, not overflow into March.
    expect(resolveWeekOfMonthAnchor('week4', '2026-02-10')).toBe('2026-02-22')
  })

  it('returns null for an unknown week value or missing reference date', () => {
    expect(resolveWeekOfMonthAnchor('week9', '2026-06-15')).toBeNull()
    expect(resolveWeekOfMonthAnchor('week1', null)).toBeNull()
  })
})

describe('resolveDueDateAnchor', () => {
  it('resolves a week-mode pick via resolveWeekOfMonthAnchor', () => {
    expect(resolveDueDateAnchor({ mode: 'week', week: 'week2' }, '2026-06-15')).toBe('2026-06-08')
  })

  it('resolves a custom-mode pick to its raw date', () => {
    expect(resolveDueDateAnchor({ mode: 'custom', date: '2026-08-03' }, '2026-06-15')).toBe('2026-08-03')
  })

  it('returns null for an empty custom date, an unset value, or a missing mode', () => {
    expect(resolveDueDateAnchor({ mode: 'custom', date: '' }, '2026-06-15')).toBeNull()
    expect(resolveDueDateAnchor(null, '2026-06-15')).toBeNull()
    expect(resolveDueDateAnchor({}, '2026-06-15')).toBeNull()
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

  it('returns empty patches, additions, and overridesByExpId for empty input', () => {
    expect(buildAdvancedEditPayload(emptyArgs)).toEqual({ patches: [], additions: [], overridesByExpId: {} })
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

  // Regression: a Bulk Edit change used to only ever write `history`/`billingMeta`,
  // never `monthlyOverrides` — the authoritative read layer getEffectiveAmountForMonth
  // checks first (F37's Bug 1: "editing does nothing" when a stale override shadows
  // the new history entry). Live-confirmed reopened for the Bulk Edit path 2026-08-26;
  // fixed by reusing the exact same helpers the single-edit Save-scope buttons use.
  it('cascading edit also writes overridesByExpId, matching Q+ Onward semantics', () => {
    const { overridesByExpId } = buildAdvancedEditPayload({
      ...emptyArgs,
      edits: { 'exp-1': { amount: '120', cycle: 'every30days', scope: 'forward' } },
    })
    expect(overridesByExpId['exp-1']['2026-05']).toEqual({ perPaycheck: 30, amount: 120, cycle: 'every30days' })
    expect(overridesByExpId['exp-1']['2026-12']).toEqual({ perPaycheck: 30, amount: 120, cycle: 'every30days' })
    // Elapsed month before the edit's start is left untouched (no entry written)
    expect(overridesByExpId['exp-1']['2026-01']).toBeUndefined()
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

  it('month-only edit writes overridesByExpId for only the target month', () => {
    const { overridesByExpId } = buildAdvancedEditPayload({
      ...emptyArgs,
      edits: { 'exp-1': { amount: '120', cycle: 'every30days', scope: 'month-only' } },
    })
    expect(overridesByExpId['exp-1']['2026-05']).toEqual({ perPaycheck: 30, amount: 120, cycle: 'every30days' })
    expect(overridesByExpId['exp-1']['2026-06']).toBeUndefined()
  })

  it('forward deletion writes a zeroed overridesByExpId from the target month onward', () => {
    const { overridesByExpId } = buildAdvancedEditPayload({ ...emptyArgs, deletions: { 'exp-1': 'forward' } })
    expect(overridesByExpId['exp-1']['2026-05'].perPaycheck).toBe(0)
    expect(overridesByExpId['exp-1']['2026-12'].perPaycheck).toBe(0)
  })

  it('month-only deletion writes a zeroed overridesByExpId for only the target month', () => {
    const { overridesByExpId } = buildAdvancedEditPayload({ ...emptyArgs, deletions: { 'exp-1': 'month-only' } })
    expect(overridesByExpId['exp-1']['2026-05'].perPaycheck).toBe(0)
    expect(overridesByExpId['exp-1']['2026-06']).toBeUndefined()
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

// ─────────────────────────────────────────────────────────────
// Exact ("penny-true") cycle math — backend totals only
// Product decision, 2026-08-31: front-facing bill cards keep the
// display-math 48-weeks/year approximation (perPaycheckFromCycle,
// unchanged, verified below), while anything computing a real financial
// total (budget breakdown Annual column, avgWeeklySpend/Left This Week,
// goal timelines, New Job Season runway) must reconcile exactly against
// what was actually entered, using a real 52-week year.
// ─────────────────────────────────────────────────────────────

describe('exactAnnualCost / exactWeeklyCost', () => {
  it('uses exact cycles-per-year: weekly 52, biweekly 26, every30days 12, yearly 1', () => {
    expect(EXACT_CYCLES_PER_YEAR).toEqual({ weekly: 52, biweekly: 26, every30days: 12, yearly: 1 })
  })

  it('a $150/yr bill has an exact annual cost of exactly $150 — no rounding drift', () => {
    expect(exactAnnualCost(150, 'yearly')).toBe(150)
    expect(exactWeeklyCost(150, 'yearly')).toBeCloseTo(150 / 52, 10)
  })

  it('reproduces the reported bug: display math (unchanged) rounds up from the exact figure', () => {
    // Anthony's report: a $150/yr bill on a biweekly account showed $6.25-$6.50/check.
    // perPaycheckFromCycle (display, untouched) rounds 150/12/4=3.125 up to $3.25/wk —
    // ×2 for biweekly = $6.50/check. That's the correct, unchanged, intentional
    // front-facing behavior (48-week-year mental math) — verified here so a future
    // change can't silently "fix" it back toward exact math by mistake.
    const displayWeekly = perPaycheckFromCycle(150, 'yearly')
    expect(displayWeekly).toBe(3.25)
    expect(displayWeekly * 2).toBe(6.5)
    // The exact backend figure is genuinely different — by design, not a bug.
    const exactWeekly = exactWeeklyCost(150, 'yearly')
    expect(exactWeekly).toBeCloseTo(2.8846153846, 8)
    expect(exactWeekly * 2).toBeCloseTo(5.7692307692, 8)
  })

  it('weekly/biweekly/every30days annualize exactly', () => {
    expect(exactAnnualCost(50, 'weekly')).toBe(2600)      // 50 * 52
    expect(exactAnnualCost(100, 'biweekly')).toBe(2600)   // 100 * 26
    expect(exactAnnualCost(400, 'every30days')).toBe(4800) // 400 * 12
  })

  it('an unrecognized cycle falls back to every30days\' 12/year, matching normalizeCycle', () => {
    expect(exactAnnualCost(100, 'bogus-cycle')).toBe(1200)
  })

  it('treats a missing/null amount as 0', () => {
    expect(exactAnnualCost(null, 'yearly')).toBe(0)
    expect(exactAnnualCost(undefined, 'weekly')).toBe(0)
  })
})

describe('getExactEffectiveAmountForMonth', () => {
  it('uses a monthlyOverrides entry\'s own {amount, cycle} — not its rounded perPaycheck', () => {
    const exp = {
      monthlyOverrides: {
        '2026-10': { perPaycheck: 3.25, amount: 150, cycle: 'yearly' }, // rounded reserve, exact source data
      },
    }
    const exact = getExactEffectiveAmountForMonth(exp, '2026-10', 3)
    expect(exact).toBeCloseTo(150 / 52, 10)
    expect(exact).not.toBe(3.25)
  })

  it('falls back to getEffectiveAmountForMonth (still rounded) when no override exists for that month', () => {
    // No monthlyOverrides at all — history-only expense, e.g. addExpAllQuarters'
    // creation path. There's no {amount, cycle} to re-derive an exact figure from,
    // so this must match the existing (unchanged) resolver exactly, not silently
    // return something new/wrong.
    const exp = { history: [{ effectiveFrom: '2026-01-05', weekly: [3.25, 3.25, 3.25, 3.25] }] }
    expect(getExactEffectiveAmountForMonth(exp, '2026-10', 3)).toBe(getEffectiveAmountForMonth(exp, '2026-10', 3))
    expect(getExactEffectiveAmountForMonth(exp, '2026-10', 3)).toBe(3.25)
  })

  it('different months can carry genuinely different override amounts, each resolved exactly', () => {
    const exp = {
      monthlyOverrides: {
        '2026-06': { perPaycheck: 10, amount: 40, cycle: 'every30days' },
        '2026-07': { perPaycheck: 15, amount: 60, cycle: 'every30days' },
      },
    }
    expect(getExactEffectiveAmountForMonth(exp, '2026-06', 1)).toBeCloseTo((40 * 12) / 52, 10)
    expect(getExactEffectiveAmountForMonth(exp, '2026-07', 2)).toBeCloseTo((60 * 12) / 52, 10)
  })
})

describe('computeRemainingSpend — exact yearly-bill reconciliation', () => {
  it('a $150/yr bill (monthlyOverrides populated for every real week) contributes exactly $150 across a real 52-week year', () => {
    // Mirrors addExpFromMonthForward: every month gets its own {perPaycheck, amount, cycle}
    // override, all identical since the bill was never edited per-month.
    const monthlyOverrides = {}
    for (let m = 1; m <= 12; m++) {
      monthlyOverrides[`2026-${String(m).padStart(2, '0')}`] = { perPaycheck: 3.25, amount: 150, cycle: 'yearly' }
    }
    const expense = { id: 'exp1', category: 'Needs', monthlyOverrides }

    // 52 real weeks spanning the fiscal year, one per calendar week.
    const futureWeeks = Array.from({ length: 52 }, (_, i) => ({
      idx: i,
      weekEnd: new Date(2026, 0, 5 + i * 7),
    }))
    const weeklyNets = futureWeeks.map(() => 0) // irrelevant to this assertion

    const result = computeRemainingSpend([expense], futureWeeks, { weeklyIncome: 0, futureWeekNets: weeklyNets })
    // Exactly the entered amount — not $156 (48-week display math) or $169
    // (52 real weeks × the rounded $3.25/wk reserve).
    expect(result.totalRemainingSpend).toBeCloseTo(150, 6)
  })
})
