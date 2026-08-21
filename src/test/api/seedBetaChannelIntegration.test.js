// Integration-style verification for the beta channel split (Authority-OS-Site
// marketing handoff, 2026-08-21). The existing api/seed.test.js unit tests
// mock each Supabase call individually and assert claimFromChannel() is
// *invoked correctly* — they don't prove the two channel pools stay isolated
// under real row data or that a claim's side effects (is_active flip,
// reactivate-on-failure) are actually consistent end to end.
//
// This file runs the real seedBeta()/claimExactCode()/claimFromChannel() code
// against a small in-memory fake Postgres table seeded with the same shape as
// production's beta_codes (glass*/website, clarity*/flyer), instead of
// mocking each intermediate call — so a bug that crossed channels, double-
// claimed a row, or leaked a wrong-channel code would actually surface as a
// wrong return value here, not just an unexercised mock assertion.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { userClient: { auth: { getUser: vi.fn() } } },
}));

// ── Fake Postgres-ish beta_codes/user_data tables ───────────────────────────
// Mutates a shared row array in place, mirroring real atomic UPDATE...WHERE
// semantics: an update only touches rows matching every filter at the moment
// it executes, and returns the post-update row (or null if nothing matched).
function makeBetaCodesQuery(rows, state = { filters: [], updatePayload: null, selectCols: null, limitN: null }) {
  const matched = () => {
    let m = rows.filter(r => state.filters.every(f => f(r)));
    if (state.limitN != null) m = m.slice(0, state.limitN);
    return m;
  };
  const project = (row) => {
    if (!state.selectCols) return row;
    const out = {};
    state.selectCols.split(",").map(s => s.trim()).forEach(c => { out[c] = row[c]; });
    return out;
  };
  const exec = () => {
    const m = matched();
    if (m.length === 0) return { data: null, error: null };
    if (state.updatePayload) Object.assign(m[0], state.updatePayload);
    return { data: project(m[0]), error: null };
  };
  return {
    eq: (col, val) => makeBetaCodesQuery(rows, { ...state, filters: [...state.filters, r => r[col] === val] }),
    ilike: (col, val) => makeBetaCodesQuery(rows, { ...state, filters: [...state.filters, r => String(r[col]).toLowerCase() === String(val).toLowerCase()] }),
    limit: (n) => makeBetaCodesQuery(rows, { ...state, limitN: n }),
    select: (cols) => makeBetaCodesQuery(rows, { ...state, selectCols: cols }),
    update: (payload) => makeBetaCodesQuery(rows, { ...state, updatePayload: payload }),
    maybeSingle: () => Promise.resolve(exec()),
    // The reactivate-on-failure call (`.update(...).eq("id", x)`, no
    // .select()/.maybeSingle()) is awaited directly in api/seed.js — make the
    // builder itself thenable so that terminal shape executes too, exactly
    // like the userData table's `.eq()` above.
    then: (resolve, reject) => Promise.resolve(exec()).then(resolve, reject),
  };
}

