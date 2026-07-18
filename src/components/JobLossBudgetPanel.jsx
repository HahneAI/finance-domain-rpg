import { useMemo, useState } from "react";
import { Pressable, PanelHero, SectionHeader, iS, lS } from "./ui.jsx";
import { CATEGORY_COLORS, FISCAL_YEAR_START } from "../constants/config.js";
import { EXPENSE_CYCLE_OPTIONS, perPaycheckFromCycle, getNextDueDate } from "../lib/expense.js";
import { computeJobLossRunway, firstUnemploymentPaymentDate, sumJobHuntIncome } from "../lib/jobLossRunway.js";

const STATUS_OPTIONS = [
  { v: "active",    label: "Active",    color: "var(--color-green)" },
  { v: "paused",    label: "Paused",    color: "var(--color-warning)" },
  { v: "cancelled", label: "Cancelled", color: "var(--color-deduction)" },
];

const isFlexibleCategory = (cat) => cat === "Lifestyle";

/**
 * JobLossBudgetPanel — Job Loss Mode's own Budget view (TODO §15 mode rebuild).
 *
 * Replaces BudgetPanel entirely while `config.jobLossMode` is true. Owns the
 * savings input + benefit scenario toggle that feed the shared runway calc
 * (lib/jobLossRunway.js) — Home reads the same values read-only so both
 * panels never disagree. Also owns expense add/remove/triage, all inline in
 * one view rather than a separate modal (the old ExpenseTriage.jsx) plus a
 * jump back to the normal, quarter-scoped BudgetPanel.
 *
 * Deliberately simpler than the normal BudgetPanel's add-expense flow (no
 * month/quarter scoping, no history editing) — job-loss expense management is
 * about "what do I actually owe every week right now," not fine-grained
 * budget planning. A flat weekly amount from today forward is the honest fit
 * for this mode, not a lesser version of the normal flow.
 */
