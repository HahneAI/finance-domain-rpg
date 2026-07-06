import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// §17.I ReviveScreen — archived identity, revive checkout, and the two-way
// door: a failed/abandoned checkout must leave the screen fully usable.

const getSession = vi.fn()
const signOut = vi.fn(async () => ({ error: null }))
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: (...a) => getSession(...a), signOut: (...a) => signOut(...a) } },
  validateInvestorCode: vi.fn(async () => false),
}))

const { ReviveScreen } = await import('../../components/ReviveScreen.jsx')

const REVIVAL = {
  revivable: true,
  email: 'gone@example.com',
  displayName: 'Old Name',
  avatarUrl: null,
  oauthProvider: null,
  plan: 'monthly',
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  vi.stubGlobal('fetch', vi.fn())
  const loc = { href: 'http://localhost/' }
  vi.stubGlobal('location', loc)
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReviveScreen — identity + checkout', () => {
  it('shows the archived identity so the user recognizes their old account', () => {
    render(<ReviveScreen revival={REVIVAL} checkoutReturn={null} />)
    expect(screen.getByText('Old Name')).toBeTruthy()
    expect(screen.getByText('gone@example.com')).toBeTruthy()
    expect(screen.getByText('Welcome back')).toBeTruthy()
  })

  it('posts the chosen plan to the REVIVE checkout route with the bearer token and redirects', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/revive_1' }) })
    render(<ReviveScreen revival={REVIVAL} checkoutReturn={null} />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/stripe-revive-checkout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      body: JSON.stringify({ plan: 'monthly' }),
    })))
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/c/revive_1'))
  })

  it('surfaces the API error and re-enables the buttons for retry', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'No revivable account for this email' }) })
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/retry' }) })
    render(<ReviveScreen revival={REVIVAL} checkoutReturn={null} />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('No revivable account for this email')).toBeTruthy())
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/retry'))
  })
})

describe('ReviveScreen — two-way door + return states', () => {
  it('shows the retry guidance on a cancel return and keeps the plan buttons usable', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/again' }) })
    render(<ReviveScreen revival={REVIVAL} checkoutReturn="cancel" />)
    expect(screen.getByText(/try a different payment method/i)).toBeTruthy()
    expect(screen.getByText(/isn't frozen/i)).toBeTruthy()
    fireEvent.click(screen.getByText(/Annual/))
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/again'))
  })

  it('shows the restoring state on a success return instead of the plan buttons', () => {
    render(<ReviveScreen revival={REVIVAL} checkoutReturn="success" />)
    expect(screen.getByText(/restoring your account/i)).toBeTruthy()
    expect(screen.queryByText('Monthly')).toBeNull()
  })

  it('offers a sign-out escape hatch', async () => {
    render(<ReviveScreen revival={REVIVAL} checkoutReturn={null} />)
    fireEvent.click(screen.getByText(/Not you\? Sign out/i))
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }))
  })
})

describe('ReviveScreen — disclosure guard', () => {
  it('never mentions the hidden grace window or 21-day access', () => {
    const { container } = render(<ReviveScreen revival={REVIVAL} checkoutReturn="cancel" />)
    const text = container.textContent
    expect(text.length).toBeGreaterThan(50) // vacuous-pass guard
    for (const forbidden of [/grace/i, /21[- ]day/i, /extra week/i, /access ends/i]) {
      expect(text).not.toMatch(forbidden)
    }
  })
})
