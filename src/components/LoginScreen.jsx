/**
 * LoginScreen — Sign in or create account via Supabase email/password auth.
 *
 * Sign In:  supabase.auth.signInWithPassword() → onAuthStateChange fires in App.jsx
 * Sign Up:  supabase.auth.signUp() → seeds user_data row → may require email confirm
 *
 * After a successful sign-in, App.jsx's onAuthStateChange handler updates authedUser
 * and this screen unmounts automatically — no explicit callback needed for sign-in.
 * signUp passes the new user to onAuth so App.jsx can start loading their data
 * immediately (for Supabase projects with email confirmation disabled).
 */
import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { iS, lS } from "./ui.jsx";

export function LoginScreen() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const isSignUp = mode === "signup";

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // Seed the user_data row so loadUserData finds a record on first login.
      // If email confirmation is enabled, data.session will be null here but
      // the insert still works because the anon key allows inserts (RLS not yet enabled).
      // Once RLS is on, signUp auto-signs the user in so auth.uid() will match.
      if (data.user) {
        await supabase.from("user_data").insert({ user_id: data.user.id });
      }
      // If Supabase requires email confirmation, session will be null — show the prompt.
      // If auto-confirm is on, onAuthStateChange in App.jsx fires and loads the dashboard.
      if (!data.session) {
        setConfirmSent(true);
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      // Success — onAuthStateChange in App.jsx handles the rest. No state change needed here.
    }

    setLoading(false);
  }

  if (confirmSent) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--color-bg-base)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}>
        <div style={{ maxWidth: "360px", width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: "11px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>
            Check your email
          </div>
          <div style={{ fontSize: "14px", color: "var(--color-text-primary)", lineHeight: 1.6 }}>
            A confirmation link was sent to <strong>{email}</strong>.<br />
            Click it to activate your account, then come back and sign in.
          </div>
          <button
            onClick={() => { setConfirmSent(false); setMode("signin"); }}
            style={{ marginTop: "24px", background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--color-bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: "360px",
        background: "var(--color-bg-surface)",
        border: "1px solid #222", borderRadius: "12px",
        padding: "32px 28px",
      }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "9px", letterSpacing: "4px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "6px" }}>
            Life RPG
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
            {isSignUp ? "Create account" : "Sign in"}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lS}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              style={{ ...iS, borderRadius: "8px" }}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lS}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isSignUp ? "At least 6 characters" : "Your password"}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
              style={{ ...iS, borderRadius: "8px" }}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", background: "rgba(224,92,92,0.1)",
              border: "1px solid rgba(224,92,92,0.35)", borderRadius: "6px",
              fontSize: "11px", color: "var(--color-red)", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "4px",
              background: loading ? "var(--color-bg-raised)" : "var(--color-gold)",
              color: loading ? "var(--color-text-disabled)" : "var(--color-bg-base)",
              border: "none", borderRadius: "8px",
              padding: "13px 0", fontSize: "11px",
              letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold", cursor: loading ? "default" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        {/* Mode toggle */}
        <div style={{ marginTop: "20px", textAlign: "center", fontSize: "11px", color: "var(--color-text-secondary)" }}>
          {isSignUp ? "Already have an account?" : "No account yet?"}
          {" "}
          <button
            onClick={() => { setMode(isSignUp ? "signin" : "signup"); setError(null); }}
            style={{ background: "transparent", border: "none", color: "var(--color-gold)", fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </div>

      </div>
    </div>
  );
}
