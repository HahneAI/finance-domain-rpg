import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// LoginScreen imports the supabase client (created at module load from env
// vars) — mock the whole module so no real client spins up.
const signInWithPassword = vi.fn(async () => ({ error: null }))
const signUp = vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null }))
const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
const validateInvestorCode = vi.fn(async () => false)

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a) => signInWithPassword(...a),
      signUp: (...a) => signUp(...a),
      resetPasswordForEmail: (...a) => resetPasswordForEmail(...a),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
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
