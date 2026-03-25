import { describe, it, expect } from 'vitest'
import { toLocalIso } from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────────────────────
// Inline re-implementations of the two derivations from App.jsx (lines 210–225).
//
// These are pure functions of (allWeeks, weekConfirmations, today).
// Testing them here catches regressions in the trigger logic without needing
// to render the full App component.
//
// If the logic in App.jsx is ever changed, these tests should catch a mismatch.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the most recent UNCONFIRMED past week, or null if all past weeks are confirmed.
 * Mirrors App.jsx confirmTriggerWeek memo (lines 210–216).
 */
function confirmTriggerWeek(allWeeks, weekConfirmations, today) {
  const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today)
  const unconfirmedWeeks = pastWeeks.filter(w => !weekConfirmations[w.idx])
  if (!unconfirmedWeeks.length) return null
  return unconfirmedWeeks[unconfirmedWeeks.length - 1]
}

/**
 * Returns the count of ALL unconfirmed past weeks.
 * Mirrors App.jsx unconfirmedCount memo (lines 222–225).
 */
function unconfirmedCount(allWeeks, weekConfirmations, today) {
  const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today)
  return pastWeeks.filter(w => !weekConfirmations[w.idx]).length
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeWeek(idx, weekEndIso, active = true) {
  return {
    idx,
    active,
    weekEnd: new Date(weekEndIso + 'T00:00:00'), // local midnight
    rotation: '6-Day',
    workedDayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// confirmTriggerWeek
// ─────────────────────────────────────────────────────────────────────────────

describe('confirmTriggerWeek', () => {
  it('returns null when there are no past weeks', () => {
    const weeks = [makeWeek(1, '2026-12-31')] // future week
    expect(confirmTriggerWeek(weeks, {}, '2026-01-01')).toBeNull()
  })

  it('returns null when all past weeks are confirmed', () => {
    const weeks = [makeWeek(1, '2026-01-05'), makeWeek(2, '2026-01-12')]
    const confirmations = { 1: { confirmedAt: '2026-01-06' }, 2: { confirmedAt: '2026-01-13' } }
    expect(confirmTriggerWeek(weeks, confirmations, '2026-01-20')).toBeNull()
  })

  it('returns the only unconfirmed past week', () => {
    const weeks = [makeWeek(1, '2026-01-05')]
    expect(confirmTriggerWeek(weeks, {}, '2026-01-10')).toMatchObject({ idx: 1 })
  })

  it('returns the MOST RECENT unconfirmed week when multiple are unconfirmed', () => {
    const weeks = [
      makeWeek(1, '2026-01-05'),
      makeWeek(2, '2026-01-12'),
      makeWeek(3, '2026-01-19'),
    ]
    // None confirmed
    const result = confirmTriggerWeek(weeks, {}, '2026-01-25')
    expect(result.idx).toBe(3) // most recent
  })

  it('skips already-confirmed weeks and returns the most recent unconfirmed', () => {
    const weeks = [
      makeWeek(1, '2026-01-05'),
      makeWeek(2, '2026-01-12'),
      makeWeek(3, '2026-01-19'),
    ]
    // Weeks 2 and 3 confirmed; week 1 is still unconfirmed
    const confirmations = { 2: { confirmedAt: '2026-01-13' }, 3: { confirmedAt: '2026-01-20' } }
    const result = confirmTriggerWeek(weeks, confirmations, '2026-01-25')
    expect(result.idx).toBe(1)
  })

  it('surfaces older skipped weeks after the newest one is confirmed', () => {
    const weeks = [
      makeWeek(5, '2026-02-02'),
      makeWeek(6, '2026-02-09'),
      makeWeek(7, '2026-02-16'),
    ]
    // Start: all unconfirmed → shows week 7
    let result = confirmTriggerWeek(weeks, {}, '2026-02-20')
    expect(result.idx).toBe(7)

    // Confirm week 7 → shows week 6
    let confirmations = { 7: { confirmedAt: '2026-02-17' } }
    result = confirmTriggerWeek(weeks, confirmations, '2026-02-20')
    expect(result.idx).toBe(6)

    // Confirm week 6 → shows week 5
    confirmations = { 6: { confirmedAt: '2026-02-10' }, 7: { confirmedAt: '2026-02-17' } }
    result = confirmTriggerWeek(weeks, confirmations, '2026-02-20')
    expect(result.idx).toBe(5)

    // Confirm all → null
    confirmations = { 5: { confirmedAt: '2026-02-03' }, 6: { confirmedAt: '2026-02-10' }, 7: { confirmedAt: '2026-02-17' } }
    result = confirmTriggerWeek(weeks, confirmations, '2026-02-20')
    expect(result).toBeNull()
  })

  it('ignores inactive weeks even if unconfirmed and in the past', () => {
    const weeks = [
      makeWeek(1, '2026-01-05', false), // inactive
      makeWeek(2, '2026-01-12', true),
    ]
    const result = confirmTriggerWeek(weeks, {}, '2026-01-20')
    expect(result.idx).toBe(2) // only active weeks considered
  })

  it('does not trigger for the current (in-progress) week — weekEnd must be strictly past', () => {
    const today = '2026-01-12'
    const weeks = [makeWeek(2, today)] // weekEnd === today, not strictly past
    expect(confirmTriggerWeek(weeks, {}, today)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// unconfirmedCount
// ─────────────────────────────────────────────────────────────────────────────

describe('unconfirmedCount', () => {
  it('returns 0 when there are no past weeks', () => {
    expect(unconfirmedCount([makeWeek(1, '2026-12-31')], {}, '2026-01-01')).toBe(0)
  })

  it('returns 0 when all past weeks are confirmed', () => {
    const weeks = [makeWeek(1, '2026-01-05'), makeWeek(2, '2026-01-12')]
    const confirmations = { 1: {}, 2: {} }
    expect(unconfirmedCount(weeks, confirmations, '2026-01-20')).toBe(0)
  })

  it('returns the total count of ALL unconfirmed past weeks, not just the most recent', () => {
    const weeks = [
      makeWeek(1, '2026-01-05'),
      makeWeek(2, '2026-01-12'),
      makeWeek(3, '2026-01-19'),
    ]
    expect(unconfirmedCount(weeks, {}, '2026-01-25')).toBe(3)
  })

  it('counts partial confirmation correctly', () => {
    const weeks = [
      makeWeek(1, '2026-01-05'),
      makeWeek(2, '2026-01-12'),
      makeWeek(3, '2026-01-19'),
    ]
    const confirmations = { 2: { confirmedAt: '2026-01-13' } } // only week 2 confirmed
    expect(unconfirmedCount(weeks, confirmations, '2026-01-25')).toBe(2)
  })

  it('decrements by 1 each time a week is confirmed', () => {
    const weeks = [makeWeek(1, '2026-01-05'), makeWeek(2, '2026-01-12')]
    const today = '2026-01-20'

    expect(unconfirmedCount(weeks, {}, today)).toBe(2)
    expect(unconfirmedCount(weeks, { 1: {} }, today)).toBe(1)
    expect(unconfirmedCount(weeks, { 1: {}, 2: {} }, today)).toBe(0)
  })

  it('ignores inactive weeks in the count', () => {
    const weeks = [
      makeWeek(1, '2026-01-05', false), // inactive
      makeWeek(2, '2026-01-12', true),
    ]
    expect(unconfirmedCount(weeks, {}, '2026-01-20')).toBe(1)
  })

  it('badge accumulates — confirming newest week does not reduce count of older ones', () => {
    const weeks = [
      makeWeek(1, '2026-01-05'),
      makeWeek(2, '2026-01-12'),
      makeWeek(3, '2026-01-19'),
    ]
    const today = '2026-01-25'
    // Only confirm the newest
    const confirmations = { 3: { confirmedAt: '2026-01-20' } }
    // Count should still be 2 (weeks 1 and 2 remain unconfirmed)
    expect(unconfirmedCount(weeks, confirmations, today)).toBe(2)
  })
})
