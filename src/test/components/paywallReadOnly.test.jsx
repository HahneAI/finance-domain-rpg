import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// HomePanel pulls in CoachNetWorthCard.jsx → lib/claude.js → the real Supabase
// singleton (created at module load from env vars) — mock it out so no real
// client spins up. isAdmin isn't set true in these tests, so the card never
// renders; this only prevents the import chain from crashing.
vi.mock('../../lib/claude.js', () => ({ chatWithCoach: vi.fn() }))

import { HomePanel } from '../../components/HomePanel.jsx'
import { BudgetPanel } from '../../components/BudgetPanel.jsx'
import { buildYear, computeNet, toLocalIso } from '../../lib/finance.js'
import { getCurrentFiscalWeek, getFiscalWeekInfo } from '../../lib/fiscalWeek.js'
import { DEFAULT_CONFIG, INITIAL_EXPENSES } from '../../constants/config.js'

// Paywall-expired read-only mode (docs/TODO.md §17.E): when the trial + hidden
// grace window has fully lapsed, Home and Budget stay visible but every
// mutation affordance disappears and setters are shadowed with no-ops.

const TODAY = '2026-07-06'
const CONFIG = {
  ...DEFAULT_CONFIG,
  employerPreset: null,
  customWeeklyHours: 40,
  baseRate: 20,
  firstActiveIdx: 0,
  setupComplete: true,
}

const allWeeks = buildYear(CONFIG)
const currentWeek = getCurrentFiscalWeek(allWeeks, TODAY)
const futureWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) >= TODAY)
const futureWeekNets = futureWeeks.map(w => computeNet(w, CONFIG, 0, false))

// ─────────────────────────────────────────────────────────────
// HomePanel
// ─────────────────────────────────────────────────────────────

describe('HomePanel — readOnly paywall mode', () => {
  const goal = { id: 'g1', label: 'Emergency Fund', target: 1000, note: '' }
  const baseProps = {
    navigate: () => {},
    weeklyIncome: 600,
    adjustedTakeHome: 30000,
    remainingSpend: { avgWeeklySpend: 100 },
    goals: [goal],
    setGoals: vi.fn(),
    setConfig: vi.fn(),
    futureWeeks,
    timelineWeekNets: futureWeekNets,
    futureWeekNets,
    expenses: INITIAL_EXPENSES,
    prevWeekNet: 600,
    currentWeek,
    config: CONFIG,
    today: TODAY,
  }

  it('shows the ADD GOAL affordance when entitled', () => {
    render(<HomePanel {...baseProps} />)
    expect(screen.getByText('+ ADD GOAL')).toBeTruthy()
  })

  it('hides the ADD GOAL affordance when readOnly', () => {
    render(<HomePanel {...baseProps} readOnly />)
    expect(screen.queryByText('+ ADD GOAL')).toBeNull()
  })

  it('still renders goal content itself when readOnly (visible, not editable)', () => {
    render(<HomePanel {...baseProps} readOnly />)
    expect(screen.getAllByText(/Emergency Fund/).length).toBeGreaterThan(0)
  })

  it('hides the reset-timeline control when readOnly', () => {
    const { container } = render(<HomePanel {...baseProps} readOnly />)
    expect(container.textContent).not.toMatch(/reset timeline/i)
  })
})

// ─────────────────────────────────────────────────────────────
// BudgetPanel
// ─────────────────────────────────────────────────────────────

describe('BudgetPanel — readOnly paywall mode', () => {
  const renderPanel = (extra = {}) => render(
    <BudgetPanel
      expenses={INITIAL_EXPENSES}
      setExpenses={vi.fn()}
      weeklyIncome={600}
      prevWeekNet={600}
      futureWeeks={futureWeeks}
      futureWeekNets={futureWeekNets}
      currentWeek={currentWeek}
      fiscalWeekInfo={getFiscalWeekInfo(currentWeek)}
      today={TODAY}
      userPaySchedule="weekly"
      config={CONFIG}
      bufferPerWeek={0}
      isAdmin={false}
      taxProjectionsEnabled={false}
      isTester={false}
      {...extra}
    />
  )

  it('shows the ADD EXPENSE LINE affordance when entitled', () => {
    renderPanel()
    expect(screen.getByText('+ ADD EXPENSE LINE')).toBeTruthy()
  })

  it('hides the ADD EXPENSE LINE affordance when readOnly', () => {
    renderPanel({ readOnly: true })
    expect(screen.queryByText('+ ADD EXPENSE LINE')).toBeNull()
  })

  it('expands a category on header tap when entitled', () => {
    const { container } = renderPanel()
    const header = container.querySelector('[data-cat-header="Needs"]')
    expect(header.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
  })

  it('locks categories collapsed and non-expandable when readOnly', () => {
    const { container } = renderPanel({ readOnly: true })
    const header = container.querySelector('[data-cat-header="Needs"]')
    expect(header.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
  })

  it('still shows category totals when readOnly (visible, not editable)', () => {
    const { container } = renderPanel({ readOnly: true })
    // Default Food expense: $100/wk reserve surfaces in the Needs header total
    expect(container.textContent).toMatch(/Needs/)
    expect(container.textContent).toMatch(/\$\d/)
  })
})
