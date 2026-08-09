import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fedTax,
  buildYear,
  computeNet,
  projectedGross,
  getPhaseIndex,
  getEffectiveAmount,
  getEffectiveAmountForMonth,
  phaseIdxForMonth,
  normalizeToMonthlyAmount,
  projectMonthlyNetTakeHome,
  resolveBudgetHealthMonthBoundary,
  computeRemainingSpend,
  computeGoalTimeline,
  loanWeeklyAmount,
  computeLoanPayoffDate,
  buildLoanHistory,
  loanPaymentsRemaining,
  computeBucketModel,
  calcEventImpact,
  resolveEventWeekMeta,
  toLocalIso,
  stateTax,
  getStateConfig,
  loanRunwayStartDate,
  dhlEmployerMatchRate,
  deriveWeeklyPayrollDeductions,
  getWeeklyBudgetBreakdownPayrollDeductions,
  isFutureWeek,
  traceExpenseCalculationSteps,
  resolveBaseRateForWeek,
  resolvePrevWeekNet,
} from '../../lib/finance.js'
import { STATE_TAX_TABLE } from '../../constants/stateTaxTable.js'
import { DEFAULT_CONFIG, DHL_PRESET } from '../../constants/config.js'
import { getCurrentFiscalWeek } from '../../lib/fiscalWeek.js'

// DHL_CONFIG: exercises DHL rotation + customWeeklyHours behavior (the "Anthony tier").
// startingWeekIsLong=false with firstActiveIdx=7 → even idx = long (6-Day).
// customWeeklyHours=60 overrides hours for projection math; rotation days preserved for
// WeekConfirmModal display. requiredOtShifts (schedule-extension shifts to reach the 60h
// target, no mandatory OT): 1 for long weeks (4 core days×12=48h → 1 extra), 2 for short weeks (3 core days×12=36h → 2 extra).
const DHL_CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: "DHL",
  startingWeekIsLong: false,  // false + firstActiveIdx=7 → even idx = long (6-Day)
  dhlTeam: 'B',
  dhlCustomSchedule: false,   // uses B-team preset rotation day arrays
  customWeeklyHours: 60,      // flat 60h/week target; overrides rotation-derived hours
  // Explicit 401k values — test must not depend on DEFAULT_CONFIG personal values
  k401Rate: 0.06,
  k401MatchRate: 0.05,
  k401StartDate: "2026-05-15",
}

const DHL_STANDARD_CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: "DHL",
  dhlTeam: 'B',
  dhlCustomSchedule: false,
  startingWeekIsLong: DHL_PRESET.teams.B.startsLong,
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

  it('all weeks have 60 total hours when customWeeklyHours=60 (overrides rotation hours)', () => {
    const sixDay = weeks.find(w => w.rotation === '6-Day')
    const fourDay = weeks.find(w => w.rotation === '4-Day')
    expect(sixDay.totalHours).toBe(60)
    expect(fourDay.totalHours).toBe(60)
  })

  it('6-Day (long) weeks have 24 weekend hours (Sat + Sun core)', () => {
    // B-team long core rotation: Tue/Wed/Sat/Sun. Sat=12h, Sun=12h, others=0.
    const sixDay = weeks.find(w => w.rotation === '6-Day')
    expect(sixDay.weekendHours).toBe(24)
  })

  it('4-Day (short) weeks have 6 weekend hours (Fri midnight → Sat 6a only)', () => {
    // B-team short core rotation: Mon/Thu/Fri. Fri earns half diff (6h), others=0.
    const fourDay = weeks.find(w => w.rotation === '4-Day')
    expect(fourDay.weekendHours).toBe(6)
  })

  it('6-Day (long) weeks need 1 extension shift; 4-Day (short) weeks need 2 extension shifts (60h target)', () => {
    // Long: 4 core days × 12h = 48h → 1 extra to reach 60h. Short: 3 days × 12h = 36h → 2 extra.
    const sixDay = weeks.find(w => w.rotation === '6-Day')
    const fourDay = weeks.find(w => w.rotation === '4-Day')
    expect(sixDay.requiredOtShifts).toBe(1)
    expect(fourDay.requiredOtShifts).toBe(2)
  })

  it('6-Day active weeks have higher grossPay than 4-Day active weeks', () => {
    const sixDay = weeks.find(w => w.rotation === '6-Day' && w.active)
    const fourDay = weeks.find(w => w.rotation === '4-Day' && w.active)
    expect(sixDay.grossPay).toBeGreaterThan(fourDay.grossPay)
  })

  it('computes correct grossPay for an active 4-Day (short) week with customWeeklyHours=60', () => {
    const cfg = DHL_CONFIG
    // Short B-team rotation: Mon/Thu/Fri/Tue(OT). weekendHours=6h (Fri midnight→Sat 6a).
    // totalHours overridden to 60h. nonWeekendH=54h → all weekend hours push past OT threshold.
    // regWknd=max(0,min(6,40-54))=0h, otWknd=6h.
    const rateReg = cfg.baseRate + cfg.nightDiffRate
    const expected = 40 * rateReg                        // 40 regular hours
                   + 20 * rateReg * cfg.otMultiplier     // 20 OT hours (all non-weekend OT)
                   + 6  * cfg.diffRate * cfg.otMultiplier // 6 OT weekend hours (Fri diff)
    const fourDay = weeks.find(w => w.rotation === '4-Day' && w.active)
    expect(fourDay.grossPay).toBeCloseTo(expected)
  })

  it('computes correct grossPay for an active 6-Day (long) week with customWeeklyHours=60', () => {
    const cfg = DHL_CONFIG
    // Long B-team rotation: Tue/Wed/Sat/Sun/Mon(OT). weekendHours=24h (Sat 12h + Sun 12h).
    // totalHours overridden to 60h. nonWeekendH=36h → regWknd=min(24,40-36)=4h, otWknd=20h.
    const rateReg = cfg.baseRate + cfg.nightDiffRate
    const expected = 40 * rateReg                         // 40 regular hours
                   + 4  * cfg.diffRate                    // 4 regular weekend diff hours
                   + 20 * rateReg * cfg.otMultiplier      // 20 OT hours (non-weekend OT)
                   + 20 * cfg.diffRate * cfg.otMultiplier // 20 OT weekend diff hours
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

  it('exposes payrollDeductions with pre-benefits and post-benefits values', () => {
    const cfg = {
      ...DHL_CONFIG,
      benefitsStartDate: '2026-07-01',
      healthPremium: 40,
      dentalPremium: 10,
      visionPremium: 5,
      ltd: 4,
      stdWeekly: 3,
      lifePremium: 2,
      hsaWeekly: 8,
      fsaWeekly: 6,
      k401Rate: 0,
      k401MatchRate: 0,
      k401StartDate: null,
    }
    const year = buildYear(cfg)
    const preBenefits = year.find(w => w.active && toLocalIso(w.weekEnd) < cfg.benefitsStartDate)
    const postBenefits = year.find(w => w.active && toLocalIso(w.weekEnd) >= cfg.benefitsStartDate)
    const expectedBenefits = 78

    expect(preBenefits.payrollDeductions.benefits).toBe(0)
    expect(preBenefits.payrollDeductions.k401Employee).toBe(0)
    expect(preBenefits.payrollDeductions.total).toBe(0)

    expect(postBenefits.payrollDeductions.benefits).toBeCloseTo(expectedBenefits)
    expect(postBenefits.payrollDeductions.k401Employee).toBe(0)
    expect(postBenefits.payrollDeductions.total).toBeCloseTo(expectedBenefits)
  })

  it('exposes payrollDeductions with pre-401k and post-401k values after activation', () => {
    const year = buildYear(DHL_CONFIG)
    const pre401k = year.find(w => w.active && !w.has401k)
    const post401k = year.find(w => w.active && w.has401k)

    expect(pre401k.payrollDeductions.benefits).toBeCloseTo(pre401k.benefitsDeduction)
    expect(pre401k.payrollDeductions.k401Employee).toBe(0)
    expect(pre401k.payrollDeductions.total).toBeCloseTo(pre401k.benefitsDeduction)

    expect(post401k.payrollDeductions.benefits).toBeCloseTo(post401k.benefitsDeduction)
    expect(post401k.payrollDeductions.k401Employee).toBeCloseTo(post401k.k401kEmployee)
    expect(post401k.payrollDeductions.total).toBeCloseTo(post401k.benefitsDeduction + post401k.k401kEmployee)
  })

  it('standard DHL preset rotation schedules core-only weeks (4-day long, 3-day short) with no mandatory OT even without dhlTeam', () => {
    const presetConfig = {
      ...DHL_STANDARD_CONFIG,
      dhlTeam: null,                 // new hires may not have picked a team yet
      startingWeekIsLong: true,
    }
    const presetWeeks = buildYear(presetConfig)
    const activeWeeks = presetWeeks.filter(w => w.active)
    expect(activeWeeks.length).toBeGreaterThan(0)
    const longWeek  = activeWeeks.find(w => w.rotation === '6-Day')
    const shortWeek = activeWeeks.find(w => w.rotation === '4-Day')
    expect(longWeek.totalHours).toBe((presetConfig.shiftHours || 12) * 4)
    expect(shortWeek.totalHours).toBe((presetConfig.shiftHours || 12) * 3)
    expect(longWeek.requiredOtShifts).toBe(DHL_PRESET.requiredOtShifts)  // 0 — OT no longer mandatory
    expect(shortWeek.requiredOtShifts).toBe(DHL_PRESET.requiredOtShifts)
  })

  it('assigns Short/Long rotation labels and admin tags for standard DHL users', () => {
    const weeks = buildYear(DHL_STANDARD_CONFIG)
    const longWeek = weeks.find(w => w.active && w.rotation === '6-Day')
    const shortWeek = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(longWeek.rotationLabel).toBe('Long Week')
    expect(shortWeek.rotationLabel).toBe('Short Week')
    expect(longWeek.adminRotationTag).toBe('6-Day')
    expect(shortWeek.adminRotationTag).toBe('4-Day')
  })
})

