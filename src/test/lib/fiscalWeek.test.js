import { describe, it, expect } from 'vitest'
import {
  FISCAL_WEEKS_PER_YEAR,
  getCurrentFiscalWeek,
  getFiscalWeekNumber,
  getFiscalWeekInfo,
  formatFiscalWeekLabel,
} from '../../lib/fiscalWeek.js'

const makeWeek = (idx, dateIso, active = true) => ({
  idx,
  active,
  weekEnd: new Date(`${dateIso}T12:00:00Z`),
})

describe('getCurrentFiscalWeek', () => {
  it('returns the first active week whose end date is on or after today', () => {
    const weeks = [
      makeWeek(0, '2026-01-01'),
      makeWeek(1, '2026-01-08'),
      { ...makeWeek(2, '2026-01-15'), active: false },
      makeWeek(3, '2026-01-22'),
    ]

    const result = getCurrentFiscalWeek(weeks, '2026-01-10')
    expect(result).toBe(weeks[3])
  })

  it('returns null when no active week meets the criteria', () => {
    const weeks = [makeWeek(0, '2025-12-25', false)]
    expect(getCurrentFiscalWeek(weeks, '2026-01-01')).toBeNull()
    expect(getCurrentFiscalWeek(undefined, '2026-01-01')).toBeNull()
  })
})

describe('getFiscalWeekNumber', () => {
  it('converts a zero-based index to a clamped 1-based number', () => {
    expect(getFiscalWeekNumber(0, FISCAL_WEEKS_PER_YEAR)).toBe(1)
    expect(getFiscalWeekNumber(10, 12)).toBe(11)
  })

  it('clamps to total weeks when idx exceeds the season', () => {
    expect(getFiscalWeekNumber(60, 12)).toBe(12)
  })

  it('returns null for non-finite inputs', () => {
    expect(getFiscalWeekNumber(undefined)).toBeNull()
    expect(getFiscalWeekNumber(Number.NaN)).toBeNull()
  })
})

describe('getFiscalWeekInfo', () => {
  it('packs the computed week number with total weeks', () => {
    const info = getFiscalWeekInfo({ idx: 2 }, 12)
    expect(info).toEqual({ num: 3, total: 12 })
  })

  it('returns null when currentWeek is missing or invalid', () => {
    expect(getFiscalWeekInfo(null, 12)).toBeNull()
    expect(getFiscalWeekInfo({ idx: Number.NaN }, 12)).toBeNull()
  })
})

describe('formatFiscalWeekLabel', () => {
  it('formats a human-friendly label', () => {
    const label = formatFiscalWeekLabel({ num: 5, total: 52 })
    expect(label).toBe('Week 5, 47 left')
  })

  it('returns an em dash placeholder when info missing', () => {
    expect(formatFiscalWeekLabel(null)).toBe('\u2014')
  })
})
