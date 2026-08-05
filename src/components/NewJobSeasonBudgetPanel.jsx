import { useCallback, useMemo, useState } from "react";
import { Pressable, PanelHero, SectionHeader, iS, lS } from "./ui.jsx";
import { DueDatePicker } from "./DueDatePicker.jsx";
import { CashOnHandSheet } from "./CashOnHandSheet.jsx";
import { CATEGORY_COLORS, FISCAL_YEAR_START } from "../constants/config.js";
import { perPaycheckFromCycle, getNextDueDate, resolveDueDateAnchor, getExpenseDisplayAmount } from "../lib/expense.js";
import { computeNewJobSeasonRunway, firstUnemploymentPaymentDate, sumJobHuntIncome } from "../lib/newJobSeasonRunway.js";

const STATUS_OPTIONS = [
  { v: "active",    label: "Active",    color: "var(--color-green)" },
  { v: "paused",    label: "Paused",    color: "var(--color-warning)" },
  { v: "cancelled", label: "Cancelled", color: "var(--color-deduction)" },
];

const isFlexibleCategory = (cat) => cat === "Lifestyle";

/**
 * NewJobSeasonBudgetPanel — New Job Season's own Budget view (TODO §1 mode rebuild).
 *
 * Replaces BudgetPanel entirely while `config.newJobSeasonMode` is true. The cash
 * on hand figure (persisted `config.newJobSeasonCashOnHand`, TODO §1.H13,
 * timeline-aware per §1.H17) is editable here AND on NewJobSeasonHomePanel via
 * the same CashOnHandSheet — both commit to the same config fields via eager
 * save, so there's no single "owner" to drift from; the benefit-scenario
 * toggle (session-only, unrelated) still lives here only, with Home reading
 * it read-only. Both feed the shared runway calc (lib/newJobSeasonRunway.js).
 * Also owns expense add/remove/triage, all inline in one view rather than a
 * separate modal (the old ExpenseTriage.jsx) plus a jump back to the normal,
 * quarter-scoped BudgetPanel.
 *
 * Deliberately simpler than the normal BudgetPanel's add-expense flow (no
 * month/quarter scoping, no history editing) — job-loss expense management is
 * about "what do I actually owe every week right now," not fine-grained
 * budget planning. A flat weekly amount from today forward is the honest fit
 * for this mode, not a lesser version of the normal flow.
 */