// ─────────────────────────────────────────────────────────────
// buildYear — DHL Warehouse (fixed schedule, no rotation)
// ─────────────────────────────────────────────────────────────
// Warehouse has no long/short alternation — each team works the SAME 4 fixed
// days every single week. Mon-Thu (MT) has no weekend day at all; Wed-Sat (WS)
// includes Fri (half diff) + Sat (full diff), same weekend-differential
// semantics as Plant's rotation.
const WAREHOUSE_MT_CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: "DHL",
  dhlSite: "WAREHOUSE",
  dhlTeam: "MT",
  shiftHours: 10,
  scheduleIsVariable: false,
  k401Rate: 0.06,
  k401MatchRate: 0.05,
  k401StartDate: "2026-05-15",
}

const WAREHOUSE_WS_CONFIG = {
  ...WAREHOUSE_MT_CONFIG,
  dhlTeam: "WS",
  shiftHours: 12,
}

describe('buildYear — DHL Warehouse (fixed schedule, no rotation)', () => {
  it('Mon-Thu team works the same 4 fixed days every week, no alternation', () => {
    const weeks = buildYear(WAREHOUSE_MT_CONFIG)
    const activeWeeks = weeks.filter(w => w.active)
    expect(activeWeeks.length).toBeGreaterThan(1)
    activeWeeks.forEach(w => {
      expect(w.workedDayNames).toEqual(['Mon', 'Tue', 'Wed', 'Thu'])
    })
  })

  it('Wed-Sat team works the same 4 fixed days every week, no alternation', () => {
    const weeks = buildYear(WAREHOUSE_WS_CONFIG)
    const activeWeeks = weeks.filter(w => w.active)
    expect(activeWeeks.length).toBeGreaterThan(1)
    activeWeeks.forEach(w => {
      expect(w.workedDayNames).toEqual(['Wed', 'Thu', 'Fri', 'Sat'])
    })
  })

  it('Mon-Thu team has 0 weekend hours (no Fri/Sat/Sun in the fixed schedule)', () => {
    const weeks = buildYear(WAREHOUSE_MT_CONFIG)
    weeks.filter(w => w.active).forEach(w => expect(w.weekendHours).toBe(0))
  })

  it('Wed-Sat team earns weekend diff on Fri (half) and Sat (full)', () => {
    const weeks = buildYear(WAREHOUSE_WS_CONFIG)
    // Fri half-shift (shiftHours/2) + Sat full shift (shiftHours) = 1.5 × shiftHours = 18h at 12h shifts.
    weeks.filter(w => w.active).forEach(w => expect(w.weekendHours).toBe(18))
  })

  it('totalHours = 4 × shiftHours for both the 10h and 12h shift choices', () => {
    const mtWeeks = buildYear(WAREHOUSE_MT_CONFIG)
    const wsWeeks = buildYear(WAREHOUSE_WS_CONFIG)
    mtWeeks.filter(w => w.active).forEach(w => expect(w.totalHours).toBe(40))  // 4 × 10
    wsWeeks.filter(w => w.active).forEach(w => expect(w.totalHours).toBe(48))  // 4 × 12
  })

  it('rotation and rotationLabel are the team display label for every week', () => {
    const mtWeeks = buildYear(WAREHOUSE_MT_CONFIG)
    const wsWeeks = buildYear(WAREHOUSE_WS_CONFIG)
    mtWeeks.forEach(w => {
      expect(w.rotation).toBe('Mon–Thu')
      expect(w.rotationLabel).toBe('Mon–Thu')
    })
    wsWeeks.forEach(w => {
      expect(w.rotation).toBe('Wed–Sat')
      expect(w.rotationLabel).toBe('Wed–Sat')
    })
  })

  it('isHighWeek is always false (no long/short distinction)', () => {
    const weeks = buildYear(WAREHOUSE_MT_CONFIG)
    weeks.forEach(w => expect(w.isHighWeek).toBe(false))
  })

  it('requiredOtShifts is always 0 (no custom-hours-extension concept for Warehouse)', () => {
    const weeks = buildYear(WAREHOUSE_MT_CONFIG)
    weeks.forEach(w => expect(w.requiredOtShifts).toBe(0))
  })

  it('an existing Plant account (no dhlSite key) is unaffected — still alternates 6-Day/4-Day', () => {
    // Confirms the "route everything active today to Plant" migration-free default:
    // DHL_CONFIG never sets dhlSite, so it must behave exactly as before this feature.
    const weeks = buildYear(DHL_STANDARD_CONFIG)
    expect(weeks[0].rotation).not.toBe('Mon–Thu')
    expect(weeks[0].rotation).not.toBe('Wed–Sat')
    expect(['6-Day', '4-Day']).toContain(weeks[0].rotation)
  })
})

// ─────────────────────────────────────────────────────────────
// resolveBaseRateForWeek + buildYear point-in-time baseRate (TODO §1.D / §3 slice)
// ─────────────────────────────────────────────────────────────

describe('resolveBaseRateForWeek', () => {
  it('falls back to the live baseRate when no history is provided', () => {
    expect(resolveBaseRateForWeek(null, new Date('2026-06-01'), 20)).toBe(20)
    expect(resolveBaseRateForWeek([], new Date('2026-06-01'), 20)).toBe(20)
  })

  it('falls back to the live baseRate when no entry covers the target date', () => {
    const history = [{ effectiveFrom: '2026-08-01', baseRate: 24.5 }]
    expect(resolveBaseRateForWeek(history, new Date('2026-06-01'), 20)).toBe(20)
  })

  it('picks the latest entry with effectiveFrom <= the target date', () => {
    const history = [
      { effectiveFrom: '2026-01-05', baseRate: 20 },
      { effectiveFrom: '2026-07-20', baseRate: 24.5 },
    ]
    expect(resolveBaseRateForWeek(history, new Date('2026-07-19'), 24.5)).toBe(20)
    expect(resolveBaseRateForWeek(history, new Date('2026-07-20'), 24.5)).toBe(24.5)
    expect(resolveBaseRateForWeek(history, new Date('2026-12-01'), 24.5)).toBe(24.5)
  })

  it('is unaffected by history entries out of chronological order', () => {
    const history = [
      { effectiveFrom: '2026-07-20', baseRate: 24.5 },
      { effectiveFrom: '2026-01-05', baseRate: 20 },
    ]
    expect(resolveBaseRateForWeek(history, new Date('2026-03-01'), 24.5)).toBe(20)
  })
})

