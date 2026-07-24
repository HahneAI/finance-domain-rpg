import { createClient } from "@supabase/supabase-js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// docs/TODO.md §32 — self-serve beta code redemption. Mirrors
// api/seed-investor.js exactly: grants is_tester + beta_code_used on the
// caller's own user_data row via the service-role client, because both are
// privileged columns the client can't write directly (migration 019's RLS
// lockdown). Re-validates the code server-side — the client-side
// validateBetaCode() check only gates UI feedback, it is not a security
// boundary. beta_started_at (migration 027) is auto-stamped by that
// migration's trigger the moment this UPDATE sets beta_code_used, so it
// doesn't need to be set here explicitly.
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
    console.error("seed-beta missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const code = typeof req.body?.code === "string" ? req.body.code.trim().toLowerCase() : "";
  if (!code) {
    return res.status(400).json({ error: "Missing beta code" });
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

  const { data: codeRow, error: codeError } = await adminClient
    .from("beta_codes")
    .select("id")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (codeError || !codeRow) {
    return res.status(403).json({ error: "Invalid or inactive beta code" });
  }

  const { error: updateError } = await adminClient
    .from("user_data")
    .update({ is_tester: true, beta_code_used: code })
    .eq("user_id", authData.user.id);
  if (updateError) {
    console.error("seed-beta update failed:", updateError.message);
    return res.status(500).json({ error: "Failed to grant beta access" });
  }

  return res.status(200).json({ ok: true });
}
