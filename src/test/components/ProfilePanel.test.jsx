import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// AccountDetail imports the supabase client (created at module load from env vars).
// Mock it so importing the component doesn't spin up a real client in the test env.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: {} },
}))

const { AccountDetail, ProfilePanel } = await import('../../components/ProfilePanel.jsx')

const baseUser = (identities) => ({
  email: 'anthony@example.com',
  identities,
  user_metadata: {},
})

// Renders the main Account list (not a sub-view). Regression coverage for the
// blank-screen crash where ProfilePanel referenced the `onInstallClick` prop
// without destructuring it from the signature (ReferenceError on render).
function renderMainProfile(extraProps = {}) {
  return render(
    <ProfilePanel
      authedUser={baseUser([{ provider: 'email' }])}
      config={DEFAULT_CONFIG}
      setConfig={() => {}}
      saveConfigNow={() => {}}
      onLocalSignOut={async () => {}}
      allWeeks={[]}
      taxDerived={{}}
      showExtra={false}
      setShowExtra={() => {}}
      isAdmin={false}
      isTester={false}
      today="2026-06-26"
      weekConfirmations={{}}
      {...extraProps}
    />
  )
}

describe('ProfilePanel — main Account list renders', () => {
  it('renders without crashing when onInstallClick is omitted', () => {
    renderMainProfile()
    // Core groups present — proves the main list rendered (no ReferenceError)
    expect(screen.getByText('Work & Pay')).toBeInTheDocument()
    expect(screen.getByText('Job & Pay')).toBeInTheDocument()
    expect(screen.getByText('Sign Out (This Device)')).toBeInTheDocument()
  })

  it('shows the install row only when onInstallClick is provided', () => {
    const { unmount } = renderMainProfile({ onInstallClick: null })
    expect(screen.queryByText('Install on home screen')).not.toBeInTheDocument()
    unmount()
    renderMainProfile({ onInstallClick: () => {} })
    expect(screen.getByText('Install on home screen')).toBeInTheDocument()
  })
})

// TODO §15 nav/panel restructuring — Job & Pay/Retirement & Benefits/Tax Plan
// all show figures that don't apply without real income; a "Back to Work" row
// replaces them as a second route into the same structure_change flow the Job
// Loss banner's button already uses.
describe('ProfilePanel — Job Loss Mode swaps Work & Pay for Back to Work', () => {
  it('hides Job & Pay / Retirement & Benefits and shows a Back to Work row instead', () => {
    renderMainProfile({ config: { ...DEFAULT_CONFIG, jobLossMode: true }, onBackToWork: () => {} })
    expect(screen.queryByText('Work & Pay')).not.toBeInTheDocument()
    expect(screen.queryByText('Job & Pay')).not.toBeInTheDocument()
    expect(screen.queryByText('Retirement & Benefits')).not.toBeInTheDocument()
    expect(screen.getByText('Job Search')).toBeInTheDocument()
    expect(screen.getByText('Back to Work')).toBeInTheDocument()
  })

  it('calls onBackToWork when the row is pressed', () => {
    const onBackToWork = vi.fn()
    renderMainProfile({ config: { ...DEFAULT_CONFIG, jobLossMode: true }, onBackToWork })
    fireEvent.click(screen.getByText('Back to Work'))
    expect(onBackToWork).toHaveBeenCalled()
  })

  it('hides Tax Plan even for a tax-plan-eligible admin while jobLossMode is true', () => {
    renderMainProfile({ config: { ...DEFAULT_CONFIG, jobLossMode: true }, isAdmin: true, onBackToWork: () => {} })
    expect(screen.queryByText('Tax Plan')).not.toBeInTheDocument()
  })

  it('restores the normal Work & Pay group once jobLossMode is false', () => {
    renderMainProfile({ config: { ...DEFAULT_CONFIG, jobLossMode: false } })
    expect(screen.getByText('Work & Pay')).toBeInTheDocument()
    expect(screen.getByText('Job & Pay')).toBeInTheDocument()
    expect(screen.queryByText('Job Search')).not.toBeInTheDocument()
  })
})