describe('resolvePrevWeekNet (TODO §1 — "This Week\'s Check" annual-average dilution fix, 2026-07-19)', () => {
  const BASE_CONFIG = {
    ...DEFAULT_CONFIG,
    employerPreset: null,
    maxWeeklyHours: 40,
    otThreshold: 40,
    baseRate: 22,
    shiftHours: 10,
    nightDiffEnabled: false,
    diffRate: 0,
    freedomAllowanceEnabled: true,
    freedomAllowance: 50,
  }
  const FREEDOM_ALLOWANCE = 50

  function setup(cfg, todayIso) {
    const allWeeks = buildYear(cfg)
    const currentWeek = getCurrentFiscalWeek(allWeeks, todayIso)
    const weeklyIncome = allWeeks.filter(w => w.active).reduce((s, w) => s + computeNet(w, cfg, 0, true), 0) / 52 - FREEDOM_ALLOWANCE
    return { allWeeks, currentWeek, weeklyIncome }
  }

  it('falls back to the CURRENT active week\'s real net — not the diluted full-year average — when there is no prior active week yet (e.g. day one after Back to Work)', () => {
    // Mirrors the real account this bug was diagnosed against: firstActiveIdx lands
    // on the current week itself, so there is no earlier active week to read.
    const cfg = { ...BASE_CONFIG, firstActiveIdx: 28 }
    const todayIso = '2026-07-19'
    const { allWeeks, currentWeek, weeklyIncome } = setup(cfg, todayIso)
    const result = resolvePrevWeekNet({
      allWeeks, todayIso, config: cfg, extraPerCheck: 0, showExtra: true,
      freedomAllowancePerWeek: FREEDOM_ALLOWANCE, weeklyIncome, logs: [], currentWeek,
    })
    const expectedCurrentWeekNet = computeNet(currentWeek, cfg, 0, true) - FREEDOM_ALLOWANCE
    expect(result).toBeCloseTo(expectedCurrentWeekNet, 5)
    // The bug this replaces: a full fiscal-year average diluted by every
    // inactive week before firstActiveIdx, wildly understating a real check.
    expect(Math.abs(result - weeklyIncome)).toBeGreaterThan(100)
  })

  it('still reads the real most recent past active week when one exists (unchanged behavior)', () => {
    const cfg = { ...BASE_CONFIG, firstActiveIdx: 0 }
    const todayIso = '2026-07-19'
    const { allWeeks, currentWeek, weeklyIncome } = setup(cfg, todayIso)
    const result = resolvePrevWeekNet({
      allWeeks, todayIso, config: cfg, extraPerCheck: 0, showExtra: true,
      freedomAllowancePerWeek: FREEDOM_ALLOWANCE, weeklyIncome, logs: [], currentWeek,
    })
    const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < todayIso)
    const prevWeek = pastWeeks[pastWeeks.length - 1]
    expect(result).toBeCloseTo(computeNet(prevWeek, cfg, 0, true) - FREEDOM_ALLOWANCE, 5)
  })

  it('falls back to weeklyIncome only when there is no active week to read at all (indefinite New Job Season through year-end)', () => {
    const cfg = {
      ...BASE_CONFIG, firstActiveIdx: 10, newJobSeasonMode: true,
      newJobSeasonDate: '2026-02-01', returnToWorkDate: null,
    }
    const todayIso = '2026-07-19'
    const { allWeeks, currentWeek, weeklyIncome } = setup(cfg, todayIso)
    expect(currentWeek).toBeNull()
    const result = resolvePrevWeekNet({
      allWeeks, todayIso, config: cfg, extraPerCheck: 0, showExtra: true,
      freedomAllowancePerWeek: FREEDOM_ALLOWANCE, weeklyIncome, logs: [], currentWeek,
    })
    expect(result).toBe(weeklyIncome)
  })

  it('applies confirmed log-entry adjustments to the current-week fallback, same as the past-week path', () => {
    const cfg = { ...BASE_CONFIG, firstActiveIdx: 28 }
    const todayIso = '2026-07-19'
    const { allWeeks, currentWeek, weeklyIncome } = setup(cfg, todayIso)
    const logs = [{ weekIdx: currentWeek.idx, type: 'missed_unpaid', shiftsLost: 1, missedDays: [] }]
    const result = resolvePrevWeekNet({
      allWeeks, todayIso, config: cfg, extraPerCheck: 0, showExtra: true,
      freedomAllowancePerWeek: FREEDOM_ALLOWANCE, weeklyIncome, logs, currentWeek,
    })
    const impact = calcEventImpact(logs[0], cfg, currentWeek)
    const expected = (computeNet(currentWeek, cfg, 0, true) - FREEDOM_ALLOWANCE) + impact.netGained - impact.netLost
    expect(result).toBeCloseTo(expected, 5)
    expect(result).not.toBeCloseTo(computeNet(currentWeek, cfg, 0, true) - FREEDOM_ALLOWANCE, 2)
  })
})

describe('buildYear — point-in-time baseRate (TODO §1.D)', () => {
  const BASE_CONFIG = {
    ...DEFAULT_CONFIG,
    employerPreset: null,
    maxWeeklyHours: 40,
    otThreshold: 40,
    baseRate: 20,
    firstActiveIdx: 0,
    nightDiffEnabled: false,
  }

  it('with no rate history passed, every active week uses the live baseRate (back-compat: identical to calling buildYear(cfg) alone)', () => {
    const weeks = buildYear(BASE_CONFIG)
    weeks.filter(w => w.active).forEach(w => expect(w.grossPay).toBe(40 * 20))
  })

  it('a rate change only recomputes weeks from its effective date forward — past weeks keep the old rate', () => {
    // Mirrors the real app: the account's original rate is itself a history row
    // (stamped at signup) alongside the later change — see App.jsx's config-history
    // watcher, which creates one for the very first wizard-set baseRate too.
    const rateHistory = [
      { effectiveFrom: '2026-01-05', baseRate: 20 },
      { effectiveFrom: '2026-07-20', baseRate: 24.5 },
    ]
    const weeks = buildYear(BASE_CONFIG, rateHistory)
    const before = weeks.find(w => w.active && w.weekEnd < new Date('2026-07-20'))
    const after = weeks.find(w => w.active && w.weekEnd >= new Date('2026-07-20'))
    expect(before.grossPay).toBe(40 * 20)
    expect(after.grossPay).toBe(40 * 24.5)
  })

  it('a future-dated effective change does not apply early to weeks between today and that date', () => {
    // No entry covers weeks between the original rate and the future one — the
    // resolver's latest-entry-<=-date rule means they correctly still resolve to
    // the OLD rate (20), not fall through to the new live cfg.baseRate.
    const rateHistory = [
      { effectiveFrom: '2026-01-05', baseRate: 20 },
      { effectiveFrom: '2026-12-01', baseRate: 24.5 },
    ]
    const weeks = buildYear({ ...BASE_CONFIG, baseRate: 24.5 }, rateHistory)
    const gapWeek = weeks.find(w => w.active && w.weekEnd >= new Date('2026-06-01') && w.weekEnd < new Date('2026-12-01'))
    expect(gapWeek.grossPay).toBe(40 * 20)
  })

  it('with only the new rate recorded (no original-rate row), weeks before it fall back to the live rate', () => {
    // Documents the accepted edge case: immediately after a fresh edit, before its
    // own history row round-trips, there's nothing yet to distinguish "before" from
    // "after" — the live config IS the newest truth at that point (see
    // resolveBaseRateForWeek's doc comment).
    const rateHistory = [{ effectiveFrom: '2026-07-20', baseRate: 24.5 }]
    const weeks = buildYear({ ...BASE_CONFIG, baseRate: 24.5 }, rateHistory)
    const before = weeks.find(w => w.active && w.weekEnd < new Date('2026-07-20'))
    expect(before.grossPay).toBe(40 * 24.5)
  })
})

// ─────────────────────────────────────────────────────────────
// customWeeklyHours — DHL and non-DHL paths
// ─────────────────────────────────────────────────────────────

