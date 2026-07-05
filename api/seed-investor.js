import { createClient } from "@supabase/supabase-js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Grants is_investor on the caller's own user_data row. Moved server-side
// (migration 019_enable_user_data_rls.sql) because is_investor is a
// privileged column the client can no longer write directly. Re-validates
// the investor code itself rather than trusting the client — the client-side
// check in LoginScreen only gates whether InvestorRegister is shown, it isn't
// a security boundary.
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
    console.error("seed-investor missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const code = typeof req.body?.code === "string" ? req.body.code.trim().toLowerCase() : "";
  if (!code) {
    return res.status(400).json({ error: "Missing investor code" });
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
    .from("investor_codes")
    .select("id")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  if (codeError || !codeRow) {
    return res.status(403).json({ error: "Invalid or inactive investor code" });
  }

  const { error: updateError } = await adminClient
    .from("user_data")
    .update({ is_investor: true })
    .eq("user_id", authData.user.id);
  if (updateError) {
    console.error("seed-investor update failed:", updateError.message);
    return res.status(500).json({ error: "Failed to grant investor access" });
  }

  return res.status(200).json({ ok: true });
}
