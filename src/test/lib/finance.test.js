import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fedTax,
  buildYear,
  computeNet,
  projectedGross,
  getPhaseIndex,
  getEffectiveAmount,
  computeRemainingSpend,
  computeGoalTimeline,
  loanWeeklyAmount,
  computeLoanPayoffDate,
  buildLoanHistory,
  loanPaymentsRemaining,
  computeBucketModel,
  calcEventImpact,
  toLocalIso,
  stateTax,
  getStateConfig,
  loanRunwayStartDate,
  dhlEmployerMatchRate,
} from '../../lib/finance.js'
import { STATE_TAX_TABLE } from '../../constants/stateTaxTable.js'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// DHL_CONFIG: used for tests that exercise DHL rotation behavior (6-Day/4-Day alternation).
// startingWeekIsLong=false with firstActiveIdx=7 produces the same even=long pattern
// as the legacy idx%2===0 logic, so all rotation-based test assertions remain valid.
const DHL_CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: "DHL",
  startingWeekIsLong: false,  // false + firstActiveIdx=7 → even idx = long (6-Day)
  // Explicit 401k values — test must not depend on DEFAULT_CONFIG personal values
  k401Rate: 0.06,
  k401MatchRate: 0.05,
  k401StartDate: "2026-05-15",
}

// ─────────────────────────────────────────────────────────────
// fedTax
// ─────────────────────────────────────────────────────────────
// dhlEmployerMatchRate
// ─────────────────────────────────────────────────────────────

