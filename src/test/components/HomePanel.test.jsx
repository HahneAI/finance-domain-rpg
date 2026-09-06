import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// HomePanel pulls in CoachNetWorthCard.jsx → lib/claude.js AND lib/db.js
// (logBetaEvent) → the real Supabase singleton (created at module load from
// env vars) — mock all of it out so no real client spins up. isAdmin/isTester/
// entitlement all default to "not entitled" in baseProps, so the card never
// renders in most tests below; the async generator implementation only
// matters for the gate tests that do open it.
const { mocks } = vi.hoisted(() => ({ mocks: { chatWithCoach: vi.fn() } }))
vi.mock('../../lib/claude.js', () => ({ chatWithCoach: mocks.chatWithCoach }))
vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
  getCachedAuthSnapshot: vi.fn().mockReturnValue({ accessToken: 'tok-123', userId: 'test-user-id' }),
}))

import { HomePanel } from '../../components/HomePanel.jsx'

const baseProps = {
  navigate: () => {},
  weeklyIncome: 1000,
  adjustedTakeHome: 52000,
  remainingSpend: { avgWeeklySpend: 0 },
  goals: [],
  futureWeekNets: [],
  prevWeekNet: 950,
  currentWeek: null,
  today: '2026-04-01',
}

describe('HomePanel', () => {
  it('labels the tile as Next Week Takehome and shows a currency value', () => {
    render(<HomePanel {...baseProps} futureWeekNets={[1234]} />)
    const tiles = screen.getAllByText('Next Week Takehome')
    expect(tiles.length).toBeGreaterThanOrEqual(1)
    const tile = tiles[0].closest('button')
    expect(tile).not.toBeNull()
    expect(tile).toHaveTextContent(/\$\d+/)
  })

  it('does not show a sign-out action on Home', () => {
    render(<HomePanel {...baseProps} />)
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  // docs/coach-entry-points.md §2 — the Net Worth Check-In card left the
  // admin/tester-only gate; a real trial/paid entitlement now also opens it.
  describe('CoachNetWorthCard gate (canAccessAskCoachGeneral)', () => {
    const coachProps = {
      ...baseProps,
      config: { newJobSeasonMode: false },
      expenses: [],
      goals: [],
      fundedGoalSpend: 0,
      currentWeek: { idx: 10 },
    }

    it('does not mount the card for a non-admin/non-tester account with no entitlement', () => {
      render(<HomePanel {...coachProps} isAdmin={false} isTester={false} entitlement={{ isEntitled: false, state: 'none' }} />)
      expect(screen.queryByText(/Coach — /)).toBeNull()
    })

    it('mounts the card for a non-admin/non-tester account with a real trial entitlement', async () => {
      mocks.chatWithCoach.mockImplementation(async function* () { yield 'trial user check-in' })
      render(
        <HomePanel
          {...coachProps}
          isAdmin={false}
          isTester={false}
          entitlement={{ isEntitled: true, state: 'trial' }}
          weeklyIncome={100}
          remainingSpend={{ avgWeeklySpend: 500 }}
        />
      )
      await waitFor(() => expect(screen.getByText('trial user check-in')).toBeTruthy())
    })

    // Locked decision 2026-07-25 (entitlements.js's hasPrivilegedAccess):
    // investor accounts bypass every paid wall too, even with no entitlement
    // at all — investor/demo accounts routinely carry none.
    it('mounts the card for an investor account with no entitlement', async () => {
      mocks.chatWithCoach.mockImplementation(async function* () { yield 'investor demo check-in' })
      render(
        <HomePanel
          {...coachProps}
          config={{ ...coachProps.config, isInvestor: true }}
          isAdmin={false}
          isTester={false}
          entitlement={{ isEntitled: false, state: 'none' }}
          weeklyIncome={100}
          remainingSpend={{ avgWeeklySpend: 500 }}
        />
      )
      await waitFor(() => expect(screen.getByText('investor demo check-in')).toBeTruthy())
    })
  })
  // ── Claim Date presentation (2026-09) ──────────────────────────────────
  // The goal surface leads with the DATE, not the dollar amount — the app-side
  // half of the site's "we are not a budgeting app" reframe. These walk the
  // §8.3 gate-matrix Goals row (empty / active / all-completed), because the
  // hero must not fabricate a signal when there is nothing to claim.
  describe('Claim Date surface', () => {
    const goalProps = {
      ...baseProps,
      weeklyIncome: 1200,
      futureWeekNets: Array(52).fill(1200),
      goals: [
        { id: 'g1', label: 'four new tires', target: 900, completed: false },
        { id: 'g2', label: 'a week in Cancun', target: 2400, completed: false },
      ],
    }

    // Guards the two absence assertions below from passing vacuously: if the
    // hero never rendered at all, "not present when empty" would still pass.
    it('renders the Next Claim Date hero with a real date for active goals', () => {
      render(<HomePanel {...goalProps} />)
      expect(screen.getByText('Next Claim Date')).toBeTruthy()
      const hero = screen.getByText('Next Claim Date').parentElement
      // A month name and a four-digit year, i.e. an actual resolved date.
      expect(hero.textContent).toMatch(/(January|February|March|April|May|June|July|August|September|October|November|December)/)
      expect(hero.textContent).toMatch(/20\d\d/)
    })

    it('shows the funding queue so the priority order is visible outside the reorder modal', () => {
      render(<HomePanel {...goalProps} />)
      // Two active goals: the second one appears as a queued "then" row.
      expect(screen.getAllByText('then').length).toBeGreaterThanOrEqual(1)
    })

    it('renders no Claim Date hero when there are no goals (no fabricated signal)', () => {
      render(<HomePanel {...baseProps} goals={[]} />)
      expect(screen.queryByText('Next Claim Date')).toBeNull()
    })

    it('renders no Claim Date hero when every goal is already claimed', () => {
      render(
        <HomePanel
          {...goalProps}
          goals={goalProps.goals.map((g) => ({ ...g, completed: true, completedAt: '2026-03-01T00:00:00.000Z' }))}
        />
      )
      expect(screen.queryByText('Next Claim Date')).toBeNull()
    })

    it('leads each goal card with a Claim date label, not the target amount', () => {
      render(<HomePanel {...goalProps} />)
      expect(screen.getAllByText('Claim date').length).toBeGreaterThanOrEqual(1)
      // The target is still present — demoted, not deleted.
      expect(screen.getAllByText('Target').length).toBeGreaterThanOrEqual(1)
    })

    it('names the claim action rather than a checkbox verb', () => {
      render(<HomePanel {...goalProps} />)
      expect(screen.getAllByText('✓ CLAIM IT').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('✓ DONE')).toBeNull()
    })

    // Live-caught: four `flex: 1` buttons in a narrow card broke "✓ CLAIM IT"
    // onto two lines INSIDE the button. jsdom has no layout engine, so this
    // asserts the structural fix (content-sized, non-breaking buttons in a
    // wrapping row) rather than the pixel outcome.
    it('keeps action-button labels on one line so the row wraps instead of the text', () => {
      render(<HomePanel {...goalProps} />)
      const claim = screen.getAllByText('✓ CLAIM IT')[0].closest('button')
      expect(claim).not.toBeNull()
      expect(claim.style.whiteSpace).toBe('nowrap')
      expect(claim.style.flex).not.toBe('1')
      expect(claim.parentElement.style.flexWrap).toBe('wrap')
    })

    it('hides every goal mutation control on a read-only (paywall-expired) account', () => {
      render(<HomePanel {...goalProps} readOnly />)
      expect(screen.queryByText('✓ CLAIM IT')).toBeNull()
    })
  })

  // DW-26: a household running a net-negative weekly surplus must get an
  // honest "you're stalemated" card, never a fabricated far-future date.
  // Real futureWeeks/timelineWeekNets/expenses are required here (not the
  // "no data" shortcut the tests above use, which defaults eW to 0) — this
  // has to drive computeGoalTimeline's real per-week loop into eW===null
  // with a genuinely negative avgSurplus, the one and only case that
  // produces wN: Infinity (finance.test.js covers that unit directly;
  // this proves HomePanel's own consumption of it end to end).
  describe('Claim Date stalemate (negative household surplus)', () => {
    const stalemateGoals = [{ id: 'g1', label: 'Stuck Goal', target: 600, completed: false }]
    const futureWeeks = [
      { idx: 1, weekEnd: new Date(2026, 0, 7) },
      { idx: 2, weekEnd: new Date(2026, 0, 14) },
    ]
    // $300/wk net against $301/wk expenses: -$1/wk every week, same fixture
    // as finance.test.js's "reports wN as Infinity" unit test.
    const stalemateProps = {
      ...baseProps,
      goals: stalemateGoals,
      futureWeeks,
      timelineWeekNets: [300, 300],
      expenses: [
        { category: 'Needs', history: [{ effectiveFrom: '2026-01-05', weekly: [301, 301, 301, 301] }] },
      ],
    }

    it('shows the dedicated stalemate message instead of a date', () => {
      render(<HomePanel {...stalemateProps} />)
      expect(screen.getByText(/can't make progress toward a claim date/)).toBeTruthy()
      expect(screen.getByText('Claim date — on hold')).toBeTruthy()
    })

    it('never fabricates a far-future date or a BEYOND-horizon badge for the stalled goal', () => {
      render(<HomePanel {...stalemateProps} />)
      expect(screen.queryByText(/BEYOND/)).toBeNull()
      // No four-digit year appears anywhere in the goal card region for this
      // goal — a real regression here previously rendered "Aug 2, 3176".
      expect(screen.queryByText(/\b3\d{3}\b/)).toBeNull()
    })

    it('still shows the goal label and its target, just demoted, alongside the stalemate message', () => {
      render(<HomePanel {...stalemateProps} />)
      expect(screen.getByText('Stuck Goal')).toBeTruthy()
      expect(screen.getByText('$600')).toBeTruthy()
    })

    it('does not render this goal in the Next Claim Date hero or funding queue (no date to lead with)', () => {
      render(<HomePanel {...stalemateProps} />)
      expect(screen.queryByText('Next Claim Date')).toBeNull()
    })
  })
})