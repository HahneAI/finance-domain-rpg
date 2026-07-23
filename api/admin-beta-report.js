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

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const EVENT_TYPES = ["login", "goal_created", "goal_updated", "expense_created", "expense_updated"];

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
    .select("user_id, display_name, beta_code_used")
    .eq("is_tester", true)
    .not("beta_code_used", "is", null);
  if (betaUsersError) {
    return res.status(500).json({ error: "Failed to load beta cohort" });
  }
  if (!betaUsers || betaUsers.length === 0) {
    return res.status(200).json({ ok: true, rows: 0, note: "No tracked beta-cohort accounts found." });
  }

  const userIds = betaUsers.map(u => u.user_id);
  const { data: events, error: eventsError } = await adminClient
    .from("beta_activity_events")
    .select("user_id, event_type, created_at")
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

  const eventsByUser = {};
  for (const row of events ?? []) {
    (eventsByUser[row.user_id] ??= []).push(row);
  }

  const summaryRows = betaUsers.map((u) => {
    const userEvents = eventsByUser[u.user_id] ?? [];
    const counts = Object.fromEntries(EVENT_TYPES.map(t => [t, 0]));
    const activeDays = new Set();
    let firstAt = null;
    let lastAt = null;
    for (const e of userEvents) {
      counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
      activeDays.add(e.created_at.slice(0, 10));
      if (!firstAt || e.created_at < firstAt) firstAt = e.created_at;
      if (!lastAt || e.created_at > lastAt) lastAt = e.created_at;
    }
    return {
      user_id: u.user_id,
      display_name: u.display_name ?? "",
      email: emailById[u.user_id] ?? "",
      beta_code_used: u.beta_code_used,
      login_count: counts.login,
      goal_created: counts.goal_created,
      goal_updated: counts.goal_updated,
      expense_created: counts.expense_created,
      expense_updated: counts.expense_updated,
      active_days: activeDays.size,
      first_event_at: firstAt ?? "",
      last_event_at: lastAt ?? "",
    };
  });

  const header = [
    "user_id", "display_name", "email", "beta_code_used", "login_count",
    "goal_created", "goal_updated", "expense_created", "expense_updated",
    "active_days", "first_event_at", "last_event_at",
  ];
  const csv = [
    header.join(","),
    ...summaryRows.map(r => header.map(k => csvEscape(r[k])).join(",")),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="beta-usage-report.csv"');
  return res.status(200).send(csv);
}
