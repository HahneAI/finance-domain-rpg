import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// AccountDetail imports the supabase client (created at module load from env vars).
// Mock it so importing the component doesn't spin up a real client in the test env.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: {} },
}))

const { AccountDetail } = await import('../../components/ProfilePanel.jsx')

const baseUser = (identities) => ({
  email: 'anthony@example.com',
  identities,
  user_metadata: {},
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
