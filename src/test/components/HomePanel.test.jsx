import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('shows a Home sign-out action wired to the provided handler', () => {
    const onLocalSignOut = vi.fn()
    render(<HomePanel {...baseProps} onLocalSignOut={onLocalSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onLocalSignOut).toHaveBeenCalledTimes(1)
  })
})
