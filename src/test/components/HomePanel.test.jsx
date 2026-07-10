import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// HomePanel pulls in CoachNetWorthCard.jsx → lib/claude.js → the real Supabase
// singleton (created at module load from env vars) — mock it out so no real
// client spins up. isAdmin defaults to false in these tests anyway, so the
// card never renders; this only prevents the import chain from crashing.
vi.mock('../../lib/claude.js', () => ({ chatWithCoach: vi.fn() }))

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
})
