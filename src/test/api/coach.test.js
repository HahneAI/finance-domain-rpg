// §2.G — api/coach.js proxies Claude API calls so ANTHROPIC_API_KEY never
// reaches the client. Auth guard mirrors delete-account.js; the Anthropic
// call itself is mocked via a stubbed global fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const userClient = { auth: { getUser: vi.fn() }, from: vi.fn() };
  // Separate service-role client mock for the is_ai_admin daily Coach-call cap
  // (api/coach.js creates this ONLY when userRow.is_ai_admin is true — see
  // the "AI Admin daily Coach call cap" describe block below).
  const adminClient = { from: vi.fn() };
  return { mocks: { userClient, adminClient } };
});

// Chainable stub for `.from("user_data").select(...).eq(...).single()`. Subscription
// columns default to "no real subscription state" (entitlement.state "none") so
// existing isAdmin/isTester-only tests are unaffected unless they opt into a
// trial/paid shape via the subscription* overrides.
function stubAccess({
  isAdmin = false, isTester = false, isInvestor = false, isAiAdmin = false, rowError = null,
  subscriptionStatus = null, trialEndsAt = null, accessEndsAt = null,
  currentPeriodEnd = null, stripeSubscriptionId = null,
} = {}) {
  mocks.userClient.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: rowError ? null : {
            is_admin: isAdmin,
            is_tester: isTester,
            is_investor: isInvestor,
            is_ai_admin: isAiAdmin,
            subscription_status: subscriptionStatus,
            trial_ends_at: trialEndsAt,
            access_ends_at: accessEndsAt,
            current_period_end: currentPeriodEnd,
            stripe_subscription_id: stripeSubscriptionId,
          },
          error: rowError,
        }),
      }),
    }),
  });
}

// Back-compat shorthand for the many existing admin-only call sites below.
function stubIsAdmin(isAdmin, { rowError = null } = {}) {
  stubAccess({ isAdmin, rowError });
}

// Stubs the service-role client's read (current counter state) + update
// (persist the increment) chain used only by the is_ai_admin daily cap.
function stubAiAdminUsage({ date = null, count = 0 } = {}) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  mocks.adminClient.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { ai_admin_coach_calls_date: date, ai_admin_coach_calls_count: count },
          error: null,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({ eq: updateEq }),
  });
  return { updateEq };
}

vi.mock("@supabase/supabase-js", () => ({
  // Routes to the service-role mock only when called with the service-role
  // key, so the AI Admin cap's separate client doesn't collide with the
  // regular per-request userClient mock above.
  createClient: vi.fn((_url, key) => (key === "service-role-key" ? mocks.adminClient : mocks.userClient)),
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
globalThis.process.env.ANTHROPIC_API_KEY = "sk-ant-test";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const { default: handler } = await import("../../../api/coach.js");

function mkReq(overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: { messages: [{ role: "user", content: "hi" }] },
    ...overrides,
  };
}

function mkRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    writes: [],
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    write(chunk) { this.writes.push(chunk); },
    end() { this.ended = true; },
  };
}

