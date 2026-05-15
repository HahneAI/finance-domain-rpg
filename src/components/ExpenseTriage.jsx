import { useEffect, useMemo } from "react";
import { CATEGORY_COLORS } from "../constants/config.js";

/**
 * ExpenseTriage — modal sheet launched from the Job Loss banner.
 *
 * Lets the user mark each loaded expense as Active / Paused / Cancelled
 * (TODO §15.C3). Paused and Cancelled expenses drop out of forward
 * projections via the App.jsx + BudgetPanel filter. Per-expense
 * "Auto-reactivate on income resume" toggle controls whether Back to
 * Work restores the row to Active.
 *
 * Category-based priority badge:
 *   Essential = "Needs" (rent, food, utilities, insurance)
 *   Flexible  = "Lifestyle" (subscriptions, entertainment)
 * Bulk action: Pause all Flexible.
 */

const STATUS_OPTIONS = [
  { v: "active",    label: "Active",   color: "var(--color-green)" },
  { v: "paused",    label: "Paused",   color: "var(--color-warning)" },
  { v: "cancelled", label: "Cancelled", color: "var(--color-deduction)" },
];

function isFlexibleCategory(cat) {
  return cat === "Lifestyle";
}

export function ExpenseTriage({ open, onClose, expenses, setExpenses }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sortedExpenses = useMemo(() => {
    if (!expenses) return [];
    // Group Essential first so the user lands on the priority items.
    return [...expenses].sort((a, b) => {
      const aEss = !isFlexibleCategory(a.category);
      const bEss = !isFlexibleCategory(b.category);
      if (aEss !== bEss) return aEss ? -1 : 1;
      return (a.label ?? "").localeCompare(b.label ?? "");
    });
  }, [expenses]);

  if (!open) return null;

  const setStatus = (id, status) => {
    setExpenses(prev => prev.map(exp => (
      exp.id === id ? { ...exp, jobLossStatus: status } : exp
    )));
  };

  const toggleAutoReactivate = (id) => {
    setExpenses(prev => prev.map(exp => (
      exp.id === id
        ? { ...exp, autoReactivateOnIncome: !(exp.autoReactivateOnIncome ?? true) }
        : exp
    )));
  };

  const pauseAllFlexible = () => {
    setExpenses(prev => prev.map(exp => (
      isFlexibleCategory(exp.category) && (exp.jobLossStatus ?? "active") === "active"
        ? { ...exp, jobLossStatus: "paused" }
        : exp
    )));
  };

  const flexibleActiveCount = expenses.filter(exp => (
    isFlexibleCategory(exp.category) && (exp.jobLossStatus ?? "active") === "active"
  )).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          width: "100%", maxWidth: "520px",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          animation: "weekCardIn 220ms ease-out",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-warning)", textTransform: "uppercase", marginBottom: "5px" }}>
                Job Loss Mode
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
                Triage Expenses
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px", lineHeight: 1.4 }}>
                Paused or cancelled rows drop out of projections until you exit Job Loss Mode.
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "var(--color-bg-raised)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "8px",
                color: "var(--color-text-secondary)",
                width: "32px", height: "32px",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          </div>

          {flexibleActiveCount > 0 && (
            <button
              onClick={pauseAllFlexible}
              style={{
                marginTop: "12px",
                background: "rgba(245,158,11,0.10)",
                color: "var(--color-warning)",
                border: "1px solid rgba(245,158,11,0.32)",
                borderRadius: "10px",
                padding: "7px 14px",
                fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Pause all Flexible ({flexibleActiveCount})
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", padding: "12px 16px" }}>
          {sortedExpenses.length === 0 ? (
            <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "12px" }}>
              No expenses loaded. Add expenses in the Budget panel to triage them here.
            </div>
          ) : (
            sortedExpenses.map((exp) => {
              const status = exp.jobLossStatus ?? "active";
              const flexible = isFlexibleCategory(exp.category);
              const monthly = exp.billingMeta?.amount ?? null;
              const autoReactivate = exp.autoReactivateOnIncome ?? true;
              const catColor = CATEGORY_COLORS[exp.category] ?? "var(--color-text-secondary)";
              return (
                <div
                  key={exp.id}
                  style={{
                    marginBottom: "10px",
                    background: "var(--color-bg-raised)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    opacity: status === "cancelled" ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                          {exp.label ?? "Untitled"}
                        </span>
                        <span style={{
                          fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                          color: flexible ? "var(--color-bg-base)" : "var(--color-text-primary)",
                          background: flexible ? "var(--color-warning)" : catColor,
                          padding: "2px 6px", borderRadius: "3px", fontWeight: "bold",
                        }}>
                          {flexible ? "Flexible" : "Essential"}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                        {exp.category ?? "—"}{monthly != null ? ` · $${Number(monthly).toLocaleString()}/mo` : ""}
                      </div>
                    </div>
                  </div>

                  {/* Three-state toggle */}
                  <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                    {STATUS_OPTIONS.map(opt => {
                      const active = status === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setStatus(exp.id, opt.v)}
                          style={{
                            flex: 1,
                            padding: "7px 10px",
                            fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                            background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-surface)",
                            color: active ? opt.color : "var(--color-text-secondary)",
                            border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                            borderRadius: "10px",
                            cursor: "pointer",
                            fontWeight: active ? 700 : 500,
                            transition: "background 0.15s, border-color 0.15s, color 0.15s",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Auto-reactivate toggle — only meaningful when paused/cancelled */}
                  {status !== "active" && (
                    <label style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      marginTop: "10px",
                      fontSize: "11px", color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={autoReactivate}
                        onChange={() => toggleAutoReactivate(exp.id)}
                        style={{ accentColor: "var(--color-accent-primary)", width: "14px", height: "14px", cursor: "pointer" }}
                      />
                      Auto-reactivate when I'm back to work
                    </label>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--color-gold)",
              color: "var(--color-bg-base)",
              border: "none", borderRadius: "12px",
              padding: "8px 18px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold", cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