export function NewJobSeasonBudgetPanel({
  config, setConfig: setConfigProp, saveConfigNow: saveConfigNowProp,
  expenses, setExpenses: setExpensesProp, onSaveExpensesNow: onSaveExpensesNowProp,
  effectiveToday, includeBenefits, setIncludeBenefits,
  readOnly = false,
}) {
  // Paywall-expired read-only mode, same shadow pattern as HomePanel/BudgetPanel
  // (docs/TODO.md §17.E): every mutation below becomes a no-op.
  const noop = useCallback(() => {}, []);
  const setExpenses = readOnly ? noop : setExpensesProp;
  const onSaveExpensesNow = readOnly ? noop : onSaveExpensesNowProp;
  const setConfig = readOnly ? noop : setConfigProp;
  const saveConfigNow = readOnly ? noop : saveConfigNowProp;
  // Eager-save wrapper (docs/TODO.md "Persistence — Eager Save Pattern"), same
  // shape as BudgetPanel.jsx's applyExpenseUpdate — every mutation below
  // (triage status, auto-reactivate, pause-all, add/remove expense) computes
  // its next expenses array synchronously and saves immediately instead of
  // sitting in the ambient 800ms debounce.
  const applyExpenseUpdate = (updater) => {
    let next;
    setExpenses(prev => { next = updater(prev); return next; });
    onSaveExpensesNow?.(next);
  };

  const [newExp, setNewExp] = useState({ label: "", category: "Needs", amount: "" });
  const [newExpDueDate, setNewExpDueDate] = useState(null);
  const [addAttempted, setAddAttempted] = useState(false);
  const [cashSheetOpen, setCashSheetOpen] = useState(false);

  const huntIncome = sumJobHuntIncome(config);

  const dash = useMemo(() => computeNewJobSeasonRunway({
    config, expenses, effectiveToday, extraCash: huntIncome,
  }), [config, expenses, effectiveToday, huntIncome]);

  // Same shared editor as NewJobSeasonHomePanel's Cash On Hand card (TODO
  // §1.H17) — confirming a value here resets the decay clock the same way,
  // since both surfaces commit to the identical config fields.
  const saveCashOnHand = (parsedValue) => {
    const next = { ...config, newJobSeasonCashOnHand: parsedValue, newJobSeasonCashOnHandAsOf: effectiveToday };
    setConfig(next);
    saveConfigNow?.(next);
  };

  // Only expenses the user chose to track during New Job Season (TODO §1
  // expense review step) show up anywhere on this panel — untracked ones
  // stay untouched for normal-mode Budget, just invisible here.
  const trackedExpenses = useMemo(
    () => (expenses ?? []).filter(exp => exp.trackDuringNewJobSeason !== false),
    [expenses],
  );

  const todayDate = useMemo(
    () => (effectiveToday ? new Date(effectiveToday + "T12:00:00") : null),
    [effectiveToday],
  );
  const firstPaymentDate = useMemo(
    () => firstUnemploymentPaymentDate(config),
    [config],
  );

  const needsCoverageIds = useMemo(() => {
    const ids = new Set();
    if (!firstPaymentDate || !todayDate) return ids;
    trackedExpenses.forEach(exp => {
      if ((exp.newJobSeasonStatus ?? "active") !== "active") return;
      const due = getNextDueDate(exp, todayDate);
      if (due && due < firstPaymentDate) ids.add(exp.id);
    });
    return ids;
  }, [trackedExpenses, firstPaymentDate, todayDate]);

  const upcomingBills = useMemo(() => {
    if (!todayDate) return [];
    const horizonDays = 35;
    return trackedExpenses
      .filter(exp => (exp.newJobSeasonStatus ?? "active") === "active")
      .map(exp => {
        const nextDue = getNextDueDate(exp, todayDate);
        if (!nextDue) return null;
        const days = Math.ceil((nextDue - todayDate) / 86400000);
        if (days > horizonDays) return null;
        return {
          id: exp.id, label: exp.label ?? "Untitled", amount: getExpenseDisplayAmount(exp),
          dueDate: nextDue, daysUntil: Math.max(0, days),
          needsCoverage: firstPaymentDate ? nextDue < firstPaymentDate : false,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [trackedExpenses, firstPaymentDate, todayDate]);

  const sortedExpenses = useMemo(() => {
    return [...trackedExpenses].sort((a, b) => {
      const aCov = needsCoverageIds.has(a.id), bCov = needsCoverageIds.has(b.id);
      if (aCov !== bCov) return aCov ? -1 : 1;
      const aEss = !isFlexibleCategory(a.category), bEss = !isFlexibleCategory(b.category);
      if (aEss !== bEss) return aEss ? -1 : 1;
      return (a.label ?? "").localeCompare(b.label ?? "");
    });
  }, [trackedExpenses, needsCoverageIds]);

  const flexibleActiveCount = trackedExpenses.filter(exp => (
    isFlexibleCategory(exp.category) && (exp.newJobSeasonStatus ?? "active") === "active"
  )).length;

  const setStatus = (id, status) => applyExpenseUpdate(prev => prev.map(e => e.id === id ? { ...e, newJobSeasonStatus: status } : e));
  const toggleAutoReactivate = (id) => applyExpenseUpdate(prev => prev.map(e => (
    e.id === id ? { ...e, autoReactivateOnIncome: !(e.autoReactivateOnIncome ?? true) } : e
  )));
  const pauseAllFlexible = () => applyExpenseUpdate(prev => prev.map(e => (
    isFlexibleCategory(e.category) && (e.newJobSeasonStatus ?? "active") === "active" ? { ...e, newJobSeasonStatus: "paused" } : e
  )));
  const removeExpense = (id) => applyExpenseUpdate(prev => prev.filter(e => e.id !== id));

  const newExpDueDateValid = newExpDueDate?.mode === "custom" ? !!newExpDueDate.date
    : newExpDueDate?.mode === "week" ? !!newExpDueDate.week
    : false;
  const canAddExpense = !!newExp.label && (parseFloat(newExp.amount) || 0) > 0 && newExpDueDateValid;

  const addExpense = () => {
    if (!canAddExpense) { setAddAttempted(true); return; }
    const amount = parseFloat(newExp.amount) || 0;
    const perPaycheck = perPaycheckFromCycle(amount, "every30days");
    const anchor = resolveDueDateAnchor(newExpDueDate, effectiveToday) ?? effectiveToday ?? FISCAL_YEAR_START;
    applyExpenseUpdate(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      trackDuringNewJobSeason: true,
      dueDateAnchor: anchor,
      history: [{ effectiveFrom: effectiveToday ?? FISCAL_YEAR_START, weekly: [perPaycheck, perPaycheck, perPaycheck, perPaycheck] }],
      billingMeta: { amount, cycle: "every30days", effectiveFrom: effectiveToday ?? FISCAL_YEAR_START },
    }]);
    setNewExp({ label: "", category: "Needs", amount: "" });
    setNewExpDueDate(null);
    setAddAttempted(false);
  };

  const hasBenefits = dash && config.unemploymentEnabled && dash.projectedUnemploymentTotal > 0;

  return (
    <div>
      <PanelHero eyebrow="New Job Season">Budget</PanelHero>

      {/* ── Savings + unemployment scenario ── */}
      <SectionHeader sub="Feeds the runway numbers on Home">Savings & Benefits</SectionHeader>
      <div style={{
        background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
        borderRadius: "14px", padding: "16px", marginBottom: "20px",
      }}>
        <label style={lS}>Current savings / cash on hand</label>
        <Pressable
          onClick={() => setCashSheetOpen(true)}
          disabled={readOnly}
          aria-label="Update cash on hand"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            marginTop: "6px", padding: "10px 12px",
            background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)",
            borderRadius: "10px", cursor: readOnly ? "default" : "pointer",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
            ${Math.round(dash?.effectiveCashOnHand ?? 0).toLocaleString()}
          </span>
          <span style={{
            width: "26px", height: "26px", borderRadius: "50%",
            background: "rgba(0,200,150,0.12)", border: "1px solid rgba(0,200,150,0.32)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-teal)", flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </span>
        </Pressable>
        <CashOnHandSheet
          open={cashSheetOpen}
          onClose={() => setCashSheetOpen(false)}
          currentValue={dash?.effectiveCashOnHand ?? 0}
          onSave={saveCashOnHand}
        />
        {dash && Math.round(dash.billsDueSinceAsOf) > 0 && (
          <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
            − ${Math.round(dash.billsDueSinceAsOf).toLocaleString()} in bills since you last updated this
          </div>
        )}
        <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
          Saved to your account — also editable from Home. Extra income logged
          on Home (${Math.round(huntIncome).toLocaleString()} so far) is added automatically.
        </div>
        {dash?.pendingCheck && (
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--color-green)", lineHeight: 1.5 }}>
            Pending check: ${Math.round(dash.pendingCheck.amount).toLocaleString()} arriving{" "}
            {dash.pendingCheck.daysOut === 0 ? "today" : `in ${dash.pendingCheck.daysOut} ${dash.pendingCheck.daysOut === 1 ? "day" : "days"}`}
            {" "}({new Date(dash.pendingCheck.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})
          </div>
        )}
        <div style={{ marginBottom: "14px" }} />

        {hasBenefits && dash && (
          <>
            <label style={lS}>Scenario</label>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", marginBottom: "10px" }}>
              {[{ v: true, label: "With unemployment" }, { v: false, label: "Without" }].map(opt => {
                const active = includeBenefits === opt.v;
                return (
                  <Pressable
                    key={opt.label}
                    onClick={() => setIncludeBenefits(opt.v)}
                    style={{
                      padding: "7px 12px", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                      background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                      color: active ? "var(--color-teal)" : "var(--color-text-secondary)",
                      border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                      borderRadius: "10px", cursor: "pointer", fontWeight: active ? 700 : 500,
                    }}
                  >
                    {active && "✓ "}{opt.label}
                  </Pressable>
                );
              })}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
              {dash.benefitsRemainingWeeks} benefit weeks remaining · ${Math.round(dash.projectedUnemploymentTotal).toLocaleString()} projected total
            </div>
          </>
        )}
      </div>

      {/* ── Upcoming bills ── */}
      {upcomingBills.length > 0 && (
        <>
          <SectionHeader>Upcoming Bills</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
            {upcomingBills.map(bill => {
              const tierColor = bill.daysUntil <= 7 ? "var(--color-deduction)" : bill.daysUntil <= 14 ? "var(--color-warning)" : "var(--color-border-subtle)";
              return (
                <div key={bill.id} style={{
                  display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px",
                  background: "var(--color-bg-raised)", border: `1px solid ${tierColor}`, borderRadius: "10px",
                }}>
                  <div style={{ flex: "0 0 auto", minWidth: "48px", textAlign: "center", color: tierColor }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{bill.daysUntil}</div>
                    <div style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase" }}>{bill.daysUntil === 1 ? "day" : "days"}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{bill.label}</div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      Due {bill.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {bill.needsCoverage && <span style={{ color: "var(--color-deduction)", fontWeight: 700 }}> · Needs Coverage</span>}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                    ${Math.round(bill.amount).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Add expense ── */}
      <SectionHeader>Expenses</SectionHeader>
      {!readOnly && (
        <div style={{
          background: "var(--color-bg-surface)", border: "1px solid rgba(0,200,150,0.22)",
          borderRadius: "12px", padding: "14px", marginBottom: "14px",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <div>
              <label style={lS}>Label</label>
              <input type="text" style={iS} value={newExp.label} onChange={e => setNewExp(v => ({ ...v, label: e.target.value }))} placeholder="e.g. Rent" />
            </div>
            <div>
              <label style={lS}>Category</label>
              <select style={iS} value={newExp.category} onChange={e => setNewExp(v => ({ ...v, category: e.target.value }))}>
                <option>Needs</option>
                <option>Lifestyle</option>
              </select>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lS}>Monthly amount ($)</label>
              <input type="number" min="0" step="0.01" style={iS} value={newExp.amount} onChange={e => setNewExp(v => ({ ...v, amount: e.target.value }))} placeholder="e.g. 1200" />
            </div>
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label style={lS}>Due date</label>
            <DueDatePicker value={newExpDueDate} onChange={setNewExpDueDate} attempted={addAttempted} />
          </div>
          <Pressable
            onClick={addExpense}
            style={{
              width: "100%", background: canAddExpense ? "var(--color-green)" : "var(--color-bg-raised)",
              color: canAddExpense ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "10px", padding: "10px",
              fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
            }}
          >
            + Add Expense
          </Pressable>
        </div>
      )}

      {!readOnly && flexibleActiveCount > 0 && (
        <Pressable
          onClick={pauseAllFlexible}
          style={{
            marginBottom: "12px", background: "rgba(245,158,11,0.10)", color: "var(--color-warning)",
            border: "1px solid rgba(245,158,11,0.32)", borderRadius: "10px", padding: "8px 14px",
            fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
          }}
        >
          Pause all Flexible ({flexibleActiveCount})
        </Pressable>
      )}

      {sortedExpenses.length === 0 ? (
        <div style={{ padding: "24px 8px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "12px" }}>
          No expenses yet — add your rent, utilities, and other bills above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {sortedExpenses.map(exp => {
            const status = exp.newJobSeasonStatus ?? "active";
            const isLoan = exp.type === "loan";
            const flexible = isFlexibleCategory(exp.category);
            const monthly = getExpenseDisplayAmount(exp) || null;
            const autoReactivate = exp.autoReactivateOnIncome ?? true;
            const catColor = CATEGORY_COLORS[exp.category] ?? "var(--color-text-secondary)";
            return (
              <div key={exp.id} style={{
                background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)",
                borderRadius: "12px", padding: "12px 14px", opacity: status === "cancelled" ? 0.55 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{exp.label ?? "Untitled"}</span>
                      {isLoan && (
                        <span style={{
                          fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                          color: "var(--color-bg-base)", background: "var(--color-teal)",
                          padding: "2px 6px", borderRadius: "3px", fontWeight: "bold",
                        }}>
                          Loan
                        </span>
                      )}
                      <span style={{
                        fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                        color: flexible ? "var(--color-bg-base)" : "var(--color-text-primary)",
                        background: flexible ? "var(--color-warning)" : catColor,
                        padding: "2px 6px", borderRadius: "3px", fontWeight: "bold",
                      }}>
                        {flexible ? "Flexible" : "Essential"}
                      </span>
                      {needsCoverageIds.has(exp.id) && (
                        <span style={{
                          fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                          color: "var(--color-bg-base)", background: "var(--color-deduction)",
                          padding: "2px 6px", borderRadius: "3px", fontWeight: "bold",
                        }}>
                          Needs Coverage
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {exp.category ?? "—"}{monthly != null ? ` · $${Number(monthly).toLocaleString()}${isLoan ? `/${exp.loanMeta?.paymentFrequency ?? "mo"}` : "/mo"}` : ""}
                    </div>
                  </div>
                  {!readOnly && (
                    <Pressable
                      onClick={() => removeExpense(exp.id)}
                      aria-label="Remove expense"
                      style={{ background: "transparent", border: "none", color: "var(--color-text-disabled)", cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}
                    >
                      ✕
                    </Pressable>
                  )}
                </div>

                {!readOnly && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "10px" }}>
                    {STATUS_OPTIONS.map(opt => {
                      const active = status === opt.v;
                      return (
                        <Pressable
                          key={opt.v}
                          onClick={() => setStatus(exp.id, opt.v)}
                          style={{
                            flex: 1, padding: "7px 10px", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                            background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-surface)",
                            color: active ? opt.color : "var(--color-text-secondary)",
                            border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                            borderRadius: "10px", cursor: "pointer", fontWeight: active ? 700 : 500,
                          }}
                        >
                          {opt.label}
                        </Pressable>
                      );
                    })}
                  </div>
                )}

                {!readOnly && status !== "active" && (
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "11px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                    <input
                      type="checkbox" checked={autoReactivate} onChange={() => toggleAutoReactivate(exp.id)}
                      style={{ accentColor: "var(--color-accent-primary)", width: "14px", height: "14px", cursor: "pointer" }}
                    />
                    Auto-reactivate when I'm back to work
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
