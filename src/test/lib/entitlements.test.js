import { describe, it, expect } from 'vitest'
import { canAccessTaxPlan } from '../../lib/entitlements.js'

describe('canAccessTaxPlan', () => {
  it('is hidden by default (no admin, no manual flag, no wizard opt-in)', () => {
    expect(canAccessTaxPlan({})).toBe(false)
    expect(canAccessTaxPlan()).toBe(false)
    expect(canAccessTaxPlan({ isAdmin: false, taxProjectionsEnabled: false, taxExemptOptIn: false })).toBe(false)
  })

  it('the setup-wizard "Unlock projections" opt-in grants it', () => {
    expect(canAccessTaxPlan({ taxExemptOptIn: true })).toBe(true)
  })

  it('admins always see it', () => {
    expect(canAccessTaxPlan({ isAdmin: true })).toBe(true)
  })

  // The core requirement: the manual flag must work on its own, even when the
  // user never clicked "Unlock projections" during setup.
  it('the manual flag grants it WITHOUT the wizard opt-in (override path)', () => {
    expect(canAccessTaxPlan({ taxProjectionsEnabled: true, taxExemptOptIn: false })).toBe(true)
  })

  it('manual flag and wizard opt-in are independent OR paths, never AND', () => {
    // Each alone is sufficient; neither blocks the other.
    expect(canAccessTaxPlan({ taxProjectionsEnabled: true })).toBe(true)
    expect(canAccessTaxPlan({ taxExemptOptIn: true })).toBe(true)
    expect(canAccessTaxPlan({ taxProjectionsEnabled: true, taxExemptOptIn: true })).toBe(true)
  })

  it('coerces truthy/falsy inputs to a real boolean', () => {
    expect(canAccessTaxPlan({ taxProjectionsEnabled: undefined, taxExemptOptIn: undefined })).toBe(false)
    expect(canAccessTaxPlan({ isAdmin: 1 })).toBe(true)
  })
})
