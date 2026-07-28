/**
 * LoginScreen — Auth entry point.
 *
 * Modes (internal state):
 *   "signin"   — email + password sign-in (default)
 *   "signup"   — create account
 *   "forgot"   — email-only form → sends password reset email
 *   "revive"   — §17.I: the email matches an archived (non-payment-deleted)
 *                account. Supabase returns the same generic error for
 *                wrong-password and no-such-user, so every failed sign-in is
 *                checked against api/revival-lookup; a match routes here
 *                instead of the generic error. Email accounts set a NEW
 *                password (deliberately no restriction on reusing the old
 *                one); OAuth accounts just Continue with Google again. Either
 *                way the resulting SIGNED_IN lands on App's ReviveScreen —
 *                access itself only returns after a successful charge.
 *
 * Props:
 *   recoveryMode      — true when App.jsx detects PASSWORD_RECOVERY event (user clicked reset link)
 *   onRecoveryDone    — called after successful password update in recovery mode
 *
 * OAuth (Google + Apple) uses signInWithOAuth redirect flow —
 * no extra handling needed; onAuthStateChange in App.jsx fires on return.
 * Providers must be enabled in the Supabase dashboard under Authentication > Providers.
 *
 * Animation: mode crossfades (signin ↔ signup ↔ forgot ↔ revive, etc) via opacity fade.
 */
import { useEffect, useState, useRef } from "react";
import { supabase, validateInvestorCode } from "../lib/supabase.js";
import { recordConsent } from "../lib/db.js";
import { CURRENT_LEGAL_VERSION, TERMS_OF_SERVICE_MARKDOWN, PRIVACY_POLICY_MARKDOWN } from "../constants/legalDocuments.js";
import { iS, lS } from "./ui.jsx";
import { LegalDocumentModal } from "./LegalDocumentModal.jsx";

// Key used to hand the "I agreed" intent across the OAuth redirect boundary —
// clicking "Continue with Google" on the signup tab navigates the whole page
// away, so there's no in-memory state to carry the checkbox's value forward.
// App.jsx's SIGNED_IN handler consumes and clears this once the account is
// confirmed to exist; sessionStorage (not localStorage) so it can't outlive
// the tab that set it.
export const PENDING_CONSENT_STORAGE_KEY = "pendingConsentVersion";

// ── Mode crossfade wrapper — smooth opacity transitions between login modes ───
// For form modes (signin/signup/forgot/revive/info/recovery), fade new mode in
// without keeping prev mode in the DOM (which would confuse testing/accessibility).
function ModeFade({ modeKey, children, ms = 200 }) {
  const [cur, setCur] = useState({ key: modeKey, node: children });

  useEffect(() => {
    if (modeKey !== cur.key) {
      setCur({ key: modeKey, node: children });
    } else if (children !== cur.node) {
      setCur({ key: modeKey, node: children });
    }
  }, [modeKey, children]);

  return (
    <div key={cur.key} className="login-fade-in">
      {cur.node}
    </div>
  );
}

// ── OAuth provider button ────────────────────────────────────────────────────

function OAuthBtn({ label, icon, onClick }) {
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
      <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-primary)" }}>{label}</span>
      <div style={{ flex: 1, height: "1px", background: "#222" }} />
    </div>
  );
}

// ── Shared wrapper (exported for investor auth screens) ───────────────────────

