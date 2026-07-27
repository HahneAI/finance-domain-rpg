import { createClient } from "@supabase/supabase-js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const TRIAL_DAYS = 14;
const ACCESS_DAYS = 21; // day 14 public trial end + hidden 7-day grace, never disclosed

// Consolidates the former seed-beta.js / seed-investor.js / seed-trial.js
// into one route, dispatched on body.type — Vercel's Hobby plan caps a
// deployment at 12 Serverless Functions (one per api/ file); this repo hit
// 13 and started failing builds. All three were already near-identical
// "verify the session, then grant a privileged user_data flag via the
// service-role client" handlers (migration 019_enable_user_data_rls.sql
// revoked client writes to these columns), so merging changes zero
// behavior — same status codes, same error messages, same validation, just
// one fewer function slot spent. Each of the three re-validates its own
// code/state server-side rather than trusting the client — the client-side
// checks (LoginScreen, ProfilePanel) only gate UI feedback, never security.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL/SUPABASE_URL",
    !anonKey && "VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    console.error("seed missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const type = req.body?.type;
  if (!["beta", "investor", "trial"].includes(type)) {
    return res.status(400).json({ error: "Missing or invalid type" });
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

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = authData.user.id;

  if (type === "beta") return seedBeta(req, res, adminClient, userId);
  if (type === "investor") return seedInvestor(req, res, adminClient, userId);
  return seedTrial(res, adminClient, userId);
}

// ── beta (was seed-beta.js) — docs/TODO.md §32 ──────────────────────────────
async function seedBeta(req, res, adminClient, userId) {
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toLowerCase() : "";
  if (!code) return res.status(400).json({ error: "Missing beta code" });

  // Case-insensitive match: `code` is already lowercased above, but the
  // stored beta_codes.code value isn't guaranteed to be — this table is
  // dashboard-managed (migration 028's own comment), so nothing enforces
  // lowercase on entry there. ilike (with no wildcard chars in `code`, since
  // codes are plain letters/digits/hyphens) is an exact case-insensitive
  // match, not a partial one.
  const { data: codeRow, error: codeError } = await adminClient
    .from("beta_codes")
    .select("id")
    .ilike("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (codeError || !codeRow) return res.status(403).json({ error: "Invalid or inactive beta code" });

  const { error: updateError } = await adminClient
    .from("user_data")
    .update({ is_tester: true, beta_code_used: code })
    .eq("user_id", userId);
  if (updateError) {
    // 40-seat cap (migration 034_beta_seat_cap.sql) — a real, expected outcome
    // once the program fills, not a server failure. The trigger's raised
    // message surfaces here verbatim; match on it so this returns a clean
    // user-facing "full" message + 403, not a generic 500 that reads like a bug.
    if (updateError.message?.includes("beta program is full")) {
      return res.status(403).json({ error: "The beta program is full" });
    }
    console.error("seed(beta) update failed:", updateError.message);
    return res.status(500).json({ error: "Failed to grant beta access" });
  }
  return res.status(200).json({ ok: true });
}

// ── investor (was seed-investor.js) ─────────────────────────────────────────
async function seedInvestor(req, res, adminClient, userId) {
  const code = typeof req.body?.code === "string" ? req.body.code.trim().toLowerCase() : "";
  if (!code) return res.status(400).json({ error: "Missing investor code" });

  const { data: codeRow, error: codeError } = await adminClient
    .from("investor_codes")
    .select("id")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (codeError || !codeRow) return res.status(403).json({ error: "Invalid or inactive investor code" });

  const { error: updateError } = await adminClient
    .from("user_data")
    .update({ is_investor: true })
    .eq("user_id", userId);
  if (updateError) {
    console.error("seed(investor) update failed:", updateError.message);
    return res.status(500).json({ error: "Failed to grant investor access" });
  }
  return res.status(200).json({ ok: true });
}

// ── trial (was seed-trial.js) ───────────────────────────────────────────────
async function seedTrial(res, adminClient, userId) {
  const { data: existing, error: fetchError } = await adminClient
    .from("user_data")
    .select("trial_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) {
    console.error("seed(trial) fetch failed:", fetchError.message);
    return res.status(500).json({ error: "Failed to load account" });
  }
  if (existing?.trial_started_at) return res.status(200).json({ seeded: false });

  const now = new Date();
  const patch = {
    user_id: userId,
    trial_started_at: now.toISOString(),
    trial_ends_at: new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(),
    access_ends_at: new Date(now.getTime() + ACCESS_DAYS * 86400000).toISOString(),
    subscription_status: "trialing",
  };
  const { error: upsertError } = await adminClient
    .from("user_data")
    .upsert(patch, { onConflict: "user_id" });
  if (upsertError) {
    console.error("seed(trial) upsert failed:", upsertError.message);
    return res.status(500).json({ error: "Failed to seed trial" });
  }
  return res.status(200).json({ seeded: true });
}
