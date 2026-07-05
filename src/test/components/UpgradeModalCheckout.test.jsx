import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Checkout-flow coverage for UpgradeModal (§17.E). The disclosure-guard file
// (UpgradeModal.test.jsx) covers copy; this file covers behavior: the Stripe
// checkout call, its failure modes, and the dismiss affordances.

const getSession = vi.fn()
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: (...a) => getSession(...a) } },
}))

const { UpgradeModal } = await import('../../components/UpgradeModal.jsx')

const SESSION = { data: { session: { access_token: 'tok-123' } } }

// UpgradeModal renders via createPortal(..., document.body); assert against screen.
beforeEach(() => {
  getSession.mockResolvedValue(SESSION)
  vi.stubGlobal('fetch', vi.fn())
  // jsdom throws "Not implemented: navigation" on real href assignment —
  // replace location with a plain writable object for the redirect assertion.
  const loc = { href: 'http://localhost/' }
  vi.stubGlobal('location', loc)
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UpgradeModal — checkout', () => {
  it('posts the chosen plan with the session bearer token and redirects to the checkout URL', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/sess_1' }) })
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/stripe-create-checkout', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      body: JSON.stringify({ plan: 'monthly' }),
    })))
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/c/sess_1'))
  })

  it('sends plan "annual" from the annual button', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/sess_2' }) })
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText(/Annual — Best Value/))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ plan: 'annual' })
  })

  it('shows a "Redirecting…" state on the chosen plan while checkout is pending', async () => {
    let resolveFetch
    fetch.mockReturnValue(new Promise(res => { resolveFetch = res }))
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('Redirecting…')).toBeTruthy())
    resolveFetch({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/x' }) })
  })

  it('errors without calling the API when there is no active session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('No active session found.')).toBeTruthy())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces the API error message on a non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Price not configured' }) })
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('Price not configured')).toBeTruthy())
  })

  it('falls back to a generic message when the response has no URL or error', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('Failed to start checkout.')).toBeTruthy())
  })

  it('recovers with a generic message when fetch itself rejects', async () => {
    fetch.mockRejectedValue(new TypeError('network down'))
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('Failed to start checkout.')).toBeTruthy())
  })

  it('re-enables the plan buttons after a failure so the user can retry', async () => {
    fetch.mockRejectedValueOnce(new TypeError('network down'))
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/retry' }) })
    render(<UpgradeModal />)
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(screen.getByText('Failed to start checkout.')).toBeTruthy())
    fireEvent.click(screen.getByText('Monthly'))
    await waitFor(() => expect(window.location.href).toBe('https://checkout.stripe.com/retry'))
  })
})

describe('UpgradeModal — dismiss affordances', () => {
  it('renders no dismiss button when onClose is omitted (full-panel replacement)', () => {
    render(<UpgradeModal />)
    expect(screen.queryByLabelText('Dismiss')).toBeNull()
  })

  it('renders ✕ and closes on click when onClose is provided (overlay mode)', () => {
    const onClose = vi.fn()
    render(<UpgradeModal onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a backdrop click but not on clicks inside the card', () => {
    const onClose = vi.fn()
    render(<UpgradeModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Your free trial has ended'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Your free trial has ended').closest('div[style*="fixed"]') ?? document.body.lastChild)
    expect(onClose).toHaveBeenCalled()
  })
})
