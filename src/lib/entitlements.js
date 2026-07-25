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
 *
 * This is the *narrow*, admin/tester-only gate — every Coach surface still
 * used it until the split below. Any future admin-only-for-now Coach surface
 * (i.e. anything in docs/coach-entry-points.md sections 4+) should keep
 * gating on this function, not on canAccessAskCoachGeneral.
 */
export function canAccessAiFeatures({ isAdmin = false, isTester = false } = {}) {
  return hasTesterAccess({ isAdmin, isTester });
}

/**
 * Beta usage-tracking eligibility (docs/TODO.md — beta usage scoring;
 * database/migrations/025_add_beta_code_used.sql).
 *
 * Deliberately NOT built on hasTesterAccess — this is not a feature-access gate,
 * it decides whether an account's activity gets logged to beta_activity_events.
 * isAdmin does NOT grant this: admin accounts aren't part of the beta cohort.
 *
 * Two populations both carry is_tester = true:
 *   • Real 10-week beta cohort — is_tester true AND a beta_code_used value present.
 *   • Friends/family testers — is_tester true, no beta_code_used. Keep their
 *     standing 6-month trial window; NOT tracked here, at least not initially.
 */
export function isTrackedBetaTester({ isTester = false, betaCodeUsed = null } = {}) {
  return Boolean(isTester && betaCodeUsed);
}

/**
 * Ask Coach general chat + Net Worth Check-In card visibility
 * (docs/coach-entry-points.md sections 1–2 — the first two Coach surfaces to
 * leave the admin/tester-only standing constraint). Ships with the regular
 * paid subscription, trial included, per docs/TODO.md §18.0's free-vs-paid
 * note — so a real trial/grace/active entitlement grants access exactly like
 * an admin or manually-flagged tester does.
 *
 * Deliberately a *separate* function from canAccessAiFeatures rather than a
 * change to it: every other Coach surface (none built yet) must stay on the
 * narrow admin/tester-only gate above, or building one later would silently
 * inherit this wider trial/paid gate the day it ships.
 *
 * isAdmin/isTester always pass regardless of `entitlement` — an admin or a
 * manually-flagged tester account may carry no real subscription state at
 * all (entitlement.state === "none": investor/demo accounts, or a row that
 * predates the trial-window migration), and must not lose Coach access
 * because of that.
 *
 * @param {object} entitlement - the object from lib/subscription.js's
 *   getEntitlement() — only `.isEntitled` is read here.
 */
export function canAccessAskCoachGeneral({ isAdmin = false, isTester = false, entitlement } = {}) {
  return hasTesterAccess({ isAdmin, isTester }) || Boolean(entitlement?.isEntitled);
}
