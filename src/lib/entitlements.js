// Feature-access rules. Kept pure and standalone so each entitlement's precedence
// is unit-testable and defined in exactly one place, rather than re-derived inline
// in every component that gates on it.

/**
 * Base tester-tier access. isAdmin is always a strict superset of isTester —
 * every per-feature gate below builds on this instead of re-deriving the
 * isAdmin/isTester OR inline, so that superset relationship can't drift
 * feature-by-feature as new gates are added.
 */
function hasTesterAccess({ isAdmin = false, isTester = false } = {}) {
  return Boolean(isAdmin || isTester);
}

/**
 * Tax Plan / tax-projections feature visibility.
 *
 * Three paths grant access (logical OR, never AND):
 *   • isAdmin               — admins always see it.
 *   • isTester              — user_data.is_tester, set manually via SQL for
 *                             specific beta accounts (database/migrations/
 *                             021_add_is_tester_beta_flag.sql).
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
export function canAccessTaxPlan({ isAdmin = false, taxProjectionsEnabled = false, isTester = false } = {}) {
  return hasTesterAccess({ isAdmin, isTester }) || Boolean(taxProjectionsEnabled);
}

/**
 * AI feature visibility (docs/TODO.md §18 standing constraint — every AI
 * feature stays gated until Coach is ready for general rollout).
 *
 * CRUCIAL — beta testers are NOT investors. Do not fold isInvestor into this
 * OR list: is_tester grants AI features only, never demo-account access or
 * the investor code path. See docs/active-systems.md "Beta Tester Accounts".
 */
export function canAccessAiFeatures({ isAdmin = false, isTester = false } = {}) {
  return hasTesterAccess({ isAdmin, isTester });
}
