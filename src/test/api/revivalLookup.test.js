// §17.I — revival-lookup: the only read path to deleted_accounts (RLS,
// service-role only). Unauthenticated mode must disclose nothing beyond
// revivable + provider; authenticated mode keys off the SESSION email (never
// the body) and adds the archived identity for the Revive screen.
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

const { default: handler } = await import("../../../api/revival-lookup.js");

const TOMBSTONE = {
  email: "gone@example.com",
  oauth_provider: null,
  display_name: "Old Name",
  avatar_url: "https://example.com/a.png",
  plan: "monthly",
  revived_at: null,
};

function setupAdmin(tombstone) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: tombstone, error: null });
  const is = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ is });
  mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
  return { eq, is };
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

describe("revival-lookup — unauthenticated (LoginScreen failed-sign-in check)", () => {
  it("rejects non-POST", async () => {
    const res = mkRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it("400s without an email", async () => {
    const res = mkRes();
    await handler({ method: "POST", headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns ONLY revivable + provider for an open tombstone — no archived identity", async () => {
    setupAdmin(TOMBSTONE);
    const res = mkRes();
    await handler({ method: "POST", headers: {}, body: { email: "gone@example.com" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ revivable: true, oauthProvider: null });
  });

  it("returns revivable false when no open tombstone exists", async () => {
    setupAdmin(null);
    const res = mkRes();
    await handler({ method: "POST", headers: {}, body: { email: "nobody@example.com" } }, res);
    expect(res.body).toEqual({ revivable: false });
  });

  it("filters to un-revived tombstones only (revived_at IS NULL in the query)", async () => {
    const { is } = setupAdmin(null);
    const res = mkRes();
    await handler({ method: "POST", headers: {}, body: { email: "gone@example.com" } }, res);
    expect(is).toHaveBeenCalledWith("revived_at", null);
    expect(res.body).toEqual({ revivable: false });
  });
});

describe("revival-lookup — authenticated (App SIGNED_IN short-circuit)", () => {
  it("keys off the verified session email and returns the archived identity", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "gone@example.com" } },
      error: null,
    });
    const { eq } = setupAdmin(TOMBSTONE);
    const res = mkRes();
    await handler(
      // body email deliberately different — the session must win
      { method: "POST", headers: { authorization: "Bearer tok" }, body: { email: "attacker@example.com" } },
      res
    );
    expect(eq).toHaveBeenCalledWith("email", "gone@example.com");
    expect(res.body).toEqual({
      revivable: true,
      oauthProvider: null,
      email: "gone@example.com",
      displayName: "Old Name",
      avatarUrl: "https://example.com/a.png",
      plan: "monthly",
    });
  });

  it("401s on an invalid token instead of falling back to the body email", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: null, error: { message: "bad" } });
    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer bad" }, body: { email: "gone@example.com" } }, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });
});
