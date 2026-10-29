import { createClient } from "@supabase/supabase-js";

// Admin authoring surface for changelog_entries (database/migrations/032).
// Same auth pattern as admin-beta-report.js/delete-account.js/coach.js:
// verify the caller's Supabase session with the anon-key client, then
// re-check is_admin server-side (the client-side row gate in ProfilePanel is
// UX only) before touching the service-role client. The service-role client
// is required here even for GET — RLS only exposes published rows to a plain
// authenticated client, and the admin list view needs drafts too.

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

async function authenticateAdmin(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { error: { status: 401, message: "Missing access token" } };

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return { error: { status: 401, message: "Invalid or expired session" } };
  }

  const { data: callerRow, error: callerError } = await userClient
    .from("user_data")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .single();
  if (callerError || !callerRow?.is_admin) {
    return { error: { status: 403, message: "Admin only" } };
  }

  return { userId: authData.user.id };
}

export default async function handler(req, res) {
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: "Server auth configuration is missing" });
  }

  const auth = await authenticateAdmin(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (req.method === "GET") {
    const { data, error } = await adminClient
      .from("changelog_entries")
      .select("id, version_label, title, body, published_at, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: "Failed to load changelog entries" });
    return res.status(200).json({ entries: data ?? [] });
  }

  if (req.method === "POST") {
    const { id, versionLabel, title, body, published } = req.body ?? {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: "Body is required" });
    }

    if (id) {
      // Update — preserve the original published_at when it was already
      // published and stays published (re-saving shouldn't bump the "new"
      // signal every unseen-check relies on); only set/clear it on an actual
      // draft<->published transition.
      const { data: existing, error: fetchError } = await adminClient
        .from("changelog_entries")
        .select("published_at")
        .eq("id", id)
        .single();
      if (fetchError || !existing) return res.status(404).json({ error: "Entry not found" });

      const wasPublished = existing.published_at != null;
      const publishedAt = published
        ? (wasPublished ? existing.published_at : new Date().toISOString())
        : null;

      const { data, error } = await adminClient
        .from("changelog_entries")
        .update({
          version_label: versionLabel ?? null,
          title: String(title).trim(),
          body: String(body),
          published_at: publishedAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: "Failed to update entry" });
      return res.status(200).json({ entry: data });
    }

    const { data, error } = await adminClient
      .from("changelog_entries")
      .insert({
        version_label: versionLabel ?? null,
        title: String(title).trim(),
        body: String(body),
        published_at: published ? new Date().toISOString() : null,
        created_by: auth.userId,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: "Failed to create entry" });
    return res.status(201).json({ entry: data });
  }

  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing id" });
    const { error } = await adminClient.from("changelog_entries").delete().eq("id", id);
    if (error) return res.status(500).json({ error: "Failed to delete entry" });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