describe('customWeeklyHours', () => {
  it('DHL: overrides totalHours to the custom value for both rotation types', () => {
    const weeks = buildYear(DHL_CONFIG) // customWeeklyHours=60
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(long.totalHours).toBe(60)
    expect(short.totalHours).toBe(60)
  })

  it('DHL: requiredOtShifts is the extension shifts needed to reach the custom target', () => {
    // 60h target: long 4×12=48h core → 1 extra; short 3×12=36h core → 2 extra shifts to reach target
    const weeks = buildYear(DHL_CONFIG)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(long.requiredOtShifts).toBe(1)
    expect(short.requiredOtShifts).toBe(2)
  })

  it('DHL: customWeeklyHours=null (preset) uses core rotation hours and requiredOtShifts=0', () => {
    // DHL_STANDARD_CONFIG has no customWeeklyHours — core-only preset, no mandatory OT
    const weeks = buildYear(DHL_STANDARD_CONFIG)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(long.totalHours).toBe(DHL_PRESET.rotation.long.days.length * DHL_STANDARD_CONFIG.shiftHours)
    expect(short.totalHours).toBe(DHL_PRESET.rotation.short.days.length * DHL_STANDARD_CONFIG.shiftHours)
    expect(long.requiredOtShifts).toBe(DHL_PRESET.requiredOtShifts)
    expect(short.requiredOtShifts).toBe(DHL_PRESET.requiredOtShifts)
  })

  it('DHL: rotation label and workedDayNames are unaffected by customWeeklyHours', () => {
    const weeks = buildYear(DHL_CONFIG)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    // Rotation labels stay from DHL preset
    expect(long.rotationLabel).toBe('Long Week')
    expect(short.rotationLabel).toBe('Short Week')
    // Day names are B-team core preset (4 days for long, 3 for short — no mandatory OT day)
    expect(long.workedDayNames).toHaveLength(4)
    expect(short.workedDayNames).toHaveLength(3)
  })

  it('DHL: grossPay is higher for long weeks than short weeks (more weekend hours at 60h total)', () => {
    const weeks = buildYear(DHL_CONFIG)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    // Both 60h; long has 24h weekend diff vs short 6h — long earns more
    expect(long.grossPay).toBeGreaterThan(short.grossPay)
  })

  it('DHL: customWeeklyHours=48 keeps the 4-day long core and projects 48h flat', () => {
    // B-team long core rotation: 4 days (Tue/Wed/Sat/Sun) = 48h — already at the 48h target.
    // Short core is 3 days (36h); the 12h gap is an extension shift, so totalHours is forced to 48.
    // weekendHours: long Sat+Sun (24h), short Fri half (6h).
    const cfg = {
      ...DEFAULT_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'B',
      dhlCustomSchedule: false,
      startingWeekIsLong: true,
      customWeeklyHours: 48,
      firstActiveIdx: 0,
    }
    const weeks = buildYear(cfg)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    // Both weeks flat at 48h
    expect(long.totalHours).toBe(48)
    expect(short.totalHours).toBe(48)
    // Long core is already 4 shifts — no Mon (Mon is not a long-core day)
    expect(long.workedDayNames).toHaveLength(4)
    expect(long.workedDayNames).not.toContain('Mon')
    // Short core is 3 shifts (extension shift not baked into worked days)
    expect(short.workedDayNames).toHaveLength(3)
    // weekend hours: long keeps Sat+Sun (24h), short keeps Fri half (6h)
    expect(long.weekendHours).toBe(24)
    expect(short.weekendHours).toBe(6)
  })

  it('DHL: dhlCustomSchedule=true bypasses trim — totalHours reflects hardcoded worked arrays', () => {
    // dhlCustomSchedule=true uses hardcoded day arrays and skips the customWeeklyHours override block.
    // Long: Tue–Sun (6 days × 12h = 72h). Short: Mon/Wed/Thu/Fri (4 days × 12h = 48h).
    const anthonyCfg = {
      ...DEFAULT_CONFIG,
      employerPreset: 'DHL',
      dhlTeam: 'B',
      dhlCustomSchedule: true,
      startingWeekIsLong: true,
      customWeeklyHours: 60,
      firstActiveIdx: 0,
    }
    const weeks = buildYear(anthonyCfg)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    // dhlCustomSchedule=true: customWeeklyHours override is skipped → totalHours from actual worked days
    expect(long.totalHours).toBe(72)  // 6 days × 12h
    expect(short.totalHours).toBe(48) // 4 days × 12h
    // Hardcoded arrays unchanged — no trimming
    expect(long.workedDayNames).toHaveLength(6)
    expect(short.workedDayNames).toHaveLength(4)
  })

  it('DHL: per-week-type custom hours override customWeeklyHours fallback', () => {
    const cfg = {
      ...DHL_CONFIG,
      customWeeklyHours: 60,
      customWeeklyHoursLong: 66,
      customWeeklyHoursShort: 54,
    }
    const weeks = buildYear(cfg)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(long.totalHours).toBe(66)
    expect(short.totalHours).toBe(54)
    expect(projectedGross(true, cfg)).toBeCloseTo(long.grossPay)
    expect(projectedGross(false, cfg)).toBeCloseTo(short.grossPay)
  })

  it('DHL: when per-week-type values are missing, customWeeklyHours remains the fallback', () => {
    const cfg = {
      ...DHL_CONFIG,
      customWeeklyHours: 60,
      customWeeklyHoursLong: null,
      customWeeklyHoursShort: null,
    }
    const weeks = buildYear(cfg)
    const long = weeks.find(w => w.active && w.rotation === '6-Day')
    const short = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(long.totalHours).toBe(60)
    expect(short.totalHours).toBe(60)
  })

  it('non-DHL: sets totalHours to customWeeklyHours and rotation to "Custom"', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      employerPreset: null,
      customWeeklyHours: 35,
      baseRate: 18,
      shiftHours: 8,
      firstActiveIdx: 0,
    }
    const weeks = buildYear(cfg)
    const active = weeks.filter(w => w.active)
    expect(active.length).toBeGreaterThan(0)
    active.forEach(w => {
      expect(w.totalHours).toBe(35)
      expect(w.rotation).toBe('Custom')
      expect(w.rotationLabel).toBe('Custom')
    })
  })

  it('non-DHL: customWeeklyHours=null falls back to standardWeeklyHours', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      employerPreset: null,
      customWeeklyHours: null,
      standardWeeklyHours: 32,
      baseRate: 18,
      firstActiveIdx: 0,
    }
    const weeks = buildYear(cfg)
    const active = weeks.filter(w => w.active)
    active.forEach(w => {
      expect(w.totalHours).toBe(32)
      expect(w.rotation).toBe('Standard')
    })
  })

  it('non-DHL: customWeeklyHours computes grossPay correctly (no weekend diff)', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      employerPreset: null,
      customWeeklyHours: 45,
      baseRate: 20,
      otThreshold: 40,
      otMultiplier: 1.5,
      firstActiveIdx: 0,
    }
    const weeks = buildYear(cfg)
    const active = weeks.find(w => w.active)
    // 45h: 40 regular + 5 OT, no night diff, no weekend diff
    const expected = 40 * 20 + 5 * 20 * 1.5
    expect(active.grossPay).toBeCloseTo(expected)
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

  it('deducts FICA, 401k, and all weekly benefit deductions on non-taxed active weeks', () => {
    const week = weeks.find(w => w.active && !w.taxedBySchedule)
    const cfg = DHL_CONFIG
    const benefits = cfg.healthPremium + cfg.dentalPremium + cfg.visionPremium + cfg.ltd + cfg.stdWeekly + cfg.lifePremium + cfg.hsaWeekly + cfg.fsaWeekly
    const other = (cfg.otherDeductions || []).reduce((s, r) => s + (r.perCheckAmount ?? r.weeklyAmount ?? 0), 0)
    const expected = week.grossPay - week.grossPay * cfg.ficaRate - benefits - week.k401kEmployee - other
    expect(computeNet(week, cfg)).toBeCloseTo(expected)
  })

  it('deducts fed and state tax in addition on taxed 4-Day (low-rate) weeks', () => {
    const week = weeks.find(w => w.active && w.taxedBySchedule && w.rotation === '4-Day')
    const cfg = DHL_CONFIG
    const fica = week.grossPay * cfg.ficaRate
    const ded = cfg.healthPremium + cfg.dentalPremium + cfg.visionPremium + cfg.ltd + cfg.stdWeekly + cfg.lifePremium + cfg.hsaWeekly + cfg.fsaWeekly + week.k401kEmployee
    const other = (cfg.otherDeductions || []).reduce((s, r) => s + (r.perCheckAmount ?? r.weeklyAmount ?? 0), 0)
    const fed = week.taxableGross * cfg.fedRateLow  // 4-Day = short = fedRateLow
    const st = week.taxableGross * cfg.stateRateLow
    expect(computeNet(week, cfg)).toBeCloseTo(week.grossPay - fed - st - fica - ded - other)
  })

  it('deducts fed and state tax in addition on taxed 6-Day (high-rate) weeks', () => {
    const week = weeks.find(w => w.active && w.taxedBySchedule && w.rotation === '6-Day')
    const cfg = DHL_CONFIG
    const fica = week.grossPay * cfg.ficaRate
    const ded = cfg.healthPremium + cfg.dentalPremium + cfg.visionPremium + cfg.ltd + cfg.stdWeekly + cfg.lifePremium + cfg.hsaWeekly + cfg.fsaWeekly + week.k401kEmployee
    const other = (cfg.otherDeductions || []).reduce((s, r) => s + (r.perCheckAmount ?? r.weeklyAmount ?? 0), 0)
    const fed = week.taxableGross * cfg.fedRateHigh  // 6-Day = long = fedRateHigh
    const st = week.taxableGross * cfg.stateRateHigh
    expect(computeNet(week, cfg)).toBeCloseTo(week.grossPay - fed - st - fica - ded - other)
  })

  it('taxed weeks have a lower net/gross ratio than non-taxed weeks of the same rotation', () => {
    const taxed4 = weeks.find(w => w.active && w.taxedBySchedule && w.rotation === '4-Day')
    const nonTaxed4 = weeks.find(w => w.active && !w.taxedBySchedule && w.rotation === '4-Day')
    const taxedRatio = computeNet(taxed4, DHL_CONFIG) / taxed4.grossPay
    const nonTaxedRatio = computeNet(nonTaxed4, DHL_CONFIG) / nonTaxed4.grossPay
    expect(taxedRatio).toBeLessThan(nonTaxedRatio)
  })

  it('reduces taxableGross when weekly benefit deductions increase', () => {
    const withBenefits = buildYear({
      ...DHL_CONFIG,
      healthPremium: 25,
      dentalPremium: 5,
      visionPremium: 3,
      stdWeekly: 2,
      lifePremium: 1,
      hsaWeekly: 10,
      fsaWeekly: 9,
      ltd: 4,
    }).find(w => w.active && w.taxedBySchedule)
    const baseline = buildYear({
      ...DHL_CONFIG,
      healthPremium: 0,
      dentalPremium: 0,
      visionPremium: 0,
      stdWeekly: 0,
      lifePremium: 0,
      hsaWeekly: 0,
      fsaWeekly: 0,
      ltd: 0,
    }).find(w => w.idx === withBenefits.idx)
    expect(withBenefits.taxableGross).toBeLessThan(baseline.taxableGross)
    expect(computeNet(withBenefits, {
      ...DHL_CONFIG,
      healthPremium: 25,
      dentalPremium: 5,
      visionPremium: 3,
      stdWeekly: 2,
      lifePremium: 1,
      hsaWeekly: 10,
      fsaWeekly: 9,
      ltd: 4,
    })).toBeLessThan(computeNet(baseline, {
      ...DHL_CONFIG,
      healthPremium: 0,
      dentalPremium: 0,
      visionPremium: 0,
      stdWeekly: 0,
      lifePremium: 0,
      hsaWeekly: 0,
      fsaWeekly: 0,
      ltd: 0,
    }))
  })

  it('subtracts otherDeductions after taxes', () => {
    const cfg = {
      ...DHL_CONFIG,
      otherDeductions: [{ id: 'parking', perCheckAmount: 18 }],
    }
    const week = buildYear(cfg).find(w => w.active && w.taxedBySchedule)
    const withOther = computeNet(week, cfg)
    const withoutOther = computeNet(week, { ...cfg, otherDeductions: [] })
    expect(withOther).toBeCloseTo(withoutOther - 18)
  })

  it('applies benefitsStartDate gating to weekly deductions', () => {
    const cfg = {
      ...DHL_CONFIG,
      benefitsStartDate: '2026-07-01',
      healthPremium: 40,
    }
    const year = buildYear(cfg)
    const preStart = year.find(w => w.active && toLocalIso(w.weekEnd) < cfg.benefitsStartDate)
    const postStart = year.find(w => w.active && toLocalIso(w.weekEnd) >= cfg.benefitsStartDate)
    expect(preStart.benefitsDeduction).toBe(0)
    expect(postStart.benefitsDeduction).toBeGreaterThan(0)
    const postNet = computeNet(postStart, cfg)
    const postNetWithoutBenefits = computeNet({
      ...postStart,
      benefitsDeduction: 0,
      payrollDeductions: {
        ...(postStart.payrollDeductions || {}),
        benefits: 0,
        total: postStart.k401kEmployee || 0,
      },
    }, cfg)
    expect(postNet).toBeLessThan(postNetWithoutBenefits)
  })

  it('deriveWeeklyPayrollDeductions returns the payroll deduction total used by computeNet', () => {
    const week = weeks.find(w => w.active && w.taxedBySchedule)
    const parts = deriveWeeklyPayrollDeductions(week, DHL_CONFIG)
    expect(parts.benefits).toBeCloseTo(week.benefitsDeduction)
    expect(parts.k401Employee).toBeCloseTo(week.k401kEmployee)
    expect(parts.total).toBeCloseTo(week.benefitsDeduction + week.k401kEmployee)
  })

  it('deriveWeeklyPayrollDeductions keeps pre-benefits weeks at 0 when benefits are not active', () => {
    const cfg = {
      ...DHL_CONFIG,
      benefitsStartDate: '2026-07-01',
      healthPremium: 40,
      dentalPremium: 10,
      visionPremium: 5,
      ltd: 4,
      stdWeekly: 3,
      lifePremium: 2,
      hsaWeekly: 8,
      fsaWeekly: 6,
      k401Rate: 0,
      k401MatchRate: 0,
      k401StartDate: null,
    }

    const parts = deriveWeeklyPayrollDeductions(
      {
        active: true,
        benefitsActive: false,
        k401kEmployee: 0,
      },
      cfg,
    )
    expect(parts.benefits).toBe(0)
    expect(parts.k401Employee).toBe(0)
    expect(parts.total).toBe(0)
  })

  it('Budget Breakdown payroll deduction source excludes event deduction fields', () => {
    const week = weeks.find(w => w.active && w.taxedBySchedule)
    const total = getWeeklyBudgetBreakdownPayrollDeductions(
      {
        ...week,
        adjustedWeeklyDelta: -999,
        eventDeductions: 999,
        netAfterEvents: week.grossPay - 999,
      },
      DHL_CONFIG,
    )
    expect(total).toBeCloseTo(week.benefitsDeduction + week.k401kEmployee)
  })
})

