import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.getByText('Employment')).toBeInTheDocument()
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
