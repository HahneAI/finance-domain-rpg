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
      config: { jobLossMode: false },
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
})
