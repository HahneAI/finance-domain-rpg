/**
 * InvestorRegister — shown immediately after a valid investor code is entered.
 *
 * Creates the investor's Supabase account on submit (Phase 2).
 * Phase 1: validates fields and calls onRegister(formData) so App.jsx
 * can wire createInvestorAccount() once the DB layer exists.
 *
 * Returning investors who already have an account should use the
 * regular email + password form above the investor code section instead.
 */
import { useState } from "react";
import { iS, lS } from "./ui.jsx";
import { Shell } from "./LoginScreen.jsx";

function Field({ label, children, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ ...lS, ...(error ? { color: "var(--color-red)" } : {}) }}>{label}</label>
      {children}
      {error && (
        <div style={{ fontSize: "11px", color: "var(--color-red)", marginTop: "1px" }}>↑ {error}</div>
      )}
    </div>
  );
}

function errBorder(show) {
  return show ? { border: "1px solid var(--color-red)" } : {};
}

export function InvestorRegister({ onRegister, onBack }) {
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirm: "", company: "", city: "",
  });
  const [showPw, setShowPw]       = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const pwShort    = attempted && form.password.length > 0 && form.password.length < 8;
  const pwMismatch = attempted && form.confirm.length > 0 && form.password !== form.confirm;

  function validate() {
    return (
      form.name.trim().length > 0 &&
      form.email.trim().length > 0 &&
      form.password.length >= 8 &&
      form.password === form.confirm
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setAttempted(true);
    if (!validate()) return;
    setLoading(true);
    setError(null);
    // Phase 1: pass validated data up
    // Phase 2: replace with createInvestorAccount(formData) from supabase.js
    await new Promise(r => setTimeout(r, 0));
    setLoading(false);
    onRegister?.({
      name:    form.name.trim(),
      email:   form.email.trim(),
      password: form.password,
      company: form.company.trim() || null,
      city:    form.city.trim() || null,
    });
  }

  const inp = { ...iS, borderRadius: "8px" };

  return (
    <Shell title="Create Your Account" subtitle="You'll be able to explore demo accounts and set up your own.">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "4px" }}>

        <Field label="Your Name" error={attempted && !form.name.trim() ? "Required" : null}>
          <input
            type="text"
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
            style={{ ...inp, ...errBorder(attempted && !form.name.trim()) }}
          />
        </Field>

        <Field label="Email" error={attempted && !form.email.trim() ? "Required" : null}>
          <input
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{ ...inp, ...errBorder(attempted && !form.email.trim()) }}
          />
        </Field>

        <Field label="Password" error={pwShort ? "Must be at least 8 characters" : null}>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={e => set("password", e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              style={{ ...inp, paddingRight: "48px", ...errBorder(pwShort) }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-secondary)", fontSize: "11px", letterSpacing: "0.5px",
                padding: "0",
              }}
            >
              {showPw ? "hide" : "show"}
            </button>
          </div>
        </Field>

        <Field label="Confirm Password" error={pwMismatch ? "Passwords don't match" : null}>
          <input
            type={showPw ? "text" : "password"}
            value={form.confirm}
            onChange={e => set("confirm", e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
            style={{ ...inp, ...errBorder(pwMismatch) }}
          />
        </Field>

        <Field label="Company / LLC  (optional)">
          <input
            type="text"
            value={form.company}
            onChange={e => set("company", e.target.value)}
            placeholder="Your company or LLC name"
            autoComplete="organization"
            style={inp}
          />
        </Field>

        <Field label="City  (optional)">
          <input
            type="text"
            value={form.city}
            onChange={e => set("city", e.target.value)}
            placeholder="Your city"
            autoComplete="address-level2"
            style={inp}
          />
        </Field>

        {error && (
          <div style={{ padding: "10px 14px", background: "rgba(224,92,92,0.1)", border: "1px solid rgba(224,92,92,0.35)", borderRadius: "6px", fontSize: "11px", color: "var(--color-red)", lineHeight: 1.5 }}>
            {error}
          </div>
        )}

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
          {loading ? "Creating account…" : "Create Account & Continue"}
        </button>
      </form>

      <div style={{ marginTop: "16px", textAlign: "center", fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        Already have an investor account?{" "}
        <span style={{ color: "var(--color-text-primary)" }}>Sign in using the form above.</span>
      </div>

      <div style={{ marginTop: "12px", textAlign: "center" }}>
        <button type="button" onClick={onBack} style={linkStyle}>← Back</button>
      </div>
    </Shell>
  );
}

const linkStyle = {
  background: "transparent", border: "none",
  color: "var(--color-gold)", fontSize: "11px",
  cursor: "pointer", padding: 0, textDecoration: "underline",
};
