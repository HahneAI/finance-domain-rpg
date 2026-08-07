// api/admin-beta-report.js — beta cohort usage report. This suite covers the
// docs/TODO.md §12 Beta Homebase extension only (?format=json, the
// beta_scores/beta_checklist_completions/beta_content_items joins) — the
// pre-existing CSV/?format=feedback behavior had no prior test file and is
// exercised only incidentally here via the shared happy-path fixture.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    userClient: { auth: { getUser: vi.fn() }, from: vi.fn() },
    adminClient: { from: vi.fn(), auth: { admin: { getUserById: vi.fn() } } },
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

const { default: handler } = await import("../../../api/admin-beta-report.js");

function mkRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(text) { this.body = text; return this; },
  };
}

function setupCallerAuth({ isAdmin = true } = {}) {
  mocks.userClient.auth.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
  const single = vi.fn().mockResolvedValue({ data: { is_admin: isAdmin }, error: null });
  mocks.userClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) });
}

// Wires every table adminClient.from() touches for one tester (u1) with a
// controllable set of events/score/checklist state.
function routeAdminTables({ betaUsers, events = [], score = null, checklistTotal = 0, completions = [] }) {
  mocks.adminClient.from.mockImplementation((table) => {
    if (table === "user_data") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: betaUsers, error: null }) }) }) };
    }
    if (table === "beta_activity_events") {
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: events, error: null }) }) }) };
    }
    if (table === "beta_scores") {
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: score ? [score] : [], error: null }) }) };
    }
    if (table === "beta_content_items") {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ count: checklistTotal, error: null }) }) }) };
    }
    if (table === "beta_checklist_completions") {
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: completions, error: null }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  mocks.adminClient.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "tester@example.com" } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin-beta-report — ?format=json", () => {
  it("returns { ok: true, rows: [] } for an empty cohort without querying anything else", async () => {
    setupCallerAuth();
    mocks.adminClient.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ not: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) });
    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { format: "json" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, rows: [] });
  });

  it("joins score + checklist completion onto each tester's usage row", async () => {
    setupCallerAuth();
    routeAdminTables({
      betaUsers: [{ user_id: "u1", display_name: "Ada", beta_code_used: "clarity042", beta_started_at: null }],
      events: [{ user_id: "u1", event_type: "login", created_at: "2026-07-01T00:00:00Z", note: null }],
      score: { user_id: "u1", usage_score: 40, feedback_score: 20, calls_score: 10, longevity_score: 10 },
      checklistTotal: 3,
      completions: [{ user_id: "u1" }, { user_id: "u1" }],
    });

    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { format: "json" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    const row = res.body.rows[0];
    expect(row.user_id).toBe("u1");
    expect(row.checklist_completed_count).toBe(2);
    expect(row.checklist_total_count).toBe(3);
    expect(row.usage_score).toBe(40);
    expect(row.feedback_score).toBe(20);
    expect(row.calls_score).toBe(10);
    expect(row.longevity_score).toBe(10);
    expect(row.total_score).toBe(80);
  });

  it("includes each tester's own feedback text, most-recent first", async () => {
    setupCallerAuth();
    routeAdminTables({
      betaUsers: [{ user_id: "u1", display_name: "Ada", beta_code_used: "clarity042", beta_started_at: null }],
      events: [
        { user_id: "u1", event_type: "feedback", created_at: "2026-07-01T00:00:00Z", note: "first note" },
        { user_id: "u1", event_type: "login", created_at: "2026-07-02T00:00:00Z", note: null },
        { user_id: "u1", event_type: "feedback", created_at: "2026-07-05T00:00:00Z", note: "second note" },
      ],
    });

    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { format: "json" } }, res);

    const row = res.body.rows[0];
    expect(row.feedback).toEqual([
      { created_at: "2026-07-05T00:00:00Z", note: "second note" },
      { created_at: "2026-07-01T00:00:00Z", note: "first note" },
    ]);
  });

  it("shows an unscored tester as empty-string score fields and a zero checklist count, not nulls/crashes", async () => {
    setupCallerAuth();
    routeAdminTables({
      betaUsers: [{ user_id: "u2", display_name: "Sam", beta_code_used: "glass071", beta_started_at: null }],
      events: [],
      score: null,
      checklistTotal: 3,
      completions: [],
    });

    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: { format: "json" } }, res);

    const row = res.body.rows[0];
    expect(row.usage_score).toBe("");
    expect(row.total_score).toBe("");
    expect(row.checklist_completed_count).toBe(0);
    expect(row.checklist_total_count).toBe(3);
  });
});

describe("admin-beta-report — CSV (default format)", () => {
  it("includes the new checklist/score columns in the header", async () => {
    setupCallerAuth();
    routeAdminTables({
      betaUsers: [{ user_id: "u1", display_name: "Ada", beta_code_used: "clarity042", beta_started_at: null }],
    });

    const res = mkRes();
    await handler({ method: "GET", headers: { authorization: "Bearer tok" }, query: {} }, res);

    expect(res.statusCode).toBe(200);
    const headerLine = res.body.split("\n")[0];
    expect(headerLine).toContain("checklist_completed_count");
    expect(headerLine).toContain("checklist_total_count");
    expect(headerLine).toContain("usage_score");
    expect(headerLine).toContain("total_score");
  });
});
