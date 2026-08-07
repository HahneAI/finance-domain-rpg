import { createClient } from "@supabase/supabase-js";

// Beta usage-scoring report (docs/TODO.md — beta usage scoring). Admin-only,
// service-role read across the tracked beta cohort (user_data.is_tester = true
// AND beta_code_used IS NOT NULL — see database/migrations/025/026 and
// entitlements.js isTrackedBetaTester). Friends/family testers (is_tester true,
// no code) are deliberately excluded — they were never logged to
// beta_activity_events in the first place, so this filter is belt-and-suspenders.
//
// Same auth pattern as delete-account.js/coach.js: verify the caller's Supabase
// session with the anon-key client, then re-check is_admin server-side (the
// client-side gate is UX only) before touching the service-role client.
//
// One row per beta user in the CSV — aggregate counts, not a raw event dump.
// ~40 users, reviewed manually once at the end of the 10-week program; a
// per-week breakdown was deliberately left out (no canonical "week 1" anchor
// date exists per user) rather than guessing a bucketing scheme.
//
// GET ?format=feedback returns a second shape instead: one row PER FEEDBACK
// SUBMISSION (user_id, display_name, email, created_at, note) rather than
// per-user aggregates — free text with a possible multiple-per-user count
// doesn't fit the summary CSV's one-row-per-user shape.
//
// GET ?format=json returns the same per-user summary rows as JSON instead of
// CSV — the Beta Homebase admin scoresheet (db.js's fetchBetaScoreboard)
// reads this to pre-fill each tester's current usage stats, checklist
// completion, and existing rubric score before the admin edits it.
//
// docs/TODO.md §30 — each user's aggregate is scoped to THEIR OWN 10-week
// window (beta_started_at .. beta_started_at + 10 weeks, migration
// 027_add_beta_started_at.sql), not all-time activity. Staggered code
// redemption means "week 1" is a different calendar date per user; counting
// all-time would let a tester who redeemed early (and kept using the app
// afterward as an ordinary user) silently inflate their score relative to one
// who redeemed on day 1 of the program.

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const EVENT_TYPES = ["login", "goal_created", "goal_updated", "expense_created", "expense_updated", "feedback"];
const BETA_PROGRAM_WEEKS = 10;
const BETA_PROGRAM_MS = BETA_PROGRAM_WEEKS * 7 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: "Server auth configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const { data: callerRow, error: callerError } = await userClient
    .from("user_data")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .single();
  if (callerError || !callerRow?.is_admin) {
    return res.status(403).json({ error: "Admin only" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: betaUsers, error: betaUsersError } = await adminClient
    .from("user_data")
    .select("user_id, display_name, beta_code_used, beta_started_at")
    .eq("is_tester", true)
    .not("beta_code_used", "is", null);
  if (betaUsersError) {
    return res.status(500).json({ error: "Failed to load beta cohort" });
  }
  if (!betaUsers || betaUsers.length === 0) {
    if (req.query?.format === "json") return res.status(200).json({ ok: true, rows: [] });
    return res.status(200).json({ ok: true, rows: 0, note: "No tracked beta-cohort accounts found." });
  }

  const userIds = betaUsers.map(u => u.user_id);
  const { data: events, error: eventsError } = await adminClient
    .from("beta_activity_events")
    .select("user_id, event_type, created_at, note")
    .in("user_id", userIds)
    .order("created_at", { ascending: true });
  if (eventsError) {
    return res.status(500).json({ error: "Failed to load activity events" });
  }

  // Email isn't stored in user_data — pull it from auth.users per account
  // (small cohort, ~40 users, one call each is fine for a once-per-program report).
  const emailById = {};
  await Promise.all(userIds.map(async (id) => {
    const { data } = await adminClient.auth.admin.getUserById(id);
    emailById[id] = data?.user?.email ?? "";
  }));

  // docs/TODO.md §12 — Beta Homebase: joins the admin-entered rubric score
  // (database/migrations/037_add_beta_homebase.sql's beta_scores, never
  // auto-computed — see that migration's header) and each tester's checklist
  // completion count, so this report doubles as the data source the admin
  // scoresheet UI reads to pre-fill "here's what they've done so far"
  // alongside the score inputs (fetchBetaScoreboard in db.js, ?format=json below).
  const { data: scoreRows } = await adminClient
    .from("beta_scores")
    .select("user_id, usage_score, feedback_score, calls_score, longevity_score, updated_at")
    .in("user_id", userIds);
  const scoreByUser = Object.fromEntries((scoreRows ?? []).map(r => [r.user_id, r]));

  const { count: checklistTotalCount } = await adminClient
    .from("beta_content_items")
    .select("id", { count: "exact", head: true })
    .eq("kind", "checklist")
    .not("published_at", "is", null);

  const { data: completionRows } = await adminClient
    .from("beta_checklist_completions")
    .select("user_id")
    .in("user_id", userIds);
  const checklistCompletedByUser = {};
  for (const row of completionRows ?? []) {
    checklistCompletedByUser[row.user_id] = (checklistCompletedByUser[row.user_id] ?? 0) + 1;
  }

  const eventsByUser = {};
  for (const row of events ?? []) {
    (eventsByUser[row.user_id] ??= []).push(row);
  }

  // docs/TODO.md §33 — feedback text doesn't fit the one-row-per-user summary
  // (a user can submit multiple times, and free text needs room to read), so
  // it's collected separately here and served as its own export
  // (?format=feedback) instead of crammed into the summary CSV.
  const feedbackRows = [];

  const summaryRows = betaUsers.map((u) => {
    const windowStart = u.beta_started_at;
    const windowEnd = windowStart
      ? new Date(new Date(windowStart).getTime() + BETA_PROGRAM_MS).toISOString()
      : null;
    // Accounts with no beta_started_at predate migration 027 (or had
    // beta_code_used set before the trigger existed) — fall back to counting
    // all-time rather than silently dropping them from the report, and flag
    // it via the empty beta_started_at/beta_week columns below.
    const allUserEvents = eventsByUser[u.user_id] ?? [];
    const userEvents = windowStart
      ? allUserEvents.filter(e => e.created_at >= windowStart && e.created_at <= windowEnd)
      : allUserEvents;

    const counts = Object.fromEntries(EVENT_TYPES.map(t => [t, 0]));
    const activeDays = new Set();
    let firstAt = null;
    let lastAt = null;
    for (const e of userEvents) {
      counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
      activeDays.add(e.created_at.slice(0, 10));
      if (!firstAt || e.created_at < firstAt) firstAt = e.created_at;
      if (!lastAt || e.created_at > lastAt) lastAt = e.created_at;
      if (e.event_type === "feedback") {
        feedbackRows.push({
          user_id: u.user_id,
          display_name: u.display_name ?? "",
          email: emailById[u.user_id] ?? "",
          created_at: e.created_at,
          note: e.note ?? "",
        });
      }
    }

    const betaWeekNumber = windowStart
      ? Math.min(BETA_PROGRAM_WEEKS, Math.max(1, Math.ceil((Date.now() - new Date(windowStart).getTime()) / (7 * 24 * 60 * 60 * 1000))))
      : "";

    // docs/TODO.md §34 — surfaces attrition directly in the report instead of
    // requiring the reviewer to eyeball raw timestamps; zero new data collection,
    // derived from lastAt which was already being tracked.
    const daysSinceLastActive = lastAt
      ? Math.round((Date.now() - new Date(lastAt).getTime()) / (24 * 60 * 60 * 1000))
      : "";

    const score = scoreByUser[u.user_id];

    return {
      user_id: u.user_id,
      display_name: u.display_name ?? "",
      email: emailById[u.user_id] ?? "",
      beta_code_used: u.beta_code_used,
      beta_started_at: windowStart ?? "",
      beta_week_number: betaWeekNumber,
      login_count: counts.login,
      goal_created: counts.goal_created,
      goal_updated: counts.goal_updated,
      expense_created: counts.expense_created,
      expense_updated: counts.expense_updated,
      feedback_count: counts.feedback,
      active_days: activeDays.size,
      first_event_at: firstAt ?? "",
      last_event_at: lastAt ?? "",
      days_since_last_active: daysSinceLastActive,
      checklist_completed_count: checklistCompletedByUser[u.user_id] ?? 0,
      checklist_total_count: checklistTotalCount ?? 0,
      usage_score: score?.usage_score ?? "",
      feedback_score: score?.feedback_score ?? "",
      calls_score: score?.calls_score ?? "",
      longevity_score: score?.longevity_score ?? "",
      total_score: score
        ? (score.usage_score ?? 0) + (score.feedback_score ?? 0) + (score.calls_score ?? 0) + (score.longevity_score ?? 0)
        : "",
    };
  });

  if (req.query?.format === "json") {
    return res.status(200).json({ ok: true, rows: summaryRows });
  }

  if (req.query?.format === "feedback") {
    feedbackRows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const feedbackHeader = ["user_id", "display_name", "email", "created_at", "note"];
    const feedbackCsv = [
      feedbackHeader.join(","),
      ...feedbackRows.map(r => feedbackHeader.map(k => csvEscape(r[k])).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="beta-feedback.csv"');
    return res.status(200).send(feedbackCsv);
  }

  const header = [
    "user_id", "display_name", "email", "beta_code_used", "beta_started_at", "beta_week_number",
    "login_count", "goal_created", "goal_updated", "expense_created", "expense_updated", "feedback_count",
    "active_days", "first_event_at", "last_event_at", "days_since_last_active",
    "checklist_completed_count", "checklist_total_count",
    "usage_score", "feedback_score", "calls_score", "longevity_score", "total_score",
  ];
  const csv = [
    header.join(","),
    ...summaryRows.map(r => header.map(k => csvEscape(r[k])).join(",")),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="beta-usage-report.csv"');
  return res.status(200).send(csv);
}
