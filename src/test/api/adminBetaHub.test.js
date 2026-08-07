// api/admin-beta-hub.js — admin write surface for the Beta Homebase
// (database/migrations/037_add_beta_homebase.sql): beta_content_items
// (checklist + suggestion, entity: "content") and beta_scores
// (entity: "score"), dispatched in one route to stay under Vercel's Hobby
// 12-function cap (same idiom as api/seed.js). Auth pattern and the
// content CRUD shape mirror api/admin-changelog.js — see
// src/test/api/adminChangelog.test.js for the sibling suite this borrows
// its scaffolding from.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    userClient: { auth: { getUser: vi.fn() }, from: vi.fn() },
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

const { default: handler } = await import("../../../api/admin-beta-hub.js");

function mkRes() {
  return {
    statusCode: null,
    body: null,
    setHeader: vi.fn(),
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

function setupCallerAuth({ userId = "admin-1", isAdmin = true } = {}) {
  mocks.userClient.auth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  const single = vi.fn().mockResolvedValue({ data: { is_admin: isAdmin }, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  mocks.userClient.from.mockReturnValue({ select });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin-beta-hub — auth gate", () => {
  it("401s without a bearer token", async () => {
    const res = mkRes();
    await handler({ method: "GET", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it("403s a valid session that isn't an admin", async () => {
    setupCallerAuth({ isAdmin: false });
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { entity: "content", kind: "checklist" } }, res);
    expect(res.statusCode).toBe(403);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it("405s an unsupported method for an authenticated admin", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "PATCH", headers: { authorization: "Bearer tok" }, query: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe("admin-beta-hub — GET entity=content", () => {
  it("400s without entity=content", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s on a missing or invalid kind", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { entity: "content", kind: "nonsense" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns items for the requested kind, newest first", async () => {
    setupCallerAuth();
    const rows = [{ id: "c1", kind: "checklist", title: "Try the Log panel" }];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn().mockReturnValue({ order });
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { entity: "content", kind: "checklist" } }, res);

    expect(mocks.adminClient.from).toHaveBeenCalledWith("beta_content_items");
    expect(eq).toHaveBeenCalledWith("kind", "checklist");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ items: rows });
  });
});

describe("admin-beta-hub — POST entity=content", () => {
  it("400s on a missing or invalid kind", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "content", kind: "nonsense", title: "t" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s on a missing title", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "content", kind: "checklist", title: "  " } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("creates with published_at set when published=true, tagged with the caller's id", async () => {
    setupCallerAuth({ userId: "admin-7" });
    const single = vi.fn().mockResolvedValue({ data: { id: "new-1" }, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    mocks.adminClient.from.mockReturnValue({ insert });

    const res = mkRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { entity: "content", kind: "suggestion", title: " Try this ", body: "Body text", published: true },
    }, res);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "suggestion", title: "Try this", created_by: "admin-7" }));
    expect(insert.mock.calls[0][0].published_at).not.toBeNull();
    expect(res.statusCode).toBe(201);
  });

  it("update (id present) 404s when the item doesn't exist", async () => {
    setupCallerAuth();
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "content", id: "missing", kind: "checklist", title: "t" } }, res);
    expect(res.statusCode).toBe(404);
  });

  it("update preserves the original published_at when already published and staying published", async () => {
    setupCallerAuth();
    const fetchSingle = vi.fn().mockResolvedValue({ data: { published_at: "2026-01-01T00:00:00Z" }, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) });
    mocks.adminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: fetchSingle }) }),
      update,
    });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "content", id: "c1", kind: "checklist", title: "t", published: true } }, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ published_at: "2026-01-01T00:00:00Z" }));
    expect(res.statusCode).toBe(200);
  });
});

describe("admin-beta-hub — DELETE entity=content", () => {
  it("400s without entity=content", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "DELETE", headers: { authorization: "Bearer tok" }, query: { id: "c1" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s without an id", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "DELETE", headers: { authorization: "Bearer tok" }, query: { entity: "content" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("deletes the row matching the id", async () => {
    setupCallerAuth();
    const eq = vi.fn().mockResolvedValue({ error: null });
    mocks.adminClient.from.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) });

    const res = mkRes();
    await handler({ method: "DELETE", headers: { authorization: "Bearer tok" }, query: { entity: "content", id: "c1" } }, res);

    expect(eq).toHaveBeenCalledWith("id", "c1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("admin-beta-hub — POST entity=score", () => {
  it("400s on a missing userId", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "score", usageScore: 40 } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("upserts the four category scores, notes, and the caller as updated_by", async () => {
    setupCallerAuth({ userId: "admin-9" });
    const savedScore = { user_id: "u1", usage_score: 40, feedback_score: 20, calls_score: 10, longevity_score: 10 };
    const single = vi.fn().mockResolvedValue({ data: savedScore, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    mocks.adminClient.from.mockReturnValue({ upsert });

    const res = mkRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { entity: "score", userId: "u1", usageScore: 40, feedbackScore: 20, callsScore: 10, longevityScore: 10, adminNotes: "great engagement" },
    }, res);

    expect(mocks.adminClient.from).toHaveBeenCalledWith("beta_scores");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", usage_score: 40, feedback_score: 20, calls_score: 10, longevity_score: 10, admin_notes: "great engagement", updated_by: "admin-9" }),
      { onConflict: "user_id" },
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ score: savedScore });
  });

  it("writes null for an omitted category instead of leaving it stale", async () => {
    setupCallerAuth();
    const single = vi.fn().mockResolvedValue({ data: { user_id: "u1" }, error: null });
    const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    mocks.adminClient.from.mockReturnValue({ upsert });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "score", userId: "u1", usageScore: 40 } }, res);

    expect(upsert.mock.calls[0][0].feedback_score).toBeNull();
    expect(upsert.mock.calls[0][0].calls_score).toBeNull();
    expect(upsert.mock.calls[0][0].longevity_score).toBeNull();
    expect(res.statusCode).toBe(200);
  });

  it("500s on a database error", async () => {
    setupCallerAuth();
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } });
    mocks.adminClient.from.mockReturnValue({ upsert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "score", userId: "u1" } }, res);
    expect(res.statusCode).toBe(500);
  });
});

describe("admin-beta-hub — POST missing/invalid entity", () => {
  it("400s when entity is missing", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { title: "t" } }, res);
    expect(res.statusCode).toBe(400);
  });

  it("400s when entity is unrecognized", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { entity: "nonsense" } }, res);
    expect(res.statusCode).toBe(400);
  });
});
