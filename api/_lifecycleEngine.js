// Pure decision engine for the daily subscription-lifecycle cron
// (docs/TODO.md §17.G). Shared helper, not an endpoint. Given one raw
// user_data row and the current wall-clock time, decides what (if anything)
// the cron should do for that user — no I/O here, so the phase routing and
// every-other-day throttle are unit-testable without mocking Supabase/Resend
// (src/test/api/lifecycleEngine.test.js).
//
// Phase math is NOT re-derived here — it delegates to getEntitlement()
// (src/lib/subscription.js), the single source of truth for
// trial/grace/active/expired/none.
//
// Idempotency (§G): the cron must be safe to run more than once a day, so
// every send decision keys off the stored throttle timestamp
// (last_dunning_email_at) — never off "did the calendar day flip."

import { getEntitlement } from "../src/lib/subscription.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Trial add-card nudges fire once each at these days-since-trial-start.
export const TRIAL_NUDGE_DAYS = [7, 12];
// Grace + expired warnings repeat on this cadence ("every other day").
export const DUNNING_INTERVAL_DAYS = 2;
// Days past the access cutoff (day 21) before the account is delete-due (§I).
export const DELETION_BUFFER_DAYS = 7;

/**
 * @param {object} row - raw user_data row (snake_case columns)
 * @param {Date} now - real wall-clock time
 * @returns {{ type: "none"|"reset"|"email", template?: "trial_nudge"|"grace_warning"|"deletion_warning", trialDaysLeft?: number, deleteDue?: boolean }}
 *   - "none"  — nothing to do for this user this run
 *   - "reset" — user is carded/active/exempt but has stale dunning state to clear
 *   - "email" — send `template`, then stamp last_dunning_email_at + count
 *   - deleteDue — day 21+7 has passed with no card; the cron archives the
 *     account into deleted_accounts and hard-deletes it (§17.I), which takes
 *     precedence over any same-run deletion_warning email.
 */
export function decideLifecycleAction(row, now = new Date()) {
  // Admins, investors, and beta testers bypass the paywall entirely (§17.E) —
  // they must never receive trial/dunning/deletion email regardless of their
  // timestamps. Testers get a real 6-month app-side trial window (see
  // database/migrations/021_add_is_tester_beta_flag.sql), but must never be
  // auto-deleted or dunned if that window lapses before Anthony renews it.
  if (row.is_admin || row.is_investor || row.is_tester) return { type: "none" };

  const entitlement = getEntitlement(
    {
      status: row.subscription_status ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      trialEndsAt: row.trial_ends_at ?? null,
      accessEndsAt: row.access_ends_at ?? null,
      currentPeriodEnd: row.current_period_end ?? null,
    },
    now
  );

  // Card on file / active / no trial window → no lifecycle emails; clear any
  // leftover dunning state so a future lapse starts a fresh cycle (§G).
  if (row.card_on_file || entitlement.state === "active" || entitlement.state === "none") {
    const hasDunningState = (row.dunning_email_count ?? 0) > 0 || row.last_dunning_email_at != null;
    return hasDunningState ? { type: "reset" } : { type: "none" };
  }

  const nowMs = now.getTime();
  const lastSentMs = row.last_dunning_email_at ? new Date(row.last_dunning_email_at).getTime() : null;
  const intervalElapsed = lastSentMs === null || nowMs - lastSentMs >= DUNNING_INTERVAL_DAYS * DAY_MS;

  if (entitlement.state === "trial") {
    const startMs = row.trial_started_at ? new Date(row.trial_started_at).getTime() : null;
    if (startMs === null) return { type: "none" };
    const dayOfTrial = Math.floor((nowMs - startMs) / DAY_MS);
    // Latest milestone already reached; one send per milestone, keyed off
    // whether the last send predates that milestone (not off a counter, so a
    // cron outage never causes a double-send catch-up — at most one fires).
    const dueMilestone = [...TRIAL_NUDGE_DAYS].reverse().find((d) => dayOfTrial >= d);
    if (dueMilestone === undefined) return { type: "none" };
    if (lastSentMs !== null && lastSentMs >= startMs + dueMilestone * DAY_MS) return { type: "none" };
    return { type: "email", template: "trial_nudge", trialDaysLeft: entitlement.trialDaysLeft };
  }

  if (entitlement.state === "grace") {
    return intervalElapsed ? { type: "email", template: "grace_warning" } : { type: "none" };
  }

  // expired (day 21+, no card)
  const accessEndsMs = new Date(row.access_ends_at).getTime();
  const deleteDue = nowMs >= accessEndsMs + DELETION_BUFFER_DAYS * DAY_MS;
  return intervalElapsed
    ? { type: "email", template: "deletion_warning", deleteDue }
    : { type: "none", deleteDue };
}