export function JobLossBudgetPanel({
  config, expenses, setExpenses, effectiveToday,
  savingsDraft, setSavingsDraft, includeBenefits, setIncludeBenefits,
}) {
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", amount: "" });

  const manualSavings = savingsDraft === "" ? 0 : Math.max(0, parseFloat(savingsDraft) || 0);
  const huntIncome = sumJobHuntIncome(config);

  const dash = useMemo(() => computeJobLossRunway({
    config, expenses, effectiveToday, savings: manualSavings + huntIncome,
  }), [config, expenses, effectiveToday, manualSavings, huntIncome]);

  const needsCoverageIds = useMemo(() => {
    const ids = new Set();
    const firstPaymentDate = firstUnemploymentPaymentDate(config);
    if (!firstPaymentDate || !effectiveToday) return ids;
    const todayDate = new Date(effectiveToday + "T12:00:00");
    (expenses ?? []).forEach(exp => {
      if ((exp.jobLossStatus ?? "active") !== "active") return;
      const due = getNextDueDate(exp, todayDate);
      if (due && due < firstPaymentDate) ids.add(exp.id);
    });
    return ids;
  }, [expenses, config, effectiveToday]);

  const upcomingBills = useMemo(() => {
    if (!effectiveToday) return [];
    const todayDate = new Date(effectiveToday + "T12:00:00");
    const firstPaymentDate = firstUnemploymentPaymentDate(config);
    const horizonDays = 35;
    return (expenses ?? [])
      .filter(exp => (exp.jobLossStatus ?? "active") === "active")
      .map(exp => {
        const nextDue = getNextDueDate(exp, todayDate);
        if (!nextDue) return null;
        const days = Math.ceil((nextDue - todayDate) / 86400000);
        if (days > horizonDays) return null;
        return {
          id: exp.id, label: exp.label ?? "Untitled", amount: exp.billingMeta?.amount ?? 0,
          dueDate: nextDue, daysUntil: Math.max(0, days),
          needsCoverage: firstPaymentDate ? nextDue < firstPaymentDate : false,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [expenses, config, effectiveToday]);

  const sortedExpenses = useMemo(() => {
    return [...(expenses ?? [])].sort((a, b) => {
      const aCov = needsCoverageIds.has(a.id), bCov = needsCoverageIds.has(b.id);
      if (aCov !== bCov) return aCov ? -1 : 1;
      const aEss = !isFlexibleCategory(a.category), bEss = !isFlexibleCategory(b.category);
      if (aEss !== bEss) return aEss ? -1 : 1;
      return (a.label ?? "").localeCompare(b.label ?? "");
    });
  }, [expenses, needsCoverageIds]);

  const flexibleActiveCount = (expenses ?? []).filter(exp => (
    isFlexibleCategory(exp.category) && (exp.jobLossStatus ?? "active") === "active"
  )).length;

  const setStatus = (id, status) => setExpenses(prev => prev.map(e => e.id === id ? { ...e, jobLossStatus: status } : e));
  const toggleAutoReactivate = (id) => setExpenses(prev => prev.map(e => (
    e.id === id ? { ...e, autoReactivateOnIncome: !(e.autoReactivateOnIncome ?? true) } : e
  )));
  const pauseAllFlexible = () => setExpenses(prev => prev.map(e => (
    isFlexibleCategory(e.category) && (e.jobLossStatus ?? "active") === "active" ? { ...e, jobLossStatus: "paused" } : e
  )));
  const removeExpense = (id) => setExpenses(prev => prev.filter(e => e.id !== id));

  const addExpense = () => {
    if (!newExp.label || !((parseFloat(newExp.amount) || 0) > 0)) return;
    const amount = parseFloat(newExp.amount) || 0;
    const perPaycheck = perPaycheckFromCycle(amount, "every30days");
    setExpenses(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      history: [{ effectiveFrom: effectiveToday ?? FISCAL_YEAR_START, weekly: [perPaycheck, perPaycheck, perPaycheck, perPaycheck] }],
      billingMeta: { amount, cycle: "every30days", effectiveFrom: effectiveToday ?? FISCAL_YEAR_START },
    }]);
    setNewExp({ label: "", category: "Needs", amount: "" });
  };

  const hasBenefits = dash && config.unemploymentEnabled && dash.projectedUnemploymentTotal > 0;

  return (
    <div>
      <PanelHero eyebrow="Job Loss Mode">Budget</PanelHero>

      {/* ── Savings + unemployment scenario ── */}
      <SectionHeader sub="Feeds the runway numbers on Home">Savings & Benefits</SectionHeader>
      <div style={{
        background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
        borderRadius: "14px", padding: "16px", marginBottom: "20px",
      }}>
        <label style={lS}>Current savings / cash on hand</label>
        <input
          type="number" min="0" step="50" inputMode="decimal"
          value={savingsDraft}
          onChange={(e) => setSavingsDraft(e.target.value)}
          placeholder="e.g. 4000"
          style={{ ...iS, marginTop: "6px" }}
        />
        <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5, marginBottom: "14px" }}>
          One-time entry for the runway calc only — not saved to your account. Extra income logged
          on Home (${Math.round(huntIncome).toLocaleString()} so far) is added automatically.
        </div>

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
                      color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
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
        <Pressable
          onClick={addExpense}
          disabled={!newExp.label || !((parseFloat(newExp.amount) || 0) > 0)}
          style={{
            width: "100%", background: newExp.label && (parseFloat(newExp.amount) || 0) > 0 ? "var(--color-green)" : "var(--color-bg-raised)",
            color: newExp.label && (parseFloat(newExp.amount) || 0) > 0 ? "var(--color-bg-base)" : "var(--color-text-disabled)",
            border: "none", borderRadius: "10px", padding: "10px",
            fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
          }}
        >
          + Add Expense
        </Pressable>
      </div>

      {flexibleActiveCount > 0 && (
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
            const status = exp.jobLossStatus ?? "active";
            const flexible = isFlexibleCategory(exp.category);
            const monthly = exp.billingMeta?.amount ?? null;
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
                      {exp.category ?? "—"}{monthly != null ? ` · $${Number(monthly).toLocaleString()}/mo` : ""}
                    </div>
                  </div>
                  <Pressable
                    onClick={() => removeExpense(exp.id)}
                    aria-label="Remove expense"
                    style={{ background: "transparent", border: "none", color: "var(--color-text-disabled)", cursor: "pointer", fontSize: "14px", padding: "2px 4px" }}
                  >
                    ✕
                  </Pressable>
                </div>

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

                {status !== "active" && (
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
