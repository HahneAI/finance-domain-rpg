import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('labels the tile as Next Week Takehome and shows the projected net', () => {
    render(<HomePanel {...baseProps} futureWeekNets={[1234]} />)
    expect(screen.getByText('Next Week Takehome')).toBeInTheDocument()
    expect(screen.getByText('$1,234')).toBeInTheDocument()
  })
})
