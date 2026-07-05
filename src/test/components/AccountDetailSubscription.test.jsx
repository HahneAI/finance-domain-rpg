import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DEFAULT_CONFIG } from '../../constants/config.js'

// §17.F Subscription card coverage — status label, plan/price, Manage
// Subscription vs. checkout-button branching, and the billing-portal call.
const getSession = vi.fn()
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: (...a) => getSession(...a) } },
}))

const { AccountDetail } = await import('../../components/ProfilePanel.jsx')

const baseUser = { email: 'anthony@example.com', identities: [{ provider: 'email' }], user_metadata: {} }
const SESSION = { data: { session: { access_token: 'tok-123' } } }

beforeEach(() => {
  getSession.mockResolvedValue(SESSION)
  vi.stubGlobal('fetch', vi.fn())
  const loc = { href: 'http://localhost/' }
  vi.stubGlobal('location', loc)
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAccount(subscription) {
  return render(<AccountDetail authedUser={baseUser} config={DEFAULT_CONFIG} subscription={subscription} onBack={() => {}} />)
}

describe('AccountDetail — Subscription card status', () => {
  it('shows "Trial" with the days-left copy during trial', () => {
    renderAccount({ trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(), accessEndsAt: new Date(Date.now() + 12 * 86400000).toISOString() })
    expect(screen.getByText('Trial')).toBeInTheDocument()
    expect(screen.getByText(/days left in your free trial/i)).toBeInTheDocument()
  })

  it('shows "Trial Ended" (no day count, no grace mention) once expired', () => {
    const { container } = renderAccount({ trialEndsAt: new Date(Date.now() - 10 * 86400000).toISOString(), accessEndsAt: new Date(Date.now() - 1 * 86400000).toISOString() })
    expect(screen.getByText('Trial Ended')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/grace/i)
  })

  it('shows "Active" with the renewal date for a real active subscription', () => {
    renderAccount({ status: 'active', currentPeriodEnd: '2026-08-01T00:00:00.000Z', plan: 'monthly', stripeCustomerId: 'cus_1' })
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/Renews Aug 1, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Monthly plan/)).toBeInTheDocument()
  })

  it('shows "Past Due" while still within the paid period', () => {
    renderAccount({ status: 'past_due', currentPeriodEnd: new Date(Date.now() + 5 * 86400000).toISOString(), stripeCustomerId: 'cus_1' })
    expect(screen.getByText('Past Due')).toBeInTheDocument()
  })

  it('shows "Canceled" with the access-continues date while still within the paid period', () => {
    renderAccount({ status: 'canceled', currentPeriodEnd: '2026-09-15T00:00:00.000Z', stripeCustomerId: 'cus_1' })
    expect(screen.getByText('Canceled')).toBeInTheDocument()
    expect(screen.getByText(/Access continues through Sep 15, 2026/)).toBeInTheDocument()
  })

  it('shows "N/A" for an account with no trial window seeded (investor/demo)', () => {
    renderAccount(undefined)
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.getByText(/no subscription required/i)).toBeInTheDocument()
    expect(screen.queryByText('Monthly — $14.99')).not.toBeInTheDocument()
    expect(screen.queryByText('Manage Subscription')).not.toBeInTheDocument()
  })
})

describe('AccountDetail — Subscription card actions', () => {
  it('shows checkout buttons (not Manage Subscription) when there is no Stripe customer yet', () => {
    renderAccount({ trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString(), accessEndsAt: new Date(Date.now() + 12 * 86400000).toISOString() })
    expect(screen.getByText('Monthly — $14.99')).toBeInTheDocument()
    expect(screen.queryByText('Manage Subscription')).not.toBeInTheDocument()
  })

  it('shows Manage Subscription (not checkout buttons) once a Stripe customer exists', () => {
    renderAccount({ status: 'active', currentPeriodEnd: '2026-08-01T00:00:00.000Z', stripeCustomerId: 'cus_1' })
    expect(screen.getByText('Manage Subscription')).toBeInTheDocument()
    expect(screen.queryByText('Monthly — $14.99')).not.toBeInTheDocument()
  })

  it('Manage Subscription posts the bearer token to api/stripe-portal and redirects to the portal URL', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://billing.stripe.com/session_1' }) })
    renderAccount({ status: 'active', currentPeriodEnd: '2026-08-01T00:00:00.000Z', stripeCustomerId: 'cus_1' })
    fireEvent.click(screen.getByText('Manage Subscription'))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/stripe-portal', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
    })))
    await waitFor(() => expect(window.location.href).toBe('https://billing.stripe.com/session_1'))
  })

  it('surfaces a billing-portal error instead of redirecting', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'No Stripe customer on file' }) })
    renderAccount({ status: 'active', currentPeriodEnd: '2026-08-01T00:00:00.000Z', stripeCustomerId: 'cus_1' })
    fireEvent.click(screen.getByText('Manage Subscription'))
    await waitFor(() => expect(screen.getByText('No Stripe customer on file')).toBeInTheDocument())
  })
})
