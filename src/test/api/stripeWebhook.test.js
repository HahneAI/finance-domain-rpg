// §17.H — webhook hardening tests. Signature verification is REAL: fixture
// events are signed with Stripe's own generateTestHeaderString and verified by
// the actual constructWebhookEvent path (raw body → HMAC), so "reject
// unsigned/invalid events" is exercised end-to-end, not mocked away. Only the
// follow-up Stripe API client (subscriptions.retrieve) and Supabase are
// stubbed — neither can hit a network in tests.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import Stripe from "stripe";

const { mocks } = vi.hoisted(() => {
  const adminClient = { from: vi.fn() };
  const stripeSubscriptions = { retrieve: vi.fn() };
  return { mocks: { adminClient, stripeSubscriptions } };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mocks.adminClient),
}));

// Keep the real signature verification, but swap the returned client so the
// handler's follow-up subscriptions.retrieve never leaves the test.
vi.mock("../../../api/_stripeClient.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    constructWebhookEvent: (rawBody, signature) => {
      const { event, mode } = actual.constructWebhookEvent(rawBody, signature);
      return { event, mode, client: { subscriptions: mocks.stripeSubscriptions } };
    },
  };
});

const WEBHOOK_SECRET = "whsec_test_secret";
globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
globalThis.process.env.STRIPE_SECRET_KEY_TEST = "sk_test_dummy";
globalThis.process.env.STRIPE_WEBHOOK_SECRET_TEST = WEBHOOK_SECRET;
globalThis.process.env.STRIPE_PRICE_MONTHLY_TEST = "price_month_test";
globalThis.process.env.STRIPE_PRICE_ANNUAL_TEST = "price_annual_test";

const { default: handler } = await import("../../../api/stripe-webhook.js");

const signer = new Stripe("sk_test_dummy");
const sign = (payload, secret = WEBHOOK_SECRET) =>
  signer.webhooks.generateTestHeaderString({ payload, secret });

let eventSeq = 0;
function mkEvent(type, object) {
  eventSeq += 1;
  return JSON.stringify({
    id: `evt_test_${eventSeq}`,
    object: "event",
    type,
    data: { object },
  });
}

