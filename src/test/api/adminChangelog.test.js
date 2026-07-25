// api/admin-changelog.js — admin authoring surface for changelog_entries
// (database/migrations/032). Same auth pattern as revival-lookup.js/
// admin-beta-report.js: verify session via the anon-key client, re-check
// is_admin server-side, then use the service-role client for the real work.
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

const { default: handler } = await import("../../../api/admin-changelog.js");

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

describe("admin-changelog — auth gate", () => {
  it("401s without a bearer token", async () => {
    const res = mkRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it("401s on an invalid session", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: null, error: { message: "bad token" } });
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer bad" } }, res);
    expect(res.statusCode).toBe(401);
  });

  it("403s a valid session that isn't an admin", async () => {
    setupCallerAuth({ isAdmin: false });
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" } }, res);
    expect(res.statusCode).toBe(403);
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it("405s an unsupported method for an authenticated admin", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "PATCH", headers: { authorization: "Bearer tok" } }, res);
    expect(res.statusCode).toBe(405);
  });
});

describe("admin-changelog — GET (list, drafts included)", () => {
  it("returns every entry via the service-role client, newest first", async () => {
    setupCallerAuth();
    const rows = [
      { id: "e1", title: "Published one", published_at: "2026-07-20T00:00:00Z" },
      { id: "e2", title: "Draft one", published_at: null },
    ];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn().mockReturnValue({ order });
    mocks.adminClient.from.mockReturnValue({ select });

    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" } }, res);

    expect(mocks.adminClient.from).toHaveBeenCalledWith("changelog_entries");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ entries: rows });
  });

  it("500s on a database error", async () => {
    setupCallerAuth();
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: "denied" } });
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) });
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" } }, res);
    expect(res.statusCode).toBe(500);
  });
});

describe("admin-changelog — POST create (no id)", () => {
  it("400s on a missing title or body", async () => {
    setupCallerAuth();
    const res1 = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { title: "", body: "x" } }, res1);
    expect(res1.statusCode).toBe(400);

    const res2 = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { title: "t", body: "  " } }, res2);
    expect(res2.statusCode).toBe(400);
  });

  it("inserts with published_at set when published=true", async () => {
    setupCallerAuth({ userId: "admin-7" });
    const single = vi.fn().mockResolvedValue({ data: { id: "new-1", title: "Hi" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mocks.adminClient.from.mockReturnValue({ insert });

    const res = mkRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { versionLabel: "2026.07.26", title: " Hi ", body: "Body **text**", published: true },
    }, res);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      version_label: "2026.07.26",
      title: "Hi",
      body: "Body **text**",
      created_by: "admin-7",
    }));
    const insertedPayload = insert.mock.calls[0][0];
    expect(insertedPayload.published_at).not.toBeNull();
    expect(res.statusCode).toBe(201);
  });

  it("inserts with published_at null when published=false (draft)", async () => {
    setupCallerAuth();
    const single = vi.fn().mockResolvedValue({ data: { id: "new-2" }, error: null });
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    mocks.adminClient.from.mockReturnValue({ insert });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { title: "t", body: "b", published: false } }, res);

    expect(insert.mock.calls[0][0].published_at).toBeNull();
    expect(res.statusCode).toBe(201);
  });
});

describe("admin-changelog — POST update (id present)", () => {
  it("404s when the entry doesn't exist", async () => {
    setupCallerAuth();
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const eq = vi.fn().mockReturnValue({ single });
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { id: "missing", title: "t", body: "b", published: true } }, res);
    expect(res.statusCode).toBe(404);
  });

  it("preserves the original published_at when already published and staying published", async () => {
    setupCallerAuth();
    const fetchSingle = vi.fn().mockResolvedValue({ data: { published_at: "2026-01-01T00:00:00Z" }, error: null });
    const fetchEq = vi.fn().mockReturnValue({ single: fetchSingle });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    mocks.adminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: fetchEq }),
      update,
    });

    const res = mkRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { id: "e1", title: "Edited title", body: "New body", published: true },
    }, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ published_at: "2026-01-01T00:00:00Z" }));
    expect(res.statusCode).toBe(200);
  });

  it("stamps a fresh published_at on a draft→published transition", async () => {
    setupCallerAuth();
    const fetchSingle = vi.fn().mockResolvedValue({ data: { published_at: null }, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) });
    mocks.adminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: fetchSingle }) }),
      update,
    });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { id: "e1", title: "t", body: "b", published: true } }, res);

    expect(update.mock.calls[0][0].published_at).not.toBeNull();
  });

  it("clears published_at on a published→draft transition", async () => {
    setupCallerAuth();
    const fetchSingle = vi.fn().mockResolvedValue({ data: { published_at: "2026-01-01T00:00:00Z" }, error: null });
    const updateSingle = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: updateSingle }) }) });
    mocks.adminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: fetchSingle }) }),
      update,
    });

    const res = mkRes();
    await handler({ method: "POST", headers: { authorization: "Bearer tok" }, body: { id: "e1", title: "t", body: "b", published: false } }, res);

    expect(update.mock.calls[0][0].published_at).toBeNull();
  });
});

describe("admin-changelog — DELETE", () => {
  it("400s without an id", async () => {
    setupCallerAuth();
    const res = mkRes();
    await handler({ method: "DELETE", headers: { authorization: "Bearer tok" }, query: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it("deletes the row matching the id", async () => {
    setupCallerAuth();
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    mocks.adminClient.from.mockReturnValue({ delete: del });

    const res = mkRes();
    await handler({ method: "DELETE", headers: { authorization: "Bearer tok" }, query: { id: "e1" } }, res);

    expect(eq).toHaveBeenCalledWith("id", "e1");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("500s on a database error", async () => {
    setupCallerAuth();
    mocks.adminClient.from.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: { message: "denied" } }) }) });
    const res = mkRes();
    await handler({ method: "DELETE", headers: { authorization: "Bearer tok" }, query: { id: "e1" } }, res);
    expect(res.statusCode).toBe(500);
  });
});
