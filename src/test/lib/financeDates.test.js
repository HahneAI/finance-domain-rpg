import { describe, it, expect } from 'vitest'
import {
  fmtFullDate,
  fmtLoanDate,
  fiscalMonthKey,
  fiscalMonthLabel,
  toLocalIso,
} from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────
// toLocalIso
// ─────────────────────────────────────────────────────────────

describe('toLocalIso', () => {
  it('formats a local Date as YYYY-MM-DD with zero padding', () => {
    expect(toLocalIso(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toLocalIso(new Date(2026, 10, 9))).toBe('2026-11-09')
  })

  it('uses local calendar fields (no UTC shift)', () => {
    // 11:59 PM local on Dec 31 must stay Dec 31 regardless of timezone
    expect(toLocalIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})

// ─────────────────────────────────────────────────────────────
// fmtFullDate
// ─────────────────────────────────────────────────────────────

describe('fmtFullDate', () => {
  it('formats an ISO string as "Month Dayth, Year"', () => {
    expect(fmtFullDate('2027-06-17')).toBe('June 17th, 2027')
  })

  it('formats a Date object the same way', () => {
    expect(fmtFullDate(new Date(2027, 5, 17))).toBe('June 17th, 2027')
  })

  it.each([
    ['2026-01-01', 'January 1st, 2026'],
    ['2026-02-02', 'February 2nd, 2026'],
    ['2026-03-03', 'March 3rd, 2026'],
    ['2026-04-04', 'April 4th, 2026'],
    ['2026-05-11', 'May 11th, 2026'],   // 11–13 are always "th"
    ['2026-06-12', 'June 12th, 2026'],
    ['2026-07-13', 'July 13th, 2026'],
    ['2026-08-21', 'August 21st, 2026'],
    ['2026-09-22', 'September 22nd, 2026'],
    ['2026-10-23', 'October 23rd, 2026'],
    ['2026-12-31', 'December 31st, 2026'],
  ])('applies the correct ordinal: %s → %s', (iso, expected) => {
    expect(fmtFullDate(iso)).toBe(expected)
  })

  it('returns an empty string for falsy input', () => {
    expect(fmtFullDate(null)).toBe('')
    expect(fmtFullDate(undefined)).toBe('')
    expect(fmtFullDate('')).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────
// fmtLoanDate
// ─────────────────────────────────────────────────────────────

describe('fmtLoanDate', () => {
  const FY_END = '2027-01-04'

  it('omits the year for dates within the current fiscal year', () => {
    expect(fmtLoanDate('2026-08-15', FY_END)).toBe('August 15th')
    expect(fmtLoanDate(FY_END, FY_END)).toBe('January 4th') // boundary: <= end
  })

  it('shows the year for dates after the fiscal year end', () => {
    expect(fmtLoanDate('2027-01-05', FY_END)).toBe('January 5th, 2027')
  })

  it('shows the year when no fiscal year end is provided', () => {
    expect(fmtLoanDate('2026-08-15', null)).toBe('August 15th, 2026')
    expect(fmtLoanDate('2026-08-15')).toBe('August 15th, 2026')
  })

  it('returns an empty string for falsy input', () => {
    expect(fmtLoanDate(null, FY_END)).toBe('')
    expect(fmtLoanDate('', FY_END)).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────
// fiscalMonthKey / fiscalMonthLabel
// ─────────────────────────────────────────────────────────────

describe('fiscalMonthKey', () => {
  it('returns a sortable YYYY-MM key with zero-padded month', () => {
    expect(fiscalMonthKey(new Date(2026, 4, 15))).toBe('2026-05')
    expect(fiscalMonthKey(new Date(2026, 11, 1))).toBe('2026-12')
  })

  it('sorts across the fiscal year-end boundary', () => {
    const dec = fiscalMonthKey(new Date(2026, 11, 15))
    const jan = fiscalMonthKey(new Date(2027, 0, 2))
    expect(jan > dec).toBe(true)
  })
})

describe('fiscalMonthLabel', () => {
  it('uses the bare short month inside the fiscal year primary calendar year', () => {
    expect(fiscalMonthLabel(new Date(2026, 4, 15))).toBe('May')
    expect(fiscalMonthLabel(new Date(2026, 11, 15))).toBe('Dec')
  })

  it("suffixes a short year for spill-over months (e.g. Jan '27)", () => {
    expect(fiscalMonthLabel(new Date(2027, 0, 2))).toBe("Jan '27")
  })
})
