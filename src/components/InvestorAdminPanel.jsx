/**
 * InvestorAdminPanel — admin-only sub-view (ProfilePanel → "Investor Codes").
 * Lists all investor_codes rows, lets the admin toggle active/inactive and add
 * new codes, and shows a per-code registration log pulled from investor_users.
 *
 * Guard: only rendered when isAdmin === true. RLS enforces the same constraint
 * on the Supabase side (migration 013_investor_admin_policies.sql).
 */
import { useState, useEffect, useMemo } from "react";
import { SH, iS, lS } from "./ui.jsx";
import {
  fetchAllInvestorCodes,
  fetchAllInvestorUsers,
  setInvestorCodeActive,
  createInvestorCode,
} from "../lib/db.js";

function BackBar({ onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
      <button
        onClick={onBack}
        style={{
          background: "transparent", border: "none",
          color: "var(--color-gold)", cursor: "pointer",
          fontSize: "13px", padding: "4px 0",
          display: "flex", alignItems: "center", gap: "5px",
        }}
      >
        <span style={{ fontSize: "16px", lineHeight: 1 }}>‹</span>
        <span style={{ letterSpacing: "1.5px", textTransform: "uppercase", fontSize: "10px" }}>Profile</span>
      </button>
      <div style={{
        flex: 1, fontSize: "13px", fontWeight: "bold",
        letterSpacing: "1px", textTransform: "uppercase",
        color: "var(--color-text-primary)",
      }}>
        Investor Codes
      </div>
    </div>
  );
}

function ActiveBadge({ active }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
      fontWeight: "600", padding: "3px 8px", borderRadius: "4px",
      background: active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)",
      color: active ? "var(--color-green)" : "var(--color-red)",
      border: `1px solid ${active ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.25)"}`,
    }}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function UsageBadge({ count }) {
  if (count === 0) return (
    <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>No registrations</span>
  );
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase",
      fontWeight: "600", padding: "2px 8px", borderRadius: "4px",
      background: "rgba(0,200,150,0.10)",
      color: "var(--color-accent-primary)",
      border: "1px solid rgba(0,200,150,0.22)",
    }}>
      {count} registered
    </span>
  );
}

function InvestorRow({ investor }) {
  const date = investor.created_at
    ? new Date(investor.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "10px 16px", borderTop: "1px solid var(--color-border-subtle)",
      gap: "12px",
    }}>
      <div>
        <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text-primary)", marginBottom: "2px" }}>
          {investor.investor_name}
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
          {[investor.company_name, investor.city].filter(Boolean).join(" · ") || "No company / city"}
        </div>
      </div>
      <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", textAlign: "right", flexShrink: 0 }}>
        {date}
      </div>
    </div>
  );
}

