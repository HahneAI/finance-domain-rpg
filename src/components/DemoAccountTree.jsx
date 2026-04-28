import { useState } from "react";
import { iS, lS } from "./ui.jsx";
import { Shell } from "./LoginScreen.jsx";

// ── Local form helpers (Field + errBorder pattern from SetupWizard) ───────────

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

// ── Tree card button ──────────────────────────────────────────────────────────

function TreeCard({ title, sub, accent, onPress }) {
  const [pressed, setPressed]   = useState(false);
  const [flashing, setFlashing] = useState(false);

  function handleClick() {
    setPressed(true);
    if (!accent) {
      setFlashing(true);
      setTimeout(() => setFlashing(false), 150);
    }
    setTimeout(() => {
      setPressed(false);
      onPress?.();
    }, 100);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        width: "100%",
        background: "var(--color-bg-surface)",
        border: `1px solid ${flashing ? "var(--color-gold)" : accent ? "var(--color-border-accent)" : "var(--color-border-subtle)"}`,
        borderRadius: "12px",
        padding: "18px 16px",
        textAlign: "left",
        cursor: "pointer",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        transition: "transform 0.1s ease, border-color 0.15s ease",
      }}
    >
      <div style={{
        fontSize: "12px", fontWeight: "700",
        letterSpacing: "0.5px",
        color: accent ? "var(--color-gold)" : "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
      }}>
        {title}
      </div>
      {sub && (
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px", fontFamily: "var(--font-sans)" }}>
          {sub}
        </div>
      )}
    </button>
  );
}

// ── Registration form (§1.4) ──────────────────────────────────────────────────

function RegisterForm({ onRegister, onBack }) {
  const [form, setForm] = useState({
    name: "", email: "", password: "", confirm: "", company: "", city: "",
  });
  const [showPw, setShowPw]     = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [loading, setLoading]   = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function validate() {
    if (!form.name.trim())    return false;
    if (!form.email.trim())   return false;
    if (form.password.length < 8) return false;
    if (form.password !== form.confirm) return false;
    return true;
  }

  function pwMismatch() { return attempted && form.confirm && form.password !== form.confirm; }
  function pwShort()    { return attempted && form.password && form.password.length < 8; }

  async function handleSubmit(e) {
    e.preventDefault();
    setAttempted(true);
    if (!validate()) return;
    setLoading(true);
    // Phase 1: pass validated data up — Phase 2 wires createInvestorAccount() here
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

  const inputStyle = { ...iS, borderRadius: "8px" };

  return (
    <Shell title="Create Account" subtitle="Set up your investor profile.">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "4px" }}>

        <Field label="Your Name" error={attempted && !form.name.trim() ? "Required" : null}>
          <input
            type="text"
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
            style={{ ...inputStyle, ...errBorder(attempted && !form.name.trim()) }}
          />
        </Field>

        <Field label="Email" error={attempted && !form.email.trim() ? "Required" : null}>
          <input
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{ ...inputStyle, ...errBorder(attempted && !form.email.trim()) }}
          />
        </Field>

        <Field
          label="Password"
          error={
            pwShort()    ? "Must be at least 8 characters" :
            null
          }
        >
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              value={form.password}
              onChange={e => set("password", e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              style={{ ...inputStyle, paddingRight: "44px", ...errBorder(pwShort()) }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-secondary)", fontSize: "11px", letterSpacing: "0.5px",
              }}
            >
              {showPw ? "hide" : "show"}
            </button>
          </div>
        </Field>

        <Field label="Confirm Password" error={pwMismatch() ? "Passwords don't match" : null}>
          <input
            type={showPw ? "text" : "password"}
            value={form.confirm}
            onChange={e => set("confirm", e.target.value)}
            placeholder="Repeat password"
            autoComplete="new-password"
            style={{ ...inputStyle, ...errBorder(pwMismatch()) }}
          />
        </Field>

        <Field label="Company / LLC  (optional)">
          <input
            type="text"
            value={form.company}
            onChange={e => set("company", e.target.value)}
            placeholder="Your company or LLC name"
            autoComplete="organization"
            style={inputStyle}
          />
        </Field>

        <Field label="City  (optional)">
          <input
            type="text"
            value={form.city}
            onChange={e => set("city", e.target.value)}
            placeholder="Your city"
            autoComplete="address-level2"
            style={inputStyle}
          />
        </Field>

        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.6, marginTop: "2px" }}>
          You can return here with your email and password at any time.
        </div>

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
          {loading ? "Setting up…" : "Create Account & Continue"}
        </button>
      </form>

      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <button type="button" onClick={onBack} style={linkStyle}>← Back</button>
      </div>
    </Shell>
  );
}

// ── Tree view ─────────────────────────────────────────────────────────────────

function TreeView({ onCreateAccount, onBack }) {
  return (
    <Shell title="Demo Account Tree" subtitle="Choose an account to explore.">
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
        <TreeCard
          title="Demo Account 1"
          sub="Explore a sample financial profile"
          onPress={() => {}} // Phase 2: load demo fixture 1
        />
        <TreeCard
          title="Demo Account 2"
          sub="Explore a second sample profile"
          onPress={() => {}} // Phase 2: load demo fixture 2
        />
        <TreeCard
          title="Create Personal Account ✦"
          sub="Build your own financial dashboard"
          accent
          onPress={onCreateAccount}
        />
      </div>
      <div style={{ marginTop: "24px", textAlign: "center" }}>
        <button type="button" onClick={onBack} style={linkStyle}>← Welcome</button>
      </div>
    </Shell>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DemoAccountTree({ onRegister, onBack }) {
  const [view, setView] = useState("tree"); // "tree" | "register"

  if (view === "register") {
    return (
      <RegisterForm
        onRegister={onRegister}
        onBack={() => setView("tree")}
      />
    );
  }

  return (
    <TreeView
      onCreateAccount={() => setView("register")}
      onBack={onBack}
    />
  );
}

// ── Shared atom ───────────────────────────────────────────────────────────────

const linkStyle = {
  background: "transparent", border: "none",
  color: "var(--color-gold)", fontSize: "11px",
  cursor: "pointer", padding: 0, textDecoration: "underline",
};
