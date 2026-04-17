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

const resolveExpenseCycle = (exp, phaseIdx) => {
  const phaseBillingMeta = exp.billingMeta?.byPhase?.[phaseIdx];
  return normalizeCycle(phaseBillingMeta?.cycle ?? exp.billingMeta?.cycle ?? exp.cycle ?? "every30days");
};

const getBaseEntryAt = (exp, iso) => {
  const history = exp.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: exp.weekly ?? [0, 0, 0, 0] }];
  return history
    .filter(en => en.effectiveFrom <= iso)
    .reduce((b, en) => !b || en.effectiveFrom >= b.effectiveFrom ? en : b, null)
    ?? history[0];
};

const nextMonthIso = (iso) => {
  const [y, m] = iso.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PhaseAdvancedEditModal({ phaseIdx, expenses, cpm, TODAY_ISO, onSave, onClose }) {
  const phase = PHASES[phaseIdx];
  const months = QUARTER_MONTHS[phaseIdx];

  const [selectedMonthIdx, setSelectedMonthIdx] = useState(0);
  const [edits, setEdits]       = useState({});
  const [expandedExpId, setExpandedExpId] = useState(null);
  const [draftVals, setDraftVals] = useState({ amount: "", cycle: "every30days" });

  // { [expId]: 'month-only' | 'forward' }
  const [deletions, setDeletions] = useState({});
  // which row has the delete-choice popup open
  const [deletePopup, setDeletePopup] = useState(null);
  // which expId's "THIS MONTH ONLY" button is armed (red)
  const [monthOnlyArmed, setMonthOnlyArmed] = useState(null);

  // staged new expenses not yet committed
  const [additions, setAdditions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState({ label: "", amount: "", cycle: "every30days", category: "Needs" });

  const selectedMonthIso = months[selectedMonthIdx].iso;

  // ── Edit handlers ────────────────────────────────────────────
  const openEdit = (exp) => {
    setDeletePopup(null);
    setMonthOnlyArmed(null);
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
    setDeletions(prev => { const n = { ...prev }; delete n[expId]; return n; });
    setExpandedExpId(null);
  };

  const clearEdit = (expId) => {
    setEdits(prev => { const n = { ...prev }; delete n[expId]; return n; });
    setExpandedExpId(null);
  };

  // ── Delete handlers ──────────────────────────────────────────
  const openDeletePopup = (expId) => {
    setExpandedExpId(null);
    setMonthOnlyArmed(null);
    setDeletePopup(prev => prev === expId ? null : expId);
  };

  const stageDeletion = (expId, type) => {
    setDeletions(prev => ({ ...prev, [expId]: type }));
    setEdits(prev => { const n = { ...prev }; delete n[expId]; return n; });
    setDeletePopup(null);
    setMonthOnlyArmed(null);
  };

  const clearDeletion = (expId) => {
    setDeletions(prev => { const n = { ...prev }; delete n[expId]; return n; });
  };

  // ── Addition handlers ────────────────────────────────────────
  const stageAddition = () => {
    const amt = parseFloat(addDraft.amount);
    if (!addDraft.label.trim() || !amt || amt <= 0) return;
    setAdditions(prev => [...prev, {
      tempId: `new-${Date.now()}`,
      label: addDraft.label.trim(),
      category: addDraft.category,
      amount: addDraft.amount,
      cycle: addDraft.cycle,
    }]);
    setShowAddForm(false);
    setAddDraft({ label: "", amount: "", cycle: "every30days", category: "Needs" });
  };

  const removeAddition = (tempId) => {
    setAdditions(prev => prev.filter(a => a.tempId !== tempId));
  };

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = () => {
    const editPatches = Object.entries(edits).map(([expId, { amount, cycle }]) => {
      const exp = expenses.find(e => e.id === expId);
      if (!exp) return null;
      const baseWeekly = getBaseEntryAt(exp, selectedMonthIso)?.weekly ?? [0, 0, 0, 0];
      const perPaycheck = perPaycheckFromCycle(parseFloat(amount) || 0, cycle, cpm);
      const newWeekly = buildCascadedWeekly(phaseIdx, perPaycheck, baseWeekly, exp.billingMeta?.byPhase);
      const newByPhase = { ...(exp.billingMeta?.byPhase ?? {}), [phaseIdx]: { amount: parseFloat(amount), cycle, effectiveFrom: selectedMonthIso } };
      return { expId, effectiveFrom: selectedMonthIso, newWeekly, newByPhase };
    }).filter(Boolean);

    const deletionPatches = Object.entries(deletions).flatMap(([expId, type]) => {
      const exp = expenses.find(e => e.id === expId);
      if (!exp) return [];
      const baseWeekly = getBaseEntryAt(exp, selectedMonthIso)?.weekly ?? [0, 0, 0, 0];
      if (type === "forward") {
        const newWeekly = buildCascadedWeekly(phaseIdx, 0, baseWeekly, exp.billingMeta?.byPhase);
        const newByPhase = { ...(exp.billingMeta?.byPhase ?? {}), [phaseIdx]: { amount: 0, cycle: "every30days", effectiveFrom: selectedMonthIso } };
        return [{ expId, effectiveFrom: selectedMonthIso, newWeekly, newByPhase }];
      }
      // month-only: zero this month, restore at the following month
      const zeroWeekly = baseWeekly.map((w, q) => q === phaseIdx ? 0 : w);
      return [
        { expId, effectiveFrom: selectedMonthIso, newWeekly: zeroWeekly },
        { expId, effectiveFrom: nextMonthIso(selectedMonthIso), newWeekly: [...baseWeekly] },
      ];
    });

    const additionObjects = additions.map(a => {
      const amount = parseFloat(a.amount) || 0;
      const perPaycheck = perPaycheckFromCycle(amount, a.cycle, cpm);
      return {
        label: a.label,
        category: a.category,
        cycle: a.cycle,
        amount,
        effectiveFrom: selectedMonthIso,
        weekly: [0, 1, 2, 3].map(q => q >= phaseIdx ? perPaycheck : 0),
        phaseIdx,
      };
    });

    onSave({ patches: [...editPatches, ...deletionPatches], additions: additionObjects });
  };

  const hasStagedChanges = Object.keys(edits).length > 0 || Object.keys(deletions).length > 0 || additions.length > 0;
  const changeCount = Object.keys(edits).length + Object.keys(deletions).length + additions.length;

  const getDisplayAmount = (exp) => {
    if (deletions[exp.id]) return 0;
    const staged = edits[exp.id];
    if (staged) return perPaycheckFromCycle(parseFloat(staged.amount) || 0, staged.cycle, cpm);
    const baseEntry = getBaseEntryAt(exp, selectedMonthIso);
    return baseEntry?.weekly?.[phaseIdx] ?? getEffectiveAmount(exp, new Date(selectedMonthIso), phaseIdx);
  };

  const categories = ["Needs", "Lifestyle"];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        paddingTop: "calc(56px + env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "460px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "14px 14px 12px",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
          gap: "8px",
        }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-accent-primary)", letterSpacing: "0.5px", lineHeight: 1.1 }}>
              {phase.label}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", letterSpacing: "1.5px", textTransform: "uppercase", marginTop: "4px" }}>
              Monthly expense overrides
            </div>
          </div>
          <SmBtn onClick={onClose} style={{ padding: "3px 9px", minHeight: "28px", fontSize: "13px", lineHeight: 1, flexShrink: 0, marginTop: "2px" }}>✕</SmBtn>
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
              onClick={() => { setSelectedMonthIdx(mi); setExpandedExpId(null); setDeletePopup(null); setMonthOnlyArmed(null); }}
              bg={selectedMonthIdx === mi ? "var(--color-accent-primary)" : "var(--color-bg-raised)"}
              c={selectedMonthIdx === mi ? "#0a0a0a" : "var(--color-text-secondary)"}
              style={{ flex: 1, fontSize: "10px", letterSpacing: "1px", padding: "6px 4px", minHeight: "32px" }}
            >
              {m.label}
            </SmBtn>
          ))}
        </div>

        {/* ── Expense list ── */}
        <div style={{ overflowY: "scroll", flex: 1, padding: "12px 14px", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}>
          {categories.map(cat => {
            const catExps = expenses.filter(e => e.category === cat);
            const catAdditions = additions.filter(a => a.category === cat);
            if (!catExps.length && !catAdditions.length) return null;
            return (
              <div key={cat} style={{ marginBottom: "16px" }}>
                <SH color={CATEGORY_COLORS[cat]}>{cat}</SH>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>

                  {catExps.map(exp => {
                    const isExpanded   = expandedExpId === exp.id;
                    const isDeleteOpen = deletePopup === exp.id;
                    const isEdited     = !!edits[exp.id];
                    const isDeleted    = !!deletions[exp.id];
                    const displayAmt   = getDisplayAmount(exp);
                    const draftPerPaycheck = isExpanded
                      ? perPaycheckFromCycle(parseFloat(draftVals.amount) || 0, draftVals.cycle, cpm)
                      : displayAmt;

                    return (
                      <div
                        key={exp.id}
                        style={{
                          background: isDeleted
                            ? "rgba(239,68,68,0.06)"
                            : isEdited
                            ? "rgba(0,200,150,0.06)"
                            : "var(--color-bg-raised)",
                          border: `1px solid ${isDeleted ? "rgba(239,68,68,0.28)" : isEdited ? "rgba(0,200,150,0.28)" : "var(--color-border-subtle)"}`,
                          borderRadius: "8px",
                          padding: "10px 12px",
                        }}
                      >
                        {/* Collapsed header row */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: "12px",
                              color: isDeleted ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              textDecoration: isDeleted ? "line-through" : "none",
                            }}>
                              {exp.label}
                              {isEdited && <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-accent-primary)", letterSpacing: "1px" }}>CHANGED</span>}
                              {isDeleted && (
                                <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-red)", letterSpacing: "1px" }}>
                                  {deletions[exp.id] === "forward" ? "REMOVED →" : "THIS MONTH"}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: isDeleted ? "var(--color-red)" : isEdited ? "var(--color-accent-primary)" : "var(--color-text-secondary)", marginTop: "2px" }}>
                              {f2(displayAmt)}/wk
                            </div>
                          </div>

                          {/* Action buttons */}
                          {!isExpanded && !isDeleteOpen && (
                            <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                              {isDeleted ? (
                                <SmBtn
                                  onClick={() => clearDeletion(exp.id)}
                                  c="var(--color-text-secondary)"
                                  style={{ fontSize: "9px", letterSpacing: "1px", padding: "5px 10px", minHeight: "28px" }}
                                >
                                  UNDO
                                </SmBtn>
                              ) : (
                                <>
                                  <SmBtn
                                    onClick={() => openEdit(exp)}
                                    c="var(--color-accent-primary)"
                                    style={{ fontSize: "9px", letterSpacing: "1px", padding: "5px 10px", minHeight: "28px" }}
                                  >
                                    {isEdited ? "EDIT" : "CHANGE"}
                                  </SmBtn>
                                  <SmBtn
                                    onClick={() => openDeletePopup(exp.id)}
                                    c="var(--color-red)"
                                    style={{ fontSize: "9px", letterSpacing: "1px", padding: "5px 8px", minHeight: "28px" }}
                                  >
                                    DEL
                                  </SmBtn>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Delete confirmation popup */}
                        {isDeleteOpen && (
                          <div style={{ marginTop: "10px", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "10px" }}>
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "10px", letterSpacing: "0.3px" }}>
                              Remove <strong style={{ color: "var(--color-text-primary)" }}>{exp.label}</strong> from budget for:
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              <SmBtn
                                onClick={() => {
                                  if (monthOnlyArmed === exp.id) {
                                    stageDeletion(exp.id, "month-only");
                                  } else {
                                    setMonthOnlyArmed(exp.id);
                                  }
                                }}
                                bg={monthOnlyArmed === exp.id ? "var(--color-red)" : "var(--color-bg-raised)"}
                                c={monthOnlyArmed === exp.id ? "#fff" : "var(--color-text-primary)"}
                                style={{
                                  fontSize: "9px",
                                  letterSpacing: "1px",
                                  padding: "6px 10px",
                                  minHeight: "30px",
                                  transition: "background 0.15s ease, color 0.15s ease",
                                  border: monthOnlyArmed === exp.id ? "1px solid rgba(239,68,68,0.5)" : undefined,
                                }}
                              >
                                {monthOnlyArmed === exp.id ? "TAP AGAIN TO CONFIRM" : "THIS MONTH ONLY"}
                              </SmBtn>
                              <SmBtn
                                onClick={() => stageDeletion(exp.id, "forward")}
                                c="var(--color-red)"
                                style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 10px", minHeight: "30px" }}
                              >
                                FROM HERE FORWARD
                              </SmBtn>
                              <SmBtn
                                onClick={() => { setDeletePopup(null); setMonthOnlyArmed(null); }}
                                style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 10px", minHeight: "30px" }}
                              >
                                NEVERMIND
                              </SmBtn>
                            </div>
                          </div>
                        )}

                        {/* Expanded inline edit form */}
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
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
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
                              {isEdited && (
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

                  {/* Staged additions for this category */}
                  {catAdditions.map(a => (
                    <div
                      key={a.tempId}
                      style={{
                        background: "rgba(0,200,150,0.06)",
                        border: "1px solid rgba(0,200,150,0.28)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", color: "var(--color-text-primary)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {a.label}
                          <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-accent-primary)", letterSpacing: "1px" }}>NEW</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-accent-primary)", marginTop: "2px" }}>
                          {f2(perPaycheckFromCycle(parseFloat(a.amount) || 0, a.cycle, cpm))}/wk
                        </div>
                      </div>
                      <SmBtn
                        onClick={() => removeAddition(a.tempId)}
                        c="var(--color-text-secondary)"
                        style={{ fontSize: "9px", letterSpacing: "1px", padding: "5px 8px", minHeight: "28px", flexShrink: 0 }}
                      >
                        REMOVE
                      </SmBtn>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* ── Add expense ── */}
          <div style={{ marginTop: "4px", marginBottom: "8px" }}>
            {!showAddForm ? (
              <SmBtn
                onClick={() => setShowAddForm(true)}
                c="var(--color-accent-primary)"
                style={{ width: "100%", fontSize: "9px", letterSpacing: "1.5px", padding: "8px", minHeight: "36px" }}
              >
                + ADD EXPENSE
              </SmBtn>
            ) : (
              <div style={{
                background: "rgba(0,200,150,0.06)",
                border: "1px solid rgba(0,200,150,0.28)",
                borderRadius: "8px",
                padding: "12px",
              }}>
                <div style={{ fontSize: "9px", color: "var(--color-accent-primary)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>
                  New expense — effective {months[selectedMonthIdx].label}
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ ...lS }}>Expense Name</label>
                  <input
                    type="text"
                    value={addDraft.label}
                    onChange={e => setAddDraft(p => ({ ...p, label: e.target.value }))}
                    style={{ ...iS, width: "100%", marginTop: "4px" }}
                    placeholder="e.g. Netflix"
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <label style={{ ...lS }}>Amount ($)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={addDraft.amount}
                      onChange={e => setAddDraft(p => ({ ...p, amount: e.target.value }))}
                      style={{ ...iS, width: "100%", marginTop: "4px" }}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label style={{ ...lS }}>Paid Every</label>
                    <select
                      value={addDraft.cycle}
                      onChange={e => setAddDraft(p => ({ ...p, cycle: e.target.value }))}
                      style={{ ...iS, width: "100%", marginTop: "4px" }}
                    >
                      {EXPENSE_CYCLE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ ...lS }}>Category</label>
                  <select
                    value={addDraft.category}
                    onChange={e => setAddDraft(p => ({ ...p, category: e.target.value }))}
                    style={{ ...iS, width: "100%", marginTop: "4px" }}
                  >
                    <option value="Needs">Needs</option>
                    <option value="Lifestyle">Lifestyle</option>
                  </select>
                </div>
                {parseFloat(addDraft.amount) > 0 && (
                  <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>
                    Per-paycheck reserve: <span style={{ color: "var(--color-accent-primary)" }}>{f2(perPaycheckFromCycle(parseFloat(addDraft.amount) || 0, addDraft.cycle, cpm))}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: "6px" }}>
                  <SmBtn
                    onClick={stageAddition}
                    bg={addDraft.label.trim() && parseFloat(addDraft.amount) > 0 ? "var(--color-accent-primary)" : "var(--color-bg-raised)"}
                    c={addDraft.label.trim() && parseFloat(addDraft.amount) > 0 ? "#0a0a0a" : "var(--color-text-disabled)"}
                    style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 14px", minHeight: "30px", fontWeight: "bold", cursor: addDraft.label.trim() && parseFloat(addDraft.amount) > 0 ? "pointer" : "not-allowed" }}
                  >
                    ADD
                  </SmBtn>
                  <SmBtn
                    onClick={() => { setShowAddForm(false); setAddDraft({ label: "", amount: "", cycle: "every30days", category: "Needs" }); }}
                    style={{ fontSize: "9px", letterSpacing: "1px", padding: "6px 10px", minHeight: "30px" }}
                  >
                    CANCEL
                  </SmBtn>
                </div>
              </div>
            )}
          </div>

          {expenses.length === 0 && additions.length === 0 && (
            <div style={{ fontSize: "12px", color: "var(--color-text-disabled)", textAlign: "center", padding: "24px 0" }}>
              No expenses yet.
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
            onClick={hasStagedChanges ? handleSave : undefined}
            bg={hasStagedChanges ? "var(--color-accent-primary)" : "var(--color-bg-raised)"}
            c={hasStagedChanges ? "#0a0a0a" : "var(--color-text-disabled)"}
            style={{
              flex: 2,
              fontSize: "10px",
              letterSpacing: "1px",
              padding: "7px",
              minHeight: "36px",
              fontWeight: "bold",
              cursor: hasStagedChanges ? "pointer" : "not-allowed",
            }}
          >
            SAVE CHANGES{hasStagedChanges ? ` (${changeCount})` : ""}
          </SmBtn>
        </div>
      </div>
    </div>
  );
}
