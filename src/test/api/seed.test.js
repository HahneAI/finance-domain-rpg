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

// beta_codes now gets claimed via UPDATE...WHERE (single-use consumption),
// not a read-only SELECT — this mock distinguishes the "claim" call
// (payload { is_active: false }) from the "reactivate on failure" call
// (payload { is_active: true }), since seedBeta may issue either or both
// against the same table in one request.
function mockBetaCodesTable({ claim, reactivate } = {}) {
  const claimResult = claim ?? { data: { id: "c1" }, error: null };
  const reactivateResult = reactivate ?? { error: null };
  const ilike = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue(claimResult) }) }),
  });
  const reactivateEq = vi.fn().mockResolvedValue(reactivateResult);
  return {
    update: vi.fn((payload) => (payload.is_active === false ? { ilike } : { eq: reactivateEq }) ),
    __ilike: ilike,
    __reactivateEq: reactivateEq,
  };
}

describe("api/seed — type: beta", () => {
  it("400s on a missing code", async () => {
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "  " }), res);
    expect(res.statusCode).toBe(400);
  });

  it("403s an invalid or inactive code", async () => {
    mocks.adminClient.from.mockReturnValue(mockBetaCodesTable({ claim: { data: null, error: null } }));
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "NOPE" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or inactive beta code" });
  });

  it("grants is_tester + beta_code_used on a valid code, and consumes it", async () => {
    const betaCodesTable = mockBetaCodesTable();
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mocks.adminClient.from.mockImplementation(table =>
      table === "beta_codes" ? betaCodesTable : { update: vi.fn().mockReturnValue({ eq: updateEq }) }
    );
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "BETA1" }), res);
    expect(betaCodesTable.update).toHaveBeenCalledWith({ is_active: false });
    expect(updateEq).toHaveBeenCalledWith("user_id", "u1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // Case-insensitivity — beta_codes is dashboard-managed (migration 028), so
  // a code stored in any case must still match a lowercased URL/form submission.
  it("matches a code regardless of the stored row's case", async () => {
    const betaCodesTable = mockBetaCodesTable();
    mocks.adminClient.from.mockImplementation(table =>
      table === "beta_codes" ? betaCodesTable : { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    );
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "CLARITY" }), res);
    expect(betaCodesTable.__ilike).toHaveBeenCalledWith("code", "clarity");
    expect(res.statusCode).toBe(200);
  });

  // Single-use consumption (2026-07-25) — a code already claimed by someone
  // else (is_active already false) must fail the exact same way an
  // admin-retired code does; the atomic claim UPDATE naturally returns no row.
  it("403s a code that's already been redeemed by someone else", async () => {
    mocks.adminClient.from.mockReturnValue(mockBetaCodesTable({ claim: { data: null, error: null } }));
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "ALREADY-USED" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or inactive beta code" });
  });

  // 40-seat cap (migration 034_beta_seat_cap.sql) — the trigger raises a
  // Postgres exception, which lands here as an updateError. Must surface as
  // a clean, distinct "full" message + 403, not the generic 500 every other
  // update failure gets — a program-full response is an expected outcome,
  // not a server bug, and the client (BetaRedeemDetail) shows error.message
  // verbatim to the user. The already-consumed code must also be reactivated
  // so a rejected grant doesn't waste a seat's code.
  it("403s with a clean message when the 40-seat cap trigger rejects the write, and reactivates the code", async () => {
    const betaCodesTable = mockBetaCodesTable();
    const updateEq = vi.fn().mockResolvedValue({
      error: { message: "beta program is full — 40 of 40 seats taken" },
    });
    mocks.adminClient.from.mockImplementation(table =>
      table === "beta_codes" ? betaCodesTable : { update: vi.fn().mockReturnValue({ eq: updateEq }) }
    );
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "BETA1" }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "The beta program is full" });
    expect(betaCodesTable.update).toHaveBeenCalledWith({ is_active: true });
    expect(betaCodesTable.__reactivateEq).toHaveBeenCalledWith("id", "c1");
  });

  it("500s with a generic message on an unrelated update failure, and reactivates the code", async () => {
    const betaCodesTable = mockBetaCodesTable();
    const updateEq = vi.fn().mockResolvedValue({ error: { message: "connection reset" } });
    mocks.adminClient.from.mockImplementation(table =>
      table === "beta_codes" ? betaCodesTable : { update: vi.fn().mockReturnValue({ eq: updateEq }) }
    );
    const res = mkRes();
    await handler(authedReq({ type: "beta", code: "BETA1" }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Failed to grant beta access" });
    expect(betaCodesTable.update).toHaveBeenCalledWith({ is_active: true });
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
