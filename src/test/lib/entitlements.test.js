import { describe, it, expect } from 'vitest'
import { canAccessTaxPlan } from '../../lib/entitlements.js'

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

  // Liability guard: clicking "Unlock projections" in the setup wizard sets
  // config.taxExemptOptIn, which must NOT reveal the tax feature on its own.
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
  })
})