function makeFakeAdmin({ betaCodesRows, userDataRows, seatCap }) {
  return {
    from(table) {
      if (table === "beta_codes") return makeBetaCodesQuery(betaCodesRows);
      if (table === "user_data") {
        return {
          update(payload) {
            return {
              eq(col, val) {
                // Mirrors migration 034's trigger: only the transition INTO a
                // non-null beta_code_used counts against the 40-seat cap.
                if (payload.beta_code_used) {
                  const alreadyEnrolled = userDataRows.get(val)?.beta_code_used != null;
                  const takenBefore = [...userDataRows.values()].filter(r => r.beta_code_used != null).length;
                  if (!alreadyEnrolled && takenBefore >= seatCap) {
                    return Promise.resolve({ error: { message: `beta program is full — ${takenBefore} of ${seatCap} seats taken` } });
                  }
                }
                const row = userDataRows.get(val) || { user_id: val };
                Object.assign(row, payload);
                userDataRows.set(val, row);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url, key) =>
    key === "service-role-key" ? globalThis.__fakeAdmin : mocks.userClient
  ),
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const { default: handler } = await import("../../../api/seed.js");

function mkRes() {
  return {
    statusCode: null, body: null, setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}
function authedReq(body, userId = "u1") {
  return { method: "POST", headers: { authorization: "Bearer tok" }, body, __userId: userId };
}

// Same 20/20 shape as the real production beta_codes seed (021_ / 035_), just
// 3 rows per channel instead of 20 so the pool-exhaustion path is reachable
// in a handful of assertions.
function seedRealisticBetaCodes() {
  return [
    { id: "w1", code: "glass042", channel: "website", is_active: true },
    { id: "w2", code: "glass890", channel: "website", is_active: true },
    { id: "w3", code: "glass808", channel: "website", is_active: true },
    { id: "f1", code: "clarity802", channel: "flyer", is_active: true },
    { id: "f2", code: "clarity624", channel: "flyer", is_active: true },
    { id: "f3", code: "clarity790", channel: "flyer", is_active: true },
    // Legacy inactive one-offs, same as production — must never be claimable
    // and must never count toward either pool's remaining-seats math.
    { id: "legacy-clarity", code: "CLARITY", channel: "flyer", is_active: false },
    { id: "legacy-glass", code: "GLASS-VIEW", channel: "website", is_active: false },
  ];
}

let betaCodesRows, userDataRows;
beforeEach(() => {
  vi.clearAllMocks();
  betaCodesRows = seedRealisticBetaCodes();
  userDataRows = new Map();
  globalThis.__fakeAdmin = makeFakeAdmin({ betaCodesRows, userDataRows, seatCap: 40 });
  mocks.userClient.auth.getUser.mockImplementation(async () => ({
    data: { user: { id: signingInAs } }, error: null,
  }));
});

let signingInAs = "u1";
async function redeem(value, userId) {
  signingInAs = userId;
  const res = mkRes();
  await handler(authedReq({ type: "beta", code: value }, userId), res);
  return res;
}

describe("beta channel split — end-to-end against a realistic beta_codes table", () => {
  it("1. ?beta=website claims a channel='website' row and flips is_active=false", async () => {
    const res = await redeem("website", "user-w1");
    expect(res.statusCode).toBe(200);
    const grantedCode = userDataRows.get("user-w1").beta_code_used;
    expect(grantedCode).toMatch(/^glass/);
    const claimedRow = betaCodesRows.find(r => r.code === grantedCode);
    expect(claimedRow.channel).toBe("website");
    expect(claimedRow.is_active).toBe(false);
    // Flyer pool must be completely untouched by a website redemption.
    expect(betaCodesRows.filter(r => r.channel === "flyer" && r.is_active).length).toBe(3);
  });

  it("1b. ?beta=website 403s with the exact message once the website pool is exhausted, without touching flyer", async () => {
    await redeem("website", "user-w1");
    await redeem("website", "user-w2");
    await redeem("website", "user-w3");
    // All 3 website seats gone (legacy GLASS-VIEW was already inactive, doesn't count).
    expect(betaCodesRows.filter(r => r.channel === "website" && r.is_active).length).toBe(0);

    const res = await redeem("website", "user-w4");
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or inactive beta code" });
    expect(userDataRows.has("user-w4")).toBe(false);
    // Flyer pool must still be fully intact — an exhausted website pool must
    // never spill over into claiming a flyer-channel code instead.
    expect(betaCodesRows.filter(r => r.channel === "flyer" && r.is_active).length).toBe(3);
  });

  it("2. ?beta=flyer claims a channel='flyer' row specifically, never a website row", async () => {
    const res = await redeem("flyer", "user-f1");
    expect(res.statusCode).toBe(200);
    const grantedCode = userDataRows.get("user-f1").beta_code_used;
    expect(grantedCode).toMatch(/^clarity/);
    const claimedRow = betaCodesRows.find(r => r.code === grantedCode);
    expect(claimedRow.channel).toBe("flyer");
    expect(claimedRow.is_active).toBe(false);
    expect(betaCodesRows.filter(r => r.channel === "website" && r.is_active).length).toBe(3);
  });

  it("2b. exhausting the flyer pool 403s without touching the website pool, and both pools can run out independently", async () => {
    await redeem("flyer", "user-f1");
    await redeem("flyer", "user-f2");
    await redeem("flyer", "user-f3");
    const res = await redeem("flyer", "user-f4");
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or inactive beta code" });
    // Website pool is still fully available — the two pools are independent.
    const websiteRedeem = await redeem("website", "user-w1");
    expect(websiteRedeem.statusCode).toBe(200);
  });

  it("interleaved website/flyer redemptions never cross-assign a code to the wrong channel's visitor", async () => {
    const results = [];
    for (const [value, uid] of [
      ["website", "u-w1"], ["flyer", "u-f1"], ["website", "u-w2"],
      ["flyer", "u-f2"], ["website", "u-w3"], ["flyer", "u-f3"],
    ]) {
      results.push([uid, (await redeem(value, uid)).statusCode]);
    }
    expect(results.every(([, status]) => status === 200)).toBe(true);
    for (const uid of ["u-w1", "u-w2", "u-w3"]) {
      expect(userDataRows.get(uid).beta_code_used).toMatch(/^glass/);
    }
    for (const uid of ["u-f1", "u-f2", "u-f3"]) {
      expect(userDataRows.get(uid).beta_code_used).toMatch(/^clarity/);
    }
    // Every row got claimed exactly once — no double-claim, nothing left over.
    expect(betaCodesRows.filter(r => r.is_active).length).toBe(0);
  });

  it("3. a failed grant (simulated 40-seat cap trigger) reactivates the claimed row so the channel's remaining-seat count stays accurate", async () => {
    globalThis.__fakeAdmin = makeFakeAdmin({ betaCodesRows, userDataRows, seatCap: 0 }); // force immediate "full"
    const res = await redeem("website", "user-w1");
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "The beta program is full" });
    // The row claimExactCode/claimFromChannel flipped to is_active=false during
    // the failed attempt must be reactivated — otherwise the marketing site's
    // "count where channel='website' and is_active=true" seat counter would
    // silently undercount by one for a signup that never actually happened.
    expect(betaCodesRows.filter(r => r.channel === "website" && r.is_active).length).toBe(3);
    expect(userDataRows.has("user-w1")).toBe(false);
  });

  it("3b. the 40-seat aggregate cap is driven by the same user_data.beta_code_used column both channels write, so per-channel sums can never desync from it", async () => {
    // Fill the aggregate cap to exactly 2 using one seat from each channel,
    // then confirm a 3rd redemption from EITHER channel is blocked by the
    // same aggregate check — proving there's no separate per-channel counter
    // that could drift out of sync with the real total.
    globalThis.__fakeAdmin = makeFakeAdmin({ betaCodesRows, userDataRows, seatCap: 2 });
    const first = await redeem("website", "user-w1");
    const second = await redeem("flyer", "user-f1");
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const thirdViaWebsite = await redeem("website", "user-w2");
    expect(thirdViaWebsite.statusCode).toBe(403);
    expect(thirdViaWebsite.body).toEqual({ error: "The beta program is full" });

    const totalGranted = [...userDataRows.values()].filter(r => r.beta_code_used != null).length;
    expect(totalGranted).toBe(2);
    // Both pools still have unclaimed seats (2 website, 2 flyer) — the cap
    // correctly blocked further ENROLLMENT even though channel pools aren't
    // individually exhausted, exactly matching migration 034's aggregate,
    // not-per-channel, scope.
    expect(betaCodesRows.filter(r => r.channel === "website" && r.is_active).length).toBe(2);
    expect(betaCodesRows.filter(r => r.channel === "flyer" && r.is_active).length).toBe(2);
  });
});
