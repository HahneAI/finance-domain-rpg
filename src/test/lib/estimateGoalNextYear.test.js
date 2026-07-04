import { describe, it, expect } from 'vitest'
import { estimateGoalNextYear, projectedGross, toLocalIso } from '../../lib/finance.js'
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
