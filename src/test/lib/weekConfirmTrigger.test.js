import { describe, it, expect } from 'vitest'
import { toLocalIso, getPayPeriodEndDate } from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────────────────────
// Inline re-implementations of the trigger derivations from App.jsx.
//
// These are pure functions of (allWeeks, weekConfirmations, today, config).
// Testing them here catches regressions in the trigger logic without needing
// to render the full App component.
//
// isPayPeriodPast omits the DHL 6 AM wall-clock check (which depends on
// new Date().getHours()) — that branch is covered by dedicated DHL tests below
// using a time-injectable variant.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core pay-period-past predicate (no wall-clock side effect).
 * DHL path: caller supplies nowHour to stand in for new Date().getHours().
 */
function isPayPeriodPast(week, today, config, nowHour = 23) {
  const isEmployerDHL = config?.employerPreset === 'DHL'
  const payPeriodEndIso = toLocalIso(week.payPeriodEndDate)
  if (isEmployerDHL) {
    const triggerDate = new Date(week.payPeriodEndDate)
    triggerDate.setDate(triggerDate.getDate() + 1) // Sunday → Monday
    const triggerIso = toLocalIso(triggerDate)
    if (today < triggerIso) return false
    if (today === triggerIso) return nowHour >= 6
    return true
  }
  return payPeriodEndIso < today
}

/**
 * Returns the most recent UNCONFIRMED week whose pay period has closed, or null.
 * Mirrors App.jsx confirmTriggerWeek memo.
 */
function confirmTriggerWeek(allWeeks, weekConfirmations, today, config = {}, nowHour = 23) {
  const pastWeeks = allWeeks.filter(w => w.active && isPayPeriodPast(w, today, config, nowHour))
  const unconfirmedWeeks = pastWeeks.filter(w => !weekConfirmations[w.idx])
  if (!unconfirmedWeeks.length) return null
  return unconfirmedWeeks[unconfirmedWeeks.length - 1]
}

/**
 * Returns the count of ALL unconfirmed weeks whose pay period has closed.
 * Mirrors App.jsx unconfirmedCount memo.
 */
