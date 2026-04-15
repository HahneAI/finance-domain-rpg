import { useState } from "react";
import { PHASES, CATEGORY_COLORS, FISCAL_YEAR_START } from "../constants/config.js";
import { getEffectiveAmount } from "../lib/finance.js";
import { SmBtn, SH, iS, lS } from "./ui.jsx";

// Cascade rule: phases before phaseIdx untouched; phaseIdx and forward get
// perPaycheck unless that future phase already has an explicit byPhase override.
function buildCascadedWeekly(phaseIdx, perPaycheck, baseWeekly, existingByPhase) {
  return [0, 1, 2, 3].map(q => {
    if (q < phaseIdx) return baseWeekly[q] ?? 0;
    if (q === phaseIdx) return perPaycheck;
    return existingByPhase?.[q] ? (baseWeekly[q] ?? 0) : perPaycheck;
  });
}

// ─── Month definitions per quarter (2026 fiscal year) ────────────────────────
const QUARTER_MONTHS = [
  [{ label: "January",   iso: "2026-01-01" }, { label: "February",  iso: "2026-02-01" }, { label: "March",     iso: "2026-03-01" }],
  [{ label: "April",     iso: "2026-04-01" }, { label: "May",       iso: "2026-05-01" }, { label: "June",      iso: "2026-06-01" }],
  [{ label: "July",      iso: "2026-07-01" }, { label: "August",    iso: "2026-08-01" }, { label: "September", iso: "2026-09-01" }],
  [{ label: "October",   iso: "2026-10-01" }, { label: "November",  iso: "2026-11-01" }, { label: "December",  iso: "2026-12-01" }],
];

// ─── Math helpers (mirrored from BudgetPanel module scope) ───────────────────
const EXPENSE_CYCLE_OPTIONS = [
  { value: "weekly",      label: "Weekly" },
  { value: "biweekly",    label: "Biweekly" },
  { value: "every30days", label: "Every 30 days" },
  { value: "yearly",      label: "Yearly" },
];
const normalizeCycle = (c) => EXPENSE_CYCLE_OPTIONS.find(o => o.value === c) ? c : "every30days";
const roundToQuarter = (n) => Math.round(n * 4) / 4;
const toMonthlyCost = (amount, cycle) => {
  const c = normalizeCycle(cycle);
  if (c === "every30days") return amount;
  if (c === "weekly")      return amount * 4;
  if (c === "biweekly")    return amount * 2;
  if (c === "yearly")      return amount / 12;
  return amount;
};
const fromMonthlyCost = (monthly, cycle) => {
  const c = normalizeCycle(cycle);
  if (c === "every30days") return monthly;
  if (c === "weekly")      return monthly / 4;
  if (c === "biweekly")    return monthly / 2;
  if (c === "yearly")      return monthly * 12;
  return monthly;
};
const perPaycheckFromCycle = (amount, cycle, cpm) => roundToQuarter(toMonthlyCost(amount, cycle) / cpm);
const cycleAmountFromPerPaycheck = (perPaycheck, cycle, cpm) =>
  fromMonthlyCost(roundToQuarter(perPaycheck * cpm), cycle);

const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Resolve cycle for an expense in a given phase
const resolveExpenseCycle = (exp, phaseIdx) => {
  const phaseBillingMeta = exp.billingMeta?.byPhase?.[phaseIdx];
  return normalizeCycle(phaseBillingMeta?.cycle ?? exp.billingMeta?.cycle ?? exp.cycle ?? "every30days");
};

