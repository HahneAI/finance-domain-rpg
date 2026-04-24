import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekConfirmModal } from '../../components/WeekConfirmModal.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  ...DEFAULT_CONFIG,
  shiftHours: 12,
  baseRate: 21.15,
  ficaRate: 0.0765,
  k401StartDate: '2026-01-01',
}

// A standard 6-Day week: Mon–Sat scheduled (Sun off)
const SIX_DAY_WEEK = {
  idx: 7,
  rotation: '6-Day',
  weekStart: new Date(2026, 2, 16), // March 16, 2026 (local)
  weekEnd:   new Date(2026, 2, 22), // March 22, 2026
  workedDayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

// A 4-Day week: Mon, Tue, Fri, Sat scheduled
const FOUR_DAY_WEEK = {
  idx: 8,
  rotation: '4-Day',
  weekStart: new Date(2026, 2, 23),
  weekEnd:   new Date(2026, 2, 29),
  workedDayNames: ['Mon', 'Tue', 'Fri', 'Sat'],
}

function renderModal({ week = SIX_DAY_WEEK, config = BASE_CONFIG, onConfirm, onDismiss } = {}) {
  const mockConfirm  = onConfirm  ?? vi.fn()
  const mockDismiss  = onDismiss  ?? vi.fn()
  render(
    <WeekConfirmModal
      week={week}
      config={config}
      onConfirm={mockConfirm}
      onDismiss={mockDismiss}
    />
  )
  return { mockConfirm, mockDismiss }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — Initial render
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — Layer 1 initial render', () => {
  it('renders the week header with correct index and date range', () => {
    renderModal()
    expect(screen.getByText(/week 7 check-in/i)).toBeTruthy()
    // Date range appears in the header (also appears in day-row labels, so use getAllByText)
    expect(screen.getAllByText(/mar 16/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/mar 22/i).length).toBeGreaterThan(0)
  })

  it('shows the rotation badge', () => {
    renderModal()
    expect(screen.getByText('Long Week')).toBeTruthy()
  })

  it('renders all 7 day rows', () => {
    renderModal()
    // Each day should appear as a row label
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeTruthy()
    }
  })

  it('shows Worked/Missed buttons only for scheduled days', () => {
    renderModal()
    // 6-Day week: 6 scheduled days → 6 pairs
    const workedBtns = screen.getAllByRole('button', { name: /^worked$/i })
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    expect(workedBtns).toHaveLength(6)
    expect(missedBtns).toHaveLength(6)
  })

  it('shows "+ Pickup" button for the unscheduled day (Sun in Long Week)', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /\+ pickup/i })).toBeTruthy()
  })

  it('opens in Layer 1 — does not show Layer 2 form fields', () => {
    renderModal()
    expect(screen.queryByText(/what happened/i)).toBeNull()
    expect(screen.queryByText(/log & confirm/i)).toBeNull()
  })

  it('shows "Confirm Week" button (not "Next →") when all days are default', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /confirm week/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull()
  })

  it('shows "Skip for now" dismiss button', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — Day toggle interactions
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — Layer 1 day toggles', () => {
  it('marking a scheduled day Missed switches button to "Next →"', () => {
    renderModal()
    // Click the first "Missed" button (Mon)
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    expect(screen.getByRole('button', { name: /next/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /confirm week/i })).toBeNull()
  })

  it('shows net summary row after marking a day missed', () => {
    renderModal()
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    expect(screen.getByText(/− 1 missed/i)).toBeTruthy()
  })

  it('shows negative net shift count in summary row', () => {
    renderModal()
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0]) // miss Mon
    fireEvent.click(missedBtns[1]) // miss Tue
    // Layer 1 shows "Net: -2 shifts — review on next screen"
    // ("fewer shifts than scheduled" text only appears after advancing to Layer 2)
    expect(screen.getByText(/net:.*-2.*shift/i)).toBeTruthy()
  })

  it('toggling pickup on an unscheduled day shows "+ 1 pickup" in summary', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /\+ pickup/i }))
    expect(screen.getByText(/\+ 1 pickup/i)).toBeTruthy()
  })

  it('pickup exactly offsetting a missed day shows "Net hours unchanged" and swap buttons', () => {
    renderModal()
    // Miss one scheduled day
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    // Pick up the unscheduled day (Sun)
    fireEvent.click(screen.getByRole('button', { name: /\+ pickup/i }))
    expect(screen.getByText(/net hours unchanged/i)).toBeTruthy()
    // Net-zero swap: show "Confirm Clean" + "Log Swap →" instead of plain "Confirm Week"
    expect(screen.getByRole('button', { name: /confirm clean/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /log swap/i })).toBeTruthy()
  })

  it('confirms ✓ Pickup toggle text when unscheduled day is activated', () => {
    renderModal()
    const pickupBtn = screen.getByRole('button', { name: /\+ pickup/i })
    fireEvent.click(pickupBtn)
    expect(screen.getByRole('button', { name: /✓ pickup/i })).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — onDismiss
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — dismiss', () => {
  it('calls onDismiss when "Skip for now" is clicked', () => {
    const { mockDismiss } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(mockDismiss).toHaveBeenCalledOnce()
  })

  it('does not call onConfirm when skipping', () => {
    const { mockConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(mockConfirm).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — net-zero confirm (skips Layer 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — net-zero confirmation', () => {
  it('calls onConfirm with eventId: null when all days are default (perfect week)', () => {
    const { mockConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /confirm week/i }))
    expect(mockConfirm).toHaveBeenCalledOnce()
    const [confirmation, logEntry] = mockConfirm.mock.calls[0]
    expect(confirmation.netShiftDelta).toBe(0)
    expect(confirmation.eventId).toBeNull()
    expect(logEntry).toBeNull()
  })

  it('includes confirmedAt ISO string in confirmation record', () => {
    const { mockConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /confirm week/i }))
    const [confirmation] = mockConfirm.mock.calls[0]
    expect(typeof confirmation.confirmedAt).toBe('string')
    expect(new Date(confirmation.confirmedAt).getFullYear()).toBe(new Date().getFullYear())
  })

  it('includes scheduledDays array in confirmation record', () => {
    const { mockConfirm } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /confirm week/i }))
    const [confirmation] = mockConfirm.mock.calls[0]
    expect(confirmation.scheduledDays).toEqual(SIX_DAY_WEEK.workedDayNames)
  })

  it('net-zero after miss + pickup: "Confirm Clean" calls onConfirm with netShiftDelta 0 and no logEntry', () => {
    const { mockConfirm } = renderModal()
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])                                            // miss Mon
    fireEvent.click(screen.getByRole('button', { name: /\+ pickup/i }))      // pickup Sun
    fireEvent.click(screen.getByRole('button', { name: /confirm clean/i }))  // choose clean confirm
    const [confirmation, logEntry] = mockConfirm.mock.calls[0]
    expect(confirmation.netShiftDelta).toBe(0)
    expect(logEntry).toBeNull()
  })

  it('does not call onConfirm without user interaction — Layer 2 gate stands', () => {
    const { mockConfirm } = renderModal()
    // Miss a day — should show "Next →" not auto-confirm
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    expect(mockConfirm).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 → Layer 2 transition
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — Layer 1 → Layer 2 transition', () => {
  function goToLayer2() {
    renderModal()
    // Mark one day missed to create a deficit
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
  }

  it('navigates to Layer 2 when "Next →" is clicked after a deficit', () => {
    goToLayer2()
    expect(screen.getByText(/what happened\?/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /log & confirm/i })).toBeTruthy()
  })

  it('pre-selects missed_unpaid type for a deficit', () => {
    goToLayer2()
    const select = screen.getByRole('combobox')
    expect(select.value).toBe('missed_unpaid')
  })

  it('shows the net shift delta banner in Layer 2', () => {
    goToLayer2()
    expect(screen.getByText(/1 fewer shift/i)).toBeTruthy()
  })

  it('shows "← Back" button to return to Layer 1', () => {
    goToLayer2()
    expect(screen.getByRole('button', { name: /← back/i })).toBeTruthy()
  })

  it('back button returns to Layer 1', () => {
    goToLayer2()
    fireEvent.click(screen.getByRole('button', { name: /← back/i }))
    expect(screen.getByRole('button', { name: /next/i })).toBeTruthy()
    expect(screen.queryByText(/what happened\?/i)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — surplus path (pickup → bonus pre-fill)
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — Layer 2 surplus pre-fill', () => {
  function goToLayer2Surplus() {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /\+ pickup/i })) // add Sun pickup
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
  }

  it('pre-selects bonus type for a surplus', () => {
    goToLayer2Surplus()
    const select = screen.getByRole('combobox')
    expect(select.value).toBe('bonus')
  })

  it('shows the net shift delta banner with positive framing', () => {
    goToLayer2Surplus()
    expect(screen.getByText(/1 extra shift/i)).toBeTruthy()
  })

  it('shows gross estimate hint below the amount field for a pickup bonus', () => {
    goToLayer2Surplus()
    // Hint: "Est. 1 pickup shift × 12h × $21.15/hr = $253.80 gross (pre-tax)"
    expect(screen.getByText(/est\. 1 pickup shift/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — onConfirm callback shape
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — Layer 2 onConfirm callback', () => {
  function getToLayer2AndConfirm(mockConfirm) {
    render(
      <WeekConfirmModal
        week={SIX_DAY_WEEK}
        config={BASE_CONFIG}
        onConfirm={mockConfirm}
        onDismiss={vi.fn()}
      />
    )
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0]) // miss Mon → deficit
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    // Two-step: first click shows confirmation summary, second click saves
    fireEvent.click(screen.getByRole('button', { name: /log & confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, log it/i }))
  }

  it('calls onConfirm with a confirmation record and a log entry', () => {
    const mockConfirm = vi.fn()
    getToLayer2AndConfirm(mockConfirm)
    expect(mockConfirm).toHaveBeenCalledOnce()
    const [confirmation, logEntry] = mockConfirm.mock.calls[0]
    expect(confirmation).toBeTruthy()
    expect(logEntry).toBeTruthy()
  })

  it('logEntry has correct shape for missed_unpaid', () => {
    const mockConfirm = vi.fn()
    getToLayer2AndConfirm(mockConfirm)
    const [, logEntry] = mockConfirm.mock.calls[0]
    expect(logEntry.type).toBe('missed_unpaid')
    expect(typeof logEntry.id).toBe('number')
    expect(logEntry.weekEnd).toBe('2026-03-22')
    expect(logEntry.weekIdx).toBe(SIX_DAY_WEEK.idx)
    expect(logEntry.weekRotation).toBe('6-Day')
  })

  it('logEntry numeric fields are proper numbers (not strings)', () => {
    const mockConfirm = vi.fn()
    getToLayer2AndConfirm(mockConfirm)
    const [, logEntry] = mockConfirm.mock.calls[0]
    expect(typeof logEntry.shiftsLost).toBe('number')
    expect(typeof logEntry.hoursLost).toBe('number')
    expect(typeof logEntry.ptoHours).toBe('number')
    expect(typeof logEntry.amount).toBe('number')
  })

  it('confirmation record has correct netShiftDelta for a 1-day deficit', () => {
    const mockConfirm = vi.fn()
    getToLayer2AndConfirm(mockConfirm)
    const [confirmation] = mockConfirm.mock.calls[0]
    expect(confirmation.netShiftDelta).toBe(-1)
  })

  it('confirmation record eventId matches logEntry id', () => {
    const mockConfirm = vi.fn()
    getToLayer2AndConfirm(mockConfirm)
    const [confirmation, logEntry] = mockConfirm.mock.calls[0]
    expect(confirmation.eventId).toBe(logEntry.id)
  })

  it('missedScheduledDays in confirmation contains the missed day label', () => {
    const mockConfirm = vi.fn()
    getToLayer2AndConfirm(mockConfirm)
    const [confirmation] = mockConfirm.mock.calls[0]
    // Mon is the first scheduled day in SIX_DAY_WEEK
    expect(confirmation.missedScheduledDays).toContain('Mon')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Hole 2 fix: vacuous missed event is now blocked
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — Hole 2 fix: vacuous missed_unpaid event blocked', () => {
  it('disables "Log & Confirm" when all days cleared and hours are zero', () => {
    // Hole 2 fix: if the user clears all missedDays pills in Layer 2 without
    // entering manual hours, the "Log & Confirm" button is now disabled.
    render(
      <WeekConfirmModal
        week={SIX_DAY_WEEK}
        config={BASE_CONFIG}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])                                        // miss Mon → deficit
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    // In Layer 2, the day picker shows Mon pre-selected. Click it to deselect.
    const monPills = screen.getAllByRole('button', { name: /^mon$/i })
    fireEvent.click(monPills[monPills.length - 1])
    // "Log & Confirm" should now be disabled — 0 shifts, 0 hours, 0 days
    const logBtn = screen.getByRole('button', { name: /log & confirm/i })
    expect(logBtn).toBeDisabled()
  })

  it('shows the vacuous event warning banner when all days cleared', () => {
    render(
      <WeekConfirmModal
        week={SIX_DAY_WEEK}
        config={BASE_CONFIG}
        onConfirm={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    const monPills = screen.getAllByRole('button', { name: /^mon$/i })
    fireEvent.click(monPills[monPills.length - 1])
    expect(screen.getByText(/no shifts or hours selected/i)).toBeTruthy()
  })

  it('"Skip for now" shows abandon warning after user reached Layer 2', () => {
    const { mockDismiss } = renderModal()
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])                                         // miss Mon → deficit
    fireEvent.click(screen.getByRole('button', { name: /next/i }))         // go to Layer 2
    fireEvent.click(screen.getByRole('button', { name: /← back/i }))       // back to Layer 1
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i })) // try to skip
    // onDismiss should NOT have been called yet — warning is shown first
    expect(mockDismiss).not.toHaveBeenCalled()
    expect(screen.getByText(/you started logging an event/i)).toBeTruthy()
  })

  it('"Yes, skip" in the abandon warning calls onDismiss', () => {
    const { mockDismiss } = renderModal()
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /← back/i }))
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes, skip/i }))
    expect(mockDismiss).toHaveBeenCalledOnce()
  })

  it('"← Keep logging" in the abandon warning dismisses the warning', () => {
    renderModal()
    const missedBtns = screen.getAllByRole('button', { name: /^missed$/i })
    fireEvent.click(missedBtns[0])
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    fireEvent.click(screen.getByRole('button', { name: /← back/i }))
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    fireEvent.click(screen.getByRole('button', { name: /keep logging/i }))
    // Warning gone, "Skip for now" back in footer
    expect(screen.queryByText(/you started logging an event/i)).toBeNull()
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeTruthy()
  })

  it('"Skip for now" with no Layer 2 visit calls onDismiss directly', () => {
    const { mockDismiss } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))
    expect(mockDismiss).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4-Day week variant
