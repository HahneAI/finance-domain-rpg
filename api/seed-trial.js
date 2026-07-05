import { createClient } from "@supabase/supabase-js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const TRIAL_DAYS = 14;
const ACCESS_DAYS = 21; // day 14 public trial end + hidden 7-day grace, never disclosed

// Seeds the trial window exactly once per user. Moved server-side (migration
// 019_enable_user_data_rls.sql) because trial_started_at/trial_ends_at/
// access_ends_at/subscription_status are privileged columns the client can no
// longer write directly — only the service-role key bypasses those grants.
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
    console.error("seed-trial missing env vars:", missing.join(", "));
    return res.status(500).json({ error: "Server configuration is missing" });
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

  const userId = authData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: fetchError } = await adminClient
    .from("user_data")
    .select("trial_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) {
    console.error("seed-trial fetch failed:", fetchError.message);
    return res.status(500).json({ error: "Failed to load account" });
  }
  if (existing?.trial_started_at) {
    return res.status(200).json({ seeded: false });
  }

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
    console.error("seed-trial upsert failed:", upsertError.message);
    return res.status(500).json({ error: "Failed to seed trial" });
  }

  return res.status(200).json({ seeded: true });
}