describe('dhlEmployerMatchRate', () => {
  it('matches 100% up to 4%: contribute 4 → match 4', () => {
    expect(dhlEmployerMatchRate(0.04)).toBeCloseTo(0.04)
  })
  it('contribute 5% → match 4.5%', () => {
    expect(dhlEmployerMatchRate(0.05)).toBeCloseTo(0.045)
  })
  it('contribute 6% → match 5% (cap)', () => {
    expect(dhlEmployerMatchRate(0.06)).toBeCloseTo(0.05)
  })
  it('contribute 7%+ → match stays at 5% cap', () => {
    expect(dhlEmployerMatchRate(0.07)).toBeCloseTo(0.05)
    expect(dhlEmployerMatchRate(0.15)).toBeCloseTo(0.05)
  })
  it('contribute 0% → match 0', () => {
    expect(dhlEmployerMatchRate(0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────

describe('fedTax', () => {
  it('returns 0 for zero income', () => {
    expect(fedTax(0)).toBe(0)
  })

  it('taxes income in the first bracket at 10%', () => {
    expect(fedTax(1000)).toBeCloseTo(100)
  })

  it('taxes income at exactly the first bracket ceiling', () => {
    expect(fedTax(11925)).toBeCloseTo(1192.5)
  })

  it('applies 12% on income spanning into the second bracket', () => {
    // 11925 * 0.10 + 1 * 0.12 = 1192.62
    expect(fedTax(11926)).toBeCloseTo(1192.62)
  })

  it('applies 22% on income spanning into the third bracket', () => {
    // 11925*0.10 + (48475-11925)*0.12 + (50000-48475)*0.22 = 5914
    expect(fedTax(50000)).toBeCloseTo(5914)
  })

  it('applies 24% on income in the fourth bracket', () => {
    // 11925*0.10 + 36550*0.12 + 54875*0.22 + 46650*0.24 = 28847
    expect(fedTax(150000)).toBeCloseTo(28847)
  })

  it('returns a positive value for any positive income', () => {
    expect(fedTax(500)).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────
// buildYear
// ─────────────────────────────────────────────────────────────

describe('buildYear', () => {
  let weeks

  beforeEach(() => {
    weeks = buildYear(DHL_CONFIG)
  })

  it('generates 53 weeks for the 2026 fiscal year (Jan 5 → Jan 4)', () => {
    expect(weeks).toHaveLength(53)
  })

  it('assigns sequential idx values starting at 0', () => {
    weeks.forEach((w, i) => expect(w.idx).toBe(i))
  })

  it('week 0 ends on 2026-01-05', () => {
    const w = weeks[0].weekEnd
    const iso = `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`
    expect(iso).toBe('2026-01-05')
  })

  it('week 0 is 6-Day rotation (even index)', () => {
    expect(weeks[0].rotation).toBe('6-Day')
  })

  it('week 1 is 4-Day rotation (odd index)', () => {
    expect(weeks[1].rotation).toBe('4-Day')
  })

  it('alternates 6-Day / 4-Day across all weeks', () => {
    weeks.forEach((w, i) => {
      expect(w.rotation).toBe(i % 2 === 0 ? '6-Day' : '4-Day')
    })
  })

  it('weeks before firstActiveIdx are inactive with zero grossPay', () => {
    for (let i = 0; i < DHL_CONFIG.firstActiveIdx; i++) {
      expect(weeks[i].active).toBe(false)
      expect(weeks[i].grossPay).toBe(0)
    }
  })

  it('weeks from firstActiveIdx onward are active with positive grossPay', () => {
    for (let i = DHL_CONFIG.firstActiveIdx; i < weeks.length; i++) {
      expect(weeks[i].active).toBe(true)
      expect(weeks[i].grossPay).toBeGreaterThan(0)
    }
  })

  it('6-Day weeks have 72 total hours (6 shifts × 12h)', () => {
    const sixDay = weeks.find(w => w.rotation === '6-Day')
    expect(sixDay.totalHours).toBe(72)
  })

  it('4-Day weeks have 48 total hours (4 shifts × 12h)', () => {
    const fourDay = weeks.find(w => w.rotation === '4-Day')
    expect(fourDay.totalHours).toBe(48)
  })

  it('6-Day weeks include 2 weekend shifts (24 weekend hours)', () => {
    const sixDay = weeks.find(w => w.rotation === '6-Day')
    expect(sixDay.weekendHours).toBe(24)
  })

  it('4-Day weeks have zero weekend hours', () => {
    const fourDay = weeks.find(w => w.rotation === '4-Day')
    expect(fourDay.weekendHours).toBe(0)
  })

  it('6-Day active weeks have higher grossPay than 4-Day active weeks', () => {
    const sixDay = weeks.find(w => w.rotation === '6-Day' && w.active)
    const fourDay = weeks.find(w => w.rotation === '4-Day' && w.active)
    expect(sixDay.grossPay).toBeGreaterThan(fourDay.grossPay)
  })

  it('computes correct grossPay for an active 4-Day week (40 regular + 8 OT + 48h night diff)', () => {
    const cfg = DHL_CONFIG
    const expected = 40 * cfg.baseRate + 8 * cfg.baseRate * cfg.otMultiplier + 48 * cfg.nightDiffRate
    const fourDay = weeks.find(w => w.rotation === '4-Day' && w.active)
    expect(fourDay.grossPay).toBeCloseTo(expected)
  })

  it('computes correct grossPay for an active 6-Day week (40 regular + 32 OT + 24 weekend + 72h night diff)', () => {
    const cfg = DHL_CONFIG
    const expected = 40 * cfg.baseRate + 32 * cfg.baseRate * cfg.otMultiplier + 24 * cfg.diffRate + 72 * cfg.nightDiffRate
    const sixDay = weeks.find(w => w.rotation === '6-Day' && w.active)
    expect(sixDay.grossPay).toBeCloseTo(expected)
  })

  it('marks weeks in taxedWeeks as taxedBySchedule=true', () => {
    const taxedSet = new Set(DHL_CONFIG.taxedWeeks)
    weeks.forEach(w => {
      if (taxedSet.has(w.idx)) expect(w.taxedBySchedule).toBe(true)
    })
  })

  it('marks weeks not in taxedWeeks as taxedBySchedule=false', () => {
    const taxedSet = new Set(DHL_CONFIG.taxedWeeks)
    weeks.forEach(w => {
      if (!taxedSet.has(w.idx)) expect(w.taxedBySchedule).toBe(false)
    })
  })

  it('has401k is false before k401StartDate', () => {
    // k401StartDate is 2026-05-15; early active weeks should have has401k=false
    const earlyActive = weeks.filter(w => w.active && !w.has401k)
    expect(earlyActive.length).toBeGreaterThan(0)
    earlyActive.forEach(w => expect(w.k401kEmployee).toBe(0))
  })

  it('has401k is true and k401kEmployee > 0 after k401StartDate', () => {
    const lateActive = weeks.filter(w => w.active && w.has401k)
    expect(lateActive.length).toBeGreaterThan(0)
    lateActive.forEach(w => expect(w.k401kEmployee).toBeGreaterThan(0))
  })

  it('standard DHL preset rotation uses DHL_PRESET day arrays when dhlTeam set and !dhlCustomSchedule', () => {
    // This path covers lines 76-77: the dhlTeam && !dhlCustomSchedule branch in buildYear()
    const presetConfig = {
      ...DHL_CONFIG,
      dhlTeam: 'A',
      dhlCustomSchedule: false,
      startingWeekIsLong: true,  // Team A starts long
    }
    const presetWeeks = buildYear(presetConfig)
    expect(presetWeeks).toHaveLength(53)
    // Active weeks should have non-zero gross pay
    const activeWeeks = presetWeeks.filter(w => w.active)
    expect(activeWeeks.length).toBeGreaterThan(0)
    activeWeeks.forEach(w => expect(w.grossPay).toBeGreaterThan(0))
    // Standard preset long week (DHL_PRESET short = Mon/Thu/Fri = 3 shifts = 36h)
    // short and long weeks should produce different grossPay amounts
    const firstLong  = activeWeeks.find(w => w.rotation === '6-Day')
    const firstShort = activeWeeks.find(w => w.rotation === '4-Day')
    if (firstLong && firstShort) {
      expect(firstLong.grossPay).toBeGreaterThan(firstShort.grossPay)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// computeNet
// ─────────────────────────────────────────────────────────────

describe('computeNet', () => {
  let weeks

  beforeEach(() => {
    weeks = buildYear(DHL_CONFIG)
  })

  it('returns 0 for inactive weeks', () => {
    expect(computeNet(weeks[0], DHL_CONFIG)).toBe(0)
  })

  it('net pay is less than gross pay for all active weeks', () => {
    weeks.filter(w => w.active).forEach(w => {
      expect(computeNet(w, DHL_CONFIG)).toBeLessThan(w.grossPay)
    })
  })

  it('deducts only FICA, LTD, and 401k on non-taxed active weeks', () => {
    const week = weeks.find(w => w.active && !w.taxedBySchedule)
    const cfg = DHL_CONFIG
    const expected = week.grossPay - week.grossPay * cfg.ficaRate - cfg.ltd - week.k401kEmployee
    expect(computeNet(week, cfg)).toBeCloseTo(expected)
  })

  it('deducts fed and state tax in addition on taxed 4-Day (low-rate) weeks', () => {
    const week = weeks.find(w => w.active && w.taxedBySchedule && w.rotation === '4-Day')
    const cfg = DHL_CONFIG
    const fica = week.grossPay * cfg.ficaRate
    const ded = cfg.ltd + week.k401kEmployee
    const fed = week.taxableGross * cfg.fedRateLow  // 4-Day = short = fedRateLow
    const st = week.taxableGross * cfg.stateRateLow
    expect(computeNet(week, cfg)).toBeCloseTo(week.grossPay - fed - st - fica - ded)
  })

  it('deducts fed and state tax in addition on taxed 6-Day (high-rate) weeks', () => {
    const week = weeks.find(w => w.active && w.taxedBySchedule && w.rotation === '6-Day')
    const cfg = DHL_CONFIG
    const fica = week.grossPay * cfg.ficaRate
    const ded = cfg.ltd + week.k401kEmployee
    const fed = week.taxableGross * cfg.fedRateHigh  // 6-Day = long = fedRateHigh
    const st = week.taxableGross * cfg.stateRateHigh
    expect(computeNet(week, cfg)).toBeCloseTo(week.grossPay - fed - st - fica - ded)
  })

  it('taxed weeks have a lower net/gross ratio than non-taxed weeks of the same rotation', () => {
    const taxed4 = weeks.find(w => w.active && w.taxedBySchedule && w.rotation === '4-Day')
    const nonTaxed4 = weeks.find(w => w.active && !w.taxedBySchedule && w.rotation === '4-Day')
    const taxedRatio = computeNet(taxed4, DHL_CONFIG) / taxed4.grossPay
    const nonTaxedRatio = computeNet(nonTaxed4, DHL_CONFIG) / nonTaxed4.grossPay
    expect(taxedRatio).toBeLessThan(nonTaxedRatio)
  })
})

// ─────────────────────────────────────────────────────────────
// projectedGross
// ─────────────────────────────────────────────────────────────

describe('projectedGross', () => {
  const cfg = DEFAULT_CONFIG

  it('6-Day gross is higher than 4-Day gross', () => {
    expect(projectedGross(true, cfg)).toBeGreaterThan(projectedGross(false, cfg))
  })

  it('calculates correct gross for 6-Day (40 regular + 32 OT + 24 weekend hours)', () => {
    const expected = 40 * cfg.baseRate + 32 * cfg.baseRate * cfg.otMultiplier + 2 * cfg.shiftHours * cfg.diffRate
    expect(projectedGross(true, cfg)).toBeCloseTo(expected)
  })

  it('calculates correct gross for 4-Day (40 regular + 8 OT, no weekend)', () => {
    const expected = 40 * cfg.baseRate + 8 * cfg.baseRate * cfg.otMultiplier
    expect(projectedGross(false, cfg)).toBeCloseTo(expected)
  })

  it('matches the grossPay of the corresponding active week from buildYear', () => {
    const weeks = buildYear(DHL_CONFIG)
    const sixDay = weeks.find(w => w.active && w.rotation === '6-Day')
    const fourDay = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(projectedGross(true, DHL_CONFIG)).toBeCloseTo(sixDay.grossPay)
    expect(projectedGross(false, DHL_CONFIG)).toBeCloseTo(fourDay.grossPay)
  })
})

// ─────────────────────────────────────────────────────────────
// getPhaseIndex
// ─────────────────────────────────────────────────────────────

describe('getPhaseIndex', () => {
  it('returns 0 for dates in Q1 (up to and including 2026-03-31)', () => {
    expect(getPhaseIndex(new Date(2026, 0, 5))).toBe(0)   // Jan 5
    expect(getPhaseIndex(new Date(2026, 2, 31))).toBe(0)  // Mar 31
  })

  it('returns 1 for dates in Q2 (2026-04-01 through 2026-06-30)', () => {
    expect(getPhaseIndex(new Date(2026, 3, 1))).toBe(1)   // Apr 1
    expect(getPhaseIndex(new Date(2026, 5, 30))).toBe(1)  // Jun 30
  })

  it('returns 2 for dates in Q3 (2026-07-01 through 2026-09-30)', () => {
    expect(getPhaseIndex(new Date(2026, 6, 1))).toBe(2)   // Jul 1
    expect(getPhaseIndex(new Date(2026, 8, 30))).toBe(2)  // Sep 30
  })

  it('returns 3 for dates in Q4 (after 2026-09-30)', () => {
    expect(getPhaseIndex(new Date(2026, 9, 1))).toBe(3)   // Oct 1
    expect(getPhaseIndex(new Date(2026, 11, 31))).toBe(3) // Dec 31
  })
})

// ─────────────────────────────────────────────────────────────
// getEffectiveAmount
// ─────────────────────────────────────────────────────────────

describe('getEffectiveAmount', () => {
  it('returns weekly[phaseIdx] when expense has no history', () => {
    const expense = { weekly: [100, 200, 300, 400] }
    expect(getEffectiveAmount(expense, new Date(2026, 0, 5), 0)).toBe(100)
    expect(getEffectiveAmount(expense, new Date(2026, 5, 1), 1)).toBe(200)
  })

  it('returns 0 when no history and no weekly array', () => {
    expect(getEffectiveAmount({}, new Date(2026, 0, 5), 0)).toBe(0)
  })

  it('uses the most recent history entry on or before the week date', () => {
    const expense = {
      history: [
        { effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] },
        { effectiveFrom: '2026-04-01', weekly: [200, 200, 200, 200] },
      ],
    }
    expect(getEffectiveAmount(expense, new Date(2026, 2, 15), 0)).toBe(100) // March → first entry
    expect(getEffectiveAmount(expense, new Date(2026, 3, 15), 1)).toBe(200) // April → second entry
  })

  it('returns the phase-specific weekly amount from the matching history entry', () => {
    const expense = {
      history: [{ effectiveFrom: '2026-01-05', weekly: [50, 125, 125, 125] }],
    }
    expect(getEffectiveAmount(expense, new Date(2026, 0, 5), 0)).toBe(50)   // Q1
    expect(getEffectiveAmount(expense, new Date(2026, 3, 1), 1)).toBe(125)  // Q2
  })

  it('returns 0 when all history entries are after the week date', () => {
    const expense = {
      history: [{ effectiveFrom: '2026-06-01', weekly: [100, 100, 100, 100] }],
    }
    expect(getEffectiveAmount(expense, new Date(2026, 0, 5), 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// computeRemainingSpend
// ─────────────────────────────────────────────────────────────

describe('computeRemainingSpend', () => {
  it('returns zeros when futureWeeks is empty', () => {
    const result = computeRemainingSpend([], [])
    expect(result.totalRemainingSpend).toBe(0)
    expect(result.avgWeeklySpend).toBe(0)
    expect(result.weekCount).toBe(0)
  })

  it('sums expense amounts across all future weeks', () => {
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
    ]
    const futureWeeks = [
      { weekEnd: new Date(2026, 0, 12), idx: 1 },
      { weekEnd: new Date(2026, 0, 19), idx: 2 },
    ]
    const result = computeRemainingSpend(expenses, futureWeeks)
    expect(result.totalRemainingSpend).toBeCloseTo(200)
    expect(result.avgWeeklySpend).toBeCloseTo(100)
    expect(result.weekCount).toBe(2)
  })

  it('excludes Transfers category from spend totals', () => {
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
      { category: 'Transfers', history: [{ effectiveFrom: '2026-01-05', weekly: [125, 125, 125, 125] }] },
    ]
    const futureWeeks = [{ weekEnd: new Date(2026, 0, 12), idx: 1 }]
    const result = computeRemainingSpend(expenses, futureWeeks)
    expect(result.totalRemainingSpend).toBeCloseTo(100)
  })
})

// ─────────────────────────────────────────────────────────────
// computeGoalTimeline
// ─────────────────────────────────────────────────────────────

describe('computeGoalTimeline', () => {
  it('returns goals with sW=0, eW=0, wN=0 when no future weeks', () => {
    const goals = [{ id: 'g1', target: 1000, label: 'Test' }]
    const result = computeGoalTimeline(goals, [], [], [], 0, 0)
    expect(result[0]).toMatchObject({ sW: 0, eW: 0, wN: 0 })
  })

  it('returns empty array when no active goals', () => {
    expect(computeGoalTimeline([], [], [], [], 0, 0)).toHaveLength(0)
  })

  it('produces a finite completion week when surplus is available', () => {
    const goals = [{ id: 'g1', target: 300, label: 'Test' }]
    const futureWeeks = Array.from({ length: 20 }, (_, i) => ({
      idx: i + 1,
      weekEnd: new Date(2026, 3, (i + 1) * 7),
    }))
    const weeklyNets = Array(20).fill(400)
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
    ]
    const result = computeGoalTimeline(goals, futureWeeks, weeklyNets, expenses, 0, 0)
    expect(result[0].eW).not.toBeNull()
    expect(result[0].wN).toBeGreaterThan(0)
  })

  it('funds goals in priority order — second goal starts after first completes', () => {
    const goals = [
      { id: 'g1', target: 300, label: 'First' },
      { id: 'g2', target: 300, label: 'Second' },
    ]
    const futureWeeks = Array.from({ length: 20 }, (_, i) => ({
      idx: i + 1,
      weekEnd: new Date(2026, 3, (i + 1) * 7),
    }))
    const weeklyNets = Array(20).fill(400)
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
    ]
    const result = computeGoalTimeline(goals, futureWeeks, weeklyNets, expenses, 0, 0)
    if (result[0].eW !== null && result[1].sW !== null) {
      expect(result[1].sW).toBeGreaterThanOrEqual(Math.floor(result[0].eW))
    }
  })
})

// ─────────────────────────────────────────────────────────────
// loanWeeklyAmount
// ─────────────────────────────────────────────────────────────

describe('loanWeeklyAmount', () => {
  it('returns payment as-is for weekly frequency', () => {
    expect(loanWeeklyAmount({ paymentAmount: 100, paymentFrequency: 'weekly' })).toBe(100)
  })

  it('halves payment for biweekly frequency', () => {
    expect(loanWeeklyAmount({ paymentAmount: 200, paymentFrequency: 'biweekly' })).toBe(100)
  })

  it('converts monthly payment to weekly equivalent (× 12 / 52)', () => {
    expect(loanWeeklyAmount({ paymentAmount: 520, paymentFrequency: 'monthly' })).toBeCloseTo(120)
  })

  it('defaults to weekly when no frequency specified', () => {
    expect(loanWeeklyAmount({ paymentAmount: 75 })).toBe(75)
  })

  it('returns 0 when no payment amount provided', () => {
    expect(loanWeeklyAmount({ paymentFrequency: 'weekly' })).toBe(0)
  })

  it('supports legacy paymentPerCheck field', () => {
    expect(loanWeeklyAmount({ paymentPerCheck: 100, paymentFrequency: 'weekly' })).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────
// computeLoanPayoffDate
// ─────────────────────────────────────────────────────────────

describe('computeLoanPayoffDate', () => {
  const baseLoan = {
    totalAmount: 1000,
    paymentAmount: 100,
    paymentFrequency: 'weekly',
    firstPaymentDate: '2026-02-01',
  }

  it('returns a date after firstPaymentDate', () => {
    expect(computeLoanPayoffDate(baseLoan) > baseLoan.firstPaymentDate).toBe(true)
  })

  it('returns correct payoff date for 10 weekly payments of $100 on $1000 loan', () => {
    // 10 payments × 7 days = 70 days from 2026-02-01 = 2026-04-12
    expect(computeLoanPayoffDate(baseLoan)).toBe('2026-04-12')
  })

  it('returns firstPaymentDate when paymentAmount is 0 (no payments)', () => {
    expect(computeLoanPayoffDate({ ...baseLoan, paymentAmount: 0 })).toBe('2026-02-01')
  })
})

// ─────────────────────────────────────────────────────────────
// buildLoanHistory
// ─────────────────────────────────────────────────────────────

describe('buildLoanHistory', () => {
  const loan = {
    totalAmount: 1000,
    paymentAmount: 100,
    paymentFrequency: 'weekly',
    firstPaymentDate: '2026-03-01',
  }

  it('returns exactly 2 history entries', () => {
    expect(buildLoanHistory(loan)).toHaveLength(2)
  })

  it('first entry has the weekly loan amount in all 4 quarters', () => {
    const history = buildLoanHistory(loan)
    const weekly = loanWeeklyAmount(loan)
    expect(history[0].weekly).toEqual([weekly, weekly, weekly, weekly])
  })

  it('second entry zeroes out the amount in all 4 quarters (after payoff)', () => {
    expect(buildLoanHistory(loan)[1].weekly).toEqual([0, 0, 0, 0])
  })

  it('first entry effectiveFrom is before firstPaymentDate (runway starts early)', () => {
    const history = buildLoanHistory(loan)
    expect(history[0].effectiveFrom < loan.firstPaymentDate).toBe(true)
  })

  it('second entry effectiveFrom matches computeLoanPayoffDate', () => {
    const history = buildLoanHistory(loan)
    expect(history[1].effectiveFrom).toBe(computeLoanPayoffDate(loan))
  })
})

// ─────────────────────────────────────────────────────────────
// loanPaymentsRemaining
// ─────────────────────────────────────────────────────────────

describe('loanPaymentsRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 22)) // March 22, 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when today is on or after payoff date', () => {
    const paidLoan = {
      totalAmount: 100,
      paymentAmount: 100,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-01-01',
    }
    expect(loanPaymentsRemaining(paidLoan)).toBe(0)
  })

  it('returns total payments when today is before firstPaymentDate', () => {
    const futureLoan = {
      totalAmount: 1000,
      paymentAmount: 100,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-04-01', // future
    }
    expect(loanPaymentsRemaining(futureLoan)).toBe(10)
  })

  it('returns a reduced count when today is mid-term (hits elapsed calculation path)', () => {
    // Use a long-running loan so today (March 22) is between firstPaymentDate and payoffDate.
    // 52 weekly payments from 2026-01-01 → payoff ≈ 2026-12-31; March 22 is ~11 payments in.
    const activeLoan = {
      totalAmount: 5200,
      paymentAmount: 100,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-01-01',
    }
    const remaining = loanPaymentsRemaining(activeLoan)
    // 52 total - 11 elapsed ≈ 41 remaining
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThan(52)
  })

  it('returns total payment count when today is before firstPaymentDate', () => {
    vi.setSystemTime(new Date(2026, 0, 1)) // Jan 1 — before firstPaymentDate
    const loan = {
      totalAmount: 1000,
      paymentAmount: 100,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-06-01',
    }
    expect(loanPaymentsRemaining(loan)).toBe(10) // ceil(1000/100)
  })
})

// ─────────────────────────────────────────────────────────────
// computeBucketModel
// ─────────────────────────────────────────────────────────────

describe('computeBucketModel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 22)) // March 22, 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes February as the only completed month when today is March 22', () => {
    const result = computeBucketModel([], DEFAULT_CONFIG)
    expect(result.monthHistory).toHaveLength(1)
    expect(result.monthHistory[0].month).toBe('2026-02')
  })

  it('awards 18h bonus and 0 deduction for a month with no missed unapproved hours', () => {
    const feb = computeBucketModel([], DEFAULT_CONFIG).monthHistory[0]
    expect(feb.bonus).toBe(18)
    expect(feb.deduction).toBe(0)
  })

  it('carries opening balance from cfg.bucketStartBalance into the first month', () => {
    const feb = computeBucketModel([], DEFAULT_CONFIG).monthHistory[0]
    expect(feb.openingBalance).toBe(DEFAULT_CONFIG.bucketStartBalance) // 64
    expect(feb.closingBalance).toBe(82) // 64 + 18
  })

  it('awards 12h bonus for a month with 1–12 missed unapproved hours', () => {
    const logs = [{ type: 'missed_unapproved', weekEnd: '2026-02-15', hoursLost: 8 }]
    const feb = computeBucketModel(logs, DEFAULT_CONFIG).monthHistory[0]
    expect(feb.bonus).toBe(12)
    expect(feb.deduction).toBe(8)
  })

  it('awards 6h bonus for a month with 13–24 missed unapproved hours', () => {
    const logs = [{ type: 'missed_unapproved', weekEnd: '2026-02-15', hoursLost: 20 }]
    const feb = computeBucketModel(logs, DEFAULT_CONFIG).monthHistory[0]
    expect(feb.bonus).toBe(6)
    expect(feb.deduction).toBe(20)
  })

  it('awards 0h bonus for a month with more than 24 missed unapproved hours', () => {
    const logs = [{ type: 'missed_unapproved', weekEnd: '2026-02-15', hoursLost: 30 }]
    const feb = computeBucketModel(logs, DEFAULT_CONFIG).monthHistory[0]
    expect(feb.bonus).toBe(0)
    expect(feb.deduction).toBe(30)
  })

  it('triggers overflow payout when closing balance would exceed cap (128h)', () => {
    const highCfg = { ...DEFAULT_CONFIG, bucketStartBalance: 120 }
    const feb = computeBucketModel([], highCfg).monthHistory[0]
    // 120 + 18 = 138; overflow = 10; closingBalance = 128
    expect(feb.overflow).toBe(10)
    expect(feb.closingBalance).toBe(128)
    expect(feb.payout).toBeCloseTo(10 * DEFAULT_CONFIG.bucketPayoutRate)
  })

  it('sets currentBalance to balance after all completed months', () => {
    const result = computeBucketModel([], DEFAULT_CONFIG)
    expect(result.currentBalance).toBe(82) // 64 + 18
  })

  it('status is "safe" when currentBalance >= 48', () => {
    const result = computeBucketModel([], DEFAULT_CONFIG) // currentBalance = 82
    expect(result.status).toBe('safe')
  })

  it('status is "caution" when 12 <= currentBalance < 48', () => {
    // Start at 0, no violations: Feb closes at 18 (12 <= 18 < 48)
    const result = computeBucketModel([], { ...DEFAULT_CONFIG, bucketStartBalance: 0 })
    expect(result.currentBalance).toBe(18)
    expect(result.status).toBe('caution')
  })

  it('status is "critical" when currentBalance < 12', () => {
    // Start at 0, 30h unapproved in Feb: 0 + 0 - 30 = -30
    const logs = [{ type: 'missed_unapproved', weekEnd: '2026-02-15', hoursLost: 30 }]
    const result = computeBucketModel(logs, { ...DEFAULT_CONFIG, bucketStartBalance: 0 })
    expect(result.currentBalance).toBe(-30)
    expect(result.status).toBe('critical')
  })

  it('only missed_unapproved events affect bucket deductions', () => {
    const mixedLogs = [
      { type: 'missed_unpaid', weekEnd: '2026-02-15', hoursLost: 12 },
      { type: 'pto', weekEnd: '2026-02-15', ptoHours: 12 },
    ]
    const withLogs = computeBucketModel(mixedLogs, DEFAULT_CONFIG)
    const withoutLogs = computeBucketModel([], DEFAULT_CONFIG)
    expect(withLogs.monthHistory[0].deduction).toBe(withoutLogs.monthHistory[0].deduction)
  })

  it('projects future months assuming perfect attendance', () => {
    const result = computeBucketModel([], DEFAULT_CONFIG)
    result.projectedHistory.forEach(m => {
      expect(m.bonus).toBe(18)
      expect(m.deduction).toBe(0)
      expect(m.projected).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// calcEventImpact
// ─────────────────────────────────────────────────────────────

describe('calcEventImpact', () => {
  const cfg = DEFAULT_CONFIG

  // Helpers
  const makeEvent = (overrides) => ({
    type: 'other_loss',
    weekRotation: '4-Day',
    weekIdx: 5,
    weekEnd: '2026-02-02',
    amount: 0,
    shiftsLost: 0,
    weekendShifts: 0,
    ptoHours: 0,
    hoursLost: 0,
    ...overrides,
  })

  describe('missed_unpaid', () => {
    it('calculates grossLost > 0 when shifts are lost', () => {
      const event = makeEvent({ type: 'missed_unpaid', weekRotation: '6-Day', weekIdx: 10, weekEnd: '2026-03-16', shiftsLost: 3 })
      expect(calcEventImpact(event, cfg).grossLost).toBeGreaterThan(0)
    })

    it('returns grossLost = 0 when no shifts are lost', () => {
      const event = makeEvent({ type: 'missed_unpaid', weekRotation: '4-Day', weekIdx: 5, weekEnd: '2026-02-09' })
      expect(calcEventImpact(event, cfg).grossLost).toBe(0)
    })

    it('bucketHoursDeducted is 0 (approved absence does not hit bucket)', () => {
      const event = makeEvent({ type: 'missed_unpaid', weekRotation: '6-Day', weekIdx: 10, weekEnd: '2026-03-16', shiftsLost: 1 })
      expect(calcEventImpact(event, cfg).bucketHoursDeducted).toBe(0)
    })

    it('grossGained is 0', () => {
      const event = makeEvent({ type: 'missed_unpaid', weekRotation: '6-Day', weekIdx: 10, weekEnd: '2026-03-16', shiftsLost: 1 })
      expect(calcEventImpact(event, cfg).grossGained).toBe(0)
    })
  })

  describe('missed_unapproved', () => {
    it('calculates grossLost = hoursLost × baseRate', () => {
      const event = makeEvent({ type: 'missed_unapproved', weekEnd: '2026-02-02', hoursLost: 12 })
      expect(calcEventImpact(event, cfg).grossLost).toBeCloseTo(12 * cfg.baseRate)
    })

    it('sets bucketHoursDeducted = hoursLost', () => {
      const event = makeEvent({ type: 'missed_unapproved', weekEnd: '2026-02-02', hoursLost: 12 })
      expect(calcEventImpact(event, cfg).bucketHoursDeducted).toBe(12)
    })
  })

  describe('pto', () => {
    it('returns non-negative grossLost (opportunity cost of PTO vs base pay)', () => {
      const event = makeEvent({ type: 'pto', weekRotation: '6-Day', weekEnd: '2026-02-02', ptoHours: 12 })
      expect(calcEventImpact(event, cfg).grossLost).toBeGreaterThanOrEqual(0)
    })

    it('bucketHoursDeducted is 0 for PTO events', () => {
      const event = makeEvent({ type: 'pto', weekRotation: '6-Day', weekEnd: '2026-02-02', ptoHours: 12 })
      expect(calcEventImpact(event, cfg).bucketHoursDeducted).toBe(0)
    })
  })

  describe('partial', () => {
    it('calculates grossLost = hoursLost × baseRate', () => {
      const event = makeEvent({ type: 'partial', weekEnd: '2026-02-02', hoursLost: 6 })
      expect(calcEventImpact(event, cfg).grossLost).toBeCloseTo(6 * cfg.baseRate)
    })

    it('bucketHoursDeducted is 0 for partial shifts', () => {
      const event = makeEvent({ type: 'partial', weekEnd: '2026-02-02', hoursLost: 6 })
      expect(calcEventImpact(event, cfg).bucketHoursDeducted).toBe(0)
    })
  })

  describe('bonus', () => {
    it('returns grossGained = amount, grossLost = 0', () => {
      const event = makeEvent({ type: 'bonus', weekEnd: '2026-02-02', amount: 500 })
      const result = calcEventImpact(event, cfg)
      expect(result.grossGained).toBe(500)
      expect(result.grossLost).toBe(0)
    })
  })

  describe('other_loss', () => {
    it('returns grossLost = amount', () => {
      const event = makeEvent({ type: 'other_loss', weekEnd: '2026-02-02', amount: 200 })
      expect(calcEventImpact(event, cfg).grossLost).toBe(200)
    })
  })

  describe('tax calculation', () => {
    it('applies only FICA rate on non-taxed weeks', () => {
      // weekIdx=5 is not in taxedWeeks
      const event = makeEvent({ type: 'other_loss', weekIdx: 5, weekEnd: '2026-02-02', amount: 100 })
      const result = calcEventImpact(event, cfg)
      expect(result.netLost).toBeCloseTo(100 * (1 - cfg.ficaRate))
    })

    it('applies FICA + w1 (4-Day) withholding rates on taxed weeks', () => {
      // weekIdx=7 is a taxed week; weekRotation='4-Day' uses w1 rates
      const event = makeEvent({ type: 'other_loss', weekRotation: '4-Day', weekIdx: 7, weekEnd: '2026-02-23', amount: 100 })
      const effectiveRate = cfg.ficaRate + cfg.w1FedRate + cfg.w1StateRate
      expect(calcEventImpact(event, cfg).netLost).toBeCloseTo(100 * (1 - effectiveRate))
    })

    it('applies FICA + w2 (6-Day) withholding rates on taxed 6-Day weeks', () => {
      const event = makeEvent({ type: 'other_loss', weekRotation: '6-Day', weekIdx: 8, weekEnd: '2026-02-23', amount: 100 })
      const effectiveRate = cfg.ficaRate + cfg.w2FedRate + cfg.w2StateRate
      expect(calcEventImpact(event, cfg).netLost).toBeCloseTo(100 * (1 - effectiveRate))
    })
  })

  describe('401k impact', () => {
    it('k401kLost and k401kMatchLost are 0 for events before k401StartDate', () => {
      const event = makeEvent({ type: 'other_loss', weekEnd: '2026-02-02', amount: 100 })
      const result = calcEventImpact(event, cfg)
      expect(result.k401kLost).toBe(0)
      expect(result.k401kMatchLost).toBe(0)
    })

    it('calculates k401kLost and k401kMatchLost for events after k401StartDate', () => {
      const event = makeEvent({ type: 'other_loss', weekIdx: 25, weekEnd: '2026-07-20', amount: 100 })
      const result = calcEventImpact(event, cfg)
      expect(result.k401kLost).toBeCloseTo(100 * cfg.k401Rate)
      expect(result.k401kMatchLost).toBeCloseTo(100 * cfg.k401MatchRate)
    })

    it('calculates k401kGained for bonus events after k401StartDate', () => {
      const event = makeEvent({ type: 'bonus', weekIdx: 25, weekEnd: '2026-07-20', amount: 500 })
      const result = calcEventImpact(event, cfg)
      expect(result.k401kGained).toBeCloseTo(500 * cfg.k401Rate)
      expect(result.k401kMatchGained).toBeCloseTo(500 * cfg.k401MatchRate)
    })
  })

  describe('legacy rotation string', () => {
    it('"Week 2" rotation string is treated the same as "6-Day"', () => {
      const legacyEvent = makeEvent({ type: 'bonus', weekRotation: 'Week 2', weekEnd: '2026-02-02', amount: 100 })
      const newEvent = makeEvent({ type: 'bonus', weekRotation: '6-Day', weekEnd: '2026-02-02', amount: 100 })
      expect(calcEventImpact(legacyEvent, cfg).grossGained).toBe(calcEventImpact(newEvent, cfg).grossGained)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// toLocalIso
// ─────────────────────────────────────────────────────────────
describe('toLocalIso', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = toLocalIso(new Date(2026, 0, 5))
    expect(result).toBe('2026-01-05')
  })

  it('zero-pads single-digit month and day', () => {
    expect(toLocalIso(new Date(2026, 2, 4))).toBe('2026-03-04')  // March 4
    expect(toLocalIso(new Date(2026, 9, 1))).toBe('2026-10-01')  // Oct 1
  })

  it('handles year-end boundary', () => {
    expect(toLocalIso(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('handles fiscal year start (2026-01-05)', () => {
    expect(toLocalIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

// ─────────────────────────────────────────────────────────────
// stateTax
// ─────────────────────────────────────────────────────────────
describe('stateTax', () => {
  it('returns 0 for a NONE-model state (TX)', () => {
    const cfg = STATE_TAX_TABLE['TX']
    expect(stateTax(50000, cfg)).toBe(0)
  })

  it('returns 0 for null stateConfig', () => {
    expect(stateTax(50000, null)).toBe(0)
  })

  it('returns 0 for undefined stateConfig', () => {
    expect(stateTax(50000, undefined)).toBe(0)
  })

  it('calculates progressive tax correctly for MO (top marginal 4.7%)', () => {
    const cfg = STATE_TAX_TABLE['MO']
    expect(cfg.model).toBe('PROGRESSIVE')
    // MO 2025 bracket math:
    // 0-1273: 0%
    // 1273-2546: 2%
    // 2546-3819: 2.5%
    // 3819-5092: 3%
    // 5092-6365: 3.5%
    // 6365-7638: 4%
    // 7638-8911: 4.5%
    // 8911+: 4.7%
    const expected =
      (2546 - 1273) * 0.02 +
      (3819 - 2546) * 0.025 +
      (5092 - 3819) * 0.03 +
      (6365 - 5092) * 0.035 +
      (7638 - 6365) * 0.04 +
      (8911 - 7638) * 0.045 +
      (50000 - 8911) * 0.047
    expect(stateTax(50000, cfg)).toBeCloseTo(expected, 5)
  })

  it('flat tax: zero income returns 0', () => {
    expect(stateTax(0, STATE_TAX_TABLE['IL'])).toBe(0)
  })

  it('calculates progressive tax within first bracket (AL — $400 @ 2%)', () => {
    const cfg = STATE_TAX_TABLE['AL']
    expect(cfg.model).toBe('PROGRESSIVE')
    expect(stateTax(400, cfg)).toBeCloseTo(400 * 0.02, 5)
  })

  it('calculates progressive tax spanning multiple brackets (AL — $5000)', () => {
    // AL: [0–500 @ 2%, 500–3000 @ 4%, 3000+ @ 5%]
    // 500*0.02 + 2500*0.04 + 2000*0.05 = 10 + 100 + 100 = 210
    const cfg = STATE_TAX_TABLE['AL']
    expect(stateTax(5000, cfg)).toBeCloseTo(210, 5)
  })

  it('progressive zero income returns 0', () => {
    expect(stateTax(0, STATE_TAX_TABLE['CA'])).toBe(0)
  })

  it('result is always non-negative for all 50 states', () => {
    for (const cfg of Object.values(STATE_TAX_TABLE)) {
      expect(stateTax(40000, cfg)).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns 0 for unknown model string (defensive fallback branch)', () => {
    expect(stateTax(50000, { model: 'CUSTOM_UNKNOWN' })).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// getStateConfig
// ─────────────────────────────────────────────────────────────
describe('getStateConfig', () => {
  it('returns the correct config for a known state (MO)', () => {
    const cfg = getStateConfig('MO')
    expect(cfg).toBe(STATE_TAX_TABLE['MO'])
    expect(cfg.model).toBe('PROGRESSIVE')
  })

  it('returns a config with a model field for common states', () => {
    for (const code of ['TX', 'CA', 'IL', 'AL', 'MO', 'FL', 'NY']) {
      const cfg = getStateConfig(code)
      expect(cfg).toHaveProperty('model')
    }
  })

  it('falls back to MO for an unknown state code', () => {
    expect(getStateConfig('XX')).toBe(STATE_TAX_TABLE['MO'])
  })

  it('falls back to MO for undefined', () => {
    expect(getStateConfig(undefined)).toBe(STATE_TAX_TABLE['MO'])
  })

  it('returns a NONE config for no-income-tax states', () => {
    expect(getStateConfig('FL').model).toBe('NONE')
    expect(getStateConfig('TX').model).toBe('NONE')
  })
})

// ─────────────────────────────────────────────────────────────
// loanRunwayStartDate
// ─────────────────────────────────────────────────────────────
describe('loanRunwayStartDate', () => {
  const baseLoan = {
    totalAmount: 5000,
    paymentAmount: 200,
    firstPaymentDate: '2026-06-01',
  }

  it('weekly frequency → 7 days before firstPaymentDate', () => {
    const loan = { ...baseLoan, paymentFrequency: 'weekly' }
    expect(loanRunwayStartDate(loan)).toBe('2026-05-25')
  })

  it('biweekly frequency → 14 days before firstPaymentDate', () => {
    const loan = { ...baseLoan, paymentFrequency: 'biweekly' }
    expect(loanRunwayStartDate(loan)).toBe('2026-05-18')
  })

  it('monthly frequency → ~30 days before firstPaymentDate', () => {
    const loan = { ...baseLoan, paymentFrequency: 'monthly' }
    expect(loanRunwayStartDate(loan)).toBe('2026-05-02')
  })

  it('defaults to weekly (7 days) when no paymentFrequency provided', () => {
    expect(loanRunwayStartDate({ ...baseLoan })).toBe('2026-05-25')
  })

  it('returns a valid ISO date string', () => {
    const result = loanRunwayStartDate({ ...baseLoan, paymentFrequency: 'weekly' })
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('start date is strictly before firstPaymentDate', () => {
    const result = loanRunwayStartDate({ ...baseLoan, paymentFrequency: 'weekly' })
    expect(result < baseLoan.firstPaymentDate).toBe(true)
  })
})
