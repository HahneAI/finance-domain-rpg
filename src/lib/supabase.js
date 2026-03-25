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
    } catch {}
    try { return window.localStorage.getItem(key); } catch {}
    return null;
  },
  setItem(key, value) {
    try { window.localStorage.setItem(key, value); } catch {}
    try {
      const encoded = encodeURIComponent(value);
      if (encoded.length < 3800) { // stay under the 4096-byte per-cookie limit
        const secure = location.protocol === "https:" ? ";Secure" : "";
        document.cookie = `${key}=${encoded};max-age=${365 * 24 * 3600};path=/;SameSite=Lax${secure}`;
      }
    } catch {}
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); } catch {}
    try { document.cookie = `${key}=;max-age=0;path=/`; } catch {}
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
  return data.user?.id ?? null;
}

/**
 * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.).
 * Returns the unsubscribe function — call it in the useEffect cleanup.
 *
 * Usage in App.jsx:
 *   const unsub = onAuthChange((user) => setAuthedUser(user));
 *   return () => unsub();
 */
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}
