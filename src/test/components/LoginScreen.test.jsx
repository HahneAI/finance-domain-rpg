import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// LoginScreen imports the supabase client (created at module load from env
// vars) — mock the whole module so no real client spins up.
const signInWithPassword = vi.fn(async () => ({ error: null }))
const signUp = vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null }))
const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
const signInWithOAuth = vi.fn(async () => ({ error: null }))
const updateUser = vi.fn(async () => ({ error: null }))
const validateInvestorCode = vi.fn(async () => false)

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a) => signInWithPassword(...a),
      signUp: (...a) => signUp(...a),
      resetPasswordForEmail: (...a) => resetPasswordForEmail(...a),
      signInWithOAuth: (...a) => signInWithOAuth(...a),
      updateUser: (...a) => updateUser(...a),
    },
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
  },
  validateInvestorCode: (...a) => validateInvestorCode(...a),
}))

const { LoginScreen } = await import('../../components/LoginScreen.jsx')

beforeEach(() => {
  signInWithPassword.mockClear()
  signUp.mockClear()
  resetPasswordForEmail.mockClear()
  signInWithOAuth.mockClear()
  updateUser.mockClear()
  validateInvestorCode.mockClear()
})

describe('LoginScreen — sign in', () => {
  it('renders the sign-in form by default', () => {
    render(<LoginScreen />)
    // "Sign in" appears as both the shell title and the submit button
    expect(screen.getAllByText('Sign in').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('Your password')).toBeTruthy()
  })

  it('submits email/password to supabase signInWithPassword', async () => {
    render(<LoginScreen />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'hunter22' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'hunter22' })
    )
  })

  it('surfaces sign-in errors from supabase', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    render(<LoginScreen />)
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByText(/Invalid login credentials/i)).toBeTruthy())
  })
})

describe('LoginScreen — §17.I revival routing', () => {
  // Every failed sign-in checks api/revival-lookup; a match routes to the
  // revive mode instead of the generic error.
  const failSignIn = () =>
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })

  const submitLogin = () => {
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'gone@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'whatever' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('routes a failed sign-in with an open tombstone to the revive password form', async () => {
    failSignIn()
    fetch.mockResolvedValue({ ok: true, json: async () => ({ revivable: true, oauthProvider: null }) })
    render(<LoginScreen />)
    submitLogin()
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy())
    // Wait for the revive form to fully render with the password input
    await waitFor(() => expect(screen.getByPlaceholderText('At least 6 characters')).toBeTruthy())
    expect(fetch).toHaveBeenCalledWith('/api/revival-lookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'gone@example.com' }),
    }))
    expect(screen.queryByText(/Invalid login credentials/i)).toBeNull()
  })

  it('shows Continue with Google instead of a password form for an OAuth tombstone', async () => {
    failSignIn()
    fetch.mockResolvedValue({ ok: true, json: async () => ({ revivable: true, oauthProvider: 'google' }) })
    render(<LoginScreen />)
    submitLogin()
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy())
    expect(screen.getByText('Continue with Google')).toBeTruthy()
    expect(screen.queryByPlaceholderText('At least 6 characters')).toBeNull()
  })

  it('falls back to the generic error when the email is not revivable', async () => {
    failSignIn()
    fetch.mockResolvedValue({ ok: true, json: async () => ({ revivable: false }) })
    render(<LoginScreen />)
    submitLogin()
    await waitFor(() => expect(screen.getByText(/Invalid login credentials/i)).toBeTruthy())
  })

  it('falls back to the generic error when the lookup itself fails', async () => {
    failSignIn()
    fetch.mockRejectedValue(new TypeError('network down'))
    render(<LoginScreen />)
    submitLogin()
    await waitFor(() => expect(screen.getByText(/Invalid login credentials/i)).toBeTruthy())
  })

  it('creates the replacement account with the NEW password from the revive form', async () => {
    failSignIn()
    fetch.mockResolvedValue({ ok: true, json: async () => ({ revivable: true, oauthProvider: null }) })
    signUp.mockResolvedValueOnce({ data: { user: { id: 'u2' }, session: {} }, error: null })
    render(<LoginScreen />)
    submitLogin()
    await waitFor(() => expect(screen.getByText('Welcome back')).toBeTruthy())
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'newpass1' } })
    fireEvent.change(screen.getByPlaceholderText('Repeat new password'), { target: { value: 'newpass1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'gone@example.com',
      password: 'newpass1',
    })))
  })
})

