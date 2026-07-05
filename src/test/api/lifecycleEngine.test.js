// §17.G cron phase-routing + throttle tests. The engine is pure (row + now →
// action), so every schedule rule is asserted without mocking Supabase/Resend.
import { describe, it, expect } from "vitest";
import { decideLifecycleAction } from "../../../api/_lifecycleEngine.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-07-01T12:00:00Z"); // trial_started_at
const day = (n) => new Date(T0.getTime() + n * DAY_MS);

// A bare trial row: seeded window, no card, no Stripe sub, no dunning history.
const mkRow = (overrides = {}) => ({
  user_id: "user-1",
  subscription_status: "trialing",
  stripe_subscription_id: null,
  trial_started_at: T0.toISOString(),
  trial_ends_at: day(14).toISOString(),
  access_ends_at: day(21).toISOString(),
  card_on_file: false,
  last_dunning_email_at: null,
  dunning_email_count: 0,
  current_period_end: null,
  is_admin: false,
  is_investor: false,
  ...overrides,
});

describe("decideLifecycleAction — exemptions and resets", () => {
  it("never emails admins, even deep in expired territory", () => {
    expect(decideLifecycleAction(mkRow({ is_admin: true }), day(25))).toEqual({ type: "none" });
  });

  it("never emails investors", () => {
    expect(decideLifecycleAction(mkRow({ is_investor: true }), day(25))).toEqual({ type: "none" });
  });

  it("card on file → no email; resets stale dunning state", () => {
    const carded = mkRow({ card_on_file: true });
    expect(decideLifecycleAction(carded, day(10))).toEqual({ type: "none" });
    const withHistory = mkRow({
      card_on_file: true,
      last_dunning_email_at: day(7).toISOString(),
      dunning_email_count: 2,
    });
    expect(decideLifecycleAction(withHistory, day(10))).toEqual({ type: "reset" });
  });

  it("active subscription → reset when dunning state lingers, else none", () => {
    const active = mkRow({ subscription_status: "active" });
    expect(decideLifecycleAction(active, day(30))).toEqual({ type: "none" });
    expect(
      decideLifecycleAction(mkRow({ subscription_status: "active", dunning_email_count: 3 }), day(30))
    ).toEqual({ type: "reset" });
  });

  it("no trial window seeded (state none) → never emails", () => {
    const row = mkRow({ trial_ends_at: null, access_ends_at: null, subscription_status: null });
    expect(decideLifecycleAction(row, day(30))).toEqual({ type: "none" });
  });
});

describe("decideLifecycleAction — trial nudges (day 7 + day 12)", () => {
  it("stays quiet before day 7", () => {
    expect(decideLifecycleAction(mkRow(), day(6))).toEqual({ type: "none" });
  });

  it("fires the first nudge at day 7 with the correct days-left", () => {
    const action = decideLifecycleAction(mkRow(), day(7));
    expect(action.type).toBe("email");
    expect(action.template).toBe("trial_nudge");
    expect(action.trialDaysLeft).toBe(7);
  });

  it("does not repeat after the day-7 send (idempotent for twice-daily runs)", () => {
    const row = mkRow({ last_dunning_email_at: day(7).toISOString(), dunning_email_count: 1 });
    expect(decideLifecycleAction(row, day(7)).type).toBe("none");
    expect(decideLifecycleAction(row, day(10)).type).toBe("none");
  });

  it("fires the second nudge at day 12 after a day-7 send", () => {
    const row = mkRow({ last_dunning_email_at: day(7).toISOString(), dunning_email_count: 1 });
    const action = decideLifecycleAction(row, day(12));
    expect(action).toMatchObject({ type: "email", template: "trial_nudge", trialDaysLeft: 2 });
  });

  it("does not repeat after the day-12 send", () => {
    const row = mkRow({ last_dunning_email_at: day(12).toISOString(), dunning_email_count: 2 });
    expect(decideLifecycleAction(row, day(13)).type).toBe("none");
  });

  it("a cron outage causes at most one catch-up nudge, not two", () => {
    // Never emailed, first run happens on day 13 → only the day-12 milestone fires.
    const action = decideLifecycleAction(mkRow(), day(13));
    expect(action).toMatchObject({ type: "email", template: "trial_nudge" });
    const after = mkRow({ last_dunning_email_at: day(13).toISOString(), dunning_email_count: 1 });
    expect(decideLifecycleAction(after, day(13.5)).type).toBe("none");
  });
});

describe("decideLifecycleAction — grace warnings (day 14–20, every 2 days)", () => {
  it("sends 'trial ended' at day 14 when the last nudge was ≥2 days ago", () => {
    const row = mkRow({ last_dunning_email_at: day(12).toISOString(), dunning_email_count: 2 });
    expect(decideLifecycleAction(row, day(14))).toEqual({ type: "email", template: "grace_warning" });
  });

  it("throttles to every other day", () => {
    const row = mkRow({ last_dunning_email_at: day(14).toISOString(), dunning_email_count: 3 });
    expect(decideLifecycleAction(row, day(15)).type).toBe("none");
    expect(decideLifecycleAction(row, day(16))).toEqual({ type: "email", template: "grace_warning" });
  });
});

describe("decideLifecycleAction — expired dunning (day 21+, every 2 days)", () => {
  it("switches to deletion warnings at day 21", () => {
    const row = mkRow({ last_dunning_email_at: day(18).toISOString(), dunning_email_count: 4 });
    expect(decideLifecycleAction(row, day(21))).toEqual({
      type: "email",
      template: "deletion_warning",
      deleteDue: false,
    });
  });

  it("throttles to every other day", () => {
    const row = mkRow({ last_dunning_email_at: day(21).toISOString(), dunning_email_count: 5 });
    expect(decideLifecycleAction(row, day(22))).toEqual({ type: "none", deleteDue: false });
    expect(decideLifecycleAction(row, day(23))).toEqual({
      type: "email",
      template: "deletion_warning",
      deleteDue: false,
    });
  });

  it("flags delete-due at day 21+7 on both email and throttled runs", () => {
    const sendRun = mkRow({ last_dunning_email_at: day(26).toISOString(), dunning_email_count: 7 });
    expect(decideLifecycleAction(sendRun, day(28))).toEqual({
      type: "email",
      template: "deletion_warning",
      deleteDue: true,
    });
    const quietRun = mkRow({ last_dunning_email_at: day(28).toISOString(), dunning_email_count: 8 });
    expect(decideLifecycleAction(quietRun, day(29))).toEqual({ type: "none", deleteDue: true });
  });

  it("a lapsed past_due subscriber falls into expired dunning only once the paid period ends", () => {
    const inPeriod = mkRow({
      subscription_status: "past_due",
      stripe_subscription_id: "sub_1",
      current_period_end: day(40).toISOString(),
      dunning_email_count: 1,
      last_dunning_email_at: day(10).toISOString(),
    });
    // Still within the paid period → entitled → treated as active → reset.
    expect(decideLifecycleAction(inPeriod, day(30))).toEqual({ type: "reset" });
    const lapsed = mkRow({
      subscription_status: "past_due",
      stripe_subscription_id: "sub_1",
      current_period_end: day(25).toISOString(),
    });
    expect(decideLifecycleAction(lapsed, day(30))).toMatchObject({
      type: "email",
      template: "deletion_warning",
    });
  });
});