// ─────────────────────────────────────────────────────────────────────────────

describe('WeekConfirmModal — 4-Day week', () => {
  it('shows 4 Worked/Missed pairs and 3 pickup buttons (Wed, Thu, Sun unscheduled)', () => {
    renderModal({ week: FOUR_DAY_WEEK })
    const workedBtns = screen.getAllByRole('button', { name: /^worked$/i })
    const pickupBtns = screen.getAllByRole('button', { name: /\+ pickup/i })
    expect(workedBtns).toHaveLength(4)
    expect(pickupBtns).toHaveLength(3)
  })

  it('shows the correct rotation badge', () => {
    renderModal({ week: FOUR_DAY_WEEK })
    expect(screen.getByText('Short Week')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 3 — Core-day pill UI for DHL custom schedule users
// ─────────────────────────────────────────────────────────────────────────────

const DHL_CUSTOM_CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: 'DHL',
  dhlTeam: 'B',
  dhlCustomSchedule: false,
  customWeeklyHours: 48,
  customWeeklyHoursLong: 60,
  customWeeklyHoursShort: 48,
  shiftHours: 12,
  baseRate: 19.65,
  ficaRate: 0.0765,
  k401StartDate: '2026-01-01',
}

// Long week: Tue/Wed/Sat/Sun are core days; Mon is the standard OT day
const DHL_LONG_WEEK = {
  idx: 7,
  rotation: '6-Day',
  isHighWeek: true,
  weekStart: new Date(2026, 2, 16),
  weekEnd:   new Date(2026, 2, 22),
  workedDayNames: ['Tue', 'Wed', 'Sat', 'Sun', 'Mon'],
  requiredOtShifts: 1,
}

// Short week: Mon/Thu/Fri are core days; Tue is the standard OT day
const DHL_SHORT_WEEK = {
  idx: 8,
  rotation: '4-Day',
  isHighWeek: false,
  weekStart: new Date(2026, 2, 23),
  weekEnd:   new Date(2026, 2, 29),
  workedDayNames: ['Mon', 'Thu', 'Fri', 'Tue'],
  requiredOtShifts: 0,
}

describe('WeekConfirmModal — Sprint 3 core-day pills', () => {
  it('renders core-day pills for DHL custom schedule long week (Tue/Wed/Sat/Sun)', () => {
    renderModal({ week: DHL_LONG_WEEK, config: DHL_CUSTOM_CONFIG })
    expect(screen.getByText(/core shifts/i)).toBeTruthy()
    // All 4 core days should appear as pill buttons
    const pills = ['Tue', 'Wed', 'Sat', 'Sun']
    pills.forEach(day => expect(screen.getAllByRole('button', { name: new RegExp(`^${day}$`, 'i') }).length).toBeGreaterThan(0))
    // Mon (OT day) should NOT appear in the core-day section (it's in the OT selector)
  })

  it('renders core-day pills for DHL custom schedule short week (Mon/Thu/Fri)', () => {
    renderModal({ week: DHL_SHORT_WEEK, config: DHL_CUSTOM_CONFIG })
    expect(screen.getByText(/core shifts/i)).toBeTruthy()
    const pills = ['Mon', 'Thu', 'Fri']
    pills.forEach(day => expect(screen.getAllByRole('button', { name: new RegExp(`^${day}$`, 'i') }).length).toBeGreaterThan(0))
  })

  it('does NOT render core-day pills for standard (non-custom) DHL users', () => {
    const standardConfig = { ...DHL_CUSTOM_CONFIG, customWeeklyHours: null, customWeeklyHoursLong: null, customWeeklyHoursShort: null }
    renderModal({ week: DHL_LONG_WEEK, config: standardConfig })
    expect(screen.queryByText(/core shifts/i)).toBeNull()
  })

  it('does NOT render core-day pills for dhlCustomSchedule=true (legacy path)', () => {
    const legacyConfig = { ...DHL_CUSTOM_CONFIG, dhlCustomSchedule: true }
    renderModal({ week: DHL_LONG_WEEK, config: legacyConfig })
    expect(screen.queryByText(/core shifts/i)).toBeNull()
  })

  it('toggling a core pill to missed shows the missed-core warning', () => {
    renderModal({ week: DHL_LONG_WEEK, config: DHL_CUSTOM_CONFIG })
    // Click Tue pill to mark it as missed
    const tuePills = screen.getAllByRole('button', { name: /^tue$/i })
    fireEvent.click(tuePills[0])
    expect(screen.getByText(/core shift.*missed/i)).toBeTruthy()
    expect(screen.getByText(/attendance miss/i)).toBeTruthy()
  })

  it('unchecking a core day reduces the actualHours count shown in the target tracker', () => {
    renderModal({ week: DHL_LONG_WEEK, config: DHL_CUSTOM_CONFIG })
    // Initially all core days + Mon OT slot unanswered → totalHoursPlanned starts at core only
    // Mark Tue as missed — the tracker should show one fewer shift
    const tuePills = screen.getAllByRole('button', { name: /^tue$/i })
    fireEvent.click(tuePills[0])
    // Target tracker should show a lower hours/target ratio
    expect(screen.getByText(/short of your 60h target/i)).toBeTruthy()
  })

  it('OT selector is still present and required for long week custom schedule', () => {
    renderModal({ week: DHL_LONG_WEEK, config: DHL_CUSTOM_CONFIG })
    expect(screen.getByText(/schedule extension/i)).toBeTruthy()
  })
})
