// §17.H — account deletion cancels the Stripe subscription first, so a
// deleted user isn't billed again. The flow stays a true hard delete (no
// archive — §I's non-payment cron path is the only one that archives).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const userClient = { auth: { getUser: vi.fn() } };
  const adminClient = {
    from: vi.fn(),
    auth: { admin: { deleteUser: vi.fn() } },
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

vi.mock("../../../api/_stripeClient.js", () => ({
  STRIPE_CLIENTS: [mocks.stripeA, mocks.stripeB],
}));

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

/** Wire the admin client: the sub-id lookup row, then delete + deleteUser results. */
function setupAdmin(subRow) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: subRow, error: null });
  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  mocks.adminClient.from.mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
    delete: vi.fn().mockReturnValue({ eq: deleteEq }),
  });
  mocks.adminClient.auth.admin.deleteUser.mockResolvedValue({ error: null });
  return { deleteEq };
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

describe("delete-account — Stripe subscription cancellation", () => {
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

  it("skips the cancel call when the subscription is already canceled", async () => {
    setupAdmin({ stripe_subscription_id: "sub_123" });
    mocks.stripeA.subscriptions.retrieve.mockResolvedValue({ id: "sub_123", status: "canceled" });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.stripeA.subscriptions.cancel).not.toHaveBeenCalled();
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

  it("proceeds with deletion when the subscription exists in neither mode", async () => {
    const { deleteEq } = setupAdmin({ stripe_subscription_id: "sub_gone" });
    mocks.stripeA.subscriptions.retrieve.mockRejectedValue(missingErr());
    mocks.stripeB.subscriptions.retrieve.mockRejectedValue(missingErr());
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(deleteEq).toHaveBeenCalled();
  });

  it("aborts the deletion (500) when the cancel fails unexpectedly — retryable, user keeps account", async () => {
    const { deleteEq } = setupAdmin({ stripe_subscription_id: "sub_123" });
    mocks.stripeA.subscriptions.retrieve.mockResolvedValue({ id: "sub_123", status: "active" });
    mocks.stripeA.subscriptions.cancel.mockRejectedValue(new Error("stripe is down"));
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(500);
    expect(deleteEq).not.toHaveBeenCalled();
    expect(mocks.adminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});