function CodeCard({ code, investors, onToggle, toggling }) {
  const [expanded, setExpanded] = useState(false);
  const registered = useMemo(
    () => investors.filter(u => u.code_used === code.code),
    [investors, code.code]
  );
  const createdDate = code.created_at
    ? new Date(code.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <div style={{
      background: "var(--color-bg-surface)",
      border: `1px solid ${code.is_active ? "var(--color-border-subtle)" : "rgba(239,68,68,0.18)"}`,
      borderRadius: "12px",
      marginBottom: "12px",
      overflow: "hidden",
    }}>
      {/* Code header row */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
          <div style={{ minWidth: 0 }}>
            {/* Code text */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: "700", color: "var(--color-text-primary)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>
              {code.code}
            </div>
            {/* Label */}
            {code.label && (
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>
                {code.label}
              </div>
            )}
            {/* Notes */}
            {code.notes && (
              <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", fontStyle: "italic" }}>
                {code.notes}
              </div>
            )}
          </div>
          <ActiveBadge active={code.is_active} />
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <UsageBadge count={registered.length} />
          <span style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>Created {createdDate}</span>
        </div>

        {/* Actions row */}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center" }}>
          {/* Toggle active button */}
          <button
            onClick={() => onToggle(code.id, !code.is_active)}
            disabled={toggling}
            style={{
              fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase",
              fontWeight: "600", padding: "6px 12px", borderRadius: "8px",
              border: code.is_active
                ? "1px solid rgba(239,68,68,0.35)"
                : "1px solid rgba(34,197,94,0.35)",
              background: "transparent",
              color: code.is_active ? "var(--color-red)" : "var(--color-green)",
              cursor: toggling ? "not-allowed" : "pointer",
              opacity: toggling ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {toggling ? "Saving…" : code.is_active ? "Deactivate" : "Activate"}
          </button>

          {/* Expand registrations */}
          {registered.length > 0 && (
            <button
              onClick={() => setExpanded(p => !p)}
              style={{
                fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase",
                fontWeight: "600", padding: "6px 12px", borderRadius: "8px",
                border: "1px solid var(--color-border-subtle)",
                background: "transparent",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              {expanded ? "Hide" : `Show ${registered.length}`}
            </button>
          )}
        </div>
      </div>

      {/* Registration list (expanded) */}
      {expanded && registered.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border-subtle)" }}>
          <div style={{ padding: "8px 16px 4px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
            Registered investors
          </div>
          {registered.map(inv => (
            <InvestorRow key={inv.id} investor={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddCodeForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ code: "", label: "", notes: "" });
  const [state, setState] = useState({ loading: false, error: null });

  function handleCodeChange(e) {
    const v = e.target.value;
    if (/^[a-zA-Z]*$/.test(v)) setForm(p => ({ ...p, code: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.code.trim()) {
      setState({ loading: false, error: "Code is required." });
      return;
    }
    setState({ loading: true, error: null });
    try {
      const newCode = await createInvestorCode(form);
      setState({ loading: false, error: null });
      onAdd(newCode);
    } catch (err) {
      setState({ loading: false, error: err.message });
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: "var(--color-bg-surface)",
      border: "1px solid var(--color-border-accent)",
      borderRadius: "12px",
      padding: "16px",
      marginBottom: "16px",
    }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", marginBottom: "14px", fontWeight: "600" }}>
        New Access Code
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label style={{ ...lS, display: "block", marginBottom: "5px" }}>Code *</label>
        <input
          value={form.code}
          onChange={handleCodeChange}
          placeholder="e.g. LAUNCH"
          autoFocus
          style={{ ...iS, width: "100%", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "9px 12px", textTransform: "uppercase", letterSpacing: "2px" }}
        />
        <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", marginTop: "4px" }}>
          Letters only — stored and matched lowercase
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <label style={{ ...lS, display: "block", marginBottom: "5px" }}>Label</label>
        <input
          value={form.label}
          onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
          placeholder="e.g. NOLA Q3 Meeting"
          style={{ ...iS, width: "100%", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "9px 12px" }}
        />
      </div>

      <div style={{ marginBottom: "14px" }}>
        <label style={{ ...lS, display: "block", marginBottom: "5px" }}>Notes</label>
        <input
          value={form.notes}
          onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Optional — internal context"
          style={{ ...iS, width: "100%", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "9px 12px" }}
        />
      </div>

      {state.error && (
        <div style={{ fontSize: "12px", color: "var(--color-red)", marginBottom: "10px" }}>
          {state.error}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="submit"
          disabled={state.loading || !form.code.trim()}
          style={{
            flex: 1, padding: "9px 16px", borderRadius: "10px", border: "none",
            background: (state.loading || !form.code.trim()) ? "var(--color-bg-raised)" : "var(--color-accent-primary)",
            color: (state.loading || !form.code.trim()) ? "var(--color-text-disabled)" : "var(--color-bg-base)",
            fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase",
            fontWeight: "bold", cursor: (state.loading || !form.code.trim()) ? "not-allowed" : "pointer",
          }}
        >
          {state.loading ? "Creating…" : "Create Code"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "9px 16px", borderRadius: "10px",
            border: "1px solid var(--color-border-subtle)",
            background: "var(--color-bg-raised)",
            color: "var(--color-text-secondary)",
            fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function InvestorAdminPanel({ onBack }) {
  const [codes, setCodes] = useState(null);      // null = loading
  const [investors, setInvestors] = useState([]); // all investor_users
  const [loadError, setLoadError] = useState(null);
  const [togglingId, setTogglingId] = useState(null); // id currently being toggled
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [codesData, investorsData] = await Promise.all([
          fetchAllInvestorCodes(),
          fetchAllInvestorUsers(),
        ]);
        if (!cancelled) {
          setCodes(codesData);
          setInvestors(investorsData);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleToggle(id, newActive) {
    setTogglingId(id);
    try {
      await setInvestorCodeActive(id, newActive);
      setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: newActive } : c));
    } catch (err) {
      console.error("Toggle failed:", err.message);
    } finally {
      setTogglingId(null);
    }
  }

  function handleAdd(newCode) {
    setCodes(prev => [newCode, ...(prev ?? [])]);
    setShowAddForm(false);
  }

  const totalRegistered = investors.length;

  return (
    <div style={{ maxWidth: "520px" }}>
      <BackBar onBack={onBack} />

      {/* Summary row */}
      {codes !== null && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          {[
            { label: "Total Codes", value: codes.length },
            { label: "Active", value: codes.filter(c => c.is_active).length, color: "var(--color-green)" },
            { label: "Registered", value: totalRegistered, color: "var(--color-accent-primary)" },
          ].map(stat => (
            <div key={stat.label} style={{
              flex: 1, minWidth: "80px",
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "10px", padding: "12px 14px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "18px", fontWeight: "700", color: stat.color ?? "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)", marginTop: "3px" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add code */}
      {showAddForm ? (
        <AddCodeForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: "100%", padding: "11px 16px", borderRadius: "10px",
            border: "1px dashed rgba(0,200,150,0.4)",
            background: "rgba(0,200,150,0.06)",
            color: "var(--color-accent-primary)",
            fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase",
            fontWeight: "600", cursor: "pointer", marginBottom: "20px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          Add Access Code
        </button>
      )}

      <SH color="var(--color-gold)">Access Codes</SH>

      {/* Loading */}
      {codes === null && !loadError && (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: "12px", color: "var(--color-text-disabled)" }}>
          Loading…
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div style={{
          padding: "14px 16px", background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px",
          fontSize: "12px", color: "var(--color-red)", marginBottom: "16px",
        }}>
          Failed to load: {loadError}
        </div>
      )}

      {/* Empty */}
      {codes !== null && codes.length === 0 && (
        <div style={{ padding: "32px 0", textAlign: "center", fontSize: "12px", color: "var(--color-text-disabled)" }}>
          No codes yet. Create one above.
        </div>
      )}

      {/* Code list */}
      {(codes ?? []).map(code => (
        <CodeCard
          key={code.id}
          code={code}
          investors={investors}
          onToggle={handleToggle}
          toggling={togglingId === code.id}
        />
      ))}
    </div>
  );
}
