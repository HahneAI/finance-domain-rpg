import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrialBanner } from '../../components/TrialBanner.jsx'

// §17.F trial/dunning banner. Copy for grace/expired must never disclose the
// hidden day-21 cutoff — same disclosure rule as UpgradeModal/UpgradePanel.
const FORBIDDEN = [/21-day/i, /\bgrace\b/i, /extra week/i, /day 21/i]

function entitlement(overrides) {
  return { state: 'trial', trialDaysLeft: 10, isEntitled: true, accessDaysLeft: null, ...overrides }
}

describe('TrialBanner', () => {
  it('renders nothing when active', () => {
    const { container } = render(<TrialBanner entitlement={entitlement({ state: 'active' })} onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(container.textContent).toBe('')
  })

  it('renders nothing when no trial window was ever seeded (state "none")', () => {
    const { container } = render(<TrialBanner entitlement={entitlement({ state: 'none' })} onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(container.textContent).toBe('')
  })

  it('shows the days-left countdown during trial', () => {
    render(<TrialBanner entitlement={entitlement({ state: 'trial', trialDaysLeft: 6 })} onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/6 days left in your free trial/i)).toBeTruthy()
  })

  it('singularizes "day" at 1 day left', () => {
    render(<TrialBanner entitlement={entitlement({ state: 'trial', trialDaysLeft: 1 })} onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/1 day left in your free trial/i)).toBeTruthy()
  })

  it('shows grace copy without hinting access continues', () => {
    const { container } = render(<TrialBanner entitlement={entitlement({ state: 'grace', trialDaysLeft: 0 })} onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/your trial ended — add a card to keep using the app/i)).toBeTruthy()
    for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern)
  })

  it('shows expired copy without hinting a grace period existed', () => {
    const { container } = render(<TrialBanner entitlement={entitlement({ state: 'expired', trialDaysLeft: 0 })} onUpgrade={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/trial ended — add a card to restore full access/i)).toBeTruthy()
    for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern)
  })

  it('calls onUpgrade when the Upgrade button is clicked', () => {
    const onUpgrade = vi.fn()
    render(<TrialBanner entitlement={entitlement()} onUpgrade={onUpgrade} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('Upgrade'))
    expect(onUpgrade).toHaveBeenCalled()
  })

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<TrialBanner entitlement={entitlement()} onUpgrade={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
