/**
 * WeekConfirmModal — Two-layer weekly check-in modal
 *
 * Layer 1 — Day grid:
 *   Shows Mon–Sun as rows. Each day has one of three toggle states:
 *     true  = worked   (scheduled days default here)
 *     false = missed   (scheduled days only)
 *     null  = off      (unscheduled days default here; can be toggled to pickup)
 *
 *   Net shift delta = pickupDays.length − missedScheduledDays.length
 *     = 0 → same total hours (even if different days) → confirm clean, skip Layer 2
 *     < 0 → fewer shifts than scheduled → Layer 2 pre-filled as missed event
 *     > 0 → extra shifts worked → Layer 2 pre-filled as bonus event
 *
 * Layer 2 — Full event log form (same fields as LogPanel's event creation):
 *   Lets the user log what caused the schedule difference.
 *   Pre-fills type/days/amounts from the delta, but all fields are editable.
 *   Calls onConfirm(confirmation, logEntry) on "Log & Confirm".
 *
 * Props:
 *   week    — week object from buildYear(): { idx, weekStart, weekEnd, workedDayNames, rotation }
 *   config  — user config (shiftHours, baseRate, payPeriodEndDay, etc.)
 *   onConfirm(confirmation, logEntry|null) — called on confirm; logEntry is null for net-zero
 *   onDismiss() — session-only skip; badge persists in sidebar until confirmed
 */
import { useState, useEffect } from "react";
import { EVENT_TYPES } from "../constants/config.js";
import { calcEventImpact, toLocalIso } from "../lib/finance.js";
import { formatRotationDisplay } from "../lib/rotation.js";
import { iS, lS } from "./ui.jsx";

// Canonical day ordering — must match LogPanel's DayPicker to keep missedDays arrays consistent
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtDate = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Formats absolute dollar amounts for display (no sign, always 2 decimal places)
const f2 = n => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Given a weekStart date, returns an array of 7 Date objects aligned to
 * DAY_NAMES order: [Mon, Tue, Wed, Thu, Fri, Sat, Sun].
 * Computes each date from weekStart's actual day-of-week so the function
 * stays correct even if FISCAL_YEAR_START ever shifts to a non-Monday.
 *
 * DAY_NAMES index → JS getDay(): Mon→1, Tue→2, Wed→3, Thu→4, Fri→5, Sat→6, Sun→0
 * offset = (targetDow - startDow + 7) % 7
 */
function weekDayDates(weekStart) {
  const startDow = weekStart.getDay(); // 0=Sun,1=Mon,...,6=Sat
  return DAY_NAMES.map((_, i) => {
    const targetDow = (i + 1) % 7; // Mon→1, Tue→2, ..., Sun→0
    const offset = (targetDow - startDow + 7) % 7;
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset);
    return d;
  });
}

