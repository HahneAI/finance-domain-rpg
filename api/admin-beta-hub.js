import { createClient } from "@supabase/supabase-js";

// Admin write surface for the Beta Tester Homebase (docs/TODO.md §12,
// database/migrations/037_add_beta_homebase.sql) — two entities in one route
// to stay under Vercel's Hobby-plan 12-Serverless-Functions-per-deployment
// cap (this repo hit 13 once already, see CLAUDE.md), same consolidation
// idiom api/seed.js already established (dispatch on a body field rather
// than one file per concern):
//
//   entity: "content" — checklist items + suggestion prompts (beta_content_items).
//     Same title/body/published shape as changelog_entries — CRUD mirrors
//     api/admin-changelog.js's GET/POST/DELETE-by-method pattern exactly.
//   entity: "score"   — a tester's rubric score (beta_scores). Upsert only
//     (no delete — clearing a score back to "not yet scored" is just saving
//     nulls). Deliberately admin-entered, not computed — docs/TODO.md §12.L's
//     "scoring stays manual, reviewed by a human" decision; this route is
//     what makes that manual judgment tester-visible, not what automates it.
//
// Same auth pattern as admin-changelog.js/admin-beta-report.js: verify the
// caller's Supabase session with the anon-key client, then re-check is_admin
// server-side (the client-side row gate in ProfilePanel is UX only) before
// touching the service-role client.

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

const CONTENT_KINDS = ["checklist", "suggestion"];

async function handleContentGet(req, res, adminClient) {
  const kind = req.query?.kind;
  if (!CONTENT_KINDS.includes(kind)) return res.status(400).json({ error: "Missing or invalid kind" });
  const { data, error } = await adminClient
    .from("beta_content_items")
    .select("id, kind, title, body, published_at, created_at, updated_at")
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Failed to load items" });
  return res.status(200).json({ items: data ?? [] });
}

async function handleContentSave(req, res, adminClient, adminUserId) {
  const { id, kind, title, body, published } = req.body ?? {};
  if (!CONTENT_KINDS.includes(kind)) return res.status(400).json({ error: "Missing or invalid kind" });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });

  if (id) {
    const { data: existing, error: fetchError } = await adminClient
      .from("beta_content_items")
      .select("published_at")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Item not found" });

    const wasPublished = existing.published_at != null;
    const publishedAt = published
      ? (wasPublished ? existing.published_at : new Date().toISOString())
      : null;

    const { data, error } = await adminClient
      .from("beta_content_items")
      .update({
        title: String(title).trim(),
        body: body != null ? String(body) : null,
        published_at: publishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: "Failed to update item" });
    return res.status(200).json({ item: data });
  }

  const { data, error } = await adminClient
    .from("beta_content_items")
    .insert({
      kind,
      title: String(title).trim(),
      body: body != null ? String(body) : null,
      published_at: published ? new Date().toISOString() : null,
      created_by: adminUserId,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: "Failed to create item" });
  return res.status(201).json({ item: data });
}

async function handleContentDelete(req, res, adminClient) {
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Missing id" });
  const { error } = await adminClient.from("beta_content_items").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Failed to delete item" });
  return res.status(200).json({ ok: true });
}

async function handleScoreSave(req, res, adminClient, adminUserId) {
  const { userId, usageScore, feedbackScore, callsScore, longevityScore, adminNotes } = req.body ?? {};
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const { data, error } = await adminClient
    .from("beta_scores")
    .upsert({
      user_id: userId,
      usage_score: usageScore ?? null,
      feedback_score: feedbackScore ?? null,
      calls_score: callsScore ?? null,
      longevity_score: longevityScore ?? null,
      admin_notes: adminNotes ?? null,
      updated_by: adminUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) return res.status(500).json({ error: "Failed to save score" });
  return res.status(200).json({ score: data });
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
    if (req.query?.entity !== "content") return res.status(400).json({ error: "Missing or invalid entity" });
    return handleContentGet(req, res, adminClient);
  }

  if (req.method === "POST") {
    const entity = req.body?.entity;
    if (entity === "content") return handleContentSave(req, res, adminClient, auth.userId);
    if (entity === "score") return handleScoreSave(req, res, adminClient, auth.userId);
    return res.status(400).json({ error: "Missing or invalid entity" });
  }

  if (req.method === "DELETE") {
    if (req.query?.entity !== "content") return res.status(400).json({ error: "Missing or invalid entity" });
    return handleContentDelete(req, res, adminClient);
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
