/**
 * LoginScreen — Auth entry point.
 *
 * Modes (internal state):
 *   "signin"   — email + password sign-in (default)
 *   "signup"   — create account
 *   "forgot"   — email-only form → sends password reset email
 *
 * Props:
 *   recoveryMode      — true when App.jsx detects PASSWORD_RECOVERY event (user clicked reset link)
 *   onRecoveryDone    — called after successful password update in recovery mode
 *
 * OAuth (Google + Apple) uses signInWithOAuth redirect flow —
 * no extra handling needed; onAuthStateChange in App.jsx fires on return.
 * Providers must be enabled in the Supabase dashboard under Authentication > Providers.
 */
import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { iS, lS } from "./ui.jsx";

// ── OAuth provider button ────────────────────────────────────────────────────

function OAuthBtn({ provider, label, icon, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
        width: "100%", padding: "11px 0",
        background: hovered ? "var(--color-bg-raised)" : "var(--color-bg-base)",
        border: "1px solid #2e2e2e", borderRadius: "8px",
        color: "var(--color-text-primary)", fontSize: "12px", fontWeight: "600",
        cursor: "pointer", transition: "background 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const GoogleIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

// const AppleIcon = (
//   <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
//     <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.27.07 2.15.73 2.88.78 1.09-.21 2.14-.9 3.29-.84 1.4.07 2.45.65 3.14 1.63-2.87 1.72-2.19 5.51.48 6.63-.57 1.56-1.32 3.1-1.79 4.66zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
//   </svg>
// ); // TODO: uncomment when Apple Developer account ($99/yr) is set up

// ── Divider ──────────────────────────────────────────────────────────────────

function Divider({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "4px 0" }}>
      <div style={{ flex: 1, height: "1px", background: "#222" }} />
      <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#444" }}>{label}</span>
      <div style={{ flex: 1, height: "1px", background: "#222" }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoginScreen({ recoveryMode = false, onRecoveryDone }) {
  const [mode, setMode]         = useState("signin"); // "signin" | "signup" | "forgot"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [info, setInfo]         = useState(null); // success / info messages

  const isSignUp = mode === "signup";

  // ── OAuth ─────────────────────────────────────────────────────────────────

  async function handleOAuth(provider) {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) setError(oauthError.message);
  }

  // ── Password recovery (redirected back from email link) ───────────────────

  async function handleSetNewPassword(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onRecoveryDone?.();
  }

  // ── Forgot password — send reset email ───────────────────────────────────

  async function handleForgot(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setInfo(`Reset link sent to ${email}. Check your inbox.`);
  }

  // ── Sign in / Sign up ─────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isSignUp) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (signUpError) { setError(signUpError.message); setLoading(false); return; }
      if (data.user) {
        await supabase.from("user_data").insert({ user_id: data.user.id });
      }
      if (!data.session) {
        setInfo(`Confirmation sent to ${email}. Click the link to activate your account.`);
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError(signInError.message); setLoading(false); return; }
    }

    setLoading(false);
  }

  // ── Shared wrapper ────────────────────────────────────────────────────────

  function Shell({ title, subtitle, children }) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: "360px", background: "var(--color-bg-surface)", border: "1px solid #222", borderRadius: "12px", padding: "32px 28px" }}>
          <div style={{ marginBottom: "28px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "4px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "6px" }}>Life RPG</div>
            <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-text-primary)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{subtitle}</div>}
          </div>
          {children}
        </div>
      </div>
    );
  }

  // ── Info / confirmation screen ────────────────────────────────────────────

  if (info) {
    return (
      <Shell title="Check your email">
        <div style={{ fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>{info}</div>
        <button
          onClick={() => { setInfo(null); setMode("signin"); }}
          style={{ marginTop: "20px", background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
        >
          ← Back to sign in
        </button>
      </Shell>
    );
  }

  // ── Recovery mode — set new password ─────────────────────────────────────

  if (recoveryMode) {
    return (
      <Shell title="Set new password" subtitle="Enter and confirm your new password.">
        <form onSubmit={handleSetNewPassword} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lS}>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lS}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <SubmitBtn loading={loading}>{loading ? "..." : "Update Password"}</SubmitBtn>
        </form>
      </Shell>
    );
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  if (mode === "forgot") {
    return (
      <Shell title="Reset password" subtitle="We'll email you a link to set a new password.">
        <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lS}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" style={{ ...iS, borderRadius: "8px" }} />
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <SubmitBtn loading={loading}>{loading ? "..." : "Send reset link"}</SubmitBtn>
        </form>
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <button onClick={() => { setMode("signin"); setError(null); }} style={linkBtnStyle}>← Back to sign in</button>
        </div>
      </Shell>
    );
  }

  // ── Sign in / Sign up ─────────────────────────────────────────────────────

  return (
    <Shell title={isSignUp ? "Create account" : "Sign in"}>

      {/* OAuth */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        <OAuthBtn provider="google" label="Continue with Google" icon={GoogleIcon} onClick={() => handleOAuth("google")} />
        {/* Apple Sign In — requires Apple Developer account ($99/yr); re-enable when ready:
        <OAuthBtn provider="apple" label="Continue with Apple" icon={AppleIcon} onClick={() => handleOAuth("apple")} /> */}
      </div>

      <Divider label="or" />

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "4px" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={lS}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" style={{ ...iS, borderRadius: "8px" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label style={lS}>Password</label>
            {!isSignUp && (
              <button type="button" onClick={() => { setMode("forgot"); setError(null); }} style={linkBtnStyle}>
                Forgot?
              </button>
            )}
          </div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isSignUp ? "At least 6 characters" : "Your password"} required autoComplete={isSignUp ? "new-password" : "current-password"} style={{ ...iS, borderRadius: "8px" }} />
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}

        <SubmitBtn loading={loading}>{loading ? "..." : isSignUp ? "Create account" : "Sign in"}</SubmitBtn>
      </form>

      {/* Mode toggle */}
      <div style={{ marginTop: "20px", textAlign: "center", fontSize: "11px", color: "var(--color-text-secondary)" }}>
        {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
        <button onClick={() => { setMode(isSignUp ? "signin" : "signup"); setError(null); }} style={linkBtnStyle}>
          {isSignUp ? "Sign in" : "Create one"}
        </button>
      </div>

    </Shell>
  );
}

// ── Tiny shared atoms (not worth exporting) ───────────────────────────────────

const linkBtnStyle = {
  background: "transparent", border: "none",
  color: "var(--color-gold)", fontSize: "11px",
  cursor: "pointer", padding: 0, textDecoration: "underline",
};

function ErrorBox({ children }) {
  return (
    <div style={{ padding: "10px 14px", background: "rgba(224,92,92,0.1)", border: "1px solid rgba(224,92,92,0.35)", borderRadius: "6px", fontSize: "11px", color: "var(--color-red)", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function SubmitBtn({ loading, children }) {
  return (
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
        transition: "background 0.15s", width: "100%",
      }}
    >
      {children}
    </button>
  );
}