// Find the most-recent history entry effective at or before a given ISO date
const getBaseEntryAt = (exp, iso) => {
  const history = exp.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: exp.weekly ?? [0, 0, 0, 0] }];
  return history
    .filter(en => en.effectiveFrom <= iso)
    .reduce((b, en) => !b || en.effectiveFrom >= b.effectiveFrom ? en : b, null)
    ?? history[0];
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PhaseAdvancedEditModal({ phaseIdx, expenses, cpm, TODAY_ISO, onSave, onClose }) {
  const phase = PHASES[phaseIdx];
  const months = QUARTER_MONTHS[phaseIdx];

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  // edits: { [expId]: { amount: string, cycle: string } } — staged until SAVE
  const [edits, setEdits] = useState({});
  const [expandedExpId, setExpandedExpId] = useState(null);
  // Local draft state for the currently open edit row
  const [draftVals, setDraftVals] = useState({ amount: "", cycle: "every30days" });

  const selectedMonthIso = months[selectedMonthIdx].iso;

  // Group expenses by category for display
  const categories = ["Needs", "Lifestyle"];

  const openEdit = (exp) => {
    const staged = edits[exp.id];
    if (staged) {
      setDraftVals({ amount: staged.amount, cycle: staged.cycle });
    } else {
      const cycle = resolveExpenseCycle(exp, phaseIdx);
      const baseEntry = getBaseEntryAt(exp, selectedMonthIso);
      const perPaycheck = baseEntry?.weekly?.[phaseIdx] ?? 0;
      setDraftVals({
        amount: cycleAmountFromPerPaycheck(perPaycheck, cycle, cpm).toFixed(2),
        cycle,
      });
    }
    setExpandedExpId(exp.id);
  };

  const stageEdit = (expId) => {
    setEdits(prev => ({ ...prev, [expId]: { amount: draftVals.amount, cycle: draftVals.cycle } }));
    setExpandedExpId(null);
  };

  const clearEdit = (expId) => {
    setEdits(prev => { const next = { ...prev }; delete next[expId]; return next; });
    setExpandedExpId(null);
  };

  const handleSave = () => {
    const patches = Object.entries(edits).map(([expId, { amount, cycle }]) => {
      const exp = expenses.find(e => e.id === expId);
      if (!exp) return null;
      const baseEntry = getBaseEntryAt(exp, selectedMonthIso);
      const baseWeekly = baseEntry?.weekly ?? [0, 0, 0, 0];
      const perPaycheck = perPaycheckFromCycle(parseFloat(amount) || 0, cycle, cpm);
      const newWeekly = buildCascadedWeekly(phaseIdx, perPaycheck, baseWeekly, exp.billingMeta?.byPhase);
      const newByPhase = {
        ...(exp.billingMeta?.byPhase ?? {}),
        [phaseIdx]: { amount: parseFloat(amount), cycle, effectiveFrom: selectedMonthIso },
      };
      return { expId, effectiveFrom: selectedMonthIso, newWeekly, newByPhase };
    }).filter(Boolean);

    onSave(patches);
  };

  const hasStagedEdits = Object.keys(edits).length > 0;

  // Compute current display amount for an expense at selectedMonthIso
  const getDisplayAmount = (exp) => {
    const staged = edits[exp.id];
    if (staged) {
      return perPaycheckFromCycle(parseFloat(staged.amount) || 0, staged.cycle, cpm);
    }
    const baseEntry = getBaseEntryAt(exp, selectedMonthIso);
    return baseEntry?.weekly?.[phaseIdx] ?? getEffectiveAmount(exp, new Date(selectedMonthIso), phaseIdx);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Safe-area padding so modal clears Dynamic Island top + home indicator bottom
        padding: "max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Modal card — stop click from closing when clicking inside */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "460px",
          // svh excludes browser chrome; subtract both safe-area paddings so modal never clips
          maxHeight: "calc(100svh - max(16px, env(safe-area-inset-top, 0px)) - max(16px, env(safe-area-inset-bottom, 0px)) - 16px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px 8px",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", fontWeight: "bold" }}>
            ADV. EDIT — {phase.label}
          </div>
          <SmBtn onClick={onClose} style={{ padding: "3px 9px", minHeight: "28px", fontSize: "13px", lineHeight: 1, flexShrink: 0 }}>✕</SmBtn>
        </div>

        {/* ── Month selector ── */}
        <div style={{
          display: "flex",
          gap: "8px",
          padding: "8px 14px",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}>
          {months.map((m, mi) => (
            <SmBtn
              key={m.iso}
              onClick={() => { setSelectedMonthIdx(mi); setExpandedExpId(null); }}
              bg={selectedMonthIdx === mi ? "var(--color-accent-primary)" : "var(--color-bg-raised)"}
              c={selectedMonthIdx === mi ? "#0a0a0a" : "var(--color-text-secondary)"}
              style={{ flex: 1, fontSize: "10px", letterSpacing: "1px", padding: "6px 4px", minHeight: "32px" }}
            >
              {m.label}
            </SmBtn>
          ))}
        </div>

        {/* ── Expense list ── */}
        <div style={{ overflowY: "scroll", flex: 1, padding: "12px 18px", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}>
          {categories.map(cat => {
            const catExps = expenses.filter(e => e.category === cat);
            if (!catExps.length) return null;
            return (
              <div key={cat} style={{ marginBottom: "16px" }}>
                <SH color={CATEGORY_COLORS[cat]}>{cat}</SH>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {catExps.map(exp => {
                    const isExpanded = expandedExpId === exp.id;
                    const isStaged = !!edits[exp.id];
                    const displayAmt = getDisplayAmount(exp);
                    const cycle = isStaged ? edits[exp.id].cycle : resolveExpenseCycle(exp, phaseIdx);
                    const draftPerPaycheck = isExpanded
                      ? perPaycheckFromCycle(parseFloat(draftVals.amount) || 0, draftVals.cycle, cpm)
                      : displayAmt;

                    return (
                      <div
                        key={exp.id}
                        style={{
                          background: isStaged ? "rgba(0,200,150,0.06)" : "var(--color-bg-raised)",
                          border: `1px solid ${isStaged ? "rgba(0,200,150,0.28)" : "var(--color-border-subtle)"}`,
                          borderRadius: "8px",
                          padding: "10px 12px",
                        }}
                      >
                        {/* Collapsed row */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px", color: "var(--color-text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {exp.label}
                              {isStaged && (
                                <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-accent-primary)", letterSpacing: "1px" }}>CHANGED</span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: isStaged ? "var(--color-accent-primary)" : "var(--color-text-secondary)", marginTop: "2px" }}>
                              {f2(displayAmt)}/wk
                            </div>
                          </div>
                          {!isExpanded && (
                            <SmBtn
                              onClick={() => openEdit(exp)}
                              c="var(--color-accent-primary)"
                              style={{ fontSize: "9px", letterSpacing: "1px", padding: "5px 10px", minHeight: "28px" }}
                            >
                              {isStaged ? "EDIT" : "CHANGE"}
                            </SmBtn>
                          )}
                        </div>

                        {/* Expanded inline edit */}
                        {isExpanded && (
                          <div style={{ marginTop: "10px", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "10px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                              <div>
                                <label style={{ ...lS }}>Bill Amount ($)</label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={draftVals.amount}
                                  onChange={e => setDraftVals(prev => ({ ...prev, amount: e.target.value }))}
                                  style={{ ...iS, width: "100%", marginTop: "4px" }}
                                  placeholder="0.00"
                                />
                              </div>
                              <div>
                                <label style={{ ...lS }}>Paid Every</label>
                                <select
                                  value={draftVals.cycle}
                                  onChange={e => setDraftVals(prev => ({ ...prev, cycle: e.target.value }))}
                                  style={{ ...iS, width: "100%", marginTop: "4px" }}
                                >
                                  {EXPENSE_CYCLE_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>
                              Per-paycheck reserve: <span style={{ color: "var(--color-accent-primary)" }}>{f2(draftPerPaycheck)}</span>
                            </div>
                            <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px", letterSpacing: "0.5px" }}>
                              Effective from {months[selectedMonthIdx].label} · cascades through Q{phaseIdx + 1}–Q4
                            </div>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <SmBtn
                                onClick={() => stageEdit(exp.id)}
                                bg="var(--color-accent-primary)"
                                c="#0a0a0a"
                                style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 14px", minHeight: "30px", fontWeight: "bold" }}
                              >
                                DONE
                              </SmBtn>
                              {isStaged && (
                                <SmBtn
                                  onClick={() => clearEdit(exp.id)}
                                  c="var(--color-red)"
                                  style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 10px", minHeight: "30px" }}
                                >
                                  CLEAR
                                </SmBtn>
                              )}
                              <SmBtn
                                onClick={() => setExpandedExpId(null)}
                                style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 10px", minHeight: "30px" }}
                              >
                                CANCEL
                              </SmBtn>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {expenses.length === 0 && (
            <div style={{ fontSize: "12px", color: "var(--color-text-disabled)", textAlign: "center", padding: "24px 0" }}>
              No expenses to edit.
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: "flex",
          gap: "8px",
          padding: "8px 14px",
          borderTop: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}>
          <SmBtn
            onClick={onClose}
            style={{ flex: 1, fontSize: "10px", letterSpacing: "1px", padding: "7px", minHeight: "36px" }}
          >
            CANCEL
          </SmBtn>
          <SmBtn
            onClick={hasStagedEdits ? handleSave : undefined}
            bg={hasStagedEdits ? "var(--color-accent-primary)" : "var(--color-bg-raised)"}
            c={hasStagedEdits ? "#0a0a0a" : "var(--color-text-disabled)"}
            style={{
              flex: 2,
              fontSize: "10px",
              letterSpacing: "1px",
              padding: "7px",
              minHeight: "36px",
              fontWeight: "bold",
              cursor: hasStagedEdits ? "pointer" : "not-allowed",
            }}
          >
            SAVE CHANGES{hasStagedEdits ? ` (${Object.keys(edits).length})` : ""}
          </SmBtn>
        </div>
      </div>
    </div>
  );
}
