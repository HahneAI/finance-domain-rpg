// DW-7 regression (docs/drift-app-warden.md §16.4 finding 1 / BUG_FIX_TODO.md
// DW-7): the daily lifecycle cron's list-query SELECT must fetch every
// user_data column decideLifecycleAction() reads off `row` — Supabase only
// returns selected columns, so a column the engine checks but the cron never
// selects silently reads as `undefined` at runtime. That's exactly how the
// is_tester bypass went dead in production: the engine's exemption checked
// row.is_tester, but the cron's SELECT list only had is_admin/is_investor,
// so every lapsed beta tester fell through to the real dunning/deletion
// cadence with no error anywhere. Unit tests on the pure engine alone can't
// catch this — they construct rows with is_tester set directly, bypassing
// the real column-list gap. This test inspects the actual string passed to
// Supabase's .select() at runtime, so it fails the moment the two drift
// apart again, for any field, not just this one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    adminClient: { from: vi.fn(), auth: { admin: { getUserById: vi.fn(), deleteUser: vi.fn() } } },
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mocks.adminClient),
}));
vi.mock("../../../api/_email.js", () => ({
  sendEmail: vi.fn(),
  isEmailConfigured: () => true,
}));
vi.mock("../../../api/_stripeClient.js", () => ({
  STRIPE_CLIENTS: [{ subscriptions: {} }],
  cancelStripeSubscription: vi.fn(),
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
globalThis.process.env.CRON_SECRET = "cron-secret";

const { default: handler } = await import("../../../api/cron-subscription-lifecycle.js");

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cron-subscription-lifecycle — SELECT column completeness", () => {
  it("selects every user_data column decideLifecycleAction() reads off `row`", async () => {
    let requestedSelect = null;
    // Empty result set: the handler returns right after the list query, so no
    // other Supabase/email/Stripe calls need mocking for this assertion.
    mocks.adminClient.from.mockImplementation((table) => ({
      select: vi.fn((cols) => {
        if (table === "user_data" && typeof cols === "string" && cols.includes("subscription_status")) {
          requestedSelect = cols;
        }
        return { not: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }),
    }));

    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(200);
    expect(requestedSelect).not.toBeNull();

    const selectedColumns = new Set(requestedSelect.split(",").map((c) => c.trim()));

    const engineSrc = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../api/_lifecycleEngine.js"),
      "utf8"
    );
    const readColumns = [...new Set([...engineSrc.matchAll(/\brow\.([a-zA-Z_]+)/g)].map((m) => m[1]))];
    // Sanity check the extraction itself actually found the known exemption
    // flags — if this regex ever stops matching anything, the test would
    // otherwise pass vacuously.
    expect(readColumns).toEqual(expect.arrayContaining(["is_admin", "is_investor", "is_tester"]));

    const missing = readColumns.filter((c) => !selectedColumns.has(c));
    expect(missing).toEqual([]);
  });
});
