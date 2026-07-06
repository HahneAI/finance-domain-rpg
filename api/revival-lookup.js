import { createClient } from "@supabase/supabase-js";

// §17.I — is this email an archived, revivable account? deleted_accounts is
// service-role-only (RLS with no policies), so the client can never query it
// directly; this route is the only read path.
//
// Two calling modes:
//   1. Unauthenticated (body { email }) — LoginScreen calls this after a
//      failed sign-in, since Supabase returns the same generic error for
//      wrong-password and no-such-user. Returns ONLY { revivable,
//      oauthProvider } — never archived data. This is deliberately an
//      existence oracle ("this email had an account deleted for non-payment");
//      accepted trade-off per the §I spec, since without it a deleted user
//      just sees "Invalid login credentials" forever. The provider hint is
//      needed so the revive form knows to show "Continue with Google" instead
//      of a password field.
//   2. Authenticated (Authorization: Bearer <token>) — App.jsx calls this on
//      SIGNED_IN before syncUserProfile can seed a fresh trial (the OAuth
//      short-circuit). The email is taken from the verified session, never
//      the body, and the response adds the archived identity
//      (displayName/avatarUrl/plan) for the Revive screen.
//
// Only tombstones with revived_at IS NULL count — a consumed tombstone means
// the account already came back; the email behaves like any other.

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
    return res.status(500).json({ error: "Server configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let email = null;
  let authenticated = false;
  if (token) {
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user?.email) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    email = authData.user.email;
    authenticated = true;
  } else {
    email = typeof req.body?.email === "string" ? req.body.email.trim() : null;
    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tombstone, error: lookupError } = await adminClient
    .from("deleted_accounts")
    .select("email, oauth_provider, display_name, avatar_url, plan, revived_at")
    .eq("email", email)
    .is("revived_at", null)
    .maybeSingle();
  if (lookupError) {
    console.error("revival-lookup failed:", lookupError.message);
    return res.status(500).json({ error: "Lookup failed" });
  }

  if (!tombstone) {
    return res.status(200).json({ revivable: false });
  }

  const base = { revivable: true, oauthProvider: tombstone.oauth_provider ?? null };
  if (!authenticated) {
    return res.status(200).json(base);
  }
  return res.status(200).json({
    ...base,
    email: tombstone.email,
    displayName: tombstone.display_name ?? null,
    avatarUrl: tombstone.avatar_url ?? null,
    plan: tombstone.plan ?? null,
  });
}
