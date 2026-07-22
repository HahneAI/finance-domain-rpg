import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LogPanel } from '../../components/LogPanel.jsx'
import { DEFAULT_CONFIG } from '../../constants/config.js'
import { calcEventImpact } from '../../lib/finance.js'

// ─────────────────────────────────────────────────────────────────────────────
// Minimal props for LogPanel — only fields that the component actually reads.
// Attendance history only cares about `logs` and `config.shiftHours`.
// ─────────────────────────────────────────────────────────────────────────────

const BASE_CONFIG = {
  ...DEFAULT_CONFIG,
  shiftHours: 12,
  ficaRate: 0.0765,
  baseRate: 21.15,
  k401StartDate: '2026-01-01',
  bucketCap: 128,
}

const BASE_PROPS = {
  config: BASE_CONFIG,
  setLogs: vi.fn(),
  baseWeeklyUnallocated: 200,
  futureWeeks: [],
  allWeeks: [],
  currentWeek: null,
  goals: [],
  bucketModel: null,
}

function renderPanel(logs = []) {
  render(<LogPanel {...BASE_PROPS} logs={logs} />)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture log entries
// ─────────────────────────────────────────────────────────────────────────────

const mkUnpaid = (weekEnd, shiftsLost, missedDays = []) => ({
  id: Date.now() + Math.random(),
  weekEnd,
  weekIdx: 1,
  weekRotation: '6-Day',
  type: 'missed_unpaid',
  shiftsLost,
  weekendShifts: missedDays.filter(d => d === 'Fri' || d === 'Sat' || d === 'Sun').length,
  ptoHours: 0,
  hoursLost: shiftsLost * 12,
  amount: 0,
  missedDays,
  note: '',
})

const mkUnapproved = (weekEnd, missedDays) => ({
  id: Date.now() + Math.random(),
  weekEnd,
  weekIdx: 1,
  weekRotation: '6-Day',
  type: 'missed_unapproved',
  shiftsLost: missedDays.length,
  weekendShifts: 0,
  ptoHours: 0,
  hoursLost: missedDays.length * 12,
  amount: 0,
  missedDays,
  note: '',
})

const mkPartial = (weekEnd, hoursLost) => ({
  id: Date.now() + Math.random(),
  weekEnd,
  weekIdx: 1,
  weekRotation: '6-Day',
  type: 'partial',
  shiftsLost: 0,
  weekendShifts: 0,
  ptoHours: 0,
  hoursLost,
  amount: 0,
  missedDays: [],
  note: '',
})

const mkBonus = (weekEnd, amount) => ({
  id: Date.now() + Math.random(),
  weekEnd,
  weekIdx: 1,
  weekRotation: '6-Day',
  type: 'bonus',
  shiftsLost: 0,
  weekendShifts: 0,
  ptoHours: 0,
  hoursLost: 0,
  amount,
  missedDays: [],
  note: '',
})

// ─────────────────────────────────────────────────────────────────────────────
// Visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('Attendance History — visibility', () => {
  it('does not render when logs array is empty', () => {
    renderPanel([])
    expect(screen.queryByText(/attendance history/i)).toBeNull()
  })

  it('does not render when only bonus/other_loss events exist', () => {
    renderPanel([mkBonus('2026-03-16', 500)])
    expect(screen.queryByText(/attendance history/i)).toBeNull()
  })

  it('renders when at least one missed_unpaid event exists', () => {
    renderPanel([mkUnpaid('2026-03-16', 1, ['Mon'])])
    expect(screen.getByText(/attendance history/i)).toBeTruthy()
  })

  it('renders when at least one missed_unapproved event exists', () => {
    renderPanel([mkUnapproved('2026-03-16', ['Tue'])])
    expect(screen.getByText(/attendance history/i)).toBeTruthy()
  })

  it('renders when at least one partial event exists', () => {
    renderPanel([mkPartial('2026-03-16', 6)])
    expect(screen.getByText(/attendance history/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Collapse / expand
// ─────────────────────────────────────────────────────────────────────────────

describe('Attendance History — collapse/expand', () => {
  it('is collapsed by default (YTD tiles not visible)', () => {
    renderPanel([mkUnpaid('2026-03-16', 2, ['Mon', 'Tue'])])
    expect(screen.queryByText(/unpaid shifts/i)).toBeNull()
  })

  it('expands when the header button is clicked', () => {
    renderPanel([mkUnpaid('2026-03-16', 2, ['Mon', 'Tue'])])
    fireEvent.click(screen.getByText(/attendance history/i).closest('button'))
    expect(screen.getByText(/unpaid shifts/i)).toBeTruthy()
    expect(screen.getByText(/unapprov\. days/i)).toBeTruthy()
    expect(screen.getByText(/partial shifts/i)).toBeTruthy()
  })

  it('collapses again on a second click', async () => {
    renderPanel([mkUnpaid('2026-03-16', 2, ['Mon', 'Tue'])])
    const btn = screen.getByText(/attendance history/i).closest('button')
    fireEvent.click(btn)
    fireEvent.click(btn)
    // The panel now fold-animates out (useFoldTransition keeps it mounted through
    // the exit tween), so it unmounts a beat after the collapse click.
    await waitFor(() => expect(screen.queryByText(/unpaid shifts/i)).toBeNull())
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Header badge
// ─────────────────────────────────────────────────────────────────────────────

describe('Attendance History — header badge', () => {
  it('shows correct "days missed YTD" count for unpaid shifts', () => {
    // 2 shifts lost → badge shows 2 days missed
    renderPanel([mkUnpaid('2026-03-16', 2, ['Mon', 'Tue'])])
    expect(screen.getByText(/2 days missed ytd/i)).toBeTruthy()
  })

  it('adds unpaid + unapproved days together in the badge', () => {
    const logs = [
      mkUnpaid('2026-03-16', 1, ['Mon']),       // 1 unpaid shift
      mkUnapproved('2026-03-23', ['Wed', 'Thu']), // 2 unapproved days
    ]
    renderPanel(logs)
    expect(screen.getByText(/3 days missed ytd/i)).toBeTruthy()
  })

  it('does not show badge when only partial events exist (partials are not "missed")', () => {
    renderPanel([mkPartial('2026-03-16', 6)])
    // Badge text should not appear (ytdUnpaid + ytdUnapproved = 0)
    expect(screen.queryByText(/days missed ytd/i)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// YTD summary tiles
// ─────────────────────────────────────────────────────────────────────────────

describe('Attendance History — YTD tiles', () => {
  function openHistory(logs) {
    renderPanel(logs)
    fireEvent.click(screen.getByText(/attendance history/i).closest('button'))
  }

  it('shows correct unpaid shift count', () => {
    openHistory([
      mkUnpaid('2026-03-16', 3, ['Mon', 'Tue', 'Wed']),
    ])
    // The "3" should appear in the Unpaid Shifts tile
    const tiles = screen.getAllByText('3')
    expect(tiles.length).toBeGreaterThan(0)
  })

  it('shows correct unapproved day count', () => {
    openHistory([
      mkUnapproved('2026-03-23', ['Mon', 'Tue']),
    ])
    const tiles = screen.getAllByText('2')
    expect(tiles.length).toBeGreaterThan(0)
  })

  it('shows correct partial shift count', () => {
    openHistory([
      mkPartial('2026-03-16', 6),
      mkPartial('2026-03-23', 4),
    ])
    const tiles = screen.getAllByText('2')
    expect(tiles.length).toBeGreaterThan(0)
  })

  it('shows zero for categories with no events', () => {
    // Only a partial — unpaid and unapproved tiles should show 0
    openHistory([mkPartial('2026-03-16', 6)])
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Monthly breakdown
// ─────────────────────────────────────────────────────────────────────────────

describe('Attendance History — monthly breakdown', () => {
  function openHistory(logs) {
    renderPanel(logs)
    fireEvent.click(screen.getByText(/attendance history/i).closest('button'))
  }

  it('shows the By Month label when events exist', () => {
    openHistory([mkUnpaid('2026-03-16', 1, ['Mon'])])
    expect(screen.getByText(/by month/i)).toBeTruthy()
  })

  it('renders a row for the correct month label', () => {
    openHistory([mkUnpaid('2026-03-16', 1, ['Mon'])])
    expect(screen.getByText('Mar 2026')).toBeTruthy()
  })

  it('renders separate rows for events in different months', () => {
    openHistory([
      mkUnpaid('2026-02-16', 1, ['Mon']),
      mkUnpaid('2026-03-16', 2, ['Tue', 'Wed']),
    ])
    expect(screen.getByText('Feb 2026')).toBeTruthy()
    expect(screen.getByText('Mar 2026')).toBeTruthy()
  })

  it('shows dash for unapproved column when no unapproved events in that month', () => {
    openHistory([mkUnpaid('2026-03-16', 1, ['Mon'])])
    // The unapproved cell for Mar 2026 should be "—"
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows unapproved hours in the correct format', () => {
    openHistory([mkUnapproved('2026-03-23', ['Mon', 'Tue'])]) // 2 days, 24h
    expect(screen.getByText('2d·24h')).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Day-of-week pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('Attendance History — day pattern', () => {
  function openHistory(logs) {
    renderPanel(logs)
    fireEvent.click(screen.getByText(/attendance history/i).closest('button'))
  }

  it('shows Day Pattern label when missed/unapproved events with missedDays exist', () => {
    openHistory([mkUnpaid('2026-03-16', 1, ['Mon'])])
    expect(screen.getByText(/day pattern/i)).toBeTruthy()
  })

  it('renders a pill for each unique day that was missed', () => {
    openHistory([mkUnpaid('2026-03-16', 2, ['Mon', 'Wed'])])
    expect(screen.getByText('MON')).toBeTruthy()
    expect(screen.getByText('WED')).toBeTruthy()
    expect(screen.queryByText('TUE')).toBeNull()
  })

  it('shows the correct count per day across multiple events', () => {
    openHistory([
      mkUnpaid('2026-03-16', 2, ['Mon', 'Wed']),
      mkUnpaid('2026-03-23', 1, ['Mon']),
    ])
    // Mon appears twice — find the count badge next to MON pill
    // Both the pill label and the count appear; getAllByText('2') will capture the count
    const twos = screen.getAllByText('2')
    expect(twos.length).toBeGreaterThan(0)
  })

  it('does not show Day Pattern when only partial events exist', () => {
    openHistory([mkPartial('2026-03-16', 6)])
    expect(screen.queryByText(/day pattern/i)).toBeNull()
  })

  it('shows total missed days footer', () => {
    openHistory([
      mkUnpaid('2026-03-16', 2, ['Mon', 'Tue']),
      mkUnapproved('2026-03-23', ['Wed']),
    ])
    expect(screen.getByText(/3 total missed days logged/i)).toBeTruthy()
  })

  it('uses singular "day" when only 1 missed day', () => {
    openHistory([mkUnpaid('2026-03-16', 1, ['Mon'])])
    expect(screen.getByText(/1 total missed day logged/i)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Pay Week dropdown — rolling order (previous week forward, then a Past group)
// ─────────────────────────────────────────────────────────────────────────────

const mkDate = (y, m, d) => new Date(y, m - 1, d)

const mkWeek = (idx, startYmd, endYmd) => ({
  idx,
  active: true,
  rotation: '6-Day',
  weekStart: mkDate(...startYmd),
  weekEnd: mkDate(...endYmd),
  workedDayNames: [],
  k401kEmployee: 0,
  k401kEmployer: 0,
  totalHours: 40,
  grossPay: 0,
  taxedBySchedule: true,
})

describe('Pay Week dropdown — rolling order', () => {
  // idx0/1 → older past · idx2 → "previous week" (last completed before today)
  // idx3 → current week (contains today) · idx4/5 → future, through year-end
  const allWeeks = [
    mkWeek(0, [2025, 12, 29], [2026, 1, 4]),
    mkWeek(1, [2026, 1, 5], [2026, 1, 11]),
    mkWeek(2, [2026, 1, 12], [2026, 1, 18]),
    mkWeek(3, [2026, 1, 19], [2026, 1, 25]),
    mkWeek(4, [2026, 1, 26], [2026, 2, 1]),
    mkWeek(5, [2026, 2, 2], [2026, 2, 8]),
  ]

  function openAddForm() {
    const { container } = render(<LogPanel {...BASE_PROPS} logs={[]} allWeeks={allWeeks} effectiveToday="2026-01-20" />)
    fireEvent.click(screen.getByText('+ LOG EVENT'))
    return container.querySelector('select')
  }

  it('lists the previous completed week forward through year-end before any Past group', () => {
    const select = openAddForm()
    const options = Array.from(select.querySelectorAll('option'))
    // Skip the leading "— select pay week —" placeholder.
    const values = options.slice(1).map(o => o.value)
    expect(values.slice(0, 4)).toEqual(['2026-01-18', '2026-01-25', '2026-02-01', '2026-02-08'])
  })

  it('groups older weeks under a "Past" optgroup, most-recent-past first', () => {
    const select = openAddForm()
    const pastGroup = select.querySelector('optgroup[label="Past"]')
    expect(pastGroup).toBeTruthy()
    const pastValues = Array.from(pastGroup.querySelectorAll('option')).map(o => o.value)
    expect(pastValues).toEqual(['2026-01-11', '2026-01-04'])
  })

  it('labels each option as "Week of <start> – <end>" with ordinal day suffixes', () => {
    const select = openAddForm()
    const options = Array.from(select.querySelectorAll('option'))
    const forWeek3 = options.find(o => o.value === '2026-01-25')
    expect(forWeek3.textContent).toBe('Week of Jan 19th – Jan 25th')
    const forWeek0 = select.querySelector('optgroup[label="Past"] option[value="2026-01-04"]')
    expect(forWeek0.textContent).toBe('Week of Dec 29th – Jan 4th')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PTO Goal — eager save (DW-6 regression: Save/Clear must not rely solely on
// the 800ms debounce — see CLAUDE.md's Persistence eager-save table)
// ─────────────────────────────────────────────────────────────────────────────

describe('PTO Goal — eager save', () => {
  const PTO_PROPS = { ...BASE_PROPS, config: { ...BASE_CONFIG, ptoEnabled: true } }

  it('calls onSavePtoGoalNow with the same value passed to setPtoGoal on Save', () => {
    const setPtoGoal = vi.fn()
    const onSavePtoGoalNow = vi.fn()
    render(<LogPanel {...PTO_PROPS} logs={[]} ptoGoal={null} setPtoGoal={setPtoGoal} onSavePtoGoalNow={onSavePtoGoalNow} />)

    fireEvent.click(screen.getByText('Set Goal'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Paternity Leave'), { target: { value: 'Paternity Leave' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 134'), { target: { value: '80' } })
    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2026-06-01' } })
    fireEvent.click(screen.getByText('Save'))

    expect(setPtoGoal).toHaveBeenCalledTimes(1)
    expect(onSavePtoGoalNow).toHaveBeenCalledTimes(1)
    expect(onSavePtoGoalNow).toHaveBeenCalledWith(setPtoGoal.mock.calls[0][0])
    expect(setPtoGoal.mock.calls[0][0]).toMatchObject({
      label: 'Paternity Leave',
      hoursNeeded: 80,
      targetDate: '2026-06-01',
      negativeBalanceCap: 40,
    })
  })

  it('calls onSavePtoGoalNow(null) alongside setPtoGoal(null) on Clear', () => {
    const setPtoGoal = vi.fn()
    const onSavePtoGoalNow = vi.fn()
    const existingGoal = { label: 'Paternity Leave', hoursNeeded: 80, targetDate: '2026-06-01', negativeBalanceCap: 40 }
    render(<LogPanel {...PTO_PROPS} logs={[]} ptoGoal={existingGoal} setPtoGoal={setPtoGoal} onSavePtoGoalNow={onSavePtoGoalNow} />)

    fireEvent.click(screen.getByText('Clear'))

    expect(setPtoGoal).toHaveBeenCalledWith(null)
    expect(onSavePtoGoalNow).toHaveBeenCalledWith(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Log Effect Summary — DW-5 regression: these tiles must read the authoritative
// App-computed props (logNetLost/logK401kLost/logPTOHoursLost/adjustedTakeHome),
// not a locally-recomputed value that could disagree with what Income/Home show
// for the same account. Rendering with an empty `logs` array but non-zero prop
// values proves the tiles can no longer be driven by a local recomputation —
// before the fix, "Adjusted Take-Home"/"Total Net Lost"/"401k Lost"/"PTO Accrual
// Lost" all derived from a local `logs.reduce`, so this exact scenario would have
// shown $0 / 0h regardless of what the props said.
// ─────────────────────────────────────────────────────────────────────────────

const fmt2 = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

describe('Log Effect Summary — reads authoritative props, not local recomputation', () => {
  const AUTHORITATIVE_PROPS = {
    ...BASE_PROPS,
    config: { ...BASE_CONFIG, k401Rate: 0.05, ptoEnabled: true },
    logNetLost: 1234.56,
    logNetGained: 0,
    logK401kLost: 78.9,
    logPTOHoursLost: 24,
    adjustedTakeHome: 39876,
  }

  // "Total Net Lost" is a MetricCard with rawVal, which counts up from 0 via
  // requestAnimationFrame (CLAUDE.md's countup rule) instead of rendering the
  // final value on mount — jsdom doesn't drive rAF forward, so that specific
  // tile isn't asserted here. It reads the same `logNetLost` prop (`val={f(logNetLost)}
  // rawVal={logNetLost}`) as the tiles proven below, via the identical code path.

  it('"Adjusted Take-Home" shows the adjustedTakeHome prop even though logs is empty', () => {
    render(<LogPanel {...AUTHORITATIVE_PROPS} logs={[]} />)
    expect(screen.getByText(fmt0(39876))).toBeInTheDocument()
  })

  it('"401k Lost" shows logK401kLost even though logs is empty', () => {
    render(<LogPanel {...AUTHORITATIVE_PROPS} logs={[]} />)
    expect(screen.getByText(fmt2(78.9))).toBeInTheDocument()
  })

  it('"PTO Accrual Lost" shows logPTOHoursLost even though logs is empty', () => {
    render(<LogPanel {...AUTHORITATIVE_PROPS} logs={[]} />)
    expect(screen.getByText('1.2 hrs')).toBeInTheDocument() // 24h ÷ 20
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// "Total Gross Lost" — DW-5 root cause A: must resolve the event's real week
// from `allWeeks` (already an existing prop) instead of falling back to a flat
// schedule projection, so a week with unusual actual pay doesn't quietly throw
// off the one figure LogPanel is the sole source of.
// ─────────────────────────────────────────────────────────────────────────────

describe('Total Gross Lost — resolves the real week from allWeeks', () => {
  it('uses the matching week\'s actual grossPay, not the flat schedule projection', () => {
    // A deliberately unusual grossPay so the weekMeta-aware and weekMeta-less
    // calculations are guaranteed to diverge — proving which one rendered.
    const week = { idx: 3, grossPay: 5000, isHighWeek: true }
    const event = {
      id: 1, type: 'missed_unpaid', weekIdx: 3, weekEnd: '2026-02-02',
      weekRotation: '6-Day', shiftsLost: 1, weekendShifts: 0, missedDays: [],
    }
    const withWeekMeta = calcEventImpact(event, BASE_CONFIG, week)
    const withoutWeekMeta = calcEventImpact(event, BASE_CONFIG)
    expect(withWeekMeta.grossLost).not.toBeCloseTo(withoutWeekMeta.grossLost, 2) // sanity: they really do diverge

    render(<LogPanel {...BASE_PROPS} logs={[event]} allWeeks={[week]} />)
    expect(screen.getByText(fmt2(withWeekMeta.grossLost))).toBeInTheDocument()
    expect(screen.queryByText(fmt2(withoutWeekMeta.grossLost))).not.toBeInTheDocument()
  })
})
