// Feature-access rules. Kept pure and standalone so each entitlement's precedence
// is unit-testable and defined in exactly one place, rather than re-derived inline
// in every component that gates on it.

/**
 * Tax Plan / tax-projections feature visibility.
 *
 * Only two paths grant access (logical OR, never AND):
 *   • isAdmin               — admins always see it.
 *   • taxProjectionsEnabled — manual per-user unlock (user_data.tax_projections_enabled),
 *                             granted via SQL to specific vetted users.
 *
 * NOTE — the setup-wizard "Unlock projections" choice (config.taxExemptOptIn) is
 * deliberately NOT a grant path. Until the tax-withholding feature is reviewed by
 * an accountant for correctness/liability, clicking "Unlock projections" must not
 * reveal any tax-plan UI to a normal user. The feature is handed out only manually.
 * Re-enabling the wizard path later is a one-line change here — do not scatter the
 * taxExemptOptIn check back into components.
 */
export function canAccessTaxPlan({ isAdmin = false, taxProjectionsEnabled = false } = {}) {
  return Boolean(isAdmin || taxProjectionsEnabled);
}