// ─────────────────────────────────────────────────────────────
// projectedGross
// ─────────────────────────────────────────────────────────────

describe('projectedGross', () => {
  it('DHL: long-week gross is higher than short-week gross', () => {
    expect(projectedGross(true, DHL_STANDARD_CONFIG)).toBeGreaterThan(projectedGross(false, DHL_STANDARD_CONFIG))
  })

  it('DHL: calculates correct gross for long week (standard rotation, no customWeeklyHours)', () => {
    const cfg = DHL_STANDARD_CONFIG
    const rate = cfg.baseRate + cfg.nightDiffRate  // 21.15
    // Long: 4 core shifts×12h=48h (no mandatory OT). wkndH=24 (Sat+Sun). nonWkndH=24. regWknd=16, otWknd=8. reg=40, ot=8.
    const expected = 40*rate + 16*cfg.diffRate + 8*rate*cfg.otMultiplier + 8*cfg.diffRate*cfg.otMultiplier
    expect(projectedGross(true, cfg)).toBeCloseTo(expected)  // 1148.8
  })

  it('DHL: calculates correct gross for short week (standard rotation, no customWeeklyHours)', () => {
    const cfg = DHL_STANDARD_CONFIG
    const rate = cfg.baseRate + cfg.nightDiffRate  // 21.15
    // Short: 3 core shifts×12h=36h (no mandatory OT). wkndH=6 (Fri). nonWkndH=30. regWknd=6, otWknd=0. reg=36, ot=0.
    const expected = 36*rate + 6*cfg.diffRate
    expect(projectedGross(false, cfg)).toBeCloseTo(expected)  // 771.9
  })

  it('matches the grossPay of the corresponding active week from buildYear', () => {
    const weeks = buildYear(DHL_CONFIG)
    const sixDay = weeks.find(w => w.active && w.rotation === '6-Day')
    const fourDay = weeks.find(w => w.active && w.rotation === '4-Day')
    expect(projectedGross(true, DHL_CONFIG)).toBeCloseTo(sixDay.grossPay)
    expect(projectedGross(false, DHL_CONFIG)).toBeCloseTo(fourDay.grossPay)
  })

  it('Warehouse: matches the fixed-schedule grossPay of any active week regardless of the isWeek2 argument', () => {
    // Warehouse has no long/short distinction — getDhlPlannedPattern ignores isLongWeek
    // entirely for it, so both isWeek2=true and isWeek2=false must return the same value.
    const weeks = buildYear(WAREHOUSE_MT_CONFIG)
    const activeWeek = weeks.find(w => w.active)
    expect(projectedGross(true, WAREHOUSE_MT_CONFIG)).toBeCloseTo(activeWeek.grossPay)
    expect(projectedGross(false, WAREHOUSE_MT_CONFIG)).toBeCloseTo(activeWeek.grossPay)
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

  it('includes all expense categories in spend totals', () => {
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
      { category: 'Lifestyle', history: [{ effectiveFrom: '2026-01-05', weekly: [125, 125, 125, 125] }] },
    ]
    const futureWeeks = [{ weekEnd: new Date(2026, 0, 12), idx: 1 }]
    const result = computeRemainingSpend(expenses, futureWeeks)
    expect(result.totalRemainingSpend).toBeCloseTo(225)
  })

  it('returns monthly budget health using monthly expenses and projected 4-week net', () => {
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
      { category: 'Lifestyle', history: [{ effectiveFrom: '2026-01-05', weekly: [50, 50, 50, 50] }] },
    ]
    const futureWeeks = [
      { weekEnd: new Date(2026, 0, 12), idx: 1 },
      { weekEnd: new Date(2026, 0, 19), idx: 2 },
    ]
    const futureWeekNets = [600, 650, 625, 675]
    const result = computeRemainingSpend(expenses, futureWeeks, {
      futureWeekNets,
      previousMonthKey: '2026-01',
      now: new Date('2026-02-01T12:00:00.000Z'),
    })

    expect(result.monthlyExpenses).toBeCloseTo(649.5)
    expect(result.monthlyNetTakeHome).toBeCloseTo(2550)
    expect(result.budgetHealth).toBeCloseTo(649.5 / 2550)
    expect(result.shouldReevaluateForMonthBoundary).toBe(true)
  })
})

