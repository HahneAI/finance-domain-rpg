import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// TrialExplainerScreen renders Shell from LoginScreen.jsx, which imports the
// real supabase client — mock it out the same way ReviveScreen.test.jsx does
// so this test doesn't need real Supabase env vars.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
  validateInvestorCode: vi.fn(async () => false),
}))

const { TrialExplainerScreen } = await import('../../components/TrialExplainerScreen.jsx')

describe('TrialExplainerScreen — required acknowledgement gate', () => {
  it('disables Continue until the checkbox is checked, then calls onContinue', () => {
    const onContinue = vi.fn()
    render(<TrialExplainerScreen trialDaysLeft={14} trialEndsAt={null} onContinue={onContinue} />)

    const button = screen.getByText('Continue to setup')
    expect(button).toBeDisabled()

    fireEvent.click(button)
    expect(onContinue).not.toHaveBeenCalled()

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(button).not.toBeDisabled()

    fireEvent.click(button)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('reflects the real trialDaysLeft rather than a hardcoded 14', () => {
    render(<TrialExplainerScreen trialDaysLeft={180} trialEndsAt={null} onContinue={() => {}} />)
    expect(screen.getByText(/180 days of full access/i)).toBeTruthy()
  })

  it('shows the formatted trial end date when provided', () => {
    render(<TrialExplainerScreen trialDaysLeft={14} trialEndsAt="2026-07-27T00:00:00.000Z" onContinue={() => {}} />)
    expect(screen.getAllByText(/Jul 27, 2026/).length).toBeGreaterThan(0)
  })
})

// Marketing handoff (2026-08-21) — continues the marketing site's story
// ("Sign Up → Set Your Numbers → Set a Goal", plus its micro-commitment
// question) onto this shared pre-wizard screen, seen by beta AND base
// signups alike.
describe('TrialExplainerScreen — marketing continuity', () => {
  it('asks the micro-commitment question before the wizard', () => {
    render(<TrialExplainerScreen trialDaysLeft={14} trialEndsAt={null} onContinue={() => {}} />)
    expect(screen.getByText(/paycheck is gone by Sunday/i)).toBeTruthy()
  })

  it('nods to the Set Your Numbers / Set a Goal steps without abandoning the 3-step promise', () => {
    render(<TrialExplainerScreen trialDaysLeft={14} trialEndsAt={null} onContinue={() => {}} />)
    expect(screen.getByText(/Sign Up/)).toBeTruthy()
    expect(screen.getByText(/Set Your Numbers/)).toBeTruthy()
    expect(screen.getByText(/Set a Goal/)).toBeTruthy()
  })
})

describe('TrialExplainerScreen — disclosure guard', () => {
  it('never mentions the hidden grace window or 21-day access', () => {
    const { container } = render(<TrialExplainerScreen trialDaysLeft={14} trialEndsAt={null} onContinue={() => {}} />)
    const text = container.textContent
    expect(text.length).toBeGreaterThan(50) // vacuous-pass guard
    for (const forbidden of [/grace/i, /21[- ]day/i, /extra week/i, /access ends/i]) {
      expect(text).not.toMatch(forbidden)
    }
  })
})