export function Shell({ title, subtitle, children }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-base)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "360px", background: "var(--color-bg-surface)", border: "1px solid #222", borderRadius: "12px", padding: "32px 28px" }}>
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <div style={{ fontSize: "11px", letterSpacing: "4px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "16px" }}>Authority Finance</div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-text-primary)", textAlign: "left" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px", textAlign: "left" }}>{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoginScreen({ recoveryMode = false, onRecoveryDone, onInvestorVerified, oauthCallbackFailed = false, onOauthRetry }) {
  const [mode, setMode]         = useState("signin"); // "signin" | "signup" | "forgot" | "revive"
  const [reviveProvider, setReviveProvider] = useState(null); // oauth provider from revival-lookup, e.g. "google"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [info, setInfo]         = useState(null); // success / info messages

  // ── Terms of Service / Privacy Policy consent (signup only) ────────────────
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModalDoc, setLegalModalDoc] = useState(null); // null | "terms" | "privacy"

  // Google sign-in redirected back here without completing — explain it instead of
  // silently showing a blank form (see App.jsx's oauthCallbackFailed detection).
  useEffect(() => {
    if (oauthCallbackFailed) setError("Google sign-in didn't finish — please tap Continue with Google again.");
  }, [oauthCallbackFailed]);

  // ── Investor code section ─────────────────────────────────────────────────
  const [investorCode, setInvestorCode]       = useState("");
  const [investorLoading, setInvestorLoading] = useState(false);
  const [investorError, setInvestorError]     = useState(null);
  const [investorShake, setInvestorShake]     = useState(false);

  const isSignUp = mode === "signup";

  // ── OAuth ─────────────────────────────────────────────────────────────────

  async function handleOAuth(provider) {
    setError(null);

    // Consent gate — signup tab only, same requirement as the email/password
    // path below. Checked before onOauthRetry/the redirect itself so a
    // rejected attempt doesn't clear oauthCallbackFailed or navigate away.
    if (isSignUp && !agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    onOauthRetry?.();

    const options = { redirectTo: window.location.origin };
    if (provider === "google" && isSignUp) {
      // Force the Google account chooser when we're on the Create Account tab,
      // otherwise Google silently reuses whatever account already has access.
      options.queryParams = { prompt: "select_account" };
    }

    if (isSignUp) {
      // Hand the agreed-to version across the full-page OAuth redirect —
      // App.jsx's SIGNED_IN handler reads and clears this once the session
      // is confirmed. See PENDING_CONSENT_STORAGE_KEY's comment above.
      try { window.sessionStorage.setItem(PENDING_CONSENT_STORAGE_KEY, CURRENT_LEGAL_VERSION); } catch { /* private mode etc. */ }
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options,
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

    if (isSignUp && !agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

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
        // Direct write, not the OAuth path's sessionStorage handoff — this
        // handler already has the user id in hand, no redirect boundary to
        // cross. See recordConsent's own comment for why a raw client insert
        // is safe here (RLS + server-forced timestamp).
        await recordConsent(data.user.id, CURRENT_LEGAL_VERSION);
      }
      if (!data.session) {
        setInfo(`Confirmation sent to ${email}. Click the link to activate your account.`);
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // §17.I — a deleted-for-non-payment account fails sign-in exactly like
        // a wrong password (the auth user row is gone). Check the tombstone
        // before surfacing the generic error; lookup failures fall through to
        // the normal error so this can never block a regular login.
        const revival = await lookupRevivable(email);
        if (revival) {
          setReviveProvider(revival.oauthProvider ?? null);
          setMode("revive");
          setError(null);
          setLoading(false);
          return;
        }
        setError(signInError.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
  }

  // ── §17.I Revive: create the replacement auth account ─────────────────────
  // New password only — the old auth user was hard-deleted. On success the
  // SIGNED_IN event fires and App.jsx's revival check routes to ReviveScreen
  // (payment + data restore). If email confirmation is required there's no
  // session yet; after confirming and signing in, the same SIGNED_IN path
  // still lands on ReviveScreen — nothing is lost.
  async function handleReviveSignUp(e) {
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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password: newPassword,
      options: { emailRedirectTo: window.location.origin },
    });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from("user_data").insert({ user_id: data.user.id });
    }
    if (!data.session) {
      setInfo(`Confirmation sent to ${email}. Click the link, then sign in to continue restoring your account.`);
    }
    setLoading(false);
  }

  async function handleInvestorSubmit() {
    if (!investorCode.trim() || investorLoading) return;
    setInvestorLoading(true);
    setInvestorError(null);
    const valid = await validateInvestorCode(investorCode);
    setInvestorLoading(false);
    if (valid) {
      onInvestorVerified?.(investorCode.trim().toLowerCase());
    } else {
      setInvestorError("Invalid code.");
      setInvestorShake(true);
      setTimeout(() => setInvestorShake(false), 350);
    }
  }

  // ── Screen rendering ─────────────────────────────────────────────────────
  // Determine the screen key and content to render. ModeFade crossfades when
  // the key changes (e.g., signin → forgot, signup → info, recovery → signin).
  let screenKey = "signin";
  let screenTitle = "Sign in";
  let screenSubtitle = undefined;
  let screenContent = null;

  if (info) {
    screenKey = "info";
    screenTitle = "Check your email";
    screenContent = (
      <div style={{ fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.7 }}>
        {info}
        <button
          onClick={() => { setInfo(null); setMode("signin"); }}
          style={{ display: "block", marginTop: "20px", background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
        >
          ← Back to sign in
        </button>
      </div>
    );
  } else if (recoveryMode) {
    screenKey = "recovery";
    screenTitle = "Set new password";
    screenSubtitle = "Enter and confirm your new password.";
    screenContent = (
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
    );
  } else if (mode === "revive") {
    screenKey = "revive";
    screenTitle = "Welcome back";
    screenSubtitle = "This email belongs to an account that was closed for non-payment — but your data was saved.";
    screenContent = (
      <>
        {reviveProvider === "google" ? (
          <>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "18px" }}>
              Sign back in with Google to restore your account. You'll pick a
              plan and re-subscribe — your income setup, budget, goals, and
              history come back as soon as your payment goes through.
            </div>
            <OAuthBtn label="Continue with Google" icon={GoogleIcon} onClick={() => handleOAuth("google")} />
            {error && <div style={{ marginTop: "14px" }}><ErrorBox>{error}</ErrorBox></div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "18px" }}>
              Set a new password for <span style={{ color: "var(--color-text-primary)" }}>{email}</span> to
              continue. You'll then pick a plan and re-subscribe — your income
              setup, budget, goals, and history come back as soon as your
              payment goes through.
            </div>
            <form onSubmit={handleReviveSignUp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={lS}>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={lS}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
              </div>
              {error && <ErrorBox>{error}</ErrorBox>}
              <SubmitBtn loading={loading}>{loading ? "..." : "Continue"}</SubmitBtn>
            </form>
          </>
        )}
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <button onClick={() => { setMode("signin"); setError(null); }} style={linkBtnStyle}>← Back to sign in</button>
        </div>
      </>
    );
  } else if (mode === "forgot") {
    screenKey = "forgot";
    screenTitle = "Reset password";
    screenSubtitle = "We'll email you a link to set a new password.";
    screenContent = (
      <>
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
      </>
    );
  } else {
    // Default: signin or signup
    screenKey = isSignUp ? "signup" : "signin";
    screenTitle = isSignUp ? "Create account" : "Sign in";
    screenContent = (
      <>
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

        {isSignUp && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "var(--color-teal)", cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
              I have read and agree to the{" "}
              <button type="button" onClick={() => setLegalModalDoc("terms")} style={linkBtnStyle}>Terms of Service</button>
              {" "}and{" "}
              <button type="button" onClick={() => setLegalModalDoc("privacy")} style={linkBtnStyle}>Privacy Policy</button>.
            </span>
          </label>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <SubmitBtn loading={loading}>{loading ? "..." : isSignUp ? "Create account" : "Sign in"}</SubmitBtn>
      </form>

      <div style={{ marginTop: "20px" }}>
        <Divider label="or continue with" />
      </div>

      {/* OAuth */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
        <OAuthBtn provider="google" label="Continue with Google" icon={GoogleIcon} onClick={() => handleOAuth("google")} />
        {/* Apple Sign In — requires Apple Developer account ($99/yr); re-enable when ready:
        <OAuthBtn provider="apple" label="Continue with Apple" icon={AppleIcon} onClick={() => handleOAuth("apple")} /> */}
      </div>

      {/* Mode toggle */}
      <div style={{ marginTop: "20px", textAlign: "center", fontSize: "11px", color: "var(--color-text-secondary)" }}>
        {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
        <button onClick={() => { setMode(isSignUp ? "signin" : "signup"); setError(null); }} style={linkBtnStyle}>
          {isSignUp ? "Sign in" : "Create one"}
        </button>
      </div>

      {/* ── Investor access ───────────────────────────────────────────────── */}
      {!isSignUp && (
        <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid #1a1a1a" }}>
          <style>{`@keyframes investorShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}`}</style>
          <div style={{ marginBottom: "12px" }}>
            <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--color-green)", textDecoration: "underline", letterSpacing: "1px" }}>I</span>
            <span style={{ fontSize: "10px", fontWeight: "600", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>NVESTOR</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input
              type="text"
              value={investorCode}
              onChange={e => {
                setInvestorCode(e.target.value.replace(/[^a-zA-Z]/g, ""));
                setInvestorError(null);
              }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleInvestorSubmit(); } }}
              placeholder="enter access code"
              autoComplete="off"
              style={{
                ...iS,
                borderRadius: "8px",
                border: investorError ? "1px solid var(--color-deduction)" : "1px solid var(--color-border-subtle)",
                animation: investorShake ? "investorShake 0.3s ease" : "none",
              }}
            />
            {investorError && (
              <div style={{ fontSize: "11px", color: "var(--color-deduction)", letterSpacing: "0.3px" }}>{investorError}</div>
            )}
            <button
              type="button"
              disabled={investorLoading || !investorCode}
              onClick={handleInvestorSubmit}
              style={{
                background: investorLoading ? "var(--color-bg-raised)" : "var(--color-green)",
                color: investorLoading ? "var(--color-text-disabled)" : "var(--color-bg-base)",
                border: "none", borderRadius: "8px",
                padding: "11px 0", fontSize: "11px",
                letterSpacing: "2px", textTransform: "uppercase",
                fontWeight: "bold",
                cursor: (investorLoading || !investorCode) ? "default" : "pointer",
                transition: "background 0.15s", width: "100%",
                opacity: !investorCode ? 0.45 : 1,
              }}
            >
              {investorLoading ? "Verifying…" : "Access"}
            </button>
          </div>
        </div>
      )}
    </>
    );
  }

  // Wrap all screen content in ModeFade and Shell
  return (
    <>
      <Shell title={screenTitle} subtitle={screenSubtitle}>
        <ModeFade modeKey={screenKey}>
          {screenContent}
        </ModeFade>
      </Shell>
      <LegalDocumentModal
        open={legalModalDoc === "terms"}
        title="Terms of Service"
        markdown={TERMS_OF_SERVICE_MARKDOWN}
        onClose={() => setLegalModalDoc(null)}
      />
      <LegalDocumentModal
        open={legalModalDoc === "privacy"}
        title="Privacy Policy"
        markdown={PRIVACY_POLICY_MARKDOWN}
        onClose={() => setLegalModalDoc(null)}
      />
    </>
  );
}

// §17.I — unauthenticated tombstone check (deleted_accounts is service-role
// only, so this goes through api/revival-lookup). Returns { revivable,
// oauthProvider } or null; any failure resolves null so the normal sign-in
// error still shows.
async function lookupRevivable(email) {
  try {
    const res = await fetch("/api/revival-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    return payload?.revivable ? payload : null;
  } catch {
    return null;
  }
}

// ── Tiny shared atoms (not worth exporting) ───────────────────────────────────

const linkBtnStyle = {
  background: "transparent", border: "none",
  color: "var(--color-teal)", fontSize: "11px",
  cursor: "pointer", padding: 0, textDecoration: "underline",
};

function ErrorBox({ children }) {
  return (
    <div style={{ padding: "10px 14px", background: "rgba(224,92,92,0.1)", border: "1px solid rgba(224,92,92,0.35)", borderRadius: "6px", fontSize: "11px", color: "var(--color-deduction)", lineHeight: 1.5 }}>
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
        background: loading ? "var(--color-bg-raised)" : "var(--color-teal)",
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