function sseStreamOf(events) {
  const chunks = events.map((e) => new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  // Default to admin so the pre-existing proxy tests exercise the happy path;
  // the admin-gate describe block below overrides this per-case.
  stubIsAdmin(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coach — guards", () => {
  it("rejects a non-POST method", async () => {
    const res = mkRes();
    await handler(mkReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects a missing token", async () => {
    const res = mkRes();
    await handler(mkReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid session token", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: null, error: { message: "bad" } });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a request with no messages", async () => {
    const res = mkRes();
    await handler(mkReq({ body: { messages: [] } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("coach — canAccessAskCoachGeneral gate (docs/coach-entry-points.md §§1-2)", () => {
  it("rejects a caller who is neither admin, tester, nor entitled, with 403 before calling Anthropic", async () => {
    stubAccess({ isAdmin: false, isTester: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when the user_data row can't be read (e.g. missing/error)", async () => {
    stubAccess({ rowError: { message: "no rows" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an admin caller through to the Anthropic call", async () => {
    stubAccess({ isAdmin: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull(); // no explicit .status() call on the streaming success path
  });

  it("allows a beta tester caller through to the Anthropic call, same as an admin", async () => {
    stubAccess({ isAdmin: false, isTester: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it("selects is_tester alongside is_admin so the query itself can't silently drop tester access", async () => {
    stubAccess({ isTester: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) }));

    await handler(mkReq(), mkRes());

    const fromCall = mocks.userClient.from.mock.results[0].value;
    expect(fromCall.select).toHaveBeenCalledWith(expect.stringMatching(/is_admin/));
    expect(fromCall.select).toHaveBeenCalledWith(expect.stringMatching(/is_tester/));
  });

  // Locked decision 2026-07-25 (entitlements.js's hasPrivilegedAccess): investor
  // accounts bypass the paid wall too — verified server-side from the DB row,
  // same as admin/tester, never trusted from anything the client sends.
  it("allows an investor caller through to the Anthropic call, even with no admin/tester flag or entitlement", async () => {
    stubAccess({ isAdmin: false, isTester: false, isInvestor: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it("selects is_investor alongside is_admin/is_tester so the query itself can't silently drop investor access", async () => {
    stubAccess({ isInvestor: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) }));

    await handler(mkReq(), mkRes());

    const fromCall = mocks.userClient.from.mock.results[0].value;
    expect(fromCall.select).toHaveBeenCalledWith(expect.stringMatching(/is_investor/));
  });

  // 2026-08-24 — is_ai_admin gets full tester-tier Coach access too, verified
  // server-side same as every other tier. stubAiAdminUsage() configures the
  // separate service-role cap check (see "AI Admin daily Coach call cap"
  // below) so this test is exercising access, not the cap itself.
  it("allows an AI Admin caller through to the Anthropic call, even with no admin/tester flag or entitlement", async () => {
    stubAccess({ isAdmin: false, isTester: false, isAiAdmin: true });
    stubAiAdminUsage({ date: null, count: 0 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  // The whole point of the DW-flip: a real, non-admin, non-tester account on
  // a trial or paid subscription must reach Coach too — verified server-side
  // from the DB row, never trusted from anything the client sends.
  it("allows a non-admin/non-tester caller in an active free trial through to the Anthropic call", async () => {
    const now = Date.now();
    stubAccess({
      isAdmin: false, isTester: false,
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(now + 5 * 86400000).toISOString(),
      accessEndsAt: new Date(now + 20 * 86400000).toISOString(),
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it("allows a non-admin/non-tester caller with an active paid subscription through to the Anthropic call", async () => {
    stubAccess({
      isAdmin: false, isTester: false,
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000).toISOString(),
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it("rejects a non-admin/non-tester caller whose trial and grace window have both expired", async () => {
    const now = Date.now();
    stubAccess({
      isAdmin: false, isTester: false,
      subscriptionStatus: "canceled",
      trialEndsAt: new Date(now - 40 * 86400000).toISOString(),
      accessEndsAt: new Date(now - 10 * 86400000).toISOString(),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects the subscription/trial columns needed to compute entitlement server-side", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) }));

    await handler(mkReq(), mkRes());

    const fromCall = mocks.userClient.from.mock.results[0].value;
    for (const col of ["subscription_status", "trial_ends_at", "access_ends_at", "current_period_end"]) {
      expect(fromCall.select).toHaveBeenCalledWith(expect.stringMatching(new RegExp(col)));
    }
  });
});

// Rudimentary daily Coach-call cap scoped ONLY to is_ai_admin accounts
// (migration 043_add_ai_admin_coach_usage_cap.sql) — every other tier
// (admin/tester/investor/real trial-paid) never touches this code path.
describe("coach — AI Admin daily Coach call cap", () => {
  it("does not touch the service-role client at all for a non-AI-Admin caller", async () => {
    stubAccess({ isAdmin: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) }));

    await handler(mkReq(), mkRes());

    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it("allows an AI Admin caller under the cap through, and persists the incremented counter", async () => {
    stubAccess({ isAiAdmin: true });
    const { updateEq } = stubAiAdminUsage({ date: new Date().toISOString().slice(0, 10), count: 3 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    expect(updateEq).toHaveBeenCalled();
    const updateCall = mocks.adminClient.from.mock.results[0].value.update;
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ ai_admin_coach_calls_count: 4 }));
  });

  it("resets the counter to 1 when the stored date is not today (new day)", async () => {
    stubAccess({ isAiAdmin: true });
    stubAiAdminUsage({ date: "2020-01-01", count: 999 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    await handler(mkReq(), mkRes());

    const updateCall = mocks.adminClient.from.mock.results[0].value.update;
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ ai_admin_coach_calls_count: 1 }));
  });

  it("rejects an AI Admin caller at the cap with 429, before calling Anthropic", async () => {
    stubAccess({ isAiAdmin: true });
    stubAiAdminUsage({ date: new Date().toISOString().slice(0, 10), count: 25 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not persist a counter write when the caller is already over the cap", async () => {
    stubAccess({ isAiAdmin: true });
    stubAiAdminUsage({ date: new Date().toISOString().slice(0, 10), count: 30 });
    vi.stubGlobal("fetch", vi.fn());

    await handler(mkReq(), mkRes());

    // Only the read call, no second .from("user_data") call for the update.
    expect(mocks.adminClient.from).toHaveBeenCalledTimes(1);
  });
});

describe("coach — Anthropic proxy", () => {
  it("streams the Anthropic response through and defaults to Haiku", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStreamOf([
        { type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 5 } } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
        { type: "message_delta", usage: { output_tokens: 3 } },
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.model).toBe("claude-haiku-4-5");
    expect(sentBody.stream).toBe(true);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.writes.length).toBe(3);
    expect(res.ended).toBe(true);
  });

  it("uses the Sonnet model id and applies cache_control to system blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(
      mkReq({ body: { messages: [{ role: "user", content: "hi" }], systemPrompt: "sys", contextBlock: "ctx", model: "sonnet" } }),
      res
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.model).toBe("claude-sonnet-5");
    expect(sentBody.system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
      { type: "text", text: "ctx", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("returns 502 without writing when the Anthropic call fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
      body: null,
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(502);
    expect(res.writes.length).toBe(0);
  });

  // DW-9 — multi-turn conversations used to resend the entire prior history
  // uncached on every turn; only system/context had a cache_control marker.
  it("marks only the last message with cache_control, converting a string content into a text block", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(
      mkReq({
        body: {
          messages: [
            { role: "user", content: "earlier turn" },
            { role: "assistant", content: "earlier reply" },
            { role: "user", content: "latest question" },
          ],
        },
      }),
      res
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[0]).toEqual({ role: "user", content: "earlier turn" });
    expect(sentBody.messages[1]).toEqual({ role: "assistant", content: "earlier reply" });
    expect(sentBody.messages[2]).toEqual({
      role: "user",
      content: [{ type: "text", text: "latest question", cache_control: { type: "ephemeral" } }],
    });
  });

  it("leaves non-string content on the last message untouched instead of double-wrapping it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);
    const structuredContent = [{ type: "text", text: "already a block" }];

    const res = mkRes();
    await handler(mkReq({ body: { messages: [{ role: "user", content: structuredContent }] } }), res);

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[0].content).toEqual(structuredContent);
  });
});

describe("coach — cost telemetry (DW-9)", () => {
  it("logs a single usage line with real token counts and a computed cost estimate, even when VERCEL_ENV is production", async () => {
    const prevEnv = globalThis.process.env.VERCEL_ENV;
    globalThis.process.env.VERCEL_ENV = "production";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStreamOf([
        { type: "message_start", message: { usage: { input_tokens: 1000, cache_read_input_tokens: 500, cache_creation_input_tokens: 200 } } },
        { type: "message_delta", usage: { output_tokens: 100 } },
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    await handler(mkReq(), mkRes());

    const usageLine = logSpy.mock.calls.map((args) => args[0]).find((line) => line.startsWith("[coach:usage]"));
    expect(usageLine).toBeTruthy();
    expect(usageLine).toContain("input=1000");
    expect(usageLine).toContain("cache_read=500");
    expect(usageLine).toContain("cache_write=200");
    expect(usageLine).toContain("output=100");
    // 1000*1.00 + 500*1.00*0.1 + 200*1.00*1.25 + 100*5.00 = 1000+50+250+500 = 1800 -> $0.0018
    expect(usageLine).toContain("est_cost_usd=0.001800");

    logSpy.mockRestore();
    globalThis.process.env.VERCEL_ENV = prevEnv;
  });
});
