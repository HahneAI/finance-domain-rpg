import { useState } from "react";
import { CATEGORY_COLORS } from "../constants/config.js";
import { getEffectiveAmount } from "../lib/finance.js";
import { getBaseEntryAt, buildAdvancedEditPayload, EXPENSE_CYCLE_OPTIONS, perPaycheckFromCycle, cycleAmountFromPerPaycheck } from "../lib/expense.js";
import { SmBtn, SH, iS, lS } from "./ui.jsx";

const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const resolveExpenseCycle = (exp, phaseIdx) => {
  const phaseMeta = exp.billingMeta?.byPhase?.[phaseIdx];
  const raw = phaseMeta?.cycle ?? exp.billingMeta?.cycle ?? exp.cycle ?? "every30days";
  return EXPENSE_CYCLE_OPTIONS.find(o => o.value === raw) ? raw : "every30days";
};

// Inline card that replaces PhaseAdvancedEditModal without an overlay.
// selectedMonthIso: "YYYY-MM-01" full ISO date of the month to edit
export function BulkEditPanel({ phaseIdx, selectedMonthIso, expenses, cpm, onSave, onClose }) {
  const [edits, setEdits] = useState({});
  const [expandedExpId, setExpandedExpId] = useState(null);
  const [draftVals, setDraftVals] = useState({ amount: "", cycle: "every30days" });
  const [draftScope, setDraftScope] = useState("forward");
  const [deletions, setDeletions] = useState({});
  const [deletePopup, setDeletePopup] = useState(null);
  const [monthOnlyArmed, setMonthOnlyArmed] = useState(null);
  const [additions, setAdditions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState({ label: "", amount: "", cycle: "every30days", category: "Needs" });

  // ── Month label for hint text ─────────────────────────────────────────────
  const monthLabel = (() => {
    const m = parseInt(selectedMonthIso.slice(5, 7), 10);
    return ["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1] ?? "";
  })();

  // ── Edit handlers ─────────────────────────────────────────────────────────
  const openEdit = (exp) => {
    setDeletePopup(null);
    setMonthOnlyArmed(null);
    const staged = edits[exp.id];
    if (staged) {
      setDraftVals({ amount: staged.amount, cycle: staged.cycle });
      setDraftScope(staged.scope ?? "forward");
    } else {
      const cycle = resolveExpenseCycle(exp, phaseIdx);
      const baseEntry = getBaseEntryAt(exp, selectedMonthIso);
      const perPaycheck = baseEntry?.weekly?.[phaseIdx] ?? 0;
      setDraftVals({
        amount: cycleAmountFromPerPaycheck(perPaycheck, cycle, cpm).toFixed(2),
        cycle,
      });
      setDraftScope("forward");
    }
    setExpandedExpId(exp.id);
  };

  const stageEdit = (expId) => {
    setEdits(prev => ({ ...prev, [expId]: { amount: draftVals.amount, cycle: draftVals.cycle, scope: draftScope } }));
    setDeletions(prev => { const n = { ...prev }; delete n[expId]; return n; });
    setExpandedExpId(null);
  };

  const clearEdit = (expId) => {
    setEdits(prev => { const n = { ...prev }; delete n[expId]; return n; });
    setExpandedExpId(null);
  };

  // ── Delete handlers ───────────────────────────────────────────────────────
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

  // ── Addition handlers ─────────────────────────────────────────────────────
  const stageAddition = () => {
    const amt = parseFloat(addDraft.amount);
    if (!addDraft.label.trim() || !amt || amt <= 0) return;
    setAdditions(prev => [...prev, {
      tempId: `new-${crypto.randomUUID()}`,
      label: addDraft.label.trim(),
      category: addDraft.category,
      amount: addDraft.amount,
      cycle: addDraft.cycle,
    }]);
    setShowAddForm(false);
    setAddDraft({ label: "", amount: "", cycle: "every30days", category: "Needs" });
  };

  const removeAddition = (tempId) => setAdditions(prev => prev.filter(a => a.tempId !== tempId));

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    onSave(buildAdvancedEditPayload({ edits, deletions, additions, expenses, monthIso: selectedMonthIso, phaseIdx, cpm }));
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
    <div style={{
      background: "var(--color-bg-surface)",
      border: "1px solid var(--color-border-subtle)",
      borderRadius: "14px",
      marginBottom: "16px",
      overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 14px 10px",
        borderBottom: "1px solid var(--color-border-subtle)",
      }}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-accent-primary)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            Bulk edit — {monthLabel}
          </div>
          <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "1px", textTransform: "uppercase", marginTop: "2px" }}>
            Stage changes then save all at once
          </div>
        </div>
        <SmBtn
          onClick={onClose}
          style={{ padding: "3px 9px", minHeight: "28px", fontSize: "12px", lineHeight: 1, flexShrink: 0 }}
        >
          ✕
        </SmBtn>
      </div>

      {/* ── Expense list ── */}
      <div style={{ padding: "12px 14px" }}>
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
                  const isInactive   = displayAmt === 0 && !isEdited && !isDeleted;
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
                        opacity: isInactive ? 0.55 : 1,
                      }}
                    >
                      {/* Collapsed row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: "12px",
                            color: isDeleted ? "var(--color-text-disabled)" : isInactive ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textDecoration: isDeleted ? "line-through" : "none",
                          }}>
                            {exp.label}
                            {isEdited && (
                              <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-accent-primary)", letterSpacing: "1px" }}>
                                {edits[exp.id]?.scope === "month-only" ? "THIS MONTH" : "CHANGED →"}
                              </span>
                            )}
                            {isDeleted && (
                              <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-red)", letterSpacing: "1px" }}>
                                {deletions[exp.id] === "forward" ? "REMOVED →" : "THIS MONTH"}
                              </span>
                            )}
                            {isInactive && <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--color-text-disabled)", letterSpacing: "1px" }}>INACTIVE</span>}
                          </div>
                          <div style={{ fontSize: "11px", color: isDeleted ? "var(--color-red)" : isEdited ? "var(--color-accent-primary)" : "var(--color-text-secondary)", marginTop: "2px" }}>
                            {f2(displayAmt)}/wk
                          </div>
                        </div>

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
                            ) : isInactive ? (
                              <SmBtn
                                onClick={() => openEdit(exp)}
                                c="var(--color-text-secondary)"
                                style={{ fontSize: "9px", letterSpacing: "1px", padding: "5px 10px", minHeight: "28px" }}
                              >
                                SET AMOUNT
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

                      {/* Delete confirmation */}
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
                                fontSize: "9px", letterSpacing: "1px", padding: "6px 10px", minHeight: "30px",
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

                      {/* Inline edit form */}
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
                          {/* Scope toggle */}
                          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                            <SmBtn
                              onClick={() => setDraftScope("month-only")}
                              bg={draftScope === "month-only" ? "rgba(245,158,11,0.15)" : "var(--color-bg-raised)"}
                              c={draftScope === "month-only" ? "var(--color-warning)" : "var(--color-text-secondary)"}
                              style={{
                                flex: 1, fontSize: "9px", letterSpacing: "1px", padding: "6px 8px", minHeight: "30px",
                                border: draftScope === "month-only" ? "1px solid rgba(245,158,11,0.35)" : undefined,
                              }}
                            >
                              THIS MONTH ONLY
                            </SmBtn>
                            <SmBtn
                              onClick={() => setDraftScope("forward")}
                              bg={draftScope === "forward" ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)"}
                              c={draftScope === "forward" ? "var(--color-accent-primary)" : "var(--color-text-secondary)"}
                              style={{
                                flex: 1, fontSize: "9px", letterSpacing: "1px", padding: "6px 8px", minHeight: "30px",
                                border: draftScope === "forward" ? "1px solid rgba(0,200,150,0.28)" : undefined,
                              }}
                            >
                              & FORWARD
                            </SmBtn>
                          </div>
                          <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px", letterSpacing: "0.5px" }}>
                            {draftScope === "month-only"
                              ? `${monthLabel} only · reverts to prior amount next month`
                              : `Effective from ${monthLabel} · cascades through Q${phaseIdx + 1}–Q4`}
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

                {/* Staged additions */}
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
        <div style={{ marginBottom: "8px" }}>
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
                New expense — effective {monthLabel}
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
          <div style={{ fontSize: "12px", color: "var(--color-text-disabled)", textAlign: "center", padding: "20px 0" }}>
            No expenses yet.
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: "flex",
        gap: "8px",
        padding: "8px 14px 12px",
        borderTop: "1px solid var(--color-border-subtle)",
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
  );
}