function mkReq(payload, signature) {
  const req = Readable.from([globalThis.Buffer.from(payload)]);
  req.method = "POST";
  req.headers = signature ? { "stripe-signature": signature } : {};
  return req;
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

/** Wire the admin client; returns spies for the event claim, user_data writes, and the tombstone. */
function setupAdmin({ claimError = null, tombstone = null } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: claimError });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const tombstoneUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const tombstoneUpdate = vi.fn().mockReturnValue({ eq: tombstoneUpdateEq });
  const maybeSingle = vi.fn().mockResolvedValue({ data: tombstone, error: null });
  mocks.adminClient.from.mockImplementation((table) => {
    if (table === "stripe_webhook_events") return { insert };
    if (table === "deleted_accounts") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ maybeSingle }) }),
        }),
        update: tombstoneUpdate,
      };
    }
    return { update, upsert, eq: updateEq };
  });
  return { insert, update, updateEq, upsert, tombstoneUpdate, tombstoneUpdateEq };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("stripe-webhook — signature verification (real HMAC)", () => {
  it("rejects a request with no signature header", async () => {
    const { insert } = setupAdmin();
    const res = mkRes();
    await handler(mkReq(mkEvent("checkout.session.completed", {})), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid signature" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const { insert } = setupAdmin();
    const payload = mkEvent("checkout.session.completed", {});
    const res = mkRes();
    await handler(mkReq(payload, sign(payload, "whsec_wrong_secret")), res);
    expect(res.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a tampered body signed for a different payload", async () => {
    const { insert } = setupAdmin();
    const original = mkEvent("invoice.payment_failed", { customer: "cus_1" });
    const tampered = original.replace("cus_1", "cus_2");
    const res = mkRes();
    await handler(mkReq(tampered, sign(original)), res);
    expect(res.statusCode).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("stripe-webhook — upsert mapping per event type", () => {
  it("checkout.session.completed maps the retrieved subscription onto user_data by client_reference_id", async () => {
    const { update, updateEq } = setupAdmin();
    mocks.stripeSubscriptions.retrieve.mockResolvedValue({
      id: "sub_123",
      status: "active",
      current_period_end: 1785000000,
      items: { data: [{ price: { id: "price_month_test" } }] },
    });
    const payload = mkEvent("checkout.session.completed", {
      mode: "subscription",
      customer: "cus_123",
      subscription: "sub_123",
      client_reference_id: "user-1",
    });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.stripeSubscriptions.retrieve).toHaveBeenCalledWith("sub_123");
    expect(update).toHaveBeenCalledWith({
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      subscription_status: "active",
      plan: "monthly",
      current_period_end: new Date(1785000000 * 1000).toISOString(),
      card_on_file: true,
    });
    expect(updateEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("customer.subscription.updated maps status/plan/period keyed by stripe_customer_id", async () => {
    const { update, updateEq } = setupAdmin();
    const payload = mkEvent("customer.subscription.updated", {
      id: "sub_123",
      customer: "cus_123",
      status: "past_due",
      // 2025+ Stripe API versions put the billing period on the item
      items: { data: [{ price: { id: "price_annual_test" }, current_period_end: 1786000000 }] },
    });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({
      stripe_subscription_id: "sub_123",
      subscription_status: "past_due",
      plan: "annual",
      current_period_end: new Date(1786000000 * 1000).toISOString(),
    });
    expect(updateEq).toHaveBeenCalledWith("stripe_customer_id", "cus_123");
  });

  it("customer.subscription.deleted forces status to canceled regardless of the object's status", async () => {
    const { update } = setupAdmin();
    const payload = mkEvent("customer.subscription.deleted", {
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      current_period_end: 1786000000,
      items: { data: [{ price: { id: "price_month_test" } }] },
    });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_status: "canceled" })
    );
  });

  it("invoice.payment_failed sets past_due keyed by customer", async () => {
    const { update, updateEq } = setupAdmin();
    const payload = mkEvent("invoice.payment_failed", { customer: "cus_123" });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);
    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({ subscription_status: "past_due" });
    expect(updateEq).toHaveBeenCalledWith("stripe_customer_id", "cus_123");
  });

  it("a revival checkout (metadata.revival) restores the archived snapshot and consumes the tombstone", async () => {
    const { upsert, update, tombstoneUpdate, tombstoneUpdateEq } = setupAdmin({
      tombstone: {
        email: "gone@example.com",
        archived_config: { setupComplete: true },
        archived_expenses: [{ name: "Rent" }],
        archived_goals: [{ name: "Emergency fund" }],
        archived_logs: [],
        archived_show_extra: false,
        archived_week_confirmations: { 3: { worked: true } },
        archived_pto_goal: { target: 40 },
        display_name: "Old Name",
        avatar_url: null,
        revived_at: null,
      },
    });
    mocks.stripeSubscriptions.retrieve.mockResolvedValue({
      id: "sub_rev",
      status: "active",
      current_period_end: 1785000000,
      items: { data: [{ price: { id: "price_month_test" } }] },
    });
    const payload = mkEvent("checkout.session.completed", {
      mode: "subscription",
      customer: "cus_old",
      subscription: "sub_rev",
      client_reference_id: "user-new",
      metadata: { revival: "true", revival_email: "gone@example.com" },
    });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);

    expect(res.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-new",
        config: { setupComplete: true },
        expenses: [{ name: "Rent" }],
        goals: [{ name: "Emergency fund" }],
        show_extra: false,
        week_confirmations: { 3: { worked: true } },
        pto_goal: { target: 40 },
        display_name: "Old Name",
        stripe_customer_id: "cus_old",
        stripe_subscription_id: "sub_rev",
        subscription_status: "active",
        plan: "monthly",
        card_on_file: true,
        // Trial window seeded in the past: a lapsed revival must resolve
        // "expired" (gated), never "none" (ungated free access).
        trial_started_at: expect.any(String),
        trial_ends_at: expect.any(String),
        access_ends_at: expect.any(String),
      }),
      { onConflict: "user_id" }
    );
    // Tombstone consumed
    expect(tombstoneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ revived_at: expect.any(String), revival_attempt_count: 0 })
    );
    expect(tombstoneUpdateEq).toHaveBeenCalledWith("email", "gone@example.com");
    // Plain update path must NOT also run
    expect(update).not.toHaveBeenCalled();
  });

  it("a revival event whose tombstone is already consumed falls through to the plain status update", async () => {
    const { upsert, update, updateEq } = setupAdmin({ tombstone: null });
    mocks.stripeSubscriptions.retrieve.mockResolvedValue({
      id: "sub_rev",
      status: "active",
      current_period_end: 1785000000,
      items: { data: [{ price: { id: "price_month_test" } }] },
    });
    const payload = mkEvent("checkout.session.completed", {
      mode: "subscription",
      customer: "cus_old",
      subscription: "sub_rev",
      client_reference_id: "user-new",
      metadata: { revival: "true", revival_email: "gone@example.com" },
    });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);
    expect(res.statusCode).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ subscription_status: "active" }));
    expect(updateEq).toHaveBeenCalledWith("user_id", "user-new");
  });

  it("a redelivered event id (unique-constraint claim failure) is acknowledged without reprocessing", async () => {
    const { update } = setupAdmin({ claimError: { code: "23505", message: "duplicate key" } });
    const payload = mkEvent("invoice.payment_failed", { customer: "cus_123" });
    const res = mkRes();
    await handler(mkReq(payload, sign(payload)), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(update).not.toHaveBeenCalled();
  });
});
