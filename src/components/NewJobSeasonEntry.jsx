import { useEffect, useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";
import { DueDatePicker } from "./DueDatePicker.jsx";
import { CATEGORY_COLORS } from "../constants/config.js";
import { resolveDueDateAnchor, getExpenseDisplayAmount } from "../lib/expense.js";
import { resolveLastPayPeriodEnd, resolvePendingCheckArrivalDate, estimatePendingCheckAmount } from "../lib/newJobSeasonRunway.js";
import { toLocalIso } from "../lib/finance.js";

// Canonical day ordering — matches WeekConfirmModal/LogPanel's DayPicker so
// day-name strings stay consistent app-wide. DOW = JS Date.getDay() value.
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TO_DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

/**
 * NewJobSeasonEntry — modal launched from the LifeEventMenu "Lost My Job" tile.
 *
 * Step 0 (unchanged): captures the job-loss effective date, mandatory
 * cash-on-hand (§1.H13), and the unemployment-benefit setup (§1.C1/C2).
 *
 * Step 1 (new — §1.H15 pending/final paycheck): mimics the weekly
 * check-in's day-picker UX (WeekConfirmModal.jsx) rather than reusing it —
 * that component is DHL-rotation/bucket/OT-aware and far heavier than this
 * needs. Skippable Y/N gate ("any paycheck still coming?"); if yes, a plain
 * Mon–Sun toggle grid for "days worked in your final week" (no
 * scheduled-vs-unscheduled distinction — just tap what applies) plus a
 * single-select day-of-week pick for "which day checks normally arrive."
 * Resolved once at Activate time (`resolveLastPayPeriodEnd` +
 * `resolvePendingCheckArrivalDate` + `estimatePendingCheckAmount`, all
 * `lib/newJobSeasonRunway.js`) into concrete `newJobSeasonPendingCheckAmount`/
 * `newJobSeasonPendingCheckDate` values — the raw day picks aren't stored, same
 * resolve-to-a-concrete-value pattern as `dueDateAnchor` below. Deliberately
 * scoped to a single 7-day picker regardless of pay schedule — for biweekly/
 * salary users this covers only the final week, not the full period; flagged
 * as a known scope limit in `docs/TODO.md` §1.H15, not silently wrong.
 *
 * Step 2 (was Step 1 — TODO §1 expense review): a multi-select checklist of
 * the user's current expenses, all checked by default, letting them uncheck
 * anything they don't want tracked while job hunting. Unchecking never
 * deletes or edits the expense — it only sets `trackDuringNewJobSeason: false`,
 * which the New Job Season Budget/Home views (and the shared runway calc) filter
 * on. Normal-mode Budget ignores the flag entirely, so nothing here is lost
 * or altered for when the user goes Back to Work.
 *
 * Step 3 (was Step 2): for whichever expenses stayed checked, assign a
 * payment date via quick "week of month" presets or a manual date — written
 * to the new `dueDateAnchor` field so the Upcoming Bills countdown and
 * runway don't fall back to the "amount last edited" bug (see
 * lib/expense.js). Loans (expense.type === "loan") skip this picker
 * entirely — they already carry a real due date in
 * `loanMeta.firstPaymentDate`, which gets attached to `dueDateAnchor`
 * automatically on confirm instead of asking again.
 *
 * Steps 2–3 are skipped entirely when there are no expenses to review, so
 * the original flow (and its "Activate" button/behavior) is unchanged for
 * that case. Step 1 is never skipped — pending-check applies regardless of
 * whether the user has any expenses.
 *
 * On confirm, `onActivate(configPatch, updatedExpenses?)` is called —
 * `updatedExpenses` is only passed when there were expenses to review.
 *   configPatch: {
 *     newJobSeasonMode: true, newJobSeasonDate, newJobSeasonCashOnHand, newJobSeasonCashOnHandAsOf,
 *     newJobSeasonPendingCheckAmount, newJobSeasonPendingCheckDate,
 *     unemploymentEnabled, unemploymentWeekly, unemploymentDurationWeeks,
 *     unemploymentWaitingWeek,
 *   }
 * App.jsx merges configPatch into config and, when present, replaces
 * expenses with updatedExpenses.
 */
export function NewJobSeasonEntry({ open, onClose, onActivate, expenses = [], config = null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  // Mandatory — the runway calc's seed cash figure. "" = unanswered (blocks
  // Next); any finite number >= 0, including 0, is a valid answer.
  const [cashOnHandDraft, setCashOnHandDraft] = useState("");
  // null = unanswered (Activate disabled); true/false once user picks.
  const [unemploymentAnswered, setUnemploymentAnswered] = useState(null);
  const [weeklyDraft, setWeeklyDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("");
  const [waitingWeek, setWaitingWeek] = useState(true);

  // ── Pending/final paycheck (§1.H15) — skippable, unlike cash-on-hand.
  // null = unanswered; true/false once picked. workedDays is a Set of
  // DAY_NAMES strings; arrivalDow is a JS getDay() value (0-6) or null.
  const [pendingCheckAnswered, setPendingCheckAnswered] = useState(null);
  const [workedDays, setWorkedDays] = useState(() => new Set());
  const [arrivalDow, setArrivalDow] = useState(null);

  const [step, setStep] = useState(0);
  const [trackedIds, setTrackedIds] = useState(() => new Set(expenses.map(e => e.id)));
  const [dueDateChoices, setDueDateChoices] = useState({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setCashOnHandDraft("");
    setUnemploymentAnswered(null);
    setWeeklyDraft("");
    setDurationDraft("");
    setWaitingWeek(true);
    setPendingCheckAnswered(null);
    setWorkedDays(new Set());
    setArrivalDow(null);
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

  // Accepts any finite non-negative number, including 0 — rejects empty and
  // anything that doesn't parse (letters can't get past type="number" in
  // practice, but this is the real gate, not the input type).
  const cashOnHandVal = cashOnHandDraft === "" ? null : parseFloat(cashOnHandDraft);
  const cashOnHandValid = cashOnHandDraft !== "" && Number.isFinite(cashOnHandVal) && cashOnHandVal >= 0;

  const hasUnemployment = unemploymentAnswered === true;
  const weeklyVal   = weeklyDraft   === "" ? null : Math.max(0, parseFloat(weeklyDraft)  || 0);
  const durationVal = durationDraft === "" ? null : Math.max(0, parseInt(durationDraft, 10) || 0);
  const unemploymentFieldsValid = !hasUnemployment || ((weeklyVal ?? 0) > 0 && (durationVal ?? 0) > 0);
  const step0Valid = !!date && cashOnHandValid && unemploymentAnswered !== null && unemploymentFieldsValid;

  // ── Pending check derivation (§1.H15) ────────────────────────────────
  const hasPendingCheck = pendingCheckAnswered === true;
  const pendingCheckValid = pendingCheckAnswered !== null && (!hasPendingCheck || arrivalDow !== null);
  const pendingPeriodEnd = hasPendingCheck
    ? resolveLastPayPeriodEnd(date, config?.payPeriodEndDay, config?.userPaySchedule)
    : null;
  const pendingArrivalDate = (hasPendingCheck && arrivalDow !== null && pendingPeriodEnd)
    ? resolvePendingCheckArrivalDate(pendingPeriodEnd, arrivalDow)
    : null;
  const pendingAmountEstimate = hasPendingCheck ? estimatePendingCheckAmount(workedDays.size, config) : 0;
  const toggleWorkedDay = (day) => setWorkedDays(prev => {
    const next = new Set(prev);
    if (next.has(day)) next.delete(day); else next.add(day);
    return next;
  });

  const hasExpenses = expenses.length > 0;
  const keptExpenses = expenses.filter(e => trackedIds.has(e.id));
  // Loans already carry a real payment date (loanMeta.firstPaymentDate) —
  // no need to make the user re-pick one, so the due-date step only lists
  // (and only requires a pick for) the non-loan bills that stayed checked.
  const keptPickableExpenses = keptExpenses.filter(e => e.type !== "loan");
  const dueDatesValid = keptPickableExpenses.every(e => {
    const v = dueDateChoices[e.id];
    return v?.mode === "custom" ? !!v.date : v?.mode === "week" ? !!v.week : false;
  });

  const toggleTracked = (id) => setTrackedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const buildConfigPatch = () => ({
    newJobSeasonMode: true,
    newJobSeasonDate: date,
    newJobSeasonCashOnHand: cashOnHandVal ?? 0,
    newJobSeasonCashOnHandAsOf: date,
    newJobSeasonPendingCheckAmount: hasPendingCheck ? Math.round(pendingAmountEstimate) : null,
    newJobSeasonPendingCheckDate: hasPendingCheck && pendingArrivalDate ? toLocalIso(pendingArrivalDate) : null,
    unemploymentEnabled: hasUnemployment,
    unemploymentWeekly: hasUnemployment ? weeklyVal : null,
    unemploymentDurationWeeks: hasUnemployment ? durationVal : null,
    unemploymentWaitingWeek: hasUnemployment ? waitingWeek : false,
  });

  const confirm = () => {
    if (!hasExpenses) {
      if (!step0Valid || !pendingCheckValid) return;
      onActivate(buildConfigPatch());
      onClose();
      return;
    }
    if (!dueDatesValid) { setAttempted(true); return; }
    const updatedExpenses = expenses.map(exp => {
      if (!trackedIds.has(exp.id)) return { ...exp, trackDuringNewJobSeason: false };
      if (exp.type === "loan") {
        // Attach the loan's own known payment date rather than asking again.
        return { ...exp, trackDuringNewJobSeason: true, dueDateAnchor: exp.loanMeta?.firstPaymentDate ?? exp.dueDateAnchor };
      }
      const anchor = resolveDueDateAnchor(dueDateChoices[exp.id], today);
      return { ...exp, trackDuringNewJobSeason: true, dueDateAnchor: anchor ?? exp.dueDateAnchor };
    });
    onActivate(buildConfigPatch(), updatedExpenses);
    onClose();
  };

  const goNext = () => {
    if (step === 0) {
      if (!step0Valid) { setAttempted(true); return; }
      setAttempted(false);
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!pendingCheckValid) { setAttempted(true); return; }
      setAttempted(false);
      if (!hasExpenses) { confirm(); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (keptPickableExpenses.length === 0) { confirm(); return; }
      setStep(3);
      return;
    }
    confirm();
  };

  const totalSteps = hasExpenses ? 4 : 2;
  const nextLabel = step === 0 ? "Next"
    : step === 1 ? (hasExpenses ? "Next" : "Activate")
    : step === 2 ? (keptPickableExpenses.length > 0 ? "Next" : "Activate")
    : "Activate";
  const nextDisabled = step === 0 ? !step0Valid : step === 1 ? !pendingCheckValid : step === 3 ? !dueDatesValid : false;
  // A native `disabled` button never dispatches onClick at all, so a click on
  // it can't reach goNext()'s `setAttempted(true)` branch — the red-border/
  // required feedback (TODO §1.H13) would never actually show. Steps 0/1's
  // buttons stay visually greyed via nextDisabled above but must stay truly
  // clickable so a tap while a required field is empty surfaces the error
  // instead of just doing nothing. Steps 2/3 keep the prior native-disabled
  // behavior (pre-existing gap there, not introduced here — see §1.H15).
  const nextNativeDisabled = (step === 0 || step === 1) ? false : nextDisabled;

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
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "5px" }}>
            Life Event{hasExpenses ? ` · Step ${step + 1} of 3` : ""}
          </div>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
            {step === 0 && "Start Your New Job Season"}
            {step === 1 && "Any paycheck still coming?"}
            {step === 2 && "Which bills do you want to track?"}
            {step === 3 && "When are these due?"}
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

              {/* ── Cash on hand (mandatory — seeds the runway calc) ── */}
              <div>
                <label style={{
                  ...labelStyle,
                  ...(attempted && !cashOnHandValid ? { color: "var(--color-deduction)" } : {}),
                }}>
                  Cash on hand right now
                </label>
                <input
                  type="number" min="0" step="1" inputMode="decimal"
                  value={cashOnHandDraft}
                  onChange={(e) => setCashOnHandDraft(e.target.value)}
                  placeholder="e.g. 1,023"
                  style={{
                    ...inputStyle,
                    transition: "border-color 0.15s",
                    ...(attempted && !cashOnHandValid ? { border: "1px solid var(--color-deduction)" } : {}),
                  }}
                />
                {attempted && !cashOnHandValid && (
                  <div style={{ fontSize: "10px", color: "var(--color-deduction)", marginTop: "4px", display: "flex", alignItems: "center", gap: "3px" }}>
                    ↑ Required — 0 is a fine answer, just not empty
                  </div>
                )}
                <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
                  Savings, checking — whatever you could draw on today. Seeds your runway math and
                  stays editable from Home or Budget once your New Job Season is active.
                </div>
              </div>

              {/* ── Unemployment Y/N gate (§1.C2) ── */}
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
                          color: active ? "var(--color-teal)" : "var(--color-text-secondary)",
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
                              color: active ? "var(--color-teal)" : "var(--color-text-secondary)",
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
                You can exit your New Job Season anytime via the <strong style={{ color: "var(--color-warning)" }}>Back to Work</strong> button
                in the app banner — that flow walks you through re-entering your new pay structure.
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
                A job loss rarely lands exactly on a payday — there's often one more check owed
                for days you already worked. Telling us about it makes your runway more accurate.
              </p>

              <div>
                <label style={labelStyle}>Any paycheck still coming from that job?</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[{ v: true, label: "Yes" }, { v: false, label: "No" }].map(opt => {
                    const active = pendingCheckAnswered === opt.v;
                    return (
                      <Pressable
                        key={opt.label}
                        onClick={() => setPendingCheckAnswered(opt.v)}
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

              {hasPendingCheck && (
                <>
                  <div>
                    <label style={labelStyle}>Days you worked in your final week</label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                      {DAY_NAMES.map(day => {
                        const worked = workedDays.has(day);
                        return (
                          <Pressable key={day} aria-label={`Worked ${day}`} onClick={() => toggleWorkedDay(day)} style={{
                            padding: "6px 10px", borderRadius: "6px", fontSize: "10px", letterSpacing: "1px",
                            textTransform: "uppercase", cursor: "pointer", fontWeight: worked ? "bold" : "normal",
                            border: `1px solid ${worked ? "rgba(34,197,94,0.5)" : "var(--color-border-subtle)"}`,
                            background: worked ? "rgba(34,197,94,0.13)" : "var(--color-bg-surface)",
                            color: worked ? "var(--color-green)" : "var(--color-text-secondary)",
                            transition: "background 0.15s, border-color 0.15s, color 0.15s",
                          }}>
                            {day}
                          </Pressable>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
                      0 days is fine if you'd already been paid up through your last day.
                    </div>
                  </div>

                  <div>
                    <label style={{
                      ...labelStyle,
                      ...(attempted && arrivalDow === null ? { color: "var(--color-deduction)" } : {}),
                    }}>
                      Which day do checks usually show up?
                    </label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                      {DAY_NAMES.map(day => {
                        const dow = DAY_TO_DOW[day];
                        const active = arrivalDow === dow;
                        return (
                          <Pressable key={day} aria-label={`Arrives ${day}`} onClick={() => setArrivalDow(dow)} style={{
                            padding: "6px 10px", borderRadius: "6px", fontSize: "10px", letterSpacing: "1px",
                            textTransform: "uppercase", cursor: "pointer", fontWeight: active ? "bold" : "normal",
                            border: `1px solid ${active ? "rgba(0,200,150,0.5)" : "var(--color-border-subtle)"}`,
                            background: active ? "rgba(0,200,150,0.13)" : "var(--color-bg-surface)",
                            color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                            transition: "background 0.15s, border-color 0.15s, color 0.15s",
                          }}>
                            {day}
                          </Pressable>
                        );
                      })}
                    </div>
                    {attempted && arrivalDow === null && (
                      <div style={{ fontSize: "10px", color: "var(--color-deduction)", marginTop: "4px", display: "flex", alignItems: "center", gap: "3px" }}>
                        ↑ Required to estimate when the check lands
                      </div>
                    )}
                  </div>

                  {pendingArrivalDate && (
                    <div style={{
                      background: "rgba(0,200,150,0.08)",
                      border: "1px solid rgba(0,200,150,0.28)",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "12px", color: "var(--color-text-primary)", lineHeight: 1.5,
                    }}>
                      Estimated <strong>${Math.round(pendingAmountEstimate).toLocaleString()}</strong> arriving{" "}
                      <strong>
                        {pendingArrivalDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </strong>. This feeds your runway on the day it's due — not before.
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && (
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
                              color: "var(--color-bg-base)", background: "var(--color-teal)",
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

          {step === 3 && (
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
            disabled={nextNativeDisabled}
            style={{
              background: nextDisabled ? "var(--color-bg-raised)" : "var(--color-teal)",
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
