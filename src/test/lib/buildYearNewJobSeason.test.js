import { describe, it, expect } from 'vitest'
import { buildYear, computeNet, toLocalIso } from '../../lib/finance.js'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// Base-user config: flat 40h × $20 = $800 gross every week, active from week 0.
// taxedWeeks emptied so computeNet takes the untaxed path (isolates the
// job-loss / unemployment math from withholding).
const BASE_CFG = {
  ...DEFAULT_CONFIG,
  employerPreset: null,
  customWeeklyHours: 40,
  baseRate: 20,
  otThreshold: 40,
  otMultiplier: 1.5,
  nightDiffEnabled: false,
  firstActiveIdx: 0,
  taxedWeeks: [],
  k401Rate: 0,
  selectedBenefits: [],
  otherDeductions: [],
}

// Week 0 ends 2026-01-05 (FISCAL_YEAR_START); weekEnd advances 7 days per idx.
// newJobSeasonDate 2026-03-01 (Sunday) → first affected weekEnd is idx 8 (Mon 2026-03-02).
const JOB_LOSS_CFG = {
  ...BASE_CFG,
  newJobSeasonMode: true,
  newJobSeasonDate: '2026-03-01',
}
const FIRST_LOSS_IDX = 8

describe('buildYear — New Job Season', () => {
  it('zeros earned income for weeks on/after newJobSeasonDate', () => {
    const weeks = buildYear(JOB_LOSS_CFG)
    const lost = weeks[FIRST_LOSS_IDX]
    expect(lost.grossPay).toBe(0)
    expect(lost.totalHours).toBe(0)
    expect(lost.workedDayNames).toEqual([])
    expect(lost.active).toBe(false)
    // and every later week too
    expect(weeks.slice(FIRST_LOSS_IDX).every(w => w.grossPay === 0 && !w.active)).toBe(true)
  })

  it('leaves historical weeks before newJobSeasonDate untouched', () => {
    const weeks = buildYear(JOB_LOSS_CFG)
    const before = weeks[FIRST_LOSS_IDX - 1]
    expect(before.grossPay).toBeCloseTo(800)
    expect(before.active).toBe(true)
  })

  it('ignores newJobSeasonDate when newJobSeasonMode is off', () => {
    const weeks = buildYear({ ...JOB_LOSS_CFG, newJobSeasonMode: false })
    expect(weeks[FIRST_LOSS_IDX].grossPay).toBeCloseTo(800)
    expect(weeks[FIRST_LOSS_IDX].active).toBe(true)
  })

  it('resumes earned income at returnToWorkDate (§1.C6)', () => {
    // 2026-06-04 (Thu) → first resumed weekEnd is Mon 2026-06-08
    const weeks = buildYear({ ...JOB_LOSS_CFG, returnToWorkDate: '2026-06-04' })
    const resumed = weeks.find(w => toLocalIso(w.weekEnd) === '2026-06-08')
    expect(resumed.grossPay).toBeCloseTo(800)
    expect(resumed.active).toBe(true)
    // the week before the boundary is still in job loss
    const stillLost = weeks[resumed.idx - 1]
    expect(stillLost.grossPay).toBe(0)
    expect(stillLost.active).toBe(false)
  })
})

