import { describe, it, expect } from 'vitest'
import { estimateGoalNextYear, getGoalProjectionHorizonDate, GOAL_PROJECTION_HORIZON_YEARS, projectedGross, toLocalIso, buildYear, computeNet } from '../../lib/finance.js'
import { DEFAULT_CONFIG, FISCAL_YEAR_START } from '../../constants/config.js'

// Base-user config with round numbers so the expected net is hand-derivable:
//   gross = 40h × $20 = $800
//   fica  = 800 × 0.0765 = $61.20
//   fed   = 800 × 0.10   = $80    (taxable = gross, no benefits / 401k)
//   state = 800 × 0.05   = $40
//   net   = 800 − 61.20 − 80 − 40 = $618.80
const BASE_CFG = {
  ...DEFAULT_CONFIG,
  employerPreset: null,
  customWeeklyHours: 40,
  baseRate: 20,
  otThreshold: 40,
  otMultiplier: 1.5,
  nightDiffEnabled: false,
  k401Rate: 0,
  ficaRate: 0.0765,
  fedRateLow: 0.10, fedRateHigh: 0.10,
  stateRateLow: 0.05, stateRateHigh: 0.05,
  selectedBenefits: [],
  otherDeductions: [],
}

const EXPECTED_BASE_NET = 618.8

describe('estimateGoalNextYear — input validation', () => {
  it('returns null for non-positive or non-finite remaining amounts', () => {
    expect(estimateGoalNextYear(0, BASE_CFG, [])).toBeNull()
    expect(estimateGoalNextYear(-500, BASE_CFG, [])).toBeNull()
    expect(estimateGoalNextYear(NaN, BASE_CFG, [])).toBeNull()
    expect(estimateGoalNextYear(Infinity, BASE_CFG, [])).toBeNull()
  })

  it('returns null when cfg is missing', () => {
    expect(estimateGoalNextYear(1000, null, [])).toBeNull()
  })

  it('returns null when weekly surplus is non-positive', () => {
    const hugeExpense = [{ weekly: [700, 700, 700, 700] }] // > $618.80 net
    expect(estimateGoalNextYear(1000, BASE_CFG, hugeExpense)).toBeNull()
  })
})