function unconfirmedCount(allWeeks, weekConfirmations, today, config = {}, nowHour = 23) {
  const pastWeeks = allWeeks.filter(w => w.active && isPayPeriodPast(w, today, config, nowHour))
  return pastWeeks.filter(w => !weekConfirmations[w.idx]).length
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * makeWeek: builds a minimal week object matching buildYear() output shape.
 * weekEndIso: the fiscal weekEnd (always a Monday in production).
 * payPeriodEndDay: 0=Sun…6=Sat (default 0, Sunday — matches DEFAULT_CONFIG).
 *
 * weekStart is derived as weekEnd − 7 days (always a Monday, same as production).
 * payPeriodEndDate is computed via getPayPeriodEndDate(), same as buildYear().
 */
function makeWeek(idx, weekEndIso, active = true, payPeriodEndDay = 0) {
  const weekEnd = new Date(weekEndIso + 'T00:00:00')
  const weekStart = new Date(weekEnd)
  weekStart.setDate(weekStart.getDate() - 7)
  const payPeriodEndDate = getPayPeriodEndDate(weekStart, payPeriodEndDay)
  return {
    idx,
    active,
    weekEnd,
    weekStart,
    payPeriodEndDate,
    rotation: '6-Day',
    workedDayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getPayPeriodEndDate unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getPayPeriodEndDate', () => {
  // weekStart = Monday Jan 5, 2026
  const weekStart = new Date('2026-01-05T00:00:00')

  it('payPeriodEndDay=0 (Sun) → Jan 11 (Sun, offset 6)', () => {
    expect(toLocalIso(getPayPeriodEndDate(weekStart, 0))).toBe('2026-01-11')
  })
  it('payPeriodEndDay=1 (Mon) → Jan 5 (same as weekStart, offset 0)', () => {
    expect(toLocalIso(getPayPeriodEndDate(weekStart, 1))).toBe('2026-01-05')
  })
  it('payPeriodEndDay=5 (Fri) → Jan 9 (Fri, offset 4)', () => {
    expect(toLocalIso(getPayPeriodEndDate(weekStart, 5))).toBe('2026-01-09')
  })
  it('payPeriodEndDay=6 (Sat) → Jan 10 (Sat, offset 5)', () => {
    expect(toLocalIso(getPayPeriodEndDate(weekStart, 6))).toBe('2026-01-10')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Base-user confirmTriggerWeek (payPeriodEndDay=5, Friday)
// weekEnd=Jan 12 Mon → payPeriodEndDate=Jan 9 Fri → triggers Sat Jan 10+
// ─────────────────────────────────────────────────────────────────────────────

describe('confirmTriggerWeek — base user (Friday pay period)', () => {
  // weekEnd=Jan 12 (Monday); payPeriodEndDate=Jan 9 (Friday)
  const WEEK = makeWeek(1, '2026-01-12', true, 5)

  it('does NOT trigger while still inside the pay period (Friday Jan 9)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-09')).toBeNull()
  })

  it('does NOT trigger on the pay period end day itself (Friday = "12:00 AM" same date)', () => {
    // payPeriodEndIso < today must be strictly less-than
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-09')).toBeNull()
  })

  it('triggers at 12:01 AM Saturday (day after Friday pay period end)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-10')).toMatchObject({ idx: 1 })
  })

  it('still triggers days later (Monday Jan 12)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-12')).toMatchObject({ idx: 1 })
  })

  it('returns null once the week is confirmed', () => {
    expect(confirmTriggerWeek([WEEK], { 1: { confirmedAt: 'x' } }, '2026-01-10')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DHL confirmTriggerWeek (payPeriodEndDay=0, Sunday) — Monday 6:01 AM gate
// weekEnd=Jan 12 Mon → payPeriodEndDate=Jan 11 Sun → triggerDay=Jan 12 Mon
// ─────────────────────────────────────────────────────────────────────────────

describe('confirmTriggerWeek — DHL (Sunday pay period, Monday 6 AM gate)', () => {
  const DHL_CONFIG = { employerPreset: 'DHL' }
  const WEEK = makeWeek(1, '2026-01-12', true, 0) // payPeriodEndDate = Jan 11 (Sun)

  it('does NOT trigger on Sunday Jan 11 (pay period end day)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-11', DHL_CONFIG, 23)).toBeNull()
  })

  it('does NOT trigger Monday Jan 12 before 6 AM (hour=5)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-12', DHL_CONFIG, 5)).toBeNull()
  })

  it('triggers Monday Jan 12 at exactly 6 AM (hour=6)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-12', DHL_CONFIG, 6)).toMatchObject({ idx: 1 })
  })

  it('triggers Monday Jan 12 after 6 AM (hour=9)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-12', DHL_CONFIG, 9)).toMatchObject({ idx: 1 })
  })

  it('triggers any time Tuesday Jan 13 (day after trigger day)', () => {
    expect(confirmTriggerWeek([WEEK], {}, '2026-01-13', DHL_CONFIG, 0)).toMatchObject({ idx: 1 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// confirmTriggerWeek — general behavior (regression suite from original tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('confirmTriggerWeek', () => {
  it('returns null when there are no past weeks', () => {
    const weeks = [makeWeek(1, '2026-12-07')] // weekEnd far future; payPeriodEnd also future
    expect(confirmTriggerWeek(weeks, {}, '2026-01-01')).toBeNull()
  })

  it('returns null when all past weeks are confirmed', () => {
    // payPeriodEndDay=0 (Sun): weekEnd Jan 12 → payPeriodEnd Jan 11 → triggers from Jan 12
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19')]
    const confirmations = { 1: { confirmedAt: '2026-01-12' }, 2: { confirmedAt: '2026-01-19' } }
    expect(confirmTriggerWeek(weeks, confirmations, '2026-01-26')).toBeNull()
  })

  it('returns the only unconfirmed past week', () => {
    const weeks = [makeWeek(1, '2026-01-12')] // payPeriodEnd = Jan 11 (Sun); triggers from Jan 12
    expect(confirmTriggerWeek(weeks, {}, '2026-01-12')).toMatchObject({ idx: 1 })
  })

  it('returns the MOST RECENT unconfirmed week when multiple are unconfirmed', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19'), makeWeek(3, '2026-01-26')]
    const result = confirmTriggerWeek(weeks, {}, '2026-01-26')
    expect(result.idx).toBe(3)
  })

  it('skips already-confirmed weeks and returns the most recent unconfirmed', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19'), makeWeek(3, '2026-01-26')]
    const confirmations = { 2: { confirmedAt: 'x' }, 3: { confirmedAt: 'x' } }
    expect(confirmTriggerWeek(weeks, confirmations, '2026-01-26')).toMatchObject({ idx: 1 })
  })

  it('surfaces older skipped weeks after the newest is confirmed', () => {
    const weeks = [makeWeek(5, '2026-02-09'), makeWeek(6, '2026-02-16'), makeWeek(7, '2026-02-23')]
    // All unconfirmed → shows week 7
    expect(confirmTriggerWeek(weeks, {}, '2026-02-23').idx).toBe(7)
    // Confirm 7 → shows 6
    expect(confirmTriggerWeek(weeks, { 7: {} }, '2026-02-23').idx).toBe(6)
    // Confirm 6+7 → shows 5
    expect(confirmTriggerWeek(weeks, { 6: {}, 7: {} }, '2026-02-23').idx).toBe(5)
    // Confirm all → null
    expect(confirmTriggerWeek(weeks, { 5: {}, 6: {}, 7: {} }, '2026-02-23')).toBeNull()
  })

  it('ignores inactive weeks even if unconfirmed and in the past', () => {
    const weeks = [makeWeek(1, '2026-01-12', false), makeWeek(2, '2026-01-19', true)]
    expect(confirmTriggerWeek(weeks, {}, '2026-01-19').idx).toBe(2)
  })

  it('does not trigger for a week whose pay period has not yet ended', () => {
    // payPeriodEndDay=0 (Sun): weekEnd Jan 12 → payPeriodEnd Jan 11 → triggers from Jan 12
    // today = Jan 11 (Sunday, the payPeriodEnd itself) → not yet past
    const weeks = [makeWeek(1, '2026-01-12')]
    expect(confirmTriggerWeek(weeks, {}, '2026-01-11')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// unconfirmedCount
// ─────────────────────────────────────────────────────────────────────────────

describe('unconfirmedCount', () => {
  it('returns 0 when there are no past weeks', () => {
    expect(unconfirmedCount([makeWeek(1, '2026-12-07')], {}, '2026-01-01')).toBe(0)
  })

  it('returns 0 when all past weeks are confirmed', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19')]
    expect(unconfirmedCount(weeks, { 1: {}, 2: {} }, '2026-01-26')).toBe(0)
  })

  it('returns the total count of ALL unconfirmed past weeks', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19'), makeWeek(3, '2026-01-26')]
    expect(unconfirmedCount(weeks, {}, '2026-01-26')).toBe(3)
  })

  it('counts partial confirmation correctly', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19'), makeWeek(3, '2026-01-26')]
    expect(unconfirmedCount(weeks, { 2: {} }, '2026-01-26')).toBe(2)
  })

  it('decrements by 1 each time a week is confirmed', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19')]
    const today = '2026-01-26'
    expect(unconfirmedCount(weeks, {}, today)).toBe(2)
    expect(unconfirmedCount(weeks, { 1: {} }, today)).toBe(1)
    expect(unconfirmedCount(weeks, { 1: {}, 2: {} }, today)).toBe(0)
  })

  it('ignores inactive weeks in the count', () => {
    const weeks = [makeWeek(1, '2026-01-12', false), makeWeek(2, '2026-01-19', true)]
    expect(unconfirmedCount(weeks, {}, '2026-01-26')).toBe(1)
  })

  it('badge accumulates — confirming newest week does not reduce count of older ones', () => {
    const weeks = [makeWeek(1, '2026-01-12'), makeWeek(2, '2026-01-19'), makeWeek(3, '2026-01-26')]
    expect(unconfirmedCount(weeks, { 3: {} }, '2026-01-26')).toBe(2)
  })
})