// ProfilePanel is mounted without expenses/goals/logs props at all (see App.jsx),
// so its Pay Structure sections structurally cannot touch them. These tests lock
// in the other half of that guarantee: the config object each section hands to
// setConfig/saveConfigNow only ever carries pay-structure fields.
describe('ProfilePanel — Pay Structure section saves never touch expenses/goals/logs', () => {
  it('Base Pay card (base user) patches only pay fields on save', () => {
    const setConfig = vi.fn()
    const saveConfigNow = vi.fn()
    renderMainProfile({ setConfig, saveConfigNow })

    fireEvent.click(screen.getByText('Job & Pay'))
    fireEvent.click(screen.getAllByText('Edit')[0]) // Base Pay is the first card

    const rateInput = screen.getByDisplayValue(String(DEFAULT_CONFIG.baseRate))
    fireEvent.change(rateInput, { target: { value: '25' } })
    fireEvent.click(screen.getByText('Save Changes'))

    expect(setConfig).toHaveBeenCalledTimes(1)
    const newConfig = setConfig.mock.calls[0][0]
    expect(newConfig.baseRate).toBe(25)
    expect(newConfig).not.toHaveProperty('expenses')
    expect(newConfig).not.toHaveProperty('goals')
    expect(newConfig).not.toHaveProperty('logs')
    expect(saveConfigNow).toHaveBeenCalledWith(newConfig)
  })

  it('Differentials card (DHL user) patches only differential fields on save', () => {
    const setConfig = vi.fn()
    const saveConfigNow = vi.fn()
    const dhlConfig = { ...DEFAULT_CONFIG, employerPreset: 'DHL', dhlTeam: 'B' }
    renderMainProfile({ config: dhlConfig, setConfig, saveConfigNow })

    fireEvent.click(screen.getByText('Job & Pay'))
    fireEvent.click(screen.getAllByText('Edit')[1]) // Differentials is the second card

    const nightDiffInput = screen.getByDisplayValue(String(dhlConfig.nightDiffRate))
    fireEvent.change(nightDiffInput, { target: { value: '2.25' } })
    fireEvent.click(screen.getByText('Save Changes'))

    expect(setConfig).toHaveBeenCalledTimes(1)
    const newConfig = setConfig.mock.calls[0][0]
    expect(newConfig.nightDiffRate).toBe(2.25)
    expect(newConfig.employerPreset).toBe('DHL') // untouched by this section
    expect(newConfig).not.toHaveProperty('expenses')
    expect(newConfig).not.toHaveProperty('goals')
    expect(newConfig).not.toHaveProperty('logs')
    expect(saveConfigNow).toHaveBeenCalledWith(newConfig)
  })
})

describe('AccountDetail — Change Password visibility by identity', () => {
  it('shows the password form for an email/password account', () => {
    render(
      <AccountDetail
        authedUser={baseUser([{ provider: 'email' }])}
        config={DEFAULT_CONFIG}
        onBack={() => {}}
      />
    )
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('hides the password form for a Google-only account', () => {
    render(
      <AccountDetail
        authedUser={baseUser([{ provider: 'google' }])}
        config={DEFAULT_CONFIG}
        onBack={() => {}}
      />
    )
    expect(screen.queryByText('Change Password')).not.toBeInTheDocument()
  })

  it('shows the password form for an account with both email and Google linked', () => {
    render(
      <AccountDetail
        authedUser={baseUser([{ provider: 'email' }, { provider: 'google' }])}
        config={DEFAULT_CONFIG}
        onBack={() => {}}
      />
    )
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('hides the password form when identities are missing entirely', () => {
    render(
      <AccountDetail
        authedUser={{ email: 'anthony@example.com', user_metadata: {} }}
        config={DEFAULT_CONFIG}
        onBack={() => {}}
      />
    )
    expect(screen.queryByText('Change Password')).not.toBeInTheDocument()
  })
})
