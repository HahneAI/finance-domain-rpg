import { describe, it, expect } from 'vitest'
import { toLocalIso } from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────────────────────
// Inline re-implementations of the Tips/Commission daily check-in trigger
// derivations from App.jsx (isTipsCommissionDayEligible / tipsCommissionTriggerDate).
//
// Mirrors src/test/lib/weekConfirmTrigger.test.js's approach for the weekly
// confirm modal: pure functions of (today, config-ish inputs), tested without
// rendering the full App component. nowHour stands in for new Date().getHours().
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A day becomes askable at noon the day after it (mirrors the DHL Monday-6am
 * gate, just at hour 12 instead of 6, with no employer-preset branch).
 */
function isTipsCommissionDayEligible(dateIso, today, nowHour = 23) {
  const triggerDate = new Date(dateIso + 'T00:00:00')
  triggerDate.setDate(triggerDate.getDate() + 1)
  const triggerIso = toLocalIso(triggerDate)
  if (today < triggerIso) return false
  if (today === triggerIso) return nowHour >= 12
  return true
}

/**
 * Newest-first walk over the last 10 days for the first unresolved + eligible day.
 * loggedDates: real answers (logged, incl. $0 "No") — permanently resolved.
 * skippedToday: session-only skips — resolved for this sitting only.
 */
function tipsCommissionTriggerDate(today, { enabled = true, enabledAt = null, loggedDates = [], skippedToday = [] } = {}, nowHour = 23) {
  if (!enabled) return null
  const logged = new Set(loggedDates)
  const skipped = new Set(skippedToday)
  for (let back = 1; back <= 10; back++) {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - back)
    const dIso = toLocalIso(d)
    if (enabledAt && dIso < enabledAt) return null
    if (logged.has(dIso)) continue
    if (skipped.has(dIso)) continue
    if (!isTipsCommissionDayEligible(dIso, today, nowHour)) continue
    return dIso
  }
  return null
}

describe('isTipsCommissionDayEligible', () => {
  it('is not eligible the same day it occurred', () => {
    expect(isTipsCommissionDayEligible('2026-07-08', '2026-07-08', 23)).toBe(false)
  })

  it('is not eligible the morning after (before noon)', () => {
    expect(isTipsCommissionDayEligible('2026-07-08', '2026-07-09', 11)).toBe(false)
  })

  it('becomes eligible at exactly noon the day after', () => {
    expect(isTipsCommissionDayEligible('2026-07-08', '2026-07-09', 12)).toBe(true)
  })

  it('stays eligible any time after noon the day after', () => {
    expect(isTipsCommissionDayEligible('2026-07-08', '2026-07-09', 18)).toBe(true)
  })

  it('is unconditionally eligible two or more days later, any hour', () => {
    expect(isTipsCommissionDayEligible('2026-07-08', '2026-07-10', 0)).toBe(true)
    expect(isTipsCommissionDayEligible('2026-07-08', '2026-07-15', 0)).toBe(true)
  })
})

describe('tipsCommissionTriggerDate — basic gating', () => {
  it('returns null when not enabled', () => {
    expect(tipsCommissionTriggerDate('2026-07-09', { enabled: false }, 18)).toBeNull()
  })

  it('skips yesterday before noon and falls through to an older backlog day instead', () => {
    // Yesterday (Jul 8) isn't eligible yet at 9am; Jul 7 (2+ days back) has no
    // noon gate, so it surfaces instead of yesterday.
    expect(tipsCommissionTriggerDate('2026-07-09', {}, 9)).toBe('2026-07-07')
  })

  it('returns null before noon when yesterday is the only day within the backlog window', () => {
    // enabledAt = today's yesterday itself, so nothing further back qualifies.
    expect(tipsCommissionTriggerDate('2026-07-09', { enabledAt: '2026-07-08' }, 9)).toBeNull()
  })

  it('surfaces yesterday, "yesterday"-phrased, once eligible at noon', () => {
    expect(tipsCommissionTriggerDate('2026-07-09', {}, 12)).toBe('2026-07-08')
  })

  it('excludes a day that already has a logged answer (including a $0 "No") and moves to the next one', () => {
    expect(tipsCommissionTriggerDate('2026-07-09', { loggedDates: ['2026-07-08'] }, 18)).toBe('2026-07-07')
  })
})

describe('tipsCommissionTriggerDate — backward-walking backlog (dictated example)', () => {
  // Wed Jul 8 skipped → Thu Jul 9 asks about yesterday (Wed 8) → also unresolved
  // → Fri Jul 10 asks about yesterday (Thu 9) → resolving/skipping it in the same
  // sitting chains back to Wed 8 (no longer "yesterday", phrased with its own date).
  it('Thursday asks about Wednesday (still unresolved) as "yesterday"', () => {
    expect(tipsCommissionTriggerDate('2026-07-09', {}, 14)).toBe('2026-07-08')
  })

  it('Friday asks about Thursday (newest unresolved) as "yesterday"', () => {
    expect(tipsCommissionTriggerDate('2026-07-10', {}, 14)).toBe('2026-07-09')
  })

  it('same-sitting chaining: once Thursday (Jul 9) is skipped, Wednesday (Jul 8) surfaces next', () => {
    expect(tipsCommissionTriggerDate('2026-07-10', { skippedToday: ['2026-07-09'] }, 14)).toBe('2026-07-08')
  })

  it('keeps chaining backward as each resolved day is added to the same-sitting skip set', () => {
    expect(tipsCommissionTriggerDate('2026-07-10', { skippedToday: ['2026-07-09', '2026-07-08'] }, 14)).toBe('2026-07-07')
  })
})

describe('tipsCommissionTriggerDate — 10-day backlog cutoff', () => {
  it('surfaces the oldest (10-day) backlog day once every newer day is resolved', () => {
    const today = '2026-07-19'
    // Resolve (skip) the 9 newest backlog days (back=1..9), leaving only back=10 open.
    const skippedToday = []
    for (let back = 1; back <= 9; back++) {
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() - back)
      skippedToday.push(toLocalIso(d))
    }
    expect(tipsCommissionTriggerDate(today, { skippedToday }, 14)).toBe('2026-07-09') // back=10
  })

  it('never surfaces a day older than the 10-day window, even if it would otherwise be unresolved', () => {
    const today = '2026-07-19'
    // Resolve (skip) all 10 backlog days (back=1..10) — an 11-days-back day (Jul 8)
    // is unresolved but must never surface since it's outside the window.
    const skippedToday = []
    for (let back = 1; back <= 10; back++) {
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() - back)
      skippedToday.push(toLocalIso(d))
    }
    expect(tipsCommissionTriggerDate(today, { skippedToday }, 14)).toBeNull()
  })
})

describe('tipsCommissionTriggerDate — enabledAt floor', () => {
  it('does not ask about days before the opt-in date', () => {
    // Opted in Jul 15; today Jul 19 → yesterday (Jul 18) is fine, but the walk
    // must stop once it reaches a day before Jul 15.
    expect(tipsCommissionTriggerDate('2026-07-19', { enabledAt: '2026-07-15' }, 14)).toBe('2026-07-18')
  })

  it('returns null when even yesterday predates the opt-in', () => {
    expect(tipsCommissionTriggerDate('2026-07-19', { enabledAt: '2026-07-19' }, 14)).toBeNull()
  })
})