describe('monthly budget health helpers', () => {
  it('normalizes weekly and biweekly amounts into monthly values', () => {
    expect(normalizeToMonthlyAmount(100, 'weekly')).toBeCloseTo(433)
    expect(normalizeToMonthlyAmount(200, 'biweekly')).toBeCloseTo(433.2)
    expect(normalizeToMonthlyAmount(900, 'monthly')).toBeCloseTo(900)
  })

  it('projects monthly take-home from next 4 weeks', () => {
    expect(projectMonthlyNetTakeHome([400, 420, 410, 430, 999], 0)).toBeCloseTo(1660)
    expect(projectMonthlyNetTakeHome([], 500)).toBeCloseTo(2000)
  })

  it('flags month-boundary reevaluation only on day 1 when month changes', () => {
    const crossed = resolveBudgetHealthMonthBoundary({
      previousMonthKey: '2026-03',
      now: new Date('2026-04-01T10:00:00.000Z'),
    })
    const notFirst = resolveBudgetHealthMonthBoundary({
      previousMonthKey: '2026-03',
      now: new Date('2026-04-02T10:00:00.000Z'),
    })
    expect(crossed.shouldReevaluate).toBe(true)
    expect(crossed.monthKey).toBe('2026-04')
    expect(notFirst.shouldReevaluate).toBe(false)
  })
})

describe('traceExpenseCalculationSteps', () => {
  it('captures routed steps from income through quarterly expense discrepancy checks', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      employerPreset: 'DHL',
      dhlCustomSchedule: false,
      startingWeekIsLong: true,
    }
    const allWeeks = buildYear(cfg)
    const futureWeeks = allWeeks.filter(w => w.active).slice(0, 6)
    const expenses = [
      {
        id: 'rent',
        weekly: [300, 300, 300, 300],
        history: [{ effectiveFrom: '2026-01-05', weekly: [300, 300, 300, 300] }],
      },
      {
        id: 'loan',
        weekly: [90, 90, 90, 90],
        history: [
          { effectiveFrom: '2026-01-05', weekly: [90, 90, 90, 90] },
          { effectiveFrom: '2026-01-12', weekly: [110, 110, 110, 110] },
        ],
      },
    ]

    const result = traceExpenseCalculationSteps({
      cfg,
      expenses,
      futureWeeks,
      showExtra: true,
      extraPerCheck: 25,
      freedomAllowancePerWeek: 50,
      observedQuarterlySpendByPhase: [null, 757, 794, 774],
    })

    expect(result.logEntries.length).toBeGreaterThanOrEqual(5)
    expect(result.markdown).toContain('# Expense Calculation Audit Log')
    expect(result.quarterlyDiscrepancies[0].discrepancy).toBeGreaterThan(0)
    expect(result.weeklyComparisons.some(w => w.discrepancy !== 0)).toBe(true)
    expect(result.uiQuarterlySpendByPhase).toHaveLength(4)
    expect(result.representativeQuarterlySpendByPhase).toHaveLength(4)
    expect(result.observedVsUiDelta).toHaveLength(4)
  })
})

