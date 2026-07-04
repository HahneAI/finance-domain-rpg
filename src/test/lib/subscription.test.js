import { describe, it, expect } from 'vitest'
import { getEntitlement } from '../../lib/subscription.js'

const TRIAL_STARTED = '2026-01-01T00:00:00.000Z'
const TRIAL_ENDS = '2026-01-15T00:00:00.000Z'   // day 14
const ACCESS_ENDS = '2026-01-22T00:00:00.000Z'  // day 21

function trialSub(overrides = {}) {
  return {
    status: 'trialing',
    stripeSubscriptionId: null,
    trialStartedAt: TRIAL_STARTED,
    trialEndsAt: TRIAL_ENDS,
    accessEndsAt: ACCESS_ENDS,
    currentPeriodEnd: null,
    ...overrides,
  }
}

describe('getEntitlement — trial/grace/expired boundaries', () => {
  it('is in trial the moment before trial_ends_at', () => {
    const now = new Date(new Date(TRIAL_ENDS).getTime() - 1)
    const result = getEntitlement(trialSub(), now)
    expect(result.state).toBe('trial')
    expect(result.isEntitled).toBe(true)
    expect(result.trialDaysLeft).toBe(1)
  })

  it('flips to grace exactly at trial_ends_at (inclusive)', () => {
    const now = new Date(TRIAL_ENDS)
    const result = getEntitlement(trialSub(), now)
    expect(result.state).toBe('grace')
    expect(result.isEntitled).toBe(true)
    expect(result.trialDaysLeft).toBe(0)
  })

  it('is still in grace the moment before access_ends_at', () => {
    const now = new Date(new Date(ACCESS_ENDS).getTime() - 1)
    const result = getEntitlement(trialSub(), now)
    expect(result.state).toBe('grace')
    expect(result.isEntitled).toBe(true)
  })

  it('flips to expired exactly at access_ends_at (inclusive)', () => {
    const now = new Date(ACCESS_ENDS)
    const result = getEntitlement(trialSub(), now)
    expect(result.state).toBe('expired')
    expect(result.isEntitled).toBe(false)
    expect(result.accessDaysLeft).toBe(0)
  })

  it('grace never exposes trialDaysLeft > 0, only accessDaysLeft internally', () => {
    const now = new Date(new Date(TRIAL_ENDS).getTime() + 3 * 86400000)
    const result = getEntitlement(trialSub(), now)
    expect(result.state).toBe('grace')
    expect(result.trialDaysLeft).toBe(0)
    expect(result.accessDaysLeft).toBe(4)
  })

  it('mid-trial reports the correct days-left countdown', () => {
    const now = new Date(new Date(TRIAL_STARTED).getTime() + 10 * 86400000) // day 10, 4 days left
    const result = getEntitlement(trialSub(), now)
    expect(result.state).toBe('trial')
    expect(result.trialDaysLeft).toBe(4)
  })
})

describe('getEntitlement — active subscription states', () => {
  it('an active Stripe subscription is entitled regardless of trial timestamps', () => {
    const now = new Date(ACCESS_ENDS) // would otherwise be "expired"
    const result = getEntitlement(trialSub({ status: 'active' }), now)
    expect(result.state).toBe('active')
    expect(result.isEntitled).toBe(true)
    expect(result.accessDaysLeft).toBeNull()
  })

  it('"trialing" status with a real Stripe subscription id is entitled', () => {
    const now = new Date(ACCESS_ENDS)
    const result = getEntitlement(trialSub({ status: 'trialing', stripeSubscriptionId: 'sub_123' }), now)
    expect(result.state).toBe('active')
  })

  it('"trialing" status with no Stripe subscription id falls through to trial/grace/expired math', () => {
    const now = new Date(ACCESS_ENDS)
    const result = getEntitlement(trialSub({ status: 'trialing', stripeSubscriptionId: null }), now)
    expect(result.state).toBe('expired')
  })
})

describe('getEntitlement — past_due and canceled (§H dunning/cancellation)', () => {
  it('past_due keeps entitlement until current_period_end', () => {
    const currentPeriodEnd = '2026-03-01T00:00:00.000Z'
    const now = new Date('2026-02-15T00:00:00.000Z')
    const result = getEntitlement(trialSub({ status: 'past_due', currentPeriodEnd }), now)
    expect(result.state).toBe('active')
    expect(result.isEntitled).toBe(true)
  })

  it('past_due locks once current_period_end has passed', () => {
    const currentPeriodEnd = '2026-02-01T00:00:00.000Z'
    const now = new Date('2026-02-15T00:00:00.000Z')
    const result = getEntitlement(trialSub({ status: 'past_due', currentPeriodEnd }), now)
    expect(result.isEntitled).toBe(false)
  })

  it('canceled ("cancel at period end") keeps access through current_period_end', () => {
    const currentPeriodEnd = '2026-03-01T00:00:00.000Z'
    const now = new Date('2026-02-15T00:00:00.000Z')
    const result = getEntitlement(trialSub({ status: 'canceled', currentPeriodEnd }), now)
    expect(result.state).toBe('active')
    expect(result.isEntitled).toBe(true)
  })

  it('canceled drops to read-only after current_period_end passes', () => {
    const currentPeriodEnd = '2026-02-01T00:00:00.000Z'
    const now = new Date('2026-02-15T00:00:00.000Z')
    const result = getEntitlement(trialSub({ status: 'canceled', currentPeriodEnd }), now)
    expect(result.isEntitled).toBe(false)
  })
})

describe('getEntitlement — no trial window seeded', () => {
  it('returns "none" and not entitled when trial/access timestamps are missing', () => {
    const result = getEntitlement({ status: null, trialEndsAt: null, accessEndsAt: null }, new Date())
    expect(result.state).toBe('none')
    expect(result.isEntitled).toBe(false)
    expect(result.accessDaysLeft).toBeNull()
  })

  it('handles a null/undefined subscription defensively', () => {
    expect(getEntitlement(null).state).toBe('none')
    expect(getEntitlement(undefined).isEntitled).toBe(false)
  })
})
