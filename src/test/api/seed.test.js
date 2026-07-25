// api/seed.js — consolidates the former seed-beta.js / seed-investor.js /
// seed-trial.js into one route (dispatched on body.type) to stay under
// Vercel's Hobby-plan 12-Serverless-Functions-per-deployment cap. Behavior
// must be identical to the three original routes — same status codes, same
// error messages, same validation — just fewer function slots spent.
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

const { default: handler } = await import("../../../api/seed.js");

function mkRes() {
  return {
    statusCode: null,
    body: null,
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

function authedReq(body) {
  return { method: "POST", headers: { authorization: "Bearer tok" }, body };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userClient.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("api/seed — shared gate", () => {
  it("rejects non-POST", async () => {
    const res = mkRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it("400s on a missing or invalid type", async () => {
    const res = mkRes();
    await handler(authedReq({ type: "nonsense" }), res);
    expect(res.statusCode).toBe(400);
    expect(mocks.userClient.auth.getUser).not.toHaveBeenCalled();
  });

  it("401s without a bearer token", async () => {
    const res = mkRes();
    await handler({ method: "POST", headers: {}, body: { type: "trial" } }, res);
    expect(res.statusCode).toBe(401);
  });

  it("401s on an invalid session", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: null, error: { message: "bad" } });
    const res = mkRes();
    await handler(authedReq({ type: "trial" }), res);
    expect(res.statusCode).toBe(401);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });
});

describe("api/seed — type: beta", () => {
  it("400s on a missing code", async () => {
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "  " }), res);
    expect(res.statusCode).toBe(400);
  });

  it("403s an invalid or inactive code", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) });
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "NOPE" }), res);
    expect(res.statusCode).toBe(403);
  });

  it("grants is_tester + beta_code_used on a valid code", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mocks.adminClient.from.mockImplementation(table => {
      if (table === "beta_codes") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) };
      }
      return { update: vi.fn().mockReturnValue({ eq: updateEq }) };
    });
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "BETA1" }), res);
    expect(updateEq).toHaveBeenCalledWith("user_id", "u1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("api/seed — type: investor", () => {
  it("403s an invalid or inactive code", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) });
    const res = mkRes();
    await handler(authedReq({ type: "investor", code: "NOPE" }), res);
    expect(res.statusCode).toBe(403);
  });

  it("grants is_investor on a valid code", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null });
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    let updatePayload;
    mocks.adminClient.from.mockImplementation(table => {
      if (table === "investor_codes") {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) }) };
      }
      return {
        update: vi.fn((payload) => { updatePayload = payload; return { eq: updateEq }; }),
      };
    });
    const res = mkRes();
    await handler(authedReq({ type: "investor", code: "ALPHA" }), res);
    expect(updatePayload).toEqual({ is_investor: true });
    expect(res.statusCode).toBe(200);
  });
});

describe("api/seed — type: trial", () => {
  it("seeds a fresh trial window for a first-time user", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { trial_started_at: null }, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.adminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      upsert,
    });
    const res = mkRes();
    await handler(authedReq({ type: "trial" }), res);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", subscription_status: "trialing" }), { onConflict: "user_id" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ seeded: true });
  });

  it("no-ops for a returning user who already has a trial window", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { trial_started_at: "2026-01-01T00:00:00Z" }, error: null });
    const upsert = vi.fn();
    mocks.adminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      upsert,
    });
    const res = mkRes();
    await handler(authedReq({ type: "trial" }), res);
    expect(upsert).not.toHaveBeenCalled();
    expect(res.body).toEqual({ seeded: false });
  });
});
