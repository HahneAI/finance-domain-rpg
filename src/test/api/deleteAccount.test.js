// Migration 044 — a user who asks to delete their account must never be told
// "no" by an infrastructure hiccup. The route now stamps deletion_requested_at
// FIRST (locking the account — src/App.jsx blocks further access on it) and
// only then attempts the real archive-then-delete (api/_accountArchive.js,
// shared with the day-21+7 non-payment cron). If that inline attempt fails,
// the request still succeeds from the caller's perspective — the row is left
// locked for api/cron-subscription-lifecycle.js's sweep to finish later.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const userClient = { auth: { getUser: vi.fn() } };
  const adminClient = {
    from: vi.fn(),
    auth: { admin: { getUserById: vi.fn(), deleteUser: vi.fn() } },
  };
  const stripeA = { subscriptions: { retrieve: vi.fn(), cancel: vi.fn() } };
  const stripeB = { subscriptions: { retrieve: vi.fn(), cancel: vi.fn() } };
  return { mocks: { userClient, adminClient, stripeA, stripeB } };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url, key) =>
    key === "service-role-key" ? mocks.adminClient : mocks.userClient
  ),
}));

// Substitute only the client list — cancelStripeSubscription stays the real
// implementation (the route passes STRIPE_CLIENTS explicitly), so the
// mode-fallback behavior below exercises the actual helper.
vi.mock("../../../api/_stripeClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, STRIPE_CLIENTS: [mocks.stripeA, mocks.stripeB] };
});

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const { default: handler } = await import("../../../api/delete-account.js");

// resource_missing is how Stripe reports "no such object in this mode".
const missingErr = () => Object.assign(new Error("No such subscription"), { code: "resource_missing" });

function mkReq(overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: { confirmationText: "DELETE" },
    ...overrides,
  };
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

const authUser = { id: "user-1", email: "gone@example.com", app_metadata: { provider: "email" } };

/** Wire the admin client: the lock update, the snapshot fetch, and the tombstone/delete writes. */
function setupAdmin(subRow, { lockError = null, archiveError = null } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: subRow, error: null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn().mockResolvedValue({ error: lockError });
  const upsert = vi.fn().mockResolvedValue({ error: archiveError });
  mocks.adminClient.from.mockImplementation((table) => {
    if (table === "deleted_accounts") return { upsert };
    return {
      update: vi.fn().mockReturnValue({ eq: updateEq }),
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      delete: vi.fn().mockReturnValue({ eq: deleteEq }),
    };
  });
  mocks.adminClient.auth.admin.getUserById.mockResolvedValue({ data: { user: authUser }, error: null });
  mocks.adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });
  return { deleteEq, updateEq, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

describe("delete-account — guards (unchanged behavior)", () => {
  it("rejects a missing token", async () => {
    const res = mkRes();
    await handler(mkReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong confirmation phrase", async () => {
    const res = mkRes();
    await handler(mkReq({ body: { confirmationText: "delete" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects an invalid session token", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: null, error: { message: "bad" } });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(401);
  });
});

describe("delete-account — locks the account first, unconditionally", () => {
  it("stamps deletion_requested_at before attempting the real archive", async () => {
    const { updateEq } = setupAdmin({ stripe_subscription_id: null });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(updateEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("500s only when even the lock write fails — nothing to honor the request with", async () => {
    setupAdmin({ stripe_subscription_id: null }, { lockError: { message: "db down" } });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(500);
    expect(mocks.adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});

describe("delete-account — inline archive, best-effort", () => {
  it("deletes without touching Stripe when no subscription id is on file", async () => {
    const { deleteEq } = setupAdmin({ stripe_subscription_id: null });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.stripeA.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.adminClient.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("cancels an active subscription before deleting", async () => {
    const { deleteEq } = setupAdmin({ stripe_subscription_id: "sub_123" });
    mocks.stripeA.subscriptions.retrieve.mockResolvedValue({ id: "sub_123", status: "active" });
    mocks.stripeA.subscriptions.cancel.mockResolvedValue({ id: "sub_123", status: "canceled" });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.stripeA.subscriptions.cancel).toHaveBeenCalledWith("sub_123");
    expect(deleteEq).toHaveBeenCalled();
  });

  it("falls through to the other mode's client when the first reports resource_missing", async () => {
    setupAdmin({ stripe_subscription_id: "sub_live" });
    mocks.stripeA.subscriptions.retrieve.mockRejectedValue(missingErr());
    mocks.stripeB.subscriptions.retrieve.mockResolvedValue({ id: "sub_live", status: "past_due" });
    mocks.stripeB.subscriptions.cancel.mockResolvedValue({ id: "sub_live", status: "canceled" });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.stripeB.subscriptions.cancel).toHaveBeenCalledWith("sub_live");
  });

  it("still returns 200 (locked, honored) when the inline Stripe cancel fails unexpectedly — left for the cron sweep", async () => {
    const { deleteEq, upsert } = setupAdmin({ stripe_subscription_id: "sub_123" });
    mocks.stripeA.subscriptions.retrieve.mockResolvedValue({ id: "sub_123", status: "active" });
    mocks.stripeA.subscriptions.cancel.mockRejectedValue(new Error("stripe is down"));
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteEq).not.toHaveBeenCalled();
    expect(mocks.adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("still returns 200 when the tombstone upsert fails — left for the cron sweep", async () => {
    const { deleteEq } = setupAdmin({ stripe_subscription_id: null }, { archiveError: { message: "insert failed" } });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(deleteEq).not.toHaveBeenCalled();
    expect(mocks.adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("still returns 200 when auth.admin.deleteUser fails — the original production bug, no longer surfaced to the user", async () => {
    setupAdmin({ stripe_subscription_id: null });
    mocks.adminClient.auth.admin.deleteUser.mockResolvedValue({ error: { message: "gateway timeout" } });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
