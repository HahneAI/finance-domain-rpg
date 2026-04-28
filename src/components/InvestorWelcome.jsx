import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { iS, lS } from "./ui.jsx";
import { Shell } from "./LoginScreen.jsx";

const linkStyle = {
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

function PrimaryBtn({ loading, disabled, onClick, children, type = "button" }) {
  return (
    <button
      type={type}
      disabled={loading || disabled}
      onClick={onClick}
      style={{
        background: loading ? "var(--color-bg-raised)" : "var(--color-gold)",
        color: loading ? "var(--color-text-disabled)" : "var(--color-bg-base)",
        border: "none", borderRadius: "8px",
        padding: "13px 0", fontSize: "11px",
        letterSpacing: "2px", textTransform: "uppercase",
        fontWeight: "bold", cursor: (loading || disabled) ? "default" : "pointer",
        transition: "background 0.15s", width: "100%",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "var(--color-bg-raised)",
        color: "var(--color-text-primary)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "8px", padding: "13px 0",
        fontSize: "11px", letterSpacing: "2px",
        textTransform: "uppercase", fontWeight: "600",
        cursor: "pointer", transition: "background 0.15s",
        width: "100%",
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function InvestorWelcome({ onCreateAccount, onBack }) {
  const [view, setView]         = useState("welcome"); // "welcome" | "login"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  function goToWelcome() {
    setView("welcome");
    setError(null);
    setEmail("");
    setPassword("");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message);
    // On success: App.jsx onAuthStateChange fires → authedUser set → app renders
  }

  // ── Login form ────────────────────────────────────────────────────────────

  if (view === "login") {
    return (
      <Shell title="Welcome back." subtitle="Sign in to your investor account.">
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "4px" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={lS}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              required
              autoComplete="current-password"
              style={{ ...iS, borderRadius: "8px" }}
            />
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <PrimaryBtn loading={loading} type="submit">
            {loading ? "Signing in…" : "Sign In"}
          </PrimaryBtn>
        </form>
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <button type="button" onClick={goToWelcome} style={linkStyle}>← Back</button>
        </div>
      </Shell>
    );
  }

  // ── Welcome screen ────────────────────────────────────────────────────────

  return (
    <Shell title="Welcome." subtitle="Investor Access">
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
        <SecondaryBtn onClick={() => setView("login")}>Log In</SecondaryBtn>
        <PrimaryBtn onClick={onCreateAccount}>Create Account</PrimaryBtn>
      </div>
      <div style={{ marginTop: "24px", textAlign: "center" }}>
        <button type="button" onClick={onBack} style={linkStyle}>← Back</button>
      </div>
    </Shell>
  );
}
