import { createClient } from "@supabase/supabase-js";

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

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

  const { error: userDataDeleteError } = await adminClient
    .from("user_data")
    .delete()
    .eq("user_id", userId);

  if (userDataDeleteError) {
    return res.status(500).json({ error: "Failed to delete account data" });
  }

  const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return res.status(500).json({ error: "Failed to delete auth account" });
  }

  return res.status(200).json({ ok: true });
}
