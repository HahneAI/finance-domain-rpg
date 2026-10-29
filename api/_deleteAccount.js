import { createClient } from "@supabase/supabase-js";
import { archiveAndDeleteAccount } from "./_accountArchive.js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// A user who asks to delete their account must never be told "no" by an
// infrastructure hiccup (migration 044 — see its header for the incident this
// closes: a transient auth.admin.deleteUser failure used to surface a raw
// "Failed to delete auth account" error while user_data had already been
// wiped out from under them). So this route no longer risks a hard failure on
// the step the user actually asked for:
//   1. Stamp deletion_requested_at on the row FIRST — a plain single-column
//      UPDATE that should essentially never fail. The instant this succeeds,
//      the account is locked (src/lib/db.js / src/App.jsx block further app
//      access on it) and the request is honored from the user's perspective,
//      whatever happens next.
//   2. Attempt the real archive-then-delete (api/_accountArchive.js — same
//      tombstone-then-purge sequence the day-21+7 non-payment cron already
//      uses) inline, best-effort. On success the account is fully gone
//      immediately.
//   3. If step 2 throws, don't fail the request — log it and leave the row
//      locked. api/cron-subscription-lifecycle.js sweeps every locked row on
//      its next daily run and retries the same archive until it succeeds.
// Either way this route returns 200 once the account is locked — "we're sad
// to see you go" is true the moment the user asked, not once every backend
// system has caught up.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

  const confirmationText = req.body?.confirmationText;
  if (confirmationText !== "DELETE") {
    return res.status(400).json({ error: "Invalid delete confirmation" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const userId = authData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const { error: lockError } = await adminClient
    .from("user_data")
    .update({ deletion_requested_at: now.toISOString() })
    .eq("user_id", userId);
  if (lockError) {
    return res.status(500).json({ error: "Failed to process deletion request" });
  }

  try {
    await archiveAndDeleteAccount(adminClient, userId, now, "user_requested");
  } catch (err) {
    // Locked but not yet purged — the daily cron sweep will finish this.
    // Not an error the user needs to see: their request has already been honored.
    console.error(`delete-account: inline archive failed for ${userId}, left for cron retry:`, err.message);
  }

  return res.status(200).json({ ok: true });
}