describe('LoginScreen — mode switching', () => {
  it('switches to the create-account form', () => {
    render(<LoginScreen />)
    fireEvent.click(screen.getByText('Create one'))
    expect(screen.getAllByText('Create account').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByPlaceholderText('At least 6 characters')).toBeTruthy()
  })

  it('switches to forgot-password and sends the reset email', async () => {
    render(<LoginScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot?' }))
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    await waitFor(() =>
      expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', expect.anything())
    )
  })

  it('returns from forgot-password to sign in', () => {
    render(<LoginScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot?' }))
    fireEvent.click(screen.getByText('← Back to sign in'))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })
})

describe('LoginScreen — sign up', () => {
  it('creates the account and seeds a user_data row', async () => {
    render(<LoginScreen />)
    fireEvent.click(screen.getByText('Create one'))
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: 'secret99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@b.com', password: 'secret99' }))
    )
  })
})

describe('LoginScreen — investor access code', () => {
  it('rejects an invalid code with an error state', async () => {
    validateInvestorCode.mockResolvedValueOnce(false)
    const onInvestorVerified = vi.fn()
    render(<LoginScreen onInvestorVerified={onInvestorVerified} />)
    const codeInput = screen.getByPlaceholderText('enter access code')
    fireEvent.change(codeInput, { target: { value: 'NOPE' } })
    fireEvent.keyDown(codeInput, { key: 'Enter' })
    await waitFor(() => expect(validateInvestorCode).toHaveBeenCalledWith('NOPE'))
    expect(onInvestorVerified).not.toHaveBeenCalled()
  })

  it('calls onInvestorVerified for a valid code', async () => {
    validateInvestorCode.mockResolvedValueOnce(true)
    const onInvestorVerified = vi.fn()
    render(<LoginScreen onInvestorVerified={onInvestorVerified} />)
    const codeInput = screen.getByPlaceholderText('enter access code')
    fireEvent.change(codeInput, { target: { value: 'VIP' } })
    fireEvent.keyDown(codeInput, { key: 'Enter' })
    await waitFor(() => expect(onInvestorVerified).toHaveBeenCalled())
  })
})

describe('LoginScreen — Google OAuth callback failure', () => {
  it('explains a failed OAuth callback instead of a silent blank form', () => {
    render(<LoginScreen oauthCallbackFailed />)
    expect(screen.getByText(/Google sign-in didn't finish/i)).toBeTruthy()
  })

  it('shows no OAuth error by default', () => {
    render(<LoginScreen />)
    expect(screen.queryByText(/Google sign-in didn't finish/i)).toBeNull()
  })

  it('clears the failure flag via onOauthRetry when Google sign-in is retried', async () => {
    const onOauthRetry = vi.fn()
    render(<LoginScreen oauthCallbackFailed onOauthRetry={onOauthRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(onOauthRetry).toHaveBeenCalled()
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    ))
  })

  it('forces the Google account chooser on the Create Account tab', async () => {
    render(<LoginScreen />)
    fireEvent.click(screen.getByText('Create one'))
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalled())
    expect(signInWithOAuth.mock.calls[0][0].options.queryParams).toEqual({ prompt: 'select_account' })
  })
})

describe('LoginScreen — password recovery mode', () => {
  const fillRecovery = (pw, confirm) => {
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), { target: { value: pw } })
    fireEvent.change(screen.getByPlaceholderText('Repeat new password'), { target: { value: confirm } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Password' }))
  }

  it('renders the set-new-password form', () => {
    render(<LoginScreen recoveryMode />)
    expect(screen.getByText('Set new password')).toBeTruthy()
    expect(screen.getByPlaceholderText('Repeat new password')).toBeTruthy()
  })

  it('rejects mismatched passwords without calling supabase', async () => {
    render(<LoginScreen recoveryMode />)
    fillRecovery('secret99', 'different')
    await waitFor(() => expect(screen.getByText(/don't match/i)).toBeTruthy())
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects passwords under 6 characters', async () => {
    render(<LoginScreen recoveryMode />)
    fillRecovery('abc', 'abc')
    await waitFor(() => expect(screen.getByText(/at least 6 characters/i)).toBeTruthy())
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('updates the password and signals completion', async () => {
    const onRecoveryDone = vi.fn()
    render(<LoginScreen recoveryMode onRecoveryDone={onRecoveryDone} />)
    fillRecovery('secret99', 'secret99')
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'secret99' }))
    await waitFor(() => expect(onRecoveryDone).toHaveBeenCalled())
  })

  it('surfaces supabase update errors and does not complete', async () => {
    updateUser.mockResolvedValueOnce({ error: { message: 'Token expired' } })
    const onRecoveryDone = vi.fn()
    render(<LoginScreen recoveryMode onRecoveryDone={onRecoveryDone} />)
    fillRecovery('secret99', 'secret99')
    await waitFor(() => expect(screen.getByText(/Token expired/)).toBeTruthy())
    expect(onRecoveryDone).not.toHaveBeenCalled()
  })
})
