import { describe, it, expect } from 'vitest'
import { canAccessTaxPlan, canAccessAiFeatures, isTrackedBetaTester, canAccessAskCoachGeneral } from '../../lib/entitlements.js'

describe('canAccessTaxPlan', () => {
  it('is hidden by default (no admin, no manual flag)', () => {
    expect(canAccessTaxPlan({})).toBe(false)
    expect(canAccessTaxPlan()).toBe(false)
    expect(canAccessTaxPlan({ isAdmin: false, taxProjectionsEnabled: false })).toBe(false)
  })

  it('admins always see it', () => {
    expect(canAccessTaxPlan({ isAdmin: true })).toBe(true)
  })

  it('the manual per-user flag grants it', () => {
    expect(canAccessTaxPlan({ taxProjectionsEnabled: true })).toBe(true)
  })

  it('beta testers (user_data.is_tester) see it too', () => {
    expect(canAccessTaxPlan({ isTester: true })).toBe(true)
  })

  // Liability guard: the setup wizard's tax-exempt opt-in ("Request access")
  // sets config.taxExemptOptIn, which must NOT reveal the tax feature on its own.
  // Even if a caller passes it through, it cannot grant access.
  it('the setup-wizard taxExemptOptIn does NOT grant access', () => {
    expect(canAccessTaxPlan({ taxExemptOptIn: true })).toBe(false)
    expect(canAccessTaxPlan({ isAdmin: false, taxProjectionsEnabled: false, taxExemptOptIn: true })).toBe(false)
  })

  it('a manually-granted user keeps access regardless of taxExemptOptIn', () => {
    expect(canAccessTaxPlan({ taxProjectionsEnabled: true, taxExemptOptIn: false })).toBe(true)
    expect(canAccessTaxPlan({ taxProjectionsEnabled: true, taxExemptOptIn: true })).toBe(true)
  })

  it('coerces truthy/falsy inputs to a real boolean', () => {
    expect(canAccessTaxPlan({ taxProjectionsEnabled: undefined })).toBe(false)
    expect(canAccessTaxPlan({ isAdmin: 1 })).toBe(true)
    expect(canAccessTaxPlan({ isTester: 1 })).toBe(true)
  })
})

describe('canAccessAiFeatures', () => {
  it('is hidden by default (no admin, no tester)', () => {
    expect(canAccessAiFeatures({})).toBe(false)
    expect(canAccessAiFeatures()).toBe(false)
    expect(canAccessAiFeatures({ isAdmin: false, isTester: false })).toBe(false)
  })

  it('admins always see it', () => {
    expect(canAccessAiFeatures({ isAdmin: true })).toBe(true)
  })

  it('beta testers (user_data.is_tester) see it too', () => {
    expect(canAccessAiFeatures({ isTester: true })).toBe(true)
  })

  // Crucial division (docs/active-systems.md "Beta Tester Accounts"): a beta
  // tester is not an investor. Passing isInvestor must never grant this on
  // its own — the function doesn't even accept that param.
  it('does not grant access via isInvestor — beta testers are not investors', () => {
    expect(canAccessAiFeatures({ isInvestor: true })).toBe(false)
  })

  it('coerces truthy/falsy inputs to a real boolean', () => {
    expect(canAccessAiFeatures({ isTester: undefined })).toBe(false)
    expect(canAccessAiFeatures({ isAdmin: 1 })).toBe(true)
  })
})

describe('isTrackedBetaTester', () => {
  it('is false by default (no tester flag, no code)', () => {
    expect(isTrackedBetaTester({})).toBe(false)
    expect(isTrackedBetaTester()).toBe(false)
  })

  it('requires BOTH is_tester and a beta code — neither alone is enough', () => {
    expect(isTrackedBetaTester({ isTester: true, betaCodeUsed: null })).toBe(false)
    expect(isTrackedBetaTester({ isTester: false, betaCodeUsed: 'BETA10W' })).toBe(false)
  })

  it('the real beta cohort: is_tester true AND a beta code present', () => {
    expect(isTrackedBetaTester({ isTester: true, betaCodeUsed: 'BETA10W' })).toBe(true)
  })

  // Friends/family testers: is_tester true, no code — keep their standing 6-month
  // window but must NOT be tracked by the beta scoring system.
  it('friends/family testers (is_tester true, no code) are not tracked', () => {
    expect(isTrackedBetaTester({ isTester: true, betaCodeUsed: null })).toBe(false)
    expect(isTrackedBetaTester({ isTester: true })).toBe(false)
  })

  // isAdmin must NOT grant this on its own — admins aren't part of the beta cohort,
  // and this function doesn't even accept an isAdmin param.
  it('does not grant tracking via isAdmin — the function does not accept it', () => {
    expect(isTrackedBetaTester({ isAdmin: true, betaCodeUsed: 'BETA10W' })).toBe(false)
  })

  it('coerces truthy/falsy inputs to a real boolean', () => {
    expect(isTrackedBetaTester({ isTester: 1, betaCodeUsed: 'x' })).toBe(true)
    expect(isTrackedBetaTester({ isTester: true, betaCodeUsed: '' })).toBe(false)
  })
})

// docs/coach-entry-points.md sections 1–2 — the first two Coach surfaces to
// leave the admin/tester-only gate, gaining trial/paid entitlement as a
// second path in. Deliberately a separate function from canAccessAiFeatures
// (see its own docstring) so every other, not-yet-built Coach surface stays
// admin/tester-only by default.
describe('canAccessAskCoachGeneral', () => {
  it('is hidden by default (no admin, no tester, no entitlement)', () => {
    expect(canAccessAskCoachGeneral({})).toBe(false)
    expect(canAccessAskCoachGeneral()).toBe(false)
  })

  it('admins always see it, even with no real subscription state', () => {
    expect(canAccessAskCoachGeneral({ isAdmin: true, entitlement: { isEntitled: false } })).toBe(true)
    expect(canAccessAskCoachGeneral({ isAdmin: true })).toBe(true)
  })

  it('beta testers always see it, even with no real subscription state', () => {
    expect(canAccessAskCoachGeneral({ isTester: true, entitlement: { isEntitled: false } })).toBe(true)
  })

  it('a real trial/grace/active entitlement grants access on its own', () => {
    expect(canAccessAskCoachGeneral({ entitlement: { isEntitled: true, state: 'trial' } })).toBe(true)
    expect(canAccessAskCoachGeneral({ entitlement: { isEntitled: true, state: 'grace' } })).toBe(true)
    expect(canAccessAskCoachGeneral({ entitlement: { isEntitled: true, state: 'active' } })).toBe(true)
  })

  it('an expired or non-existent entitlement does not grant access on its own', () => {
    expect(canAccessAskCoachGeneral({ entitlement: { isEntitled: false, state: 'expired' } })).toBe(false)
    expect(canAccessAskCoachGeneral({ entitlement: { isEntitled: false, state: 'none' } })).toBe(false)
  })

  it('tolerates a missing entitlement object entirely', () => {
    expect(canAccessAskCoachGeneral({ isAdmin: false, isTester: false, entitlement: undefined })).toBe(false)
  })

  it('does not grant access via isInvestor — same crucial division as canAccessAiFeatures', () => {
    expect(canAccessAskCoachGeneral({ isInvestor: true, entitlement: { isEntitled: false } })).toBe(false)
  })
})