describe('estimateGoalNextYear — base user projection', () => {
  it('computes weekly net from gross minus fica, taxes, and deductions', () => {
    const r = estimateGoalNextYear(1000, BASE_CFG, [])
    expect(r.weeklyNet).toBeCloseTo(EXPECTED_BASE_NET, 2)
    expect(r.weeklyExpenses).toBe(0)
    expect(r.weeklySurplus).toBeCloseTo(EXPECTED_BASE_NET, 2)
  })

  it('projects the completion date from the next fiscal year start', () => {
    // $1,000 / $618.80 → ceil = 2 weeks after next FY start
    const r = estimateGoalNextYear(1000, BASE_CFG, [])
    expect(r.weeksFromFYStart).toBe(2)
    const [fy, fm, fd] = FISCAL_YEAR_START.split('-').map(Number)
    const expected = new Date(fy + 1, fm - 1, fd + 14)
    expect(toLocalIso(r.estDate)).toBe(toLocalIso(expected))
    expect(r.label).toMatch(/'2\d$/) // spill-over month label carries a year suffix
  })

  it('rounds weeks needed up (partial weeks count as a full week)', () => {
    // 618.80 × 3 = 1856.40 → $1,857 needs 4 weeks
    expect(estimateGoalNextYear(1857, BASE_CFG, []).weeksFromFYStart).toBe(4)
    expect(estimateGoalNextYear(1856, BASE_CFG, []).weeksFromFYStart).toBe(3)
  })

  it('401k contributions reduce net and taxable gross', () => {
    // k401 = 800×0.05 = 40; taxable = 760 → fed 76, st 38
    // net = 800 − 61.20 − 76 − 38 − 40 = 584.80
    const r = estimateGoalNextYear(1000, { ...BASE_CFG, k401Rate: 0.05 }, [])
    expect(r.weeklyNet).toBeCloseTo(584.8, 2)
  })
})

describe('estimateGoalNextYear — weeklyLogAdjustment (logged Bonus/Extra Pay, Tips/Commission, losses)', () => {
  it('defaults to 0 — omitting it leaves weeklySurplus unaffected (back-compat)', () => {
    const r = estimateGoalNextYear(1000, BASE_CFG, [])
    expect(r.weeklySurplus).toBeCloseTo(EXPECTED_BASE_NET, 2)
  })

  it('adds a positive per-week adjustment (e.g. a logged bonus smeared across the year) to weeklySurplus', () => {
    // A $600 bonus netting ~$554 smeared over a 53-week fiscal year ≈ $10.45/week
    const weeklyLogAdjustment = 554.10 / 53
    const remaining = 20000 // large enough that +$10.45/week measurably shortens the ETA
    const r = estimateGoalNextYear(remaining, BASE_CFG, [], new Date(), weeklyLogAdjustment)
    expect(r.weeklySurplus).toBeCloseTo(EXPECTED_BASE_NET + weeklyLogAdjustment, 2)
    // The extra surplus must actually move the ETA sooner, not just tag along unused.
    const withoutBonus = estimateGoalNextYear(remaining, BASE_CFG, [])
    expect(r.weeksFromFYStart).toBeLessThan(withoutBonus.weeksFromFYStart)
  })

  it('a negative adjustment (net logged losses) reduces weeklySurplus and can push the goal past horizon', () => {
    const r = estimateGoalNextYear(1000, BASE_CFG, [], new Date(), -EXPECTED_BASE_NET)
    // Surplus driven to (near) zero or negative → unfundable, same as any other
    // non-positive-surplus case.
    expect(r === null || r.weeklySurplus <= 0.01).toBe(true)
  })
})

describe('estimateGoalNextYear — expense proxy (Q4 vs December)', () => {
  it('subtracts the Q4 weekly expense total from net', () => {
    const expenses = [{ weekly: [0, 0, 0, 100] }, { weekly: [50, 50, 50, 25] }]
    const r = estimateGoalNextYear(1000, BASE_CFG, expenses)
    expect(r.weeklyExpenses).toBeCloseTo(125, 2)
    expect(r.weeklySurplus).toBeCloseTo(EXPECTED_BASE_NET - 125, 2)
  })

  it('December history entries take priority over the rest of Q4', () => {
    const expenses = [{
      history: [
        { effectiveFrom: FISCAL_YEAR_START, weekly: [100, 100, 100, 100] },
        { effectiveFrom: '2026-12-01', weekly: [100, 100, 100, 150] },
      ],
    }]
    const r = estimateGoalNextYear(1000, BASE_CFG, expenses)
    expect(r.weeklyExpenses).toBeCloseTo(150, 2)
  })

  it('treats missing expenses array as zero expenses', () => {
    const r = estimateGoalNextYear(1000, BASE_CFG, undefined)
    expect(r.weeklyExpenses).toBe(0)
  })
})

describe('getGoalProjectionHorizonDate — rolling 5-year cutoff', () => {
  it('is exactly today + GOAL_PROJECTION_HORIZON_YEARS years', () => {
    const today = new Date(2026, 7, 28) // Aug 28, 2026
    const horizon = getGoalProjectionHorizonDate(today)
    expect(horizon.getFullYear()).toBe(2026 + GOAL_PROJECTION_HORIZON_YEARS)
    expect(horizon.getMonth()).toBe(7)
    expect(horizon.getDate()).toBe(28)
  })

  it('advances by exactly one day for every real day that passes (rolling window)', () => {
    const today = new Date(2026, 7, 28)
    const tomorrow = new Date(2026, 7, 29)
    const horizonToday = getGoalProjectionHorizonDate(today)
    const horizonTomorrow = getGoalProjectionHorizonDate(tomorrow)
    const diffDays = (horizonTomorrow - horizonToday) / (24 * 60 * 60 * 1000)
    expect(diffDays).toBe(1)
  })

  it('defaults to the real current date when no argument is passed', () => {
    const before = new Date()
    const horizon = getGoalProjectionHorizonDate()
    const after = new Date()
    expect(horizon.getTime()).toBeGreaterThanOrEqual(getGoalProjectionHorizonDate(before).getTime())
    expect(horizon.getTime()).toBeLessThanOrEqual(getGoalProjectionHorizonDate(after).getTime())
  })
})

describe('estimateGoalNextYear — 5-year projection horizon', () => {
  it('flags a near-term estimate as within horizon', () => {
    // $1,000 / $618.80 → completes ~2 weeks into the next fiscal year, always
    // well within 5 years of any realistic "today".
    const r = estimateGoalNextYear(1000, BASE_CFG, [], new Date(2026, 7, 28))
    expect(r.withinHorizon).toBe(true)
    expect(toLocalIso(r.horizonDate)).toBe(toLocalIso(new Date(2031, 7, 28)))
  })

  it('flags a goal whose ETA falls after today + 5 years as beyond horizon', () => {
    // A tiny weekly surplus against a huge remaining amount pushes estDate
    // far past a "today" set close to the estimate's own next-FY start.
    const tinySurplusCfg = { ...BASE_CFG, customWeeklyHours: 1, baseRate: 1 }
    const r = estimateGoalNextYear(1_000_000, tinySurplusCfg, [], new Date(2026, 7, 28))
    expect(r).not.toBeNull()
    expect(r.withinHorizon).toBe(false)
  })

  it('the horizon is anchored to the passed-in today, not a fixed date', () => {
    const nearTermToday = new Date(2026, 7, 28)  // horizon: Aug 2031
    const farFutureToday = new Date(2040, 7, 28) // horizon: Aug 2045 — comfortably covers the same estDate
    const r1 = estimateGoalNextYear(1000, BASE_CFG, [], nearTermToday)
    const r2 = estimateGoalNextYear(1000, BASE_CFG, [], farFutureToday)
    expect(r1.withinHorizon).toBe(true)
    expect(r2.withinHorizon).toBe(true)
    expect(r1.horizonDate.getTime()).toBeLessThan(r2.horizonDate.getTime())
  })
})

describe('estimateGoalNextYear — DHL long/short averaging', () => {
  it('averages the long (high-rate) and short (low-rate) week nets', () => {
    const cfg = {
      ...BASE_CFG,
      employerPreset: 'DHL',
      dhlTeam: 'B',
      dhlCustomSchedule: false,
      customWeeklyHours: null,
      fedRateHigh: 0.12,
      stateRateHigh: 0.06,
    }
    const r = estimateGoalNextYear(1000, cfg, [])
    // Recompute both week nets with the same formula the estimator documents.
    const weekNet = (gross, fed, st) => {
      const fica = gross * cfg.ficaRate
      return gross - fica - gross * fed - gross * st
    }
    const longNet = weekNet(projectedGross(true, cfg), cfg.fedRateHigh, cfg.stateRateHigh)
    const shortNet = weekNet(projectedGross(false, cfg), cfg.fedRateLow, cfg.stateRateLow)
    expect(r.weeklyNet).toBeCloseTo((longNet + shortNet) / 2, 2)
  })
})

// DW-W6 drift tripwire (added 2026-08-24): estimateGoalNextYear's weekNet() is a
// second, hand-derived copy of computeNet's deduction stack — by design it omits
// extraPerCheck (the Tax Plan withholding-gap correction), freedomAllowancePerWeek
// (the spendable buffer, subtracted by callers, not by computeNet itself), and
// unemploymentIncome. None of those three apply when extraPerCheck is 0, no
// freedom-allowance subtraction is involved, and the week isn't a job-loss week —
// so on that common ground, estimateGoalNextYear's weeklyNet MUST exactly match
// computeNet's real output for the same config. This doesn't remove the
// documented simplifications (still real, still open per DW-W6) — it exists so
// a future change to computeNet's deduction stack (payroll deductions, tax
// formula, otherPostTaxDeductions) that ISN'T mirrored in estimateGoalNextYear's
// local weekNet() fails a test immediately, instead of silently desyncing the
// two formulas until a user notices a wrong goal ETA.
describe('estimateGoalNextYear — cross-check against computeNet (DW-W6 drift tripwire)', () => {
  it('base-user weeklyNet matches computeNet on the same config, with no tax-gap/unemployment involved', () => {
    const cfg = { ...BASE_CFG, k401Rate: 0.05, selectedBenefits: ['health'], healthPremium: 15 }
    const weeks = buildYear(cfg)
    const realWeek = weeks.find(w => w.active && w.taxedBySchedule)
    expect(realWeek).toBeTruthy()
    // extraPerCheck=0, showExtra=false: the two conditions that make computeNet's
    // output directly comparable to estimateGoalNextYear's (which never applies
    // either the correction or a freedom-allowance subtraction).
    const realNet = computeNet(realWeek, cfg, 0, false)

    const r = estimateGoalNextYear(1000, cfg, [])
    expect(r.weeklyNet).toBeCloseTo(realNet, 2)
  })

  it('DHL long/short averaged weeklyNet matches computeNet on both real weeks', () => {
    const cfg = {
      ...BASE_CFG,
      employerPreset: 'DHL',
      dhlTeam: 'B',
      dhlCustomSchedule: false,
      customWeeklyHours: null,
      k401Rate: 0.06,
      fedRateHigh: 0.12,
      stateRateHigh: 0.06,
    }
    const weeks = buildYear(cfg)
    const longWeek  = weeks.find(w => w.active && w.taxedBySchedule && w.isHighWeek)
    const shortWeek = weeks.find(w => w.active && w.taxedBySchedule && !w.isHighWeek)
    expect(longWeek).toBeTruthy()
    expect(shortWeek).toBeTruthy()
    const realLongNet  = computeNet(longWeek, cfg, 0, false)
    const realShortNet = computeNet(shortWeek, cfg, 0, false)

    const r = estimateGoalNextYear(1000, cfg, [])
    expect(r.weeklyNet).toBeCloseTo((realLongNet + realShortNet) / 2, 2)
  })
})
