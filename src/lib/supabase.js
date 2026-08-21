import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// iOS Safari PWA runs in an isolated storage partition — localStorage set in the
// regular browser tab is NOT visible when the app is launched from the home screen.
// Cookies, however, ARE shared across the same origin. We dual-write: localStorage
// (normal browsers / localhost) + cookie (iOS PWA cross-context pickup).
// If the session JSON exceeds the ~4KB cookie limit we silently skip the cookie write
// and fall back to localStorage only.
const sharedStorage = {
  getItem(key) {
    try {
      const rx = new RegExp("(?:^|; )" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)");
      const m = document.cookie.match(rx);
      if (m) {
        const val = decodeURIComponent(m[1]);
        JSON.parse(val); // validate before trusting it
        return val;
      }
    } catch { /* ignore cookie parse errors */ }
    try { return window.localStorage.getItem(key); } catch { /* ignore */ }
    return null;
  },
  setItem(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* ignore quota errors */ }
    try {
      const encoded = encodeURIComponent(value);
      if (encoded.length < 3800) { // stay under the 4096-byte per-cookie limit
        const secure = location.protocol === "https:" ? ";Secure" : "";
        document.cookie = `${key}=${encoded};max-age=${365 * 24 * 3600};path=/;SameSite=Lax${secure}`;
      }
    } catch { /* ignore cookie write errors */ }
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    try { document.cookie = `${key}=;max-age=0;path=/`; } catch { /* ignore */ }
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: sharedStorage, persistSession: true, autoRefreshToken: true },
});

/**
 * Returns the authenticated user's UUID, or null if not signed in.
 * Used by db.js for all queries — no hardcoded USER_ID anywhere.
 */
export async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  if (data.user?.id) return data.user.id;
  // getUser() hit the network (/auth/v1/user) and returned no user. That is NOT
  // proof the account is signed out: right after a deploy reload the access token
  // can be mid-refresh, or the round-trip can transiently fail, and getUser()
  // surfaces either as a null user WITHOUT throwing. Trusting that null made
  // loadUserData() fall through to its brand-new-account branch (DEFAULT_CONFIG,
  // setupComplete:false), reopening the setup wizard for an existing user — and
  // overwriting their real saved row if they completed it. This is the same
  // destructive "existing account mistaken for new" failure the PGRST116 guard in
  // loadUserData() closed for query errors, reached through the auth probe instead.
  // Fall back to the persisted session (a local storage read — the same source of
  // truth the auth gate uses via onAuthStateChange): if a real session exists, the
  // user IS signed in regardless of the getUser() blip, and the data queries below
  // still enforce identity through RLS on the access token. Only a genuinely absent
  // session (real sign-out — supabase-js clears storage on SIGNED_OUT) returns null.
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// Kept in sync via onAuthStateChange so db.js's unload-time save
// (flushUserDataKeepalive) can read the current access token + user id
// synchronously — no await. That matters because pagehide/visibilitychange
// fire in a context where the page can be torn down before an async
// getSession() promise would resolve; the flush has to dispatch its fetch()
// immediately for the keepalive flag to have any chance of helping.
let cachedAuthSnapshot = { accessToken: null, userId: null };
supabase.auth.onAuthStateChange((_event, session) => {
  cachedAuthSnapshot = {
    accessToken: session?.access_token ?? null,
    userId: session?.user?.id ?? null,
  };
});

export function getCachedAuthSnapshot() {
  return cachedAuthSnapshot;
}

/**
 * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED,
 * PASSWORD_RECOVERY, etc.). Callback receives (event, user).
 * Returns the unsubscribe function — call it in the useEffect cleanup.
 *
 * Usage in App.jsx:
 *   const unsub = onAuthChange((event, user) => { ... });
 *   return () => unsub();
 */
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}

/**
 * Validates an investor access code against the investor_codes table.
 * Comparison is case-insensitive. Returns true if the code exists and
 * is_active = true, false otherwise (including on network error).
 */
export async function validateInvestorCode(code) {
  const { data, error } = await supabase
    .from("investor_codes")
    .select("id")
    .eq("code", code.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  if (error) return false;
  return data !== null;
}
