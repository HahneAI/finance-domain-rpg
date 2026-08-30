// §17.I — archive-then-delete in the lifecycle cron. First test of the cron
// route itself (the pure engine/templates already have their own suites), so
// the fixtures drive the REAL decideLifecycleAction — a row becomes delete-due
// by actually being 28+ days past trial start, not by stubbing the engine.
// Supabase, Resend, and the Stripe cancel helper are mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    adminClient: {
      from: vi.fn(),
      auth: { admin: { getUserById: vi.fn(), deleteUser: vi.fn() } },
    },
    sendEmail: vi.fn(),
    cancelStripeSubscription: vi.fn(),
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mocks.adminClient),
}));
vi.mock("../../../api/_email.js", () => ({
  sendEmail: mocks.sendEmail,
  isEmailConfigured: () => true,
}));
// The cancel helper's own mode-fallback logic is covered in deleteAccount.test.js;
// here it only matters that the cron calls it for rows that still carry a sub.
vi.mock("../../../api/_stripeClient.js", () => ({
  STRIPE_CLIENTS: [{ subscriptions: {} }],
  cancelStripeSubscription: mocks.cancelStripeSubscription,
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
globalThis.process.env.CRON_SECRET = "cron-secret";

const { default: handler } = await import("../../../api/cron-subscription-lifecycle.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();

// A trial row n days in: delete-due needs dayOfTrial >= 28 (21 + 7 buffer).
function mkListRow(dayOfTrial, overrides = {}) {
  return {
    user_id: "user-1",
    subscription_status: "trialing",
    stripe_subscription_id: null,
    trial_started_at: daysAgo(dayOfTrial),
    trial_ends_at: daysAgo(dayOfTrial - 14),
    access_ends_at: daysAgo(dayOfTrial - 21),
    card_on_file: false,
    last_dunning_email_at: null,
    dunning_email_count: 0,
    current_period_end: null,
    is_admin: false,
    is_investor: false,
    ...overrides,
  };
}

function mkFullRow(listRow, overrides = {}) {
  return {
    ...listRow,
    config: { setupComplete: true },
    expenses: [{ name: "Rent" }],
    goals: [{ name: "Emergency fund" }],
    logs: [],
    show_extra: true,
    week_confirmations: { 3: { worked: true } },
    pto_goal: { target: 40 },
    stripe_customer_id: "cus_123",
    plan: "monthly",
    display_name: "Test User",
    avatar_url: "https://example.com/a.png",
    ...overrides,
  };
}

function mkReq() {
  return { method: "GET", headers: { authorization: "Bearer cron-secret" } };
}

function mkRes() {
  return {
    statusCode: null,
    body: null,
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

/** Wire the admin client for one run: the list query, the snapshot fetch, and all writes. */
function setupAdmin({ listRows, fullRow, archiveError = null, authUser }) {
  const upsert = vi.fn().mockResolvedValue({ error: archiveError });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  mocks.adminClient.from.mockImplementation((table) => {
    if (table === "deleted_accounts") return { upsert };
    return {
      select: vi.fn().mockReturnValue({
        // sweepPendingDeletions' own .not("deletion_requested_at", ...) query
        // is unrelated to these delete-due-by-trial-age fixtures — always
        // empty here, so it never double-processes the trial-lifecycle rows.
        not: vi.fn((field) => Promise.resolve(
          field === "deletion_requested_at" ? { data: [], error: null } : { data: listRows, error: null }
        )),
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: fullRow, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({ eq: updateEq }),
      delete: vi.fn().mockReturnValue({ eq: deleteEq }),
    };
  });
  mocks.adminClient.auth.admin.getUserById.mockResolvedValue({
    data: { user: authUser ?? { id: "user-1", email: "gone@example.com", app_metadata: { provider: "email" } } },
    error: null,
  });
  mocks.adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });
  return { upsert, deleteEq, updateEq };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cron-subscription-lifecycle — §17.I archive-then-delete", () => {
  it("archives a delete-due account into deleted_accounts, then hard-deletes it, sending no email", async () => {
    const listRow = mkListRow(30);
    const { upsert, deleteEq } = setupAdmin({ listRows: [listRow], fullRow: mkFullRow(listRow) });
    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ checked: 1, deleteDue: 1, deleted: 1, sent: 0, errors: 0 });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "gone@example.com",
        former_user_id: "user-1",
        display_name: "Test User",
        oauth_provider: null, // password account — "email" provider is not recorded
        archived_config: { setupComplete: true },
        archived_expenses: [{ name: "Rent" }],
        archived_goals: [{ name: "Emergency fund" }],
        archived_week_confirmations: { 3: { worked: true } },
        archived_pto_goal: { target: 40 },
        stripe_customer_id: "cus_123",
        plan: "monthly",
        deletion_reason: "non_payment_dunning_expired",
        // A second deletion cycle must reopen the tombstone fresh.
        revived_at: null,
        revival_attempt_count: 0,
      }),
      { onConflict: "email" } // upsert-on-email: overwrite, never duplicate
    );
    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.adminClient.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("records a real OAuth provider on the tombstone", async () => {
    const listRow = mkListRow(30);
    const { upsert } = setupAdmin({
      listRows: [listRow],
      fullRow: mkFullRow(listRow),
      authUser: { id: "user-1", email: "gone@example.com", app_metadata: { provider: "google" } },
    });
    await handler(mkReq(), mkRes());
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ oauth_provider: "google" }),
      { onConflict: "email" }
    );
  });

  it("cancels a lingering Stripe subscription before archiving", async () => {
    const listRow = mkListRow(30, { subscription_status: "past_due", stripe_subscription_id: "sub_stale" });
    setupAdmin({ listRows: [listRow], fullRow: mkFullRow(listRow, { stripe_subscription_id: "sub_stale" }) });
    mocks.cancelStripeSubscription.mockResolvedValue(undefined);
    const res = mkRes();
    await handler(mkReq(), res);
    expect(mocks.cancelStripeSubscription).toHaveBeenCalledWith("sub_stale", expect.any(Array));
    expect(res.body).toMatchObject({ deleted: 1, errors: 0 });
  });

  it("does not delete anything when the Stripe cancel fails — row is retried next run", async () => {
    // past_due with a lapsed period (current_period_end null) so the engine
    // resolves expired, not active — a "trialing" row with a sub id is active.
    const listRow = mkListRow(30, { subscription_status: "past_due", stripe_subscription_id: "sub_stale" });
    const { upsert, deleteEq } = setupAdmin({
      listRows: [listRow],
      fullRow: mkFullRow(listRow, { stripe_subscription_id: "sub_stale" }),
    });
    mocks.cancelStripeSubscription.mockRejectedValue(new Error("stripe is down"));
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.body).toMatchObject({ deleteDue: 1, deleted: 0, errors: 1 });
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteEq).not.toHaveBeenCalled();
    expect(mocks.adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("does not delete anything when the tombstone upsert fails — no archive means no delete", async () => {
    const listRow = mkListRow(30);
    const { deleteEq } = setupAdmin({
      listRows: [listRow],
      fullRow: mkFullRow(listRow),
      archiveError: { message: "insert failed" },
    });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.body).toMatchObject({ deleteDue: 1, deleted: 0, errors: 1 });
    expect(deleteEq).not.toHaveBeenCalled();
    expect(mocks.adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("expired but inside the 7-day buffer → deletion warning email, no delete", async () => {
    const listRow = mkListRow(23); // day 23: expired (21+) but before day 28
    const { upsert } = setupAdmin({ listRows: [listRow], fullRow: mkFullRow(listRow) });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.body).toMatchObject({ checked: 1, deleteDue: 0, deleted: 0, sent: 1, errors: 0 });
    expect(upsert).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledOnce();
  });

  it("rejects a request without the cron secret", async () => {
    const res = mkRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });
});

// Migration 044 — delete-account.js locks a row (deletion_requested_at set)
// then attempts the same archive inline; if that inline attempt fails, this
// sweep is what actually finishes the job. Independent of the trial-lifecycle
// rows query above (no trial_started_at filter), so it must run its own pass
// even for a run with zero trial-lifecycle rows at all.
describe("cron-subscription-lifecycle — pending-deletion sweep (migration 044)", () => {
  it("retries and finishes a locked user-requested deletion the inline attempt left unpurged", async () => {
    const pendingRow = { user_id: "user-locked" };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    mocks.adminClient.from.mockImplementation((table) => {
      if (table === "deleted_accounts") return { upsert };
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn((field) => Promise.resolve(
            field === "deletion_requested_at"
              ? { data: [pendingRow], error: null }
              : { data: [], error: null } // no trial-lifecycle rows this run
          )),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { user_id: "user-locked", config: {}, stripe_subscription_id: null },
              error: null,
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: deleteEq }),
      };
    });
    mocks.adminClient.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: "user-locked", email: "locked@example.com", app_metadata: { provider: "email" } } },
      error: null,
    });
    mocks.adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.body).toMatchObject({ checked: 0, deleted: 1, errors: 0 });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: "locked@example.com", deletion_reason: "user_requested" }),
      { onConflict: "email" }
    );
    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-locked");
    expect(mocks.adminClient.auth.admin.deleteUser).toHaveBeenCalledWith("user-locked");
  });

  it("leaves a locked row alone (retried next run) when the retry fails again", async () => {
    const pendingRow = { user_id: "user-locked" };
    mocks.adminClient.from.mockImplementation((table) => {
      if (table === "deleted_accounts") return {};
      return {
        select: vi.fn().mockReturnValue({
          not: vi.fn((field) => Promise.resolve(
            field === "deletion_requested_at"
              ? { data: [pendingRow], error: null }
              : { data: [], error: null }
          )),
        }),
      };
    });
    // No auth user found → archiveAndDeleteAccount throws before any write.
    mocks.adminClient.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: null });

    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.body).toMatchObject({ deleted: 0, errors: 1 });
  });
});