describe('traceExpenseCalculationSteps', () => {
  it('captures routed steps from income through quarterly expense discrepancy checks', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      setupComplete: true,
      employerPreset: 'DHL',
      dhlCustomSchedule: false,
      startingWeekIsLong: true,
    }
    const allWeeks = buildYear(cfg)
    const futureWeeks = allWeeks.filter(w => w.active).slice(0, 6)
    const expenses = [
      {
        id: 'rent',
        weekly: [300, 300, 300, 300],
        history: [{ effectiveFrom: '2026-01-05', weekly: [300, 300, 300, 300] }],
      },
      {
        id: 'loan',
        weekly: [90, 90, 90, 90],
        history: [
          { effectiveFrom: '2026-01-05', weekly: [90, 90, 90, 90] },
          { effectiveFrom: '2026-01-12', weekly: [110, 110, 110, 110] },
        ],
      },
    ]

    const result = traceExpenseCalculationSteps({
      cfg,
      expenses,
      futureWeeks,
      showExtra: true,
      extraPerCheck: 25,
      freedomAllowancePerWeek: 50,
      observedQuarterlySpendByPhase: [null, 757, 794, 774],
    })

    expect(result.logEntries.length).toBeGreaterThanOrEqual(5)
    expect(result.markdown).toContain('# Expense Calculation Audit Log')
    expect(result.quarterlyDiscrepancies[0].discrepancy).toBeGreaterThan(0)
    expect(result.weeklyComparisons.some(w => w.discrepancy !== 0)).toBe(true)
    expect(result.uiQuarterlySpendByPhase).toHaveLength(4)
    expect(result.representativeQuarterlySpendByPhase).toHaveLength(4)
    expect(result.observedVsUiDelta).toHaveLength(4)
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

  it('honors timelineEpochIdx — surplus before the epoch does not fund goals', () => {
    const goals = [{ id: 'g1', target: 400, label: 'Reset me' }]
    const futureWeeks = Array.from({ length: 8 }, (_, i) => ({
      idx: i + 1,
      weekEnd: new Date(2026, 3, (i + 1) * 7),
    }))
    const weeklyNets = Array(8).fill(200)
    // No epoch: $200/wk funds the $400 goal by ~week 2.
    const baseline = computeGoalTimeline(goals, futureWeeks, weeklyNets, [], 0, 0, {})
    // Epoch at idx 4: weeks 1-3 contribute nothing, so funding starts at offset 3.
    const reset = computeGoalTimeline(goals, futureWeeks, weeklyNets, [], 0, 0, {}, 4)
    expect(baseline[0].sW).toBe(0)
    expect(reset[0].sW).toBe(3)
    expect(reset[0].eW).toBeGreaterThan(baseline[0].eW)
  })

  it('does not double-count future event deductions when nets stay raw', () => {
    const goals = [{ id: 'g1', target: 500, label: 'Catch-up' }]
    const futureWeeks = [
      { idx: 1, weekEnd: new Date(2026, 0, 7) },
      { idx: 2, weekEnd: new Date(2026, 0, 14) },
    ]
    const weeklyNets = [500, 500]
    const futureEventDeductions = { 2: 200 }
    const result = computeGoalTimeline(goals, futureWeeks, weeklyNets, [], 200, 0, futureEventDeductions)
    expect(result[0].eW).not.toBeNull()
    expect(result[0].eW).toBeCloseTo(1, 3)
  })

  it('uses average surplus (net minus expenses), not average net, for unfunded fallback weeks', () => {
    const goals = [{ id: 'g1', target: 1000, label: 'Emergency Fund' }]
    const futureWeeks = [{ idx: 1, weekEnd: new Date(2026, 0, 7) }]
    const weeklyNets = [500]
    const expenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [250, 250, 250, 250] }] },
    ]
    const result = computeGoalTimeline(goals, futureWeeks, weeklyNets, expenses, 0, 0)
    expect(result[0].eW).toBeNull()
    // Week 1 contributes $250 surplus, leaving $750 still unfunded:
    // fallback should be 750 / 250 = 3.0 weeks, not 750 / 500 = 1.5.
    expect(result[0].wN).toBeCloseTo(3, 1)
  })

  it('moves goal ETA later when expenses increase by $150/week', () => {
    // Baseline: $400 net/week, $100/week expenses → $300/week surplus
    const goals = [
      { id: 'g1', target: 500, label: 'First' },
      { id: 'g2', target: 1000, label: 'Second' },
    ]
    const futureWeeks = Array.from({ length: 26 }, (_, i) => ({
      idx: i + 1,
      weekEnd: new Date(2026, 0, (i + 1) * 7),
    }))
    const weeklyNets = Array(26).fill(400)
    const baslineExpenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }] },
    ]
    const higherExpenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [250, 250, 250, 250] }] },
    ]

    const baseline = computeGoalTimeline(goals, futureWeeks, weeklyNets, baslineExpenses, 0, 0)
    const higher = computeGoalTimeline(goals, futureWeeks, weeklyNets, higherExpenses, 0, 0)

    // Both goals must complete within the year at baseline surplus
    expect(baseline[0].eW).not.toBeNull()
    expect(baseline[1].eW).not.toBeNull()

    // With $150/week more expenses (surplus drops $100→$250 is actually more), verify direction:
    // Higher expenses → less surplus → goal #2 finishes later (larger eW) or goes null
    const g2BaseEW = baseline[1].eW
    const g2HigherEW = higher[1].eW
    if (g2HigherEW !== null) {
      expect(g2HigherEW).toBeGreaterThan(g2BaseEW)
    } else {
      expect(g2HigherEW).toBeNull() // goal can't finish this year — also correct
    }
  })

  it('moves goal ETA later when expenses increase by $300/week', () => {
    const goals = [{ id: 'g1', target: 2000, label: 'Big Goal' }]
    const futureWeeks = Array.from({ length: 26 }, (_, i) => ({
      idx: i + 1,
      weekEnd: new Date(2026, 0, (i + 1) * 7),
    }))
    const weeklyNets = Array(26).fill(500)
    const lowExpenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [50, 50, 50, 50] }] },
    ]
    const highExpenses = [
      { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [350, 350, 350, 350] }] },
    ]

    const low = computeGoalTimeline(goals, futureWeeks, weeklyNets, lowExpenses, 0, 0)
    const high = computeGoalTimeline(goals, futureWeeks, weeklyNets, highExpenses, 0, 0)

    // Low expenses: $450/week surplus → goal funded in ~5 weeks
    expect(low[0].eW).not.toBeNull()
    expect(low[0].eW).toBeLessThan(6)

    // +$300/week expenses → $150/week surplus → goal takes ~14 weeks
    if (high[0].eW !== null) {
      expect(high[0].eW).toBeGreaterThan(low[0].eW)
      expect(high[0].eW).toBeGreaterThan(10)
    } else {
      expect(high[0].eW).toBeNull() // beyond 26 weeks is also valid
    }
  })
})