describe('buildYear — unemployment benefits window (§1.C2)', () => {
  const UI_CFG = {
    ...JOB_LOSS_CFG,
    unemploymentEnabled: true,
    unemploymentWeekly: 320,
    unemploymentDurationWeeks: 3,
    unemploymentWaitingWeek: false,
  }

  const incomes = cfg => buildYear(cfg).map(w => w.unemploymentIncome)

  it('pays exactly durationWeeks starting the first job-loss week (no waiting week)', () => {
    const ui = incomes(UI_CFG)
    expect(ui.slice(FIRST_LOSS_IDX, FIRST_LOSS_IDX + 3)).toEqual([320, 320, 320])
    expect(ui[FIRST_LOSS_IDX - 1]).toBe(0)
    expect(ui[FIRST_LOSS_IDX + 3]).toBe(0)
  })

  it('shifts the window one week when unemploymentWaitingWeek is set', () => {
    const ui = incomes({ ...UI_CFG, unemploymentWaitingWeek: true })
    expect(ui[FIRST_LOSS_IDX]).toBe(0) // unpaid waiting week
    expect(ui.slice(FIRST_LOSS_IDX + 1, FIRST_LOSS_IDX + 4)).toEqual([320, 320, 320])
    expect(ui[FIRST_LOSS_IDX + 4]).toBe(0)
  })

  it('pays nothing unless unemploymentEnabled is exactly true', () => {
    expect(incomes({ ...UI_CFG, unemploymentEnabled: null }).every(v => v === 0)).toBe(true)
    expect(incomes({ ...UI_CFG, unemploymentEnabled: false }).every(v => v === 0)).toBe(true)
  })

  it('pays nothing for a zero weekly amount or zero duration', () => {
    expect(incomes({ ...UI_CFG, unemploymentWeekly: 0 }).every(v => v === 0)).toBe(true)
    expect(incomes({ ...UI_CFG, unemploymentDurationWeeks: 0 }).every(v => v === 0)).toBe(true)
  })

  it('ends benefits early at returnToWorkDate even if duration remains', () => {
    // Return to work 2 weeks after the loss cuts a 3-week benefit short.
    const weeks = buildYear({ ...UI_CFG, unemploymentDurationWeeks: 10, returnToWorkDate: '2026-03-12' })
    const resumedIdx = weeks.findIndex(w => w.idx > FIRST_LOSS_IDX && w.active)
    expect(resumedIdx).toBeGreaterThan(FIRST_LOSS_IDX)
    expect(weeks[resumedIdx].unemploymentIncome).toBe(0)
    expect(weeks[resumedIdx].grossPay).toBeCloseTo(800)
  })

  it('computeNet passes unemployment income through untaxed on inactive weeks', () => {
    const weeks = buildYear(UI_CFG)
    const benefitWeek = weeks[FIRST_LOSS_IDX + 1]
    expect(benefitWeek.active).toBe(false)
    expect(computeNet(benefitWeek, UI_CFG, 0, false)).toBe(320)
  })
})

describe('buildYear — pay schedule pay-week flags', () => {
  it('monthly: exactly one pay week per calendar month — the last active week', () => {
    const weeks = buildYear({ ...BASE_CFG, userPaySchedule: 'monthly' })
    const byMonth = new Map()
    for (const w of weeks) {
      const key = `${w.weekEnd.getFullYear()}-${w.weekEnd.getMonth()}`
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key).push(w)
    }
    for (const group of byMonth.values()) {
      const payWeeks = group.filter(w => w.isPayWeek)
      expect(payWeeks).toHaveLength(1)
      expect(payWeeks[0].idx).toBe(Math.max(...group.map(w => w.idx)))
    }
  })

  it('monthly: inactive weeks are never pay weeks', () => {
    const weeks = buildYear({ ...BASE_CFG, userPaySchedule: 'monthly', firstActiveIdx: 7 })
    expect(weeks.slice(0, 7).every(w => w.isPayWeek === false)).toBe(true)
    // January has no active weeks (weeks 0-3 inactive) → no pay week at all
    const january = weeks.filter(w => w.weekEnd.getMonth() === 0 && w.weekEnd.getFullYear() === 2026)
    expect(january.some(w => w.isPayWeek)).toBe(false)
  })

  it('biweekly: explicit parity marks alternating pay weeks', () => {
    const weeks = buildYear({ ...BASE_CFG, userPaySchedule: 'biweekly', biweeklyPayWeekParity: 0 })
    expect(weeks[0].isPayWeek).toBe(true)
    expect(weeks[1].isPayWeek).toBe(false)
    expect(weeks[2].isPayWeek).toBe(true)
  })

  it('biweekly: parity falls back to firstActiveIdx % 2 when unanswered', () => {
    const weeks = buildYear({
      ...BASE_CFG,
      userPaySchedule: 'biweekly',
      biweeklyPayWeekParity: null,
      firstActiveIdx: 7,
    })
    expect(weeks[7].isPayWeek).toBe(true)  // odd parity from firstActiveIdx=7
    expect(weeks[8].isPayWeek).toBe(false)
    expect(weeks[9].isPayWeek).toBe(true)
  })

  it('weekly: every active week is a pay week', () => {
    const weeks = buildYear({ ...BASE_CFG, userPaySchedule: 'weekly' })
    expect(weeks.every(w => w.isPayWeek === w.active)).toBe(true)
  })
})
