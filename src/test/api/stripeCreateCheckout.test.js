// §17.H — stripe-create-checkout must reject unauthenticated callers before
// any Stripe or Supabase write happens. Supabase auth is mocked; the route's
// env/plan guards run for real.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    userClient: { auth: { getUser: vi.fn() } },
    adminClient: { from: vi.fn() },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url, key) =>
    key === "service-role-key" ? mocks.adminClient : mocks.userClient
  ),
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
globalThis.process.env.APP_URL = "https://app.example.com";
globalThis.process.env.STRIPE_SECRET_KEY_TEST = "sk_test_dummy";
globalThis.process.env.STRIPE_PRICE_MONTHLY_TEST = "price_month_test";
globalThis.process.env.STRIPE_PRICE_ANNUAL_TEST = "price_annual_test";

const { default: handler } = await import("../../../api/stripe-create-checkout.js");

function mkReq(overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer some-token" },
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
});

describe("stripe-create-checkout — request guards", () => {
  it("rejects non-POST methods", async () => {
    const res = mkRes();
    await handler(mkReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects a request with no Authorization header", async () => {
    const res = mkRes();
    await handler(mkReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing access token" });
    expect(mocks.userClient.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header (not a Bearer scheme)", async () => {
    const res = mkRes();
    await handler(mkReq({ headers: { authorization: "Basic abc123" } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Missing access token" });
  });

  it("rejects an unknown plan before touching auth or Stripe", async () => {
    const res = mkRes();
    await handler(mkReq({ body: { plan: "weekly" } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid plan" });
    expect(mocks.userClient.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid/expired token once Supabase fails to resolve a user", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({
      data: null,
      error: { message: "invalid JWT" },
    });
    const res = mkRes();
    await handler(mkReq({ headers: { authorization: "Bearer garbage-token" } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired session" });
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it("rejects a token that resolves to no user (no error, empty payload)", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(401);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });
});
