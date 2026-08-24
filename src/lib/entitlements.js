// Feature-access rules. Kept pure and standalone so each entitlement's precedence
// is unit-testable and defined in exactly one place, rather than re-derived inline
// in every component that gates on it.

/**
 * Base tester-tier access. isAdmin is always a strict superset of isTester —
 * every per-feature gate below builds on this instead of re-deriving the
 * isAdmin/isTester OR inline, so that superset relationship can't drift
 * feature-by-feature as new gates are added.
 *
 * isAiAdmin (2026-08-24) gets the same front-line feature access as a beta
 * tester — it is NOT a weaker isAdmin (it still unlocks none of the
 * mutating/destructive Admin Tools; see docs/admin-toolkit-reference.md "AI
 * Admin") but it IS a full tester-tier peer for every entitlement gate in
 * this file, so an AI-agent-team account can exercise the product the same
 * way a real beta tester does.
 *
 * Deliberately does NOT include isInvestor — used by canAccessTaxPlan, which
 * investor/demo accounts have no product reason to see. See
 * hasPrivilegedAccess below for the broader "bypasses every paid wall" set.
 */
function hasTesterAccess({ isAdmin = false, isTester = false, isAiAdmin = false } = {}) {
  return Boolean(isAdmin || isTester || isAiAdmin);
}

/**
 * Locked decision, 2026-07-25 — supersedes this file's older "is_investor
 * must never grant AI features" rule. Every feature behind a paid wall
 * (AI features today; any future paid-only surface) is free for admin,
 * isTester (beta-cohort or friends/family, beta code present or not — the
 * distinction that matters for isTrackedBetaTester below is irrelevant
 * here), and isInvestor (demo/pitch accounts need the full feature set,
 * not a stripped-down preview) — no payment or entitlement state required
 * for any of the three. This is intentionally broader than hasTesterAccess:
 * that one still gates Tax Plan, which investor accounts have no product
 * reason to see, so it's untouched — this helper is only for the "paid
 * wall" class of gate.
 *
 * isAiAdmin (2026-08-24) joins the same set — see hasTesterAccess above.
 */
function hasPrivilegedAccess({ isAdmin = false, isTester = false, isInvestor = false, isAiAdmin = false } = {}) {
  return Boolean(isAdmin || isTester || isInvestor || isAiAdmin);
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
export function canAccessTaxPlan({ isAdmin = false, taxProjectionsEnabled = false, isTester = false, isAiAdmin = false } = {}) {
  return hasTesterAccess({ isAdmin, isTester, isAiAdmin }) || Boolean(taxProjectionsEnabled);
}

/**
 * AI feature visibility (docs/TODO.md §2 standing constraint — every AI
 * feature stays gated until Coach is ready for general rollout).
 *
 * Admin, tester, AND investor all pass unconditionally (hasPrivilegedAccess,
 * 2026-07-25 — see that function's doc comment). This does NOT relax the
 * separate, still-true rule that is_tester and is_investor are two distinct
 * account tiers with zero overlap — is_investor still doesn't unlock the
 * beta-tester surfaces (§23), and is_tester still doesn't unlock the Demo
 * Account Tree or the investor code path. This is narrower: it's only about
 * which accounts bypass the *AI-feature paid wall specifically*, and the
 * answer for all three privileged tiers is now the same.
 *
 * This is the *narrow*, admin/tester/investor gate — every Coach surface
 * still used it until the split below. Any future admin-only-for-now Coach
 * surface (i.e. anything in docs/coach-entry-points.md sections 4+) should
 * keep gating on this function, not on canAccessAskCoachGeneral.
 */
export function canAccessAiFeatures({ isAdmin = false, isTester = false, isInvestor = false, isAiAdmin = false } = {}) {
  return hasPrivilegedAccess({ isAdmin, isTester, isInvestor, isAiAdmin });
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
 * paid subscription, trial included, per docs/TODO.md §2.0's free-vs-paid
 * note — so a real trial/grace/active entitlement grants access exactly like
 * an admin, manually-flagged tester, or investor account does.
 *
 * Deliberately a *separate* function from canAccessAiFeatures rather than a
 * change to it: every other Coach surface (none built yet) must stay on the
 * narrow admin/tester/investor gate above, or building one later would
 * silently inherit this wider trial/paid gate the day it ships.
 *
 * isAdmin/isTester/isInvestor always pass regardless of `entitlement` — an
 * admin, manually-flagged tester, or investor account may carry no real
 * subscription state at all (entitlement.state === "none": investor/demo
 * accounts routinely do, or a row that predates the trial-window
 * migration), and must not lose Coach access because of that.
 *
 * @param {object} entitlement - the object from lib/subscription.js's
 *   getEntitlement() — only `.isEntitled` is read here.
 */
export function canAccessAskCoachGeneral({ isAdmin = false, isTester = false, isInvestor = false, isAiAdmin = false, entitlement } = {}) {
  return hasPrivilegedAccess({ isAdmin, isTester, isInvestor, isAiAdmin }) || Boolean(entitlement?.isEntitled);
}
