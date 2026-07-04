// Trial + subscription entitlement logic (docs/TODO.md §17.D). Kept pure and
// standalone, same rationale as lib/entitlements.js — one place to define the
// state machine so every gate (App.jsx, banners, admin diagnostics) reads it
// the same way instead of re-deriving phase math inline.
//
// IMPORTANT: `now` must be a real wall-clock Date — never the app's admin
// Lock Date / effectiveToday simulation. The read-only gate and the trial
// countdown are both time-derived against real UTC timestamps on purpose
// (§H: "admin Lock Date must not extend a trial or the grace"); passing a
// simulated date here would let Lock Date grant free access.

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(targetMs, nowMs) {
  return Math.max(0, Math.ceil((targetMs - nowMs) / DAY_MS));
}

/**
 * @param {object} subscription - the `subscription` object from db.js loadUserData()
 * @param {Date} now - defaults to the real current time
 * @returns {{ state: "trial"|"grace"|"active"|"expired"|"none", trialDaysLeft: number, isEntitled: boolean, accessDaysLeft: number|null }}
 *
 * accessDaysLeft reflects the hidden day-21 cutoff and must never be shown to
 * a non-admin user — see the disclosure guard in §D/§H. It exists for the
 * admin diagnostic surfaces only (Live State Inspector / Config Raw View).
 */
export function getEntitlement(subscription, now = new Date()) {
  const nowMs = now.getTime();
  const status = subscription?.status ?? null;
  const currentPeriodEndMs = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).getTime() : null;

  // A real, currently-paid-for Stripe subscription is always entitled,
  // regardless of trial/grace timestamps. This also covers the two §H
  // dunning cases that must NOT immediately lock the user out:
  //   - past_due: a failed charge — access continues until current_period_end,
  //     giving Stripe's own retry schedule (and the portal's update-card flow)
  //     a chance to resolve it before anything locks.
  //   - canceled: "cancel at period end" — access continues through the
  //     period the user already paid for.
  const withinPaidPeriod = currentPeriodEndMs !== null && nowMs < currentPeriodEndMs;
  const isLiveSubscription =
    status === "active" ||
    (status === "trialing" && Boolean(subscription?.stripeSubscriptionId)) ||
    ((status === "past_due" || status === "canceled") && withinPaidPeriod);

  if (isLiveSubscription) {
    return { state: "active", trialDaysLeft: 0, isEntitled: true, accessDaysLeft: null };
  }

  const trialEndsMs = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : null;
  const accessEndsMs = subscription?.accessEndsAt ? new Date(subscription.accessEndsAt).getTime() : null;

  // No trial window seeded at all (e.g. investor/demo accounts, or a row that
  // predates migration 017) — not a paywall case, just not entitled via trial.
  if (trialEndsMs === null || accessEndsMs === null) {
    return { state: "none", trialDaysLeft: 0, isEntitled: false, accessDaysLeft: null };
  }

  if (nowMs < trialEndsMs) {
    return {
      state: "trial",
      trialDaysLeft: daysLeft(trialEndsMs, nowMs),
      isEntitled: true,
      accessDaysLeft: daysLeft(accessEndsMs, nowMs),
    };
  }

  // Public trial has ended but the hidden grace window hasn't — still
  // entitled, but trialDaysLeft is pinned to 0 so "trial ended" copy is
  // correct; accessDaysLeft exists for admin-only visibility of the real
  // cutoff, never surfaced to the user.
  if (nowMs < accessEndsMs) {
    return { state: "grace", trialDaysLeft: 0, isEntitled: true, accessDaysLeft: daysLeft(accessEndsMs, nowMs) };
  }

  return { state: "expired", trialDaysLeft: 0, isEntitled: false, accessDaysLeft: 0 };
}
