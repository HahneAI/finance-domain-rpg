// §17.I — stripe-revive-checkout: tombstone-keyed Checkout for reviving a
// non-payment-deleted account. The session's own email keys the tombstone;
// the archived Stripe customer is reused; every attempt is stamped for the
// two-way-door tracking.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    userClient: { auth: { getUser: vi.fn() } },
    adminClient: { from: vi.fn() },
    stripe: {
      customers: { create: vi.fn() },
      checkout: { sessions: { create: vi.fn() } },
    },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url, key) =>
    key === "service-role-key" ? mocks.adminClient : mocks.userClient
  ),
}));

vi.mock("../../../api/_stripeClient.js", () => ({
  stripe: mocks.stripe,
  PRICE_ID_BY_PLAN: { monthly: "price_month_test", annual: "price_annual_test" },
  MODE: "test",
  resolveAppOrigin: () => "https://app.example.com",
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
globalThis.process.env.APP_URL = "https://app.example.com";

const { default: handler } = await import("../../../api/stripe-revive-checkout.js");

function setupAdmin(tombstone) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: tombstone, error: null });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  mocks.adminClient.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ maybeSingle }) }),
    }),
    update,
  });
  return { update, updateEq };
}

function mkReq(overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer tok" },
    body: { plan: "monthly" },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-new", email: "gone@example.com" } },
    error: null,
  });
  mocks.stripe.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.com/c/revive_1" });
});

describe("stripe-revive-checkout — guards", () => {
  it("rejects a missing token", async () => {
    const res = mkRes();
    await handler(mkReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown plan", async () => {
    const res = mkRes();
    await handler(mkReq({ body: { plan: "weekly" } }), res);
    expect(res.statusCode).toBe(400);
  });

  it("403s when the session email has no open tombstone — no probing other emails", async () => {
    setupAdmin(null);
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(403);
    expect(mocks.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("stripe-revive-checkout — checkout creation", () => {
  it("reuses the archived Stripe customer, tags the session as a revival, and stamps the attempt", async () => {
    const { update, updateEq } = setupAdmin({
      email: "gone@example.com",
      stripe_customer_id: "cus_old",
      revival_attempt_count: 1,
    });
    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/c/revive_1" });
    expect(mocks.stripe.customers.create).not.toHaveBeenCalled();
    expect(mocks.stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_old",
        client_reference_id: "user-new",
        metadata: { revival: "true", revival_email: "gone@example.com" },
        line_items: [{ price: "price_month_test", quantity: 1 }],
      })
    );
    // Two-way door: attempt count incremented, timestamp stamped
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ revival_attempt_count: 2, last_revival_attempt_at: expect.any(String) })
    );
    expect(updateEq).toHaveBeenCalledWith("email", "gone@example.com");
  });

  it("creates a Stripe customer when the archive has none and saves it back to the tombstone", async () => {
    const { update } = setupAdmin({
      email: "gone@example.com",
      stripe_customer_id: null,
      revival_attempt_count: 0,
    });
    mocks.stripe.customers.create.mockResolvedValue({ id: "cus_new" });
    const res = mkRes();
    await handler(mkReq({ body: { plan: "annual" } }), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "gone@example.com" })
    );
    expect(update).toHaveBeenCalledWith({ stripe_customer_id: "cus_new" });
    expect(mocks.stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new", line_items: [{ price: "price_annual_test", quantity: 1 }] })
    );
  });
});