// ── Shared DayPicker (matches LogPanel's style exactly) ──────────────────────
// Used in Layer 2 for missed_unpaid / missed_unapproved event types.
// Only scheduled days are interactive — unscheduled days render as disabled stubs
// so the form stays consistent with what LogPanel shows for the same week.
function DayPicker({ scheduledDays, missedDays, onToggle }) {
  return (
    <div>
      <label style={lS}>Days Missed</label>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
        {DAY_NAMES.map(day => {
          const isScheduled = scheduledDays.includes(day);
          const isMissed = missedDays.includes(day);
          return (
            <button key={day} type="button" onClick={() => isScheduled && onToggle(day)} style={{
              padding: "6px 10px", borderRadius: "3px", fontSize: "10px", letterSpacing: "1px",
              cursor: isScheduled ? "pointer" : "default",
              border: isMissed ? "1px solid var(--color-red)" : isScheduled ? "1px solid var(--color-text-disabled)" : "1px solid var(--color-border-subtle)",
              background: isMissed ? "rgba(239,68,68,0.13)" : isScheduled ? "var(--color-bg-surface)" : "var(--color-bg-base)",
              color: isMissed ? "var(--color-red)" : isScheduled ? "var(--color-text-secondary)" : "var(--color-text-disabled)",
              fontWeight: isMissed ? "bold" : "normal", textTransform: "uppercase",
            }}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeekConfirmModal({ week, config, onConfirm, onDismiss, isAdmin = false }) {
  // ── Layer 1 state ─────────────────────────────────────────────────────────
  // Scheduled days default to true (worked); unscheduled days default to null (off, but clickable)
  const [dayToggles, setDayToggles] = useState(() =>
    Object.fromEntries(DAY_NAMES.map(d => [d, week.workedDayNames.includes(d) ? true : null]))
  );
  const [layer, setLayer] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [wentToLayer2, setWentToLayer2] = useState(false);
  const [skipWarning, setSkipWarning] = useState(false);

  // ── Layer 2 form state (mirrors LogPanel's blank event shape) ─────────────
  const [eventVals, setEventVals] = useState({});
  // DHL OT confirmation — one entry per requiredOtShifts slot: null=unanswered, "missed", or a day name
  const requiredOtCount = week.requiredOtShifts ?? 0;
  const [otDays, setOtDays] = useState(() => Array(requiredOtCount).fill(null));

  const scheduledDays = week.workedDayNames;
  const missedScheduledDays = scheduledDays.filter(d => dayToggles[d] === false);
  // Custom-schedule users: exclude confirmed OT days from pickups so hitting the
  // custom target via requiredOtShifts doesn't inflate netShiftDelta as a "bonus".
  const hasCustomSchedule = config.customWeeklyHours != null && config.employerPreset === "DHL";
  const pickupDays = DAY_NAMES.filter(d =>
    !scheduledDays.includes(d) &&
    (!hasCustomSchedule || !workedOtDays.includes(d)) &&
    dayToggles[d] === true
  );
  const netShiftDelta = pickupDays.length - missedScheduledDays.length;
  // Total planned hours: scheduled worked + confirmed OT + extra pickups
  const totalHoursPlanned = hasCustomSchedule
    ? (scheduledDays.length - missedScheduledDays.length + workedOtDays.length + pickupDays.length) * config.shiftHours
    : null;
  const customGap = hasCustomSchedule ? Math.max((config.customWeeklyHours ?? 0) - totalHoursPlanned, 0) : null;
  const customShiftsNeeded = customGap != null ? Math.ceil(customGap / config.shiftHours) : 0;
  // Days available to close the custom gap (not scheduled, not already confirmed as OT, not yet picked up)
  const extraPickupCandidates = hasCustomSchedule
    ? DAY_NAMES.filter(d => !scheduledDays.includes(d) && !workedOtDays.includes(d) && dayToggles[d] !== true)
    : [];

  const dayDates = weekDayDates(week.weekStart);
  // Pay period starts the day after payPeriodEndDay (e.g. end=Sun→start=Mon=1)
  const payPeriodStartDow = ((config.payPeriodEndDay ?? 0) + 1) % 7;
  const rotationDisplay = formatRotationDisplay(week, { isAdmin });

  // DHL OT tracking
  const requiresOtSelection = config.employerPreset === "DHL" && requiredOtCount > 0;
  const anyOtMissed = otDays.some(d => d === "missed");
  const missedOtCount = otDays.filter(d => d === "missed").length;
  const workedOtDays = otDays.filter(d => d && d !== "missed");

  useEffect(() => {
    if (!requiresOtSelection && otDays.some(d => d !== null)) {
      setOtDays(Array(requiredOtCount).fill(null));
    }
  }, [requiresOtSelection]);

  // Sets a specific OT slot; keeps dayToggles in sync for the changed slot.
  const selectOtDayAt = (slotIdx, value) => {
    const oldValue = otDays[slotIdx];
    setOtDays(prev => {
      const next = [...prev];
      next[slotIdx] = value;
      return next;
    });
    setDayToggles(prev => {
      const next = { ...prev };
      // Clear the previous day for this slot (unless another slot also holds it)
      if (oldValue && oldValue !== "missed") {
        const usedElsewhere = otDays.some((d, i) => i !== slotIdx && d === oldValue);
        if (!usedElsewhere) next[oldValue] = null;
      }
      if (value && value !== "missed") next[value] = true;
      return next;
    });
  };

  const otSelectionMissing = requiresOtSelection && otDays.some(d => d === null);
  const logSwapDisabled = otSelectionMissing || anyOtMissed;

  // ── Toggle handler: 3 states ──────────────────────────────────────────────
  const toggleDay = (day) => {
    const isScheduled = scheduledDays.includes(day);
    setDayToggles(t => ({
      ...t,
      // Scheduled: true (worked) ↔ false (missed)
      // Unscheduled: null (off) ↔ true (pickup)
      [day]: isScheduled ? !t[day] : (t[day] === null ? true : null),
    }));
  };

  // ── Layer 2 event form helpers ────────────────────────────────────────────

  // Toggles a day in/out of eventVals.missedDays and keeps the derived counts
  // (shiftsLost, weekendShifts, hoursLost) in sync.
  // NOTE: switching between missed_unpaid and missed_unapproved via changeEventType
  //   resets missedDays to [] — this is intentional (type implies different context)
  //   but means day selections don't survive a type change.
  const toggleMissedDay = (day) => {
    setEventVals(v => {
      const prev = Array.isArray(v.missedDays) ? v.missedDays : [];
      const next = prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day];
      const weekendShifts = next.filter(d => d === "Fri" || d === "Sat" || d === "Sun").length;
      return { ...v, missedDays: next, shiftsLost: next.length, weekendShifts, hoursLost: next.length * config.shiftHours };
    });
  };

  // Resets all type-specific numeric fields when the event type selector changes.
  // This prevents stale "shiftsLost" from a missed type leaking into a bonus type, etc.
  const changeEventType = (type) => {
    setEventVals(v => ({ ...v, type, missedDays: [], shiftsLost: 0, weekendShifts: 0, hoursLost: 0, ptoHours: 0, amount: 0 }));
  };

  // ── Impact preview for Layer 2 ────────────────────────────────────────────
  // Re-runs calcEventImpact live as the user edits the form so they see the
  // projected net change before committing. Guard on weekEnd to avoid calling
  // calcEventImpact with an empty event object before Layer 2 is initialized.
  const previewImpact = eventVals.weekEnd ? calcEventImpact(eventVals, config) : null;

  // ── Vacuous event guard ────────────────────────────────────────────────────
  // A missed_unpaid/missed_unapproved entry with zero shifts, zero hours, and
  // no days selected is a financially inert no-op that would only clutter the log.
  // Block "Log & Confirm" in this state; warn the user visually.
  const isVacuousEvent = (
    (eventVals.type === "missed_unpaid" || eventVals.type === "missed_unapproved") &&
    (parseInt(eventVals.shiftsLost) || 0) === 0 &&
    (parseFloat(eventVals.hoursLost) || 0) === 0 &&
    (eventVals.missedDays ?? []).length === 0
  );

  // ── Layer 1 save ──────────────────────────────────────────────────────────
  // Called when user clicks "Confirm Week" or "Next →".
  //
  // Net-zero path (delta === 0):
  //   Missed days exactly offset by pickup days → same total hours worked.
  //   Saves confirmation record immediately with eventId: null (no log entry needed).
  //
  // Non-zero path (deficit or surplus):
  //   Initializes the Layer 2 event form with smart pre-fills:
  //     Deficit → type: "missed_unpaid", missedDays pre-selected, hours computed
  //     Surplus → type: "bonus", amount pre-filled as gross pickup estimate
  //   User can change any field before confirming. Goes to Layer 2.
  const handleSave = () => {
    if (otSelectionMissing) {
      return;
    }
    // DHL preset: any missed OT → pre-fill Layer 2 as unapproved miss (hits bucket hours)
    if (requiresOtSelection && anyOtMissed) {
      setEventVals({
        weekEnd: toLocalIso(week.weekEnd),
        weekIdx: week.idx,
        weekRotation: week.rotation,
        type: "missed_unapproved",
        missedDays: [],
        shiftsLost: missedOtCount,
        weekendShifts: 0,
        hoursLost: missedOtCount * config.shiftHours,
        amount: 0,
        ptoHours: 0,
        note: hasCustomSchedule
          ? (missedOtCount === 1 ? `Custom schedule extension shift not worked (${config.customWeeklyHours}h target)` : `${missedOtCount} custom schedule extension shifts not worked (${config.customWeeklyHours}h target)`)
          : (missedOtCount === 1 ? "Mandatory OT shift not worked" : `${missedOtCount} mandatory OT shifts not worked`),
      });
      setLayer(2);
      setWentToLayer2(true);
      return;
    }

    if (netShiftDelta === 0) {
      // Net-zero: same total hours regardless of which days — confirm clean
      onConfirm({
        confirmedAt: new Date().toISOString(),
        dayToggles, scheduledDays, missedScheduledDays, pickupDays,
        netShiftDelta: 0, eventId: null,
        ...(requiresOtSelection ? {
          otDays,
          otDay: otDays[0] ?? null,
          otDayIsWeekend: !!(otDays[0] && otDays[0] !== "missed" && ["Sat", "Sun"].includes(otDays[0])),
        } : {}),
      }, null);
      return;
    }
    const isDeficit = netShiftDelta < 0;
    setEventVals({
      weekEnd: toLocalIso(week.weekEnd),
      weekIdx: week.idx,
      weekRotation: week.rotation,
      type: isDeficit ? "missed_unpaid" : "bonus",
      missedDays: isDeficit ? missedScheduledDays : [],
      shiftsLost: isDeficit ? missedScheduledDays.length : 0,
      weekendShifts: isDeficit ? missedScheduledDays.filter(d => d === "Fri" || d === "Sat" || d === "Sun").length : 0,
      hoursLost: isDeficit ? missedScheduledDays.length * config.shiftHours : 0,
      // Surplus: estimate gross (pre-tax) from pickup shifts so the amount field
      // has a useful starting value. User should verify the actual payout.
      amount: !isDeficit ? pickupDays.length * config.shiftHours * config.baseRate : 0,
      ptoHours: 0,
      note: requiresOtSelection && workedOtDays.length > 0
        ? workedOtDays.map(d => `OT day: ${d}${["Sat", "Sun"].includes(d) ? " (weekend — diff applies)" : ""}`).join("; ")
        : "",
    });
    setLayer(2);
    setWentToLayer2(true);
  };

  // ── Log Swap handler (net-zero case with actual day changes) ──────────────
  // Net-zero means equal shift count but different days — may affect pay (e.g.
  // missed weekday Mon, worked weekend Sun earns diffRate). Lets the user log it.
  const handleLogSwap = () => {
    if (logSwapDisabled) {
      return;
    }
    setEventVals({
      weekEnd: toLocalIso(week.weekEnd),
      weekIdx: week.idx,
      weekRotation: week.rotation,
      type: "missed_unpaid",
      missedDays: missedScheduledDays,
      shiftsLost: missedScheduledDays.length,
      weekendShifts: missedScheduledDays.filter(d => d === "Fri" || d === "Sat" || d === "Sun").length,
      hoursLost: missedScheduledDays.length * config.shiftHours,
      shiftsGained: pickupDays.length,
      hoursGained: pickupDays.length * config.shiftHours,
      amount: 0,
      ptoHours: 0,
      note: `Day swap — missed ${missedScheduledDays.join(", ")}, picked up ${pickupDays.join(", ")}`,
    });
    setLayer(2);
    setWentToLayer2(true);
  };

  // ── Custom schedule shortfall handler ────────────────────────────────────
  // Logs the remaining gap as missed_unpaid when user can't hit their custom target.
  const handleMarkShort = () => {
    setEventVals({
      weekEnd: toLocalIso(week.weekEnd),
      weekIdx: week.idx,
      weekRotation: week.rotation,
      type: "missed_unpaid",
      missedDays: [],
      shiftsLost: customShiftsNeeded,
      weekendShifts: 0,
      hoursLost: customShiftsNeeded * config.shiftHours,
      amount: 0,
      ptoHours: 0,
      note: `Custom schedule shortfall — ${customShiftsNeeded} shift${customShiftsNeeded !== 1 ? 's' : ''} not worked (${config.customWeeklyHours}h/week target)`,
    });
    setLayer(2);
    setWentToLayer2(true);
  };

  // ── Layer 2 confirm ───────────────────────────────────────────────────────
  // Builds the final log entry from eventVals, coercing all numeric fields to
  // proper number types (inputs return strings; || 0 guards empty strings).
  // The resulting logEntry is the same shape as entries created by LogPanel —
  // it will be appended to `logs` by App.jsx's onConfirm handler and
  // processed by calcEventImpact for all downstream math.
  const handleConfirmLayer2 = () => {
    const logEntry = {
      ...eventVals,
      // eslint-disable-next-line react-hooks/purity
      id: Date.now(),
      shiftsLost:   parseInt(eventVals.shiftsLost)   || 0,
      weekendShifts: parseInt(eventVals.weekendShifts) || 0,
      ptoHours:     parseFloat(eventVals.ptoHours)   || 0,
      hoursLost:    parseFloat(eventVals.hoursLost)  || 0,
      amount:       parseFloat(eventVals.amount)     || 0,
    };
    onConfirm({
      confirmedAt: new Date().toISOString(),
      dayToggles, scheduledDays, missedScheduledDays, pickupDays,
      netShiftDelta, eventId: logEntry.id,
      ...(requiresOtSelection ? {
        otDays,
        otDay: otDays[0] ?? null,
        otDayIsWeekend: !!(otDays[0] && otDays[0] !== "missed" && ["Sat", "Sun"].includes(otDays[0])),
      } : {}),
    }, logEntry);
  };

  const weekStartDate = fmtDate(week.weekStart);
  const weekEndDate = fmtDate(week.weekEnd);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      background: "rgba(0,0,0,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px",
        width: "100%", maxWidth: "460px",
        overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "5px" }}>
                Week {week.idx} Check-In
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
                {weekStartDate} — {weekEndDate}
              </div>
            </div>
            <span style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-text-secondary)", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", padding: "4px 9px", borderRadius: "3px", textTransform: "uppercase", marginTop: "2px" }}>
              {rotationDisplay}
            </span>
          </div>
        </div>

        {/* ────────────────── LAYER 1 — Day grid ────────────────── */}
        {/* Each row is a day of the week. Visual state per toggle value:
              true  (worked):  green "Worked" pill active
              false (missed):  coral "Missed" pill active
              null  (off):     greyed "+ Pickup" button (unscheduled days only)
        */}
        {layer === 1 && (
          <>
            <div style={{ overflowY: "auto", flex: 1 }}>
              <div style={{ padding: "6px 20px 4px", fontSize: "9px", color: "var(--color-text-disabled)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                Mark your actual week — tap any day to update
              </div>

              {DAY_NAMES.map((day, i) => {
                const isScheduled = scheduledDays.includes(day);
                const toggle = dayToggles[day]; // true=worked, false=missed, null=off
                const date = dayDates[i];
                const isPickup = !isScheduled && toggle === true;
                // Pay period start overlay — marks the first day of the new pay period
                const isPayStart = date.getDay() === payPeriodStartDow;

                return (
                  <div key={day} style={{
                    display: "flex", alignItems: "center",
                    padding: "9px 20px",
                    borderBottom: "1px solid var(--color-border-subtle)",
                    borderTop: isPayStart ? "1px solid rgba(0,200,150,0.15)" : undefined,
                  }}>
                    {/* Day + date */}
                    <div style={{ width: "86px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "bold", color: isScheduled ? "var(--color-text-primary)" : "var(--color-text-disabled)", letterSpacing: "1px" }}>{day}</div>
                        {isPayStart && (
                          <span style={{ fontSize: "7px", letterSpacing: "1.5px", color: "var(--color-gold)", textTransform: "uppercase", opacity: 0.7 }}>pay start</span>
                        )}
                      </div>
                      <div style={{ fontSize: "9px", color: "var(--color-text-disabled)" }}>{fmtDate(date)}</div>
                    </div>

                    {/* Shift label */}
                    <div style={{ flex: 1 }}>
                      {isScheduled
                        ? <span style={{ fontSize: "9px", color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "1px" }}>{config.shiftHours}h shift</span>
                        : isPickup
                          ? <span style={{ fontSize: "9px", color: "rgba(34,197,94,0.53)", textTransform: "uppercase", letterSpacing: "1px" }}>pickup</span>
                          : <span style={{ fontSize: "9px", color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "1px" }}>off</span>
                      }
                    </div>

                    {/* Scheduled day — Worked / Missed pill */}
                    {isScheduled && (
                      <div style={{ display: "flex", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--color-border-subtle)" }}>
                        <button onClick={() => setDayToggles(t => ({ ...t, [day]: true }))} style={{
                          padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                          cursor: "pointer", border: "none", borderRight: "1px solid var(--color-border-subtle)",
                          fontWeight: toggle === true ? "bold" : "normal",
                          background: toggle === true ? "rgba(34,197,94,0.13)" : "var(--color-bg-surface)",
                          color: toggle === true ? "var(--color-green)" : "var(--color-text-disabled)",
                          transition: "background 0.15s, color 0.15s",
                        }}>Worked</button>
                        <button onClick={() => setDayToggles(t => ({ ...t, [day]: false }))} style={{
                          padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                          cursor: "pointer", border: "none",
                          fontWeight: toggle === false ? "bold" : "normal",
                          background: toggle === false ? "rgba(239,68,68,0.13)" : "var(--color-bg-surface)",
                          color: toggle === false ? "var(--color-red)" : "var(--color-text-disabled)",
                          transition: "background 0.15s, color 0.15s",
                        }}>Missed</button>
                      </div>
                    )}

                    {/* Unscheduled day — single "Pickup Shift" toggle */}
                    {!isScheduled && (
                      <button onClick={() => toggleDay(day)} style={{
                        padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                        cursor: "pointer", border: `1px solid ${isPickup ? "rgba(34,197,94,0.33)" : "var(--color-border-subtle)"}`,
                        borderRadius: "4px",
                        background: isPickup ? "rgba(76,175,125,0.09)" : "var(--color-bg-base)",
                        color: isPickup ? "var(--color-green)" : "var(--color-text-disabled)",
                        transition: "background 0.15s, color 0.15s, border-color 0.15s",
                      }}>
                        {isPickup ? "✓ Pickup" : "+ Pickup"}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Net summary row — only shown when at least one day is non-default.
                  Shows the running delta so the user can see the impact before saving.
                  "Net hours unchanged" copy is intentionally calm — it's good news. */}
              {(missedScheduledDays.length > 0 || pickupDays.length > 0) && (
                <div style={{ margin: "10px 20px", padding: "10px 14px", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", fontSize: "10px" }}>
                  {missedScheduledDays.length > 0 && (
                    <div style={{ color: "var(--color-red)", marginBottom: pickupDays.length ? "4px" : 0 }}>
                      − {missedScheduledDays.length} missed: {missedScheduledDays.join(", ")}
                    </div>
                  )}
                  {pickupDays.length > 0 && (
                    <div style={{ color: "var(--color-green)", marginBottom: netShiftDelta !== 0 ? "4px" : 0 }}>
                      + {pickupDays.length} pickup: {pickupDays.join(", ")}
                    </div>
                  )}
                  {netShiftDelta === 0 && missedScheduledDays.length > 0 && (
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "9px", letterSpacing: "1px" }}>Net hours unchanged — confirming clean</div>
                  )}
                  {netShiftDelta !== 0 && (
                    <div style={{ color: netShiftDelta > 0 ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold", fontSize: "9px", letterSpacing: "1px" }}>
                      Net: {netShiftDelta > 0 ? "+" : ""}{netShiftDelta} shift{Math.abs(netShiftDelta) !== 1 ? "s" : ""} — review on next screen
                    </div>
                  )}
                </div>
              )}

              {requiresOtSelection && (
                <div style={{ margin: "12px 20px 0", padding: "12px 14px", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "1.5px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: "6px" }}>
                    {hasCustomSchedule
                      ? `Schedule Extension — ${requiredOtCount === 1 ? "1 additional shift" : `${requiredOtCount} additional shifts`} to reach ${config.customWeeklyHours}h`
                      : `Mandatory OT ${requiredOtCount === 1 ? "Shift" : `Shifts (${requiredOtCount} required)`}`}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5", marginBottom: "10px" }}>
                    {hasCustomSchedule
                      ? `Your ${config.customWeeklyHours}h/week target requires ${requiredOtCount === 1 ? "1 extra shift" : `${requiredOtCount} extra shifts`} beyond your base rotation. Pick the day${requiredOtCount !== 1 ? "s" : ""} you worked or mark as missed — missed shifts hit your attendance bucket.`
                      : `DHL rotations include ${requiredOtCount === 1 ? "a required OT shift" : `${requiredOtCount} required OT shifts`} each week. Pick the day you worked or mark "Missed". Weekend selections automatically apply the differential.`}
                  </div>
                  {Array.from({ length: requiredOtCount }, (_, slotIdx) => {
                    const otDaysWorkedOtherSlots = otDays.filter((d, i) => i !== slotIdx && d && d !== "missed");
                    const slotCandidates = DAY_NAMES.filter(d => !scheduledDays.includes(d) && !otDaysWorkedOtherSlots.includes(d));
                    const slotValue = otDays[slotIdx];
                    const slotIsWeekend = !!(slotValue && slotValue !== "missed" && ["Sat", "Sun"].includes(slotValue));
                    return (
                      <div key={slotIdx} style={{ marginTop: slotIdx > 0 ? "12px" : "0" }}>
                        {requiredOtCount > 1 && (
                          <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", letterSpacing: "1px", marginBottom: "6px", textTransform: "uppercase" }}>
                            {hasCustomSchedule ? `Extension Shift ${slotIdx + 1}` : `OT Shift ${slotIdx + 1}`}
                          </div>
                        )}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {slotCandidates.map(day => {
                            const active = slotValue === day;
                            const weekend = day === "Sat" || day === "Sun";
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => selectOtDayAt(slotIdx, day)}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "4px",
                                  fontSize: "9px",
                                  letterSpacing: "1px",
                                  textTransform: "uppercase",
                                  border: active ? "1px solid rgba(34,197,94,0.6)" : "1px solid var(--color-border-subtle)",
                                  background: active ? "rgba(34,197,94,0.12)" : "var(--color-bg-surface)",
                                  color: weekend ? "var(--color-green)" : "var(--color-text-secondary)",
                                  fontWeight: active ? "bold" : "normal",
                                  cursor: "pointer",
                                  display: "flex",
                                  gap: "6px",
                                  alignItems: "center",
                                }}
                              >
                                {active ? "✓" : "+"} {day}
                                {weekend && (
                                  <span style={{ fontSize: "8px", letterSpacing: "1px", color: "var(--color-text-disabled)" }}>
                                    weekend
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => selectOtDayAt(slotIdx, "missed")}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "4px",
                              fontSize: "9px",
                              letterSpacing: "1px",
                              textTransform: "uppercase",
                              border: slotValue === "missed" ? "1px solid rgba(239,68,68,0.6)" : "1px solid var(--color-border-subtle)",
                              background: slotValue === "missed" ? "rgba(239,68,68,0.12)" : "var(--color-bg-surface)",
                              color: slotValue === "missed" ? "var(--color-red)" : "var(--color-text-secondary)",
                              fontWeight: slotValue === "missed" ? "bold" : "normal",
                              cursor: "pointer",
                            }}
                          >
                            {slotValue === "missed" ? "✓ Missed" : "Missed"}
                          </button>
                        </div>
                        <div style={{
                          marginTop: "8px",
                          fontSize: "10px",
                          color: slotValue === "missed"
                            ? "var(--color-red)"
                            : slotValue
                              ? (slotIsWeekend ? "var(--color-green)" : "var(--color-text-secondary)")
                              : "var(--color-text-disabled)",
                          letterSpacing: "0.5px",
                        }}>
                          {slotValue === "missed"
                            ? "Shift not worked — will be logged and hits your attendance bucket."
                            : slotValue
                              ? (slotIsWeekend ? "Weekend shift earns your diff rate automatically." : "Weekday shift does not include the differential.")
                              : `Required — select the day or mark it missed to continue.`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Custom Schedule Target tracker ───────────────────────────
                  Shown for DHL users with customWeeklyHours set. Displays live
                  progress toward the weekly hour target as the user fills in the
                  day grid and OT/extension section, with day pickers and a
                  "mark short" escape hatch for weeks where the target can't be met.
              */}
              {hasCustomSchedule && (
                <div style={{ margin: "12px 20px 4px", padding: "12px 14px", background: "var(--color-bg-base)", border: `1px solid ${customGap === 0 ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.35)"}`, borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: customGap === 0 ? "4px" : "8px" }}>
                    <span style={{ fontSize: "9px", letterSpacing: "1.5px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>
                      Custom Schedule Target
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: "bold", color: customGap === 0 ? "var(--color-green)" : "var(--color-warning)" }}>
                      {totalHoursPlanned}h / {config.customWeeklyHours}h
                    </span>
                  </div>
                  {customGap === 0 ? (
                    <div style={{ fontSize: "10px", color: "var(--color-green)" }}>✓ On target for this week.</div>
                  ) : (
                    <>
                      <div style={{ fontSize: "10px", color: "var(--color-warning)", marginBottom: "10px", lineHeight: "1.5" }}>
                        {customShiftsNeeded} shift{customShiftsNeeded !== 1 ? "s" : ""} ({customGap}h) short of your {config.customWeeklyHours}h target.
                        {requiresOtSelection && otSelectionMissing ? " Complete the extension shift selection above first." : " Add a day below or mark the shortfall."}
                      </div>
                      {!otSelectionMissing && extraPickupCandidates.length > 0 && (
                        <div style={{ marginBottom: "10px" }}>
                          <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Add a day:</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {extraPickupCandidates.map(day => {
                              const weekend = day === "Sat" || day === "Sun";
                              return (
                                <button key={day} type="button" onClick={() => toggleDay(day)} style={{
                                  padding: "6px 12px", borderRadius: "4px", fontSize: "9px", letterSpacing: "1px",
                                  textTransform: "uppercase", cursor: "pointer",
                                  border: "1px solid var(--color-border-subtle)",
                                  background: "var(--color-bg-surface)",
                                  color: weekend ? "var(--color-green)" : "var(--color-text-secondary)",
                                }}>
                                  + {day}{weekend ? " (diff)" : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {!otSelectionMissing && (
                        <button type="button" onClick={handleMarkShort} style={{
                          padding: "7px 14px", borderRadius: "4px", fontSize: "9px", letterSpacing: "1.5px",
                          textTransform: "uppercase", cursor: "pointer",
                          border: "1px solid rgba(239,68,68,0.4)", background: "transparent", color: "var(--color-red)",
                        }}>
                          Mark {customShiftsNeeded} shift{customShiftsNeeded !== 1 ? "s" : ""} short
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Layer 1 footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-border-subtle)", flexShrink: 0 }}>
              {skipWarning ? (
                /* Abandon warning — shown when user tries to skip after starting Layer 2 */
                <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "10px", color: "var(--color-red)", marginBottom: "8px" }}>
                    You started logging an event — skip anyway?
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => setSkipWarning(false)} style={{
                      background: "transparent", border: "none", color: "var(--color-text-secondary)",
                      fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", padding: "6px 0",
                    }}>
                      ← Keep logging
                    </button>
                    <button onClick={onDismiss} style={{
                      background: "var(--color-red)", color: "var(--color-bg-base)", border: "none",
                      borderRadius: "4px", padding: "8px 16px", fontSize: "10px",
                      letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold",
                    }}>
                      Yes, skip
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button onClick={() => wentToLayer2 ? setSkipWarning(true) : onDismiss()} style={{
                    background: "transparent", border: "none", color: "var(--color-text-disabled)",
                    fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                    cursor: "pointer", padding: "6px 0",
                  }}>
                    Skip for now
                  </button>
              {netShiftDelta === 0 && (missedScheduledDays.length > 0 || pickupDays.length > 0) ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={handleSave} disabled={otSelectionMissing} style={{
                    background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)",
                    borderRadius: "4px", padding: "9px 16px", fontSize: "10px",
                    letterSpacing: "2px", textTransform: "uppercase",
                    cursor: otSelectionMissing ? "not-allowed" : "pointer",
                    opacity: otSelectionMissing ? 0.5 : 1,
                  }}>
                    Confirm Clean
                  </button>
                  <button onClick={handleLogSwap} disabled={logSwapDisabled} style={{
                    background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none",
                    borderRadius: "4px", padding: "9px 16px", fontSize: "10px",
                    letterSpacing: "2px", textTransform: "uppercase",
                    cursor: logSwapDisabled ? "not-allowed" : "pointer",
                    opacity: logSwapDisabled ? 0.5 : 1,
                    fontWeight: "bold",
                  }}>
                    Log Swap →
                  </button>
                </div>
              ) : (
                <button onClick={handleSave} disabled={otSelectionMissing} style={{
                  background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none",
                  borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                  letterSpacing: "2px", textTransform: "uppercase",
                  cursor: otSelectionMissing ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                  opacity: otSelectionMissing ? 0.5 : 1,
                }}>
                  {netShiftDelta !== 0 ? "Next →" : "Confirm Week"}
                </button>
              )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ────────────────── LAYER 2 — Full event form ────────────────── */}
        {/* Identical in structure to LogPanel's event creation form. Pre-filled from
            the Layer 1 day grid but fully editable. All numeric inputs store as strings
            in eventVals; handleConfirmLayer2() coerces to numbers before adding to logs.
        */}
        {layer === 2 && (
          <>
            <div style={{ overflowY: "auto", flex: 1, padding: "18px 20px" }}>

              {/* Net delta summary — non-interactive; reminds user why they're here */}
              <div style={{
                marginBottom: "16px", padding: "10px 14px",
                background: netShiftDelta < 0 ? "rgba(239,68,68,0.08)" : "var(--color-bg-raised)",
                border: `1px solid ${netShiftDelta < 0 ? "rgba(239,68,68,0.27)" : "rgba(34,197,94,0.27)"}`,
                borderRadius: "6px", fontSize: "10px",
                color: netShiftDelta < 0 ? "var(--color-red)" : "var(--color-green)",
              }}>
                {netShiftDelta < 0
                  ? `${Math.abs(netShiftDelta)} fewer shift${Math.abs(netShiftDelta) !== 1 ? "s" : ""} than scheduled this week`
                  : `${netShiftDelta} extra shift${netShiftDelta !== 1 ? "s" : ""} worked beyond schedule`
                }
                {missedScheduledDays.length > 0 && <div style={{ color: "var(--color-text-secondary)", marginTop: "3px", fontSize: "9px" }}>Missed: {missedScheduledDays.join(", ")}</div>}
                {pickupDays.length > 0 && <div style={{ color: "var(--color-text-secondary)", marginTop: "3px", fontSize: "9px" }}>Pickup: {pickupDays.join(", ")}</div>}
              </div>

              {/* Event type */}
              <div style={{ marginBottom: "12px" }}>
                <label style={lS}>What happened?</label>
                <select value={eventVals.type || ""} onChange={e => changeEventType(e.target.value)} style={{ ...iS, marginTop: "4px" }}>
                  {Object.entries(EVENT_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>

              {/* DayPicker + shifts/hours override — for missed types */}
              {(eventVals.type === "missed_unpaid" || eventVals.type === "missed_unapproved") && (
                <div style={{ marginBottom: "12px" }}>
                  <DayPicker
                    scheduledDays={scheduledDays}
                    missedDays={Array.isArray(eventVals.missedDays) ? eventVals.missedDays : []}
                    onToggle={toggleMissedDay}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
                    <div>
                      <label style={lS}>Shifts Missed</label>
                      <input type="number" min="0" value={eventVals.shiftsLost ?? 0}
                        onChange={e => setEventVals(v => ({ ...v, shiftsLost: e.target.value }))}
                        style={{ ...iS, marginTop: "4px" }} />
                    </div>
                    <div>
                      <label style={lS}>Hours Missed</label>
                      <input type="number" min="0" step="0.5" value={eventVals.hoursLost ?? 0}
                        onChange={e => setEventVals(v => ({ ...v, hoursLost: e.target.value }))}
                        style={{ ...iS, marginTop: "4px" }} />
                    </div>
                    {(() => {
                      const s = parseInt(eventVals.shiftsLost) || 0;
                      const h = parseFloat(eventVals.hoursLost) || 0;
                      const expected = s * config.shiftHours;
                      return expected > 0 && Math.abs(h - expected) > 0.01 ? (
                        <div style={{ gridColumn: "1/-1", fontSize: "9px", color: "var(--color-gold)", padding: "4px 8px", background: "rgba(0,200,150,0.07)", borderRadius: "4px" }}>
                          ⚠ Hours overridden — expected {s} × {config.shiftHours}h = {expected}h
                        </div>
                      ) : (
                        <div style={{ gridColumn: "1/-1", fontSize: "9px", color: "var(--color-text-disabled)" }}>
                          {s} × {config.shiftHours}h = {expected}h — edit to override
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* PTO Hours */}
              {eventVals.type === "pto" && (
                <div style={{ marginBottom: "12px" }}>
                  <label style={lS}>PTO Hours</label>
                  <input type="number" min="0" value={eventVals.ptoHours ?? ""} onChange={e => setEventVals(v => ({ ...v, ptoHours: e.target.value }))} style={{ ...iS, marginTop: "4px" }} />
                </div>
              )}

              {/* Hours Lost */}
              {eventVals.type === "partial" && (
                <div style={{ marginBottom: "12px" }}>
                  <label style={lS}>Hours Lost</label>
                  <input type="number" min="0" max={config.shiftHours} step="0.5" value={eventVals.hoursLost ?? ""} onChange={e => setEventVals(v => ({ ...v, hoursLost: e.target.value }))} style={{ ...iS, marginTop: "4px" }} />
                  <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginTop: "4px" }}>Partial shift — reduces pay and PTO accrual, does not hit attendance bucket.</div>
                </div>
              )}

              {/* Amount */}
              {(eventVals.type === "bonus" || eventVals.type === "other_loss") && (
                <div style={{ marginBottom: "12px" }}>
                  <label style={lS}>{eventVals.type === "bonus" ? "Amount ($)" : "Amount Lost ($)"}</label>
                  <input type="number" min="0" value={eventVals.amount ?? ""} onChange={e => setEventVals(v => ({ ...v, amount: e.target.value }))} style={{ ...iS, marginTop: "4px" }} />
                  {eventVals.type === "bonus" && pickupDays.length > 0 && (
                    <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginTop: "4px" }}>
                      Est. {pickupDays.length} pickup shift{pickupDays.length !== 1 ? "s" : ""} × {config.shiftHours}h × ${config.baseRate}/hr = ${(pickupDays.length * config.shiftHours * config.baseRate).toFixed(2)} gross (pre-tax)
                    </div>
                  )}
                </div>
              )}

              {/* Shifts/hours gained — bonus type */}
              {eventVals.type === "bonus" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                  <div>
                    <label style={lS}>Shifts Gained</label>
                    <input type="number" min="0"
                      value={eventVals.shiftsGained !== undefined ? eventVals.shiftsGained : pickupDays.length}
                      onChange={e => setEventVals(v => ({ ...v, shiftsGained: e.target.value }))}
                      style={{ ...iS, marginTop: "4px" }} />
                  </div>
                  <div>
                    <label style={lS}>Hours Gained</label>
                    <input type="number" min="0" step="0.5"
                      value={eventVals.hoursGained !== undefined ? eventVals.hoursGained : pickupDays.length * config.shiftHours}
                      onChange={e => setEventVals(v => ({ ...v, hoursGained: e.target.value }))}
                      style={{ ...iS, marginTop: "4px" }} />
                  </div>
                </div>
              )}

              {/* Note */}
              <div style={{ marginBottom: "12px" }}>
                <label style={lS}>Note</label>
                <input type="text" value={eventVals.note ?? ""} onChange={e => setEventVals(v => ({ ...v, note: e.target.value }))} style={{ ...iS, marginTop: "4px" }} placeholder="Optional" />
              </div>

              {/* Pay impact preview — live; recalculates on every field edit.
                  Shows projected week gross, estimated actual, and net change.
                  Hidden when calcEventImpact returns no impact (e.g. note-only events).
                  The "estimated actual" line derives from baseGross ± gross impact —
                  this is a rough estimate since tax withholding varies by week type. */}
              {previewImpact && (previewImpact.netLost > 0 || previewImpact.netGained > 0) && (
                <div style={{ padding: "10px 14px", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", fontSize: "11px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "8px" }}>Pay impact</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                    <div style={{ color: "var(--color-text-secondary)" }}>Projected week</div>
                    <div style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{f2(previewImpact.baseGross)}</div>
                    <div style={{ color: "var(--color-text-secondary)" }}>Estimated actual</div>
                    <div style={{ textAlign: "right", color: "var(--color-gold)" }}>{f2(previewImpact.netLost > 0 ? previewImpact.baseGross - previewImpact.grossLost : previewImpact.baseGross + previewImpact.grossGained)}</div>
                    <div style={{ gridColumn: "1/-1", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "5px", marginTop: "2px", display: "flex", justifyContent: "space-between", color: previewImpact.netLost > 0 ? "var(--color-red)" : "var(--color-green)", fontWeight: "bold" }}>
                      <span>Net {previewImpact.netLost > 0 ? "lost" : "gained"}</span>
                      <span>{previewImpact.netLost > 0 ? "−" : "+"}{f2(previewImpact.netLost || previewImpact.netGained)}</span>
                    </div>
                  </div>
                </div>
              )}
              {/* Vacuous event warning — no days, no hours on a missed type */}
              {isVacuousEvent && !confirming && (
                <div style={{ marginTop: "12px", padding: "10px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: "6px", fontSize: "10px", color: "var(--color-red)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>⚠</span>
                  <span>No shifts or hours selected — choose days above or enter hours before confirming.</span>
                </div>
              )}

              {/* Confirmation block — shown after first click of "Log & Confirm" */}
              {confirming && (
                <div style={{ marginTop: "16px", padding: "14px", background: "var(--color-bg-raised)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-green)", textTransform: "uppercase", marginBottom: "10px" }}>Confirm entry</div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.9" }}>
                    <div><span style={{ color: "var(--color-text-disabled)" }}>Type:</span> {EVENT_TYPES[eventVals.type]?.label ?? eventVals.type}</div>
                    {(eventVals.type === "missed_unpaid" || eventVals.type === "missed_unapproved") && (() => {
                      const s = parseInt(eventVals.shiftsLost) || 0;
                      const h = parseFloat(eventVals.hoursLost) || 0;
                      const expected = s * config.shiftHours;
                      const overridden = expected > 0 && Math.abs(h - expected) > 0.01;
                      return (
                        <>
                          <div><span style={{ color: "var(--color-text-disabled)" }}>Shifts missed:</span> <span style={{ color: "var(--color-text-primary)" }}>{s}</span></div>
                          <div>
                            <span style={{ color: "var(--color-text-disabled)" }}>Hours missed:</span>{" "}
                            <span style={{ color: overridden ? "var(--color-gold)" : "var(--color-text-primary)" }}>{h}h</span>
                            {overridden && <span style={{ color: "var(--color-gold)", fontSize: "9px", marginLeft: "6px" }}>⚠ manually overridden (expected {expected}h)</span>}
                          </div>
                          {(eventVals.missedDays ?? []).length > 0 && <div><span style={{ color: "var(--color-text-disabled)" }}>Days:</span> {eventVals.missedDays.join(", ")}</div>}
                        </>
                      );
                    })()}
                    {eventVals.type === "bonus" && (
                      <>
                        <div><span style={{ color: "var(--color-text-disabled)" }}>Amount:</span> <span style={{ color: "var(--color-green)" }}>{f2(parseFloat(eventVals.amount) || 0)}</span></div>
                        <div><span style={{ color: "var(--color-text-disabled)" }}>Shifts gained:</span> {eventVals.shiftsGained !== undefined ? eventVals.shiftsGained : pickupDays.length}</div>
                        <div><span style={{ color: "var(--color-text-disabled)" }}>Hours gained:</span> {eventVals.hoursGained !== undefined ? eventVals.hoursGained : pickupDays.length * config.shiftHours}h</div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Layer 2 footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              {!confirming ? (
                <>
                  <button onClick={() => { setLayer(1); setConfirming(false); }} style={{
                    background: "transparent", border: "none", color: "var(--color-text-disabled)",
                    fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                    cursor: "pointer", padding: "6px 0",
                  }}>
                    ← Back
                  </button>
                  <button onClick={() => !isVacuousEvent && setConfirming(true)} disabled={isVacuousEvent} style={{
                    background: isVacuousEvent ? "var(--color-text-disabled)" : "var(--color-green)",
                    color: isVacuousEvent ? "var(--color-bg-surface)" : "var(--color-bg-base)", border: "none",
                    borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                    letterSpacing: "2px", textTransform: "uppercase",
                    cursor: isVacuousEvent ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                  }}>
                    Log &amp; Confirm
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setConfirming(false)} style={{
                    background: "transparent", border: "none", color: "var(--color-text-disabled)",
                    fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                    cursor: "pointer", padding: "6px 0",
                  }}>
                    ← Edit
                  </button>
                  <button onClick={handleConfirmLayer2} style={{
                    background: "var(--color-green)", color: "var(--color-bg-base)", border: "none",
                    borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                    letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer",
                    fontWeight: "bold",
                  }}>
                    Yes, Log It
                  </button>
                </>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
