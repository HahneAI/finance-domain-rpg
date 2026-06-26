// Feature-access rules. Kept pure and standalone so each entitlement's precedence
// is unit-testable and defined in exactly one place, rather than re-derived inline
// in every component that gates on it.

/**
 * Tax Plan / tax-projections feature visibility.
 *
 * The three inputs are independent unlock paths — ANY one grants access (logical
 * OR, never AND). In particular the manual flag OVERRIDES the setup-wizard path:
 * a user who did not click "Unlock projections" during setup can still be granted
 * the feature manually.
 *
 *   • isAdmin               — admins always see it.
 *   • taxProjectionsEnabled — manual per-user unlock (user_data.tax_projections_enabled),
 *                             granted via SQL. Independent of the wizard opt-in.
 *   • taxExemptOptIn        — the user chose "Unlock projections" in the setup wizard
 *                             (config.taxExemptOptIn).
 */
export function canAccessTaxPlan({
  isAdmin = false,
  taxProjectionsEnabled = false,
  taxExemptOptIn = false,
} = {}) {
  return Boolean(isAdmin || taxProjectionsEnabled || taxExemptOptIn);
}