describe('isFutureWeek', () => {
  it('returns false when week end matches today', () => {
    expect(isFutureWeek('2026-04-01', '2026-04-01')).toBe(false)
  })

  it('returns true when week end is after today', () => {
    expect(isFutureWeek('2026-04-08', '2026-04-01')).toBe(true)
  })

  it('handles missing values gracefully', () => {
    expect(isFutureWeek(null, '2026-04-01')).toBe(false)
    expect(isFutureWeek('2026-04-02', null)).toBe(false)
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

  it('second entry effectiveFrom is the day after the payoff quarter boundary', () => {
    const history = buildLoanHistory(loan)
    expect(history[1].effectiveFrom).toBe('2026-07-01') // Q2 boundary is 2026-06-30; zero kicks in July 1
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
    // 52 weekly payments from 2026-01-01 → payoff ≈ 2026-12-31
    // today = March 22 = 80 days after Jan 1 → Math.floor(80/7)+1 = 12 payments made → 40 left
    const activeLoan = {
      totalAmount: 5200,
      paymentAmount: 100,
      paymentFrequency: 'weekly',
      firstPaymentDate: '2026-01-01',
    }
    expect(loanPaymentsRemaining(activeLoan)).toBe(40)
  })

  it('counts first payment as made on firstPaymentDate itself (past-loan regression)', () => {
    // User scenario: $4000 loan at $250/mo, firstPaymentDate 14 days ago.
    // 14 days < 30.4375 days/payment → elapsed=0 under the old code → showed 16 remaining (wrong).
    // Correct: payment #1 was made on firstPaymentDate → 1 payment made → 15 remaining.
    vi.setSystemTime(new Date(2026, 3, 22)) // April 22
    const loan = {
      totalAmount: 4000,
      paymentAmount: 250,
      paymentFrequency: 'monthly',
      firstPaymentDate: '2026-04-08',
    }
    expect(loanPaymentsRemaining(loan)).toBe(15)
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

    it('extraDay PTO is a gain of ptoHours × baseRate (no grossLost)', () => {
      const event = makeEvent({ type: 'pto', weekRotation: '6-Day', weekEnd: '2026-02-02', ptoHours: 12, extraDay: true })
      const imp = calcEventImpact(event, cfg)
      expect(imp.grossGained).toBeCloseTo(12 * cfg.baseRate)
      expect(imp.grossLost).toBe(0)
      expect(imp.netGained).toBeGreaterThan(0)
    })
  })

  describe('pto_unapproved', () => {
    it('returns non-negative grossLost (opportunity cost, same as pto type)', () => {
      const event = makeEvent({ type: 'pto_unapproved', weekRotation: '6-Day', weekEnd: '2026-02-02', hoursLost: 12 })
      expect(calcEventImpact(event, cfg).grossLost).toBeGreaterThanOrEqual(0)
    })

    it('sets bucketHoursDeducted = hoursLost (unapproved bucket hit)', () => {
      const event = makeEvent({ type: 'pto_unapproved', weekRotation: '6-Day', weekEnd: '2026-02-02', hoursLost: 12 })
      expect(calcEventImpact(event, cfg).bucketHoursDeducted).toBe(12)
    })

    it('extraDay still gains pay but keeps the bucket hit', () => {
      const event = makeEvent({ type: 'pto_unapproved', weekRotation: '6-Day', weekEnd: '2026-02-02', hoursLost: 12, extraDay: true })
      const imp = calcEventImpact(event, cfg)
      expect(imp.grossGained).toBeCloseTo(12 * cfg.baseRate)
      expect(imp.grossLost).toBe(0)
      expect(imp.bucketHoursDeducted).toBe(12)
    })

    it('hoursLostForPTO is 0 (PTO-covered hours do not reduce accrual)', () => {
      const event = makeEvent({ type: 'pto_unapproved', weekRotation: '6-Day', weekEnd: '2026-02-02', hoursLost: 12 })
      expect(calcEventImpact(event, cfg).hoursLostForPTO).toBe(0)
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

  describe('tips_commission', () => {
    it('returns grossGained = amount, grossLost = 0 — mirrors the bonus branch', () => {
      const event = makeEvent({ type: 'tips_commission', weekEnd: '2026-02-02', amount: 250 })
      const result = calcEventImpact(event, cfg)
      expect(result.grossGained).toBe(250)
      expect(result.grossLost).toBe(0)
    })

    it('a $0 amount ("No" answer) is a real, resolved entry with zero impact', () => {
      const event = makeEvent({ type: 'tips_commission', weekEnd: '2026-02-02', amount: 0 })
      const result = calcEventImpact(event, cfg)
      expect(result.grossGained).toBe(0)
      expect(result.netGained).toBe(0)
    })

    // "If you claim all tips" (LogPanel's tips-only running total) is just
    // grossGained - netGained — the same tax-aware gap every other event type's
    // net impact already runs through (DW-5), never a parallel formula.
    it('grossGained - netGained is the extra tax owed if the tip were claimed', () => {
      // weekIdx=7 is a taxed week (see "tax calculation" describe above).
      const event = makeEvent({ type: 'tips_commission', weekRotation: '4-Day', weekIdx: 7, weekEnd: '2026-02-23', amount: 20 })
      const result = calcEventImpact(event, cfg)
      const effectiveRate = cfg.ficaRate + cfg.w1FedRate + cfg.w1StateRate
      const extraTaxOwed = result.grossGained - result.netGained
      expect(extraTaxOwed).toBeCloseTo(20 * effectiveRate)
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

    it('"Long Week" rotation strings use high-week withholding', () => {
      const event = makeEvent({ type: 'other_loss', weekRotation: 'Long Week', weekIdx: 8, weekEnd: '2026-02-23', amount: 100 })
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

  // DW-5 regression: Number("") and Number(null) both evaluate to 0, so a naive
  // Number(event.weekIdx) silently borrows week 0's real tax status for an event
  // that isn't actually tied to any week — see resolveEventWeekMeta's comment.
  describe('weekIdx "" / null must not be coerced to week 0', () => {
    it('an unresolved weekIdx ("") does not inherit week 0\'s tax override', () => {
      const cfgWithOverride = { ...cfg, pastWeekTaxStatusOverrides: { 0: true } }
      const event = makeEvent({ type: 'other_loss', weekIdx: '', amount: 100 })
      const result = calcEventImpact(event, cfgWithOverride)
      // No real week → FICA only, no withholding guessed from week 0's override.
      expect(result.netLost).toBeCloseTo(100 * (1 - cfg.ficaRate))
    })

    it('an unresolved weekIdx (null) behaves the same as ""', () => {
      const cfgWithOverride = { ...cfg, pastWeekTaxStatusOverrides: { 0: true } }
      const event = makeEvent({ type: 'other_loss', weekIdx: null, amount: 100 })
      const result = calcEventImpact(event, cfgWithOverride)
      expect(result.netLost).toBeCloseTo(100 * (1 - cfg.ficaRate))
    })

    it('an event genuinely tied to weekIdx 0 still honors week 0\'s override', () => {
      const cfgWithOverride = { ...cfg, pastWeekTaxStatusOverrides: { 0: true } }
      const event = makeEvent({ type: 'other_loss', weekRotation: '4-Day', weekIdx: 0, weekEnd: '2026-01-05', amount: 100 })
      const result = calcEventImpact(event, cfgWithOverride)
      const effectiveRate = cfg.ficaRate + cfg.w1FedRate + cfg.w1StateRate
      expect(result.netLost).toBeCloseTo(100 * (1 - effectiveRate))
    })
  })
})

describe('resolveEventWeekMeta', () => {
  const allWeeks = [
    { idx: 0, grossPay: 111, isHighWeek: false },
    { idx: 5, grossPay: 999, isHighWeek: true },
  ]

  it('resolves a real weekIdx to its matching week object', () => {
    const { weekIdx, weekMeta } = resolveEventWeekMeta({ weekIdx: 5 }, allWeeks)
    expect(weekIdx).toBe(5)
    expect(weekMeta).toEqual(allWeeks[1])
  })

  it('returns weekIdx 0 (not null) for a genuine week-0 event', () => {
    const { weekIdx, weekMeta } = resolveEventWeekMeta({ weekIdx: 0 }, allWeeks)
    expect(weekIdx).toBe(0)
    expect(weekMeta).toEqual(allWeeks[0])
  })

  it('returns null weekIdx/weekMeta for ""', () => {
    const result = resolveEventWeekMeta({ weekIdx: '' }, allWeeks)
    expect(result.weekIdx).toBeNull()
    expect(result.weekMeta).toBeNull()
  })

  it('returns null weekIdx/weekMeta for null and undefined', () => {
    expect(resolveEventWeekMeta({ weekIdx: null }, allWeeks).weekIdx).toBeNull()
    expect(resolveEventWeekMeta({ weekIdx: undefined }, allWeeks).weekIdx).toBeNull()
  })

  it('returns the real weekIdx but null weekMeta when no week in allWeeks matches', () => {
    const { weekIdx, weekMeta } = resolveEventWeekMeta({ weekIdx: 42 }, allWeeks)
    expect(weekIdx).toBe(42)
    expect(weekMeta).toBeNull()
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

// phaseIdxForMonth
// ─────────────────────────────────────────────────────────────

describe('phaseIdxForMonth', () => {
  it('maps Q1 months to phase 0', () => {
    expect(phaseIdxForMonth('2026-01')).toBe(0)
    expect(phaseIdxForMonth('2026-02')).toBe(0)
    expect(phaseIdxForMonth('2026-03')).toBe(0)
  })

  it('maps Q2 months to phase 1', () => {
    expect(phaseIdxForMonth('2026-04')).toBe(1)
    expect(phaseIdxForMonth('2026-05')).toBe(1)
    expect(phaseIdxForMonth('2026-06')).toBe(1)
  })

  it('maps Q3 months to phase 2', () => {
    expect(phaseIdxForMonth('2026-07')).toBe(2)
    expect(phaseIdxForMonth('2026-08')).toBe(2)
    expect(phaseIdxForMonth('2026-09')).toBe(2)
  })

  it('maps Q4 months to phase 3', () => {
    expect(phaseIdxForMonth('2026-10')).toBe(3)
    expect(phaseIdxForMonth('2026-11')).toBe(3)
    expect(phaseIdxForMonth('2026-12')).toBe(3)
  })
})

// getEffectiveAmountForMonth
// ─────────────────────────────────────────────────────────────

describe('getEffectiveAmountForMonth', () => {
  const baseExpense = {
    history: [{ effectiveFrom: '2026-01-05', weekly: [100, 100, 100, 100] }],
  }

  it('falls back to history resolution when no monthlyOverrides', () => {
    expect(getEffectiveAmountForMonth(baseExpense, '2026-05', 1)).toBe(100)
  })

  it('returns the override perPaycheck when monthlyOverrides has an entry', () => {
    const exp = {
      ...baseExpense,
      monthlyOverrides: { '2026-05': { perPaycheck: 87.5, amount: 350, cycle: 'every30days' } },
    }
    expect(getEffectiveAmountForMonth(exp, '2026-05', 1)).toBe(87.5)
  })

  it('returns 0 for a zeroed (soft-deleted) month override', () => {
    const exp = {
      ...baseExpense,
      monthlyOverrides: { '2026-06': { perPaycheck: 0, amount: 0, cycle: 'every30days' } },
    }
    expect(getEffectiveAmountForMonth(exp, '2026-06', 1)).toBe(0)
  })

  it('override for one month does not affect other months', () => {
    const exp = {
      ...baseExpense,
      monthlyOverrides: { '2026-05': { perPaycheck: 87.5, amount: 350, cycle: 'every30days' } },
    }
    expect(getEffectiveAmountForMonth(exp, '2026-04', 1)).toBe(100) // April falls back to history
    expect(getEffectiveAmountForMonth(exp, '2026-06', 1)).toBe(100) // June falls back to history
  })

  it('uses phaseIdx to pick the correct history weekly slot when no override', () => {
    const exp = {
      history: [{ effectiveFrom: '2026-01-05', weekly: [50, 75, 100, 125] }],
    }
    expect(getEffectiveAmountForMonth(exp, '2026-02', 0)).toBe(50)  // Q1
    expect(getEffectiveAmountForMonth(exp, '2026-08', 2)).toBe(100) // Q3
    expect(getEffectiveAmountForMonth(exp, '2026-11', 3)).toBe(125) // Q4
  })

  it('handles expense with no history and no overrides', () => {
    expect(getEffectiveAmountForMonth({}, '2026-05', 1)).toBe(0)
  })
})
