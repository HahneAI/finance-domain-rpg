import { useEffect, useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";
import { DueDatePicker } from "./DueDatePicker.jsx";
import { CATEGORY_COLORS } from "../constants/config.js";
import { resolveDueDateAnchor, getExpenseDisplayAmount } from "../lib/expense.js";

/**
 * JobLossEntry — modal launched from the LifeEventMenu "Lost My Job" tile.
 *
 * Step 0 (unchanged): captures the job-loss effective date and the
 * unemployment-benefit setup (TODO §15.C1 + §15.C2).
 *
 * Step 1 (new — TODO §15 expense review): a multi-select checklist of the
 * user's current expenses, all checked by default, letting them uncheck
 * anything they don't want tracked while job hunting. Unchecking never
 * deletes or edits the expense — it only sets `trackDuringJobLoss: false`,
 * which the Job Loss Budget/Home views (and the shared runway calc) filter
 * on. Normal-mode Budget ignores the flag entirely, so nothing here is lost
 * or altered for when the user goes Back to Work.
 *
 * Step 2 (new): for whichever expenses stayed checked, assign a payment
 * date via quick "week of month" presets or a manual date — written to the
 * new `dueDateAnchor` field so the Upcoming Bills countdown and runway don't
 * fall back to the "amount last edited" bug (see lib/expense.js). Loans
 * (expense.type === "loan") skip this picker entirely — they already carry a
 * real due date in `loanMeta.firstPaymentDate`, which gets attached to
 * `dueDateAnchor` automatically on confirm instead of asking again.
 *
 * Steps 1–2 are skipped entirely when there are no expenses to review, so
 * the original single-step flow (and its "Activate" button/behavior) is
 * unchanged for that case.
 *
 * On confirm, `onActivate(configPatch, updatedExpenses?)` is called —
 * `updatedExpenses` is only passed when there were expenses to review.
 *   configPatch: {
 *     jobLossMode: true, jobLossDate,
 *     unemploymentEnabled, unemploymentWeekly, unemploymentDurationWeeks,
 *     unemploymentWaitingWeek,
 *   }
 * App.jsx merges configPatch into config and, when present, replaces
 * expenses with updatedExpenses.
 */
export function JobLossEntry({ open, onClose, onActivate, expenses = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  // null = unanswered (Activate disabled); true/false once user picks.
  const [unemploymentAnswered, setUnemploymentAnswered] = useState(null);
  const [weeklyDraft, setWeeklyDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("");
  const [waitingWeek, setWaitingWeek] = useState(true);

  const [step, setStep] = useState(0);
  const [trackedIds, setTrackedIds] = useState(() => new Set(expenses.map(e => e.id)));
  const [dueDateChoices, setDueDateChoices] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setUnemploymentAnswered(null);
    setWeeklyDraft("");
    setDurationDraft("");
    setWaitingWeek(true);
    setStep(0);
    setTrackedIds(new Set(expenses.map(e => e.id)));
    setDueDateChoices({});
    setAttempted(false);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, today]);

  const fold = useFoldTransition(open, { ms: 340 });
  if (!fold.mounted) return null;

  const hasUnemployment = unemploymentAnswered === true;
  const weeklyVal   = weeklyDraft   === "" ? null : Math.max(0, parseFloat(weeklyDraft)  || 0);
  const durationVal = durationDraft === "" ? null : Math.max(0, parseInt(durationDraft, 10) || 0);
  const unemploymentFieldsValid = !hasUnemployment || ((weeklyVal ?? 0) > 0 && (durationVal ?? 0) > 0);
  const step0Valid = !!date && unemploymentAnswered !== null && unemploymentFieldsValid;

  const hasExpenses = expenses.length > 0;
  const keptExpenses = expenses.filter(e => trackedIds.has(e.id));
  // Loans already carry a real payment date (loanMeta.firstPaymentDate) —
  // no need to make the user re-pick one, so the due-date step only lists
  // (and only requires a pick for) the non-loan bills that stayed checked.
  const keptPickableExpenses = keptExpenses.filter(e => e.type !== "loan");
  const step2Valid = keptPickableExpenses.every(e => {
    const v = dueDateChoices[e.id];
    return v?.mode === "custom" ? !!v.date : v?.mode === "week" ? !!v.week : false;
  });

  const toggleTracked = (id) => setTrackedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const buildConfigPatch = () => ({
    jobLossMode: true,
    jobLossDate: date,
    unemploymentEnabled: hasUnemployment,
    unemploymentWeekly: hasUnemployment ? weeklyVal : null,
    unemploymentDurationWeeks: hasUnemployment ? durationVal : null,
    unemploymentWaitingWeek: hasUnemployment ? waitingWeek : false,
  });

  const confirm = () => {
    if (!hasExpenses) {
      if (!step0Valid) return;
      onActivate(buildConfigPatch());
      onClose();
      return;
    }
    if (!step2Valid) { setAttempted(true); return; }
    const updatedExpenses = expenses.map(exp => {
      if (!trackedIds.has(exp.id)) return { ...exp, trackDuringJobLoss: false };
      if (exp.type === "loan") {
        // Attach the loan's own known payment date rather than asking again.
        return { ...exp, trackDuringJobLoss: true, dueDateAnchor: exp.loanMeta?.firstPaymentDate ?? exp.dueDateAnchor };
      }
      const anchor = resolveDueDateAnchor(dueDateChoices[exp.id], today);
      return { ...exp, trackDuringJobLoss: true, dueDateAnchor: anchor ?? exp.dueDateAnchor };
    });
    onActivate(buildConfigPatch(), updatedExpenses);
    onClose();
  };

  const goNext = () => {
    if (step === 0) {
      if (!step0Valid) return;
      if (!hasExpenses) { confirm(); return; }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (keptPickableExpenses.length === 0) { confirm(); return; }
      setStep(2);
      return;
    }
    confirm();
  };

  const nextLabel = step === 0 ? (hasExpenses ? "Next" : "Activate")
    : step === 1 ? (keptPickableExpenses.length > 0 ? "Next" : "Activate")
    : "Activate";
  const nextDisabled = step === 0 ? !step0Valid : step === 2 ? !step2Valid : false;

  const labelStyle = { fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", display: "block", marginBottom: "6px" };
  const inputStyle = {
    width: "100%",
    background: "var(--color-bg-base)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "10px",
    color: "var(--color-text-primary)",
    fontSize: "16px",
    fontFamily: "var(--font-mono)",
    padding: "10px 12px",
    colorScheme: "dark",
  };

  return (
    <div
      className="fold-backdrop" data-fold={fold.fold}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="fold-modal" data-fold={fold.fold}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          width: "100%", maxWidth: "440px",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "5px" }}>
            Life Event{hasExpenses ? ` · Step ${step + 1} of 3` : ""}
          </div>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
            {step === 0 && "Enter Job Loss Mode"}
            {step === 1 && "Which bills do you want to track?"}
            {step === 2 && "When are these due?"}
          </div>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>
          {step === 0 && (
            <>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
                From the date below forward, projected earned income drops to $0.
                Goals, expenses, and logs are preserved — only forward-looking finance
                math recalculates.
              </p>

              <div>
                <label style={labelStyle}>Job loss effective date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* ── Unemployment Y/N gate (§15.C2) ── */}
              <div>
                <label style={labelStyle}>Are you getting unemployment benefits?</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[{ v: true, label: "Yes" }, { v: false, label: "No" }].map(opt => {
                    const active = unemploymentAnswered === opt.v;
                    return (
                      <Pressable
                        key={opt.label}
                        onClick={() => setUnemploymentAnswered(opt.v)}
                        style={{
                          padding: "8px 18px",
                          fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase",
                          background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                          color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                          border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                          borderRadius: "10px",
                          cursor: "pointer",
                          transition: "background 0.15s, border-color 0.15s, color 0.15s",
                        }}
                      >
                        {active && "✓ "}{opt.label}
                      </Pressable>
                    );
                  })}
                </div>
              </div>

              {/* ── If Yes: weekly benefit, duration, waiting-week toggle ── */}
              {hasUnemployment && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={labelStyle}>Weekly benefit amount</label>
                    <input
                      type="number" min="0" step="1" inputMode="decimal"
                      value={weeklyDraft}
                      onChange={(e) => setWeeklyDraft(e.target.value)}
                      placeholder="e.g. 400"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Benefit duration (weeks)</label>
                    <input
                      type="number" min="0" step="1" inputMode="numeric"
                      value={durationDraft}
                      onChange={(e) => setDurationDraft(e.target.value)}
                      placeholder="e.g. 26"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Waiting week (first week unpaid)</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {[{ v: true, label: "Yes" }, { v: false, label: "No" }].map(opt => {
                        const active = waitingWeek === opt.v;
                        return (
                          <Pressable
                            key={opt.label}
                            onClick={() => setWaitingWeek(opt.v)}
                            style={{
                              padding: "7px 14px",
                              fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                              background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                              color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                              border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                              borderRadius: "10px",
                              cursor: "pointer",
                              transition: "background 0.15s, border-color 0.15s, color 0.15s",
                            }}
                          >
                            {active && "✓ "}{opt.label}
                          </Pressable>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
                      Most states make the first week unpaid; the duration count starts after.
                    </div>
                  </div>

                  <div style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.28)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.5,
                  }}>
                    Unemployment income is federally taxable, but withholding is optional and
                    not modeled here. Set aside ~10% if you didn't elect withholding when you filed.
                  </div>
                </div>
              )}

              <div style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.28)",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.5,
              }}>
                You can exit Job Loss Mode anytime via the <strong style={{ color: "var(--color-warning)" }}>Back to Work</strong> button
                in the app banner — that flow walks you through re-entering your new pay structure.
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
                All your bills start checked. Uncheck anything you don't need to track while job
                hunting — nothing is deleted or changed, and your normal Budget keeps every bill
                exactly as it is.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {expenses.map(exp => {
                  const checked = trackedIds.has(exp.id);
                  const isLoan = exp.type === "loan";
                  const catColor = CATEGORY_COLORS[exp.category] ?? "var(--color-text-secondary)";
                  const amount = getExpenseDisplayAmount(exp);
                  return (
                    <label
                      key={exp.id}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "10px 12px",
                        background: "var(--color-bg-raised)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: "10px",
                        cursor: "pointer",
                        opacity: checked ? 1 : 0.55,
                      }}
                    >
                      <input
                        type="checkbox" checked={checked} onChange={() => toggleTracked(exp.id)}
                        style={{ accentColor: "var(--color-accent-primary)", width: "16px", height: "16px", cursor: "pointer", flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>{exp.label ?? "Untitled"}</span>
                          {isLoan && (
                            <span style={{
                              fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                              color: "var(--color-bg-base)", background: "var(--color-gold)",
                              padding: "2px 6px", borderRadius: "3px", fontWeight: "bold",
                            }}>
                              Loan
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                          <span style={{ color: catColor }}>{exp.category ?? "—"}</span>
                          {amount > 0 ? ` · $${Number(amount).toLocaleString()}${isLoan ? `/${exp.loanMeta?.paymentFrequency ?? "mo"}` : "/mo"}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
                Pick when each bill is due so the Upcoming Bills countdown and runway line up
                with your real due dates.
                {keptExpenses.length > keptPickableExpenses.length && (
                  " Loans use the payment date already on file — nothing to pick for those."
                )}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {keptPickableExpenses.map(exp => (
                  <div key={exp.id}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>
                      {exp.label ?? "Untitled"}
                    </div>
                    <DueDatePicker
                      value={dueDateChoices[exp.id] ?? null}
                      onChange={(v) => setDueDateChoices(prev => ({ ...prev, [exp.id]: v }))}
                      attempted={attempted}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex", gap: "10px", justifyContent: "flex-end",
        }}>
          {step > 0 && (
            <Pressable
              onClick={() => setStep(s => s - 1)}
              style={{
                background: "var(--color-bg-raised)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "12px", padding: "7px 14px",
                fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Back
            </Pressable>
          )}
          <div style={{ flex: 1 }} />
          <Pressable
            onClick={onClose}
            style={{
              background: "var(--color-bg-raised)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "12px", padding: "7px 14px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </Pressable>
          <Pressable
            onClick={goNext}
            disabled={nextDisabled}
            style={{
              background: nextDisabled ? "var(--color-bg-raised)" : "var(--color-gold)",
              color: nextDisabled ? "var(--color-text-disabled)" : "var(--color-bg-base)",
              border: "none", borderRadius: "12px", padding: "8px 16px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold",
              cursor: nextDisabled ? "not-allowed" : "pointer",
            }}
          >
            {nextLabel}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
