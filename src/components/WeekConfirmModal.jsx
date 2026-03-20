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
import { useState } from "react";
import { EVENT_TYPES } from "../constants/config.js";
import { calcEventImpact, toLocalIso } from "../lib/finance.js";
import { iS, lS } from "./ui.jsx";

// Canonical day ordering — must match LogPanel's DayPicker to keep missedDays arrays consistent
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtDate = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
// Formats absolute dollar amounts for display (no sign, always 2 decimal places)
const f2 = n => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Given the week's Monday (weekStart), returns an array of 7 Date objects
 * aligned to DAY_NAMES order: [Mon, Tue, Wed, Thu, Fri, Sat, Sun].
 * Used to display the calendar date under each day label in Layer 1.
 */
function weekDayDates(weekStart) {
  return DAY_NAMES.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
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
              fontFamily: "'Courier New',monospace", cursor: isScheduled ? "pointer" : "default",
              border: isMissed ? "1px solid #e8856a" : isScheduled ? "1px solid #444" : "1px solid #222",
              background: isMissed ? "#e8856a22" : isScheduled ? "#1a1a1a" : "#111",
              color: isMissed ? "#e8856a" : isScheduled ? "#888" : "#2a2a2a",
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

export function WeekConfirmModal({ week, config, onConfirm, onDismiss }) {
  // ── Layer 1 state ─────────────────────────────────────────────────────────
  // Scheduled days default to true (worked); unscheduled days default to null (off, but clickable)
  const [dayToggles, setDayToggles] = useState(() =>
    Object.fromEntries(DAY_NAMES.map(d => [d, week.workedDayNames.includes(d) ? true : null]))
  );
  const [layer, setLayer] = useState(1);

  // ── Layer 2 form state (mirrors LogPanel's blank event shape) ─────────────
  const [eventVals, setEventVals] = useState({});

  const scheduledDays = week.workedDayNames;
  const missedScheduledDays = scheduledDays.filter(d => dayToggles[d] === false);
  const pickupDays = DAY_NAMES.filter(d => !scheduledDays.includes(d) && dayToggles[d] === true);
  const netShiftDelta = pickupDays.length - missedScheduledDays.length;

  const dayDates = weekDayDates(week.weekStart);

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
      const weekendShifts = next.filter(d => d === "Sat" || d === "Sun").length;
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
    if (netShiftDelta === 0) {
      // Net-zero: same total hours regardless of which days — confirm clean
      onConfirm({
        confirmedAt: new Date().toISOString(),
        dayToggles, scheduledDays, missedScheduledDays, pickupDays,
        netShiftDelta: 0, eventId: null,
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
      weekendShifts: isDeficit ? missedScheduledDays.filter(d => d === "Sat" || d === "Sun").length : 0,
      hoursLost: isDeficit ? missedScheduledDays.length * config.shiftHours : 0,
      // Surplus: estimate gross (pre-tax) from pickup shifts so the amount field
      // has a useful starting value. User should verify the actual payout.
      amount: !isDeficit ? pickupDays.length * config.shiftHours * config.baseRate : 0,
      ptoHours: 0,
      note: "",
    });
    setLayer(2);
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
        background: "#111", border: "1px solid #2a2a2a", borderRadius: "10px",
        width: "100%", maxWidth: "460px", fontFamily: "'Courier New',monospace",
        overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "5px" }}>
                Week {week.idx} Check-In
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", color: "#e8e0d0" }}>
                {weekStartDate} — {weekEndDate}
              </div>
            </div>
            <span style={{ fontSize: "9px", letterSpacing: "2px", color: "#888", background: "#1a1a1a", border: "1px solid #2a2a2a", padding: "4px 9px", borderRadius: "3px", textTransform: "uppercase", marginTop: "2px" }}>
              {week.rotation}
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
              <div style={{ padding: "6px 20px 4px", fontSize: "9px", color: "#444", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                Mark your actual week — tap any day to update
              </div>

              {DAY_NAMES.map((day, i) => {
                const isScheduled = scheduledDays.includes(day);
                const toggle = dayToggles[day]; // true=worked, false=missed, null=off
                const date = dayDates[i];
                const isPickup = !isScheduled && toggle === true;

                return (
                  <div key={day} style={{
                    display: "flex", alignItems: "center",
                    padding: "9px 20px",
                    borderBottom: "1px solid #161616",
                  }}>
                    {/* Day + date */}
                    <div style={{ width: "86px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: isScheduled ? "#ddd8cc" : "#555", letterSpacing: "1px" }}>{day}</div>
                      <div style={{ fontSize: "9px", color: "#444" }}>{fmtDate(date)}</div>
                    </div>

                    {/* Shift label */}
                    <div style={{ flex: 1 }}>
                      {isScheduled
                        ? <span style={{ fontSize: "9px", color: "#555", textTransform: "uppercase", letterSpacing: "1px" }}>{config.shiftHours}h shift</span>
                        : isPickup
                          ? <span style={{ fontSize: "9px", color: "#6dbf8a88", textTransform: "uppercase", letterSpacing: "1px" }}>pickup</span>
                          : <span style={{ fontSize: "9px", color: "#2e2e2e", textTransform: "uppercase", letterSpacing: "1px" }}>off</span>
                      }
                    </div>

                    {/* Scheduled day — Worked / Missed pill */}
                    {isScheduled && (
                      <div style={{ display: "flex", borderRadius: "4px", overflow: "hidden", border: "1px solid #2a2a2a" }}>
                        <button onClick={() => setDayToggles(t => ({ ...t, [day]: true }))} style={{
                          padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                          cursor: "pointer", border: "none", borderRight: "1px solid #2a2a2a",
                          fontFamily: "'Courier New',monospace", fontWeight: toggle === true ? "bold" : "normal",
                          background: toggle === true ? "#6dbf8a22" : "#141414",
                          color: toggle === true ? "#6dbf8a" : "#444",
                          transition: "background 0.15s, color 0.15s",
                        }}>Worked</button>
                        <button onClick={() => setDayToggles(t => ({ ...t, [day]: false }))} style={{
                          padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                          cursor: "pointer", border: "none",
                          fontFamily: "'Courier New',monospace", fontWeight: toggle === false ? "bold" : "normal",
                          background: toggle === false ? "#e8856a22" : "#141414",
                          color: toggle === false ? "#e8856a" : "#444",
                          transition: "background 0.15s, color 0.15s",
                        }}>Missed</button>
                      </div>
                    )}

                    {/* Unscheduled day — single "Pickup Shift" toggle */}
                    {!isScheduled && (
                      <button onClick={() => toggleDay(day)} style={{
                        padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                        cursor: "pointer", border: `1px solid ${isPickup ? "#6dbf8a55" : "#222"}`,
                        borderRadius: "4px", fontFamily: "'Courier New',monospace",
                        background: isPickup ? "#6dbf8a18" : "#0d0d0d",
                        color: isPickup ? "#6dbf8a" : "#2e2e2e",
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
                <div style={{ margin: "10px 20px", padding: "10px 14px", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "6px", fontSize: "10px" }}>
                  {missedScheduledDays.length > 0 && (
                    <div style={{ color: "#e8856a", marginBottom: pickupDays.length ? "4px" : 0 }}>
                      − {missedScheduledDays.length} missed: {missedScheduledDays.join(", ")}
                    </div>
                  )}
                  {pickupDays.length > 0 && (
                    <div style={{ color: "#6dbf8a", marginBottom: netShiftDelta !== 0 ? "4px" : 0 }}>
                      + {pickupDays.length} pickup: {pickupDays.join(", ")}
                    </div>
                  )}
                  {netShiftDelta === 0 && missedScheduledDays.length > 0 && (
                    <div style={{ color: "#888", fontSize: "9px", letterSpacing: "1px" }}>Net hours unchanged — confirming clean</div>
                  )}
                  {netShiftDelta !== 0 && (
                    <div style={{ color: netShiftDelta > 0 ? "#6dbf8a" : "#e8856a", fontWeight: "bold", fontSize: "9px", letterSpacing: "1px" }}>
                      Net: {netShiftDelta > 0 ? "+" : ""}{netShiftDelta} shift{Math.abs(netShiftDelta) !== 1 ? "s" : ""} — review on next screen
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Layer 1 footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={onDismiss} style={{
                background: "transparent", border: "none", color: "#444",
                fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                fontFamily: "'Courier New',monospace", cursor: "pointer", padding: "6px 0",
              }}>
                Skip for now
              </button>
              <button onClick={handleSave} style={{
                background: "#c8a84b", color: "#0a0a0a", border: "none",
                borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer",
                fontFamily: "'Courier New',monospace", fontWeight: "bold",
              }}>
                {netShiftDelta !== 0 ? "Next →" : "Confirm Week"}
              </button>
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
                background: netShiftDelta < 0 ? "#2d1a1a" : "#1a2d1e",
                border: `1px solid ${netShiftDelta < 0 ? "#e8856a44" : "#6dbf8a44"}`,
                borderRadius: "6px", fontSize: "10px",
                color: netShiftDelta < 0 ? "#e8856a" : "#6dbf8a",
              }}>
                {netShiftDelta < 0
                  ? `${Math.abs(netShiftDelta)} fewer shift${Math.abs(netShiftDelta) !== 1 ? "s" : ""} than scheduled this week`
                  : `${netShiftDelta} extra shift${netShiftDelta !== 1 ? "s" : ""} worked beyond schedule`
                }
                {missedScheduledDays.length > 0 && <div style={{ color: "#888", marginTop: "3px", fontSize: "9px" }}>Missed: {missedScheduledDays.join(", ")}</div>}
                {pickupDays.length > 0 && <div style={{ color: "#888", marginTop: "3px", fontSize: "9px" }}>Pickup: {pickupDays.join(", ")}</div>}
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

              {/* DayPicker — for missed types */}
              {(eventVals.type === "missed_unpaid" || eventVals.type === "missed_unapproved") && (
                <div style={{ marginBottom: "12px" }}>
                  <DayPicker
                    scheduledDays={scheduledDays}
                    missedDays={Array.isArray(eventVals.missedDays) ? eventVals.missedDays : []}
                    onToggle={toggleMissedDay}
                  />
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
                  <div style={{ fontSize: "9px", color: "#555", marginTop: "4px" }}>Partial shift — reduces pay and PTO accrual, does not hit attendance bucket.</div>
                </div>
              )}

              {/* Amount */}
              {(eventVals.type === "bonus" || eventVals.type === "other_loss") && (
                <div style={{ marginBottom: "12px" }}>
                  <label style={lS}>{eventVals.type === "bonus" ? "Amount ($)" : "Amount Lost ($)"}</label>
                  <input type="number" min="0" value={eventVals.amount ?? ""} onChange={e => setEventVals(v => ({ ...v, amount: e.target.value }))} style={{ ...iS, marginTop: "4px" }} />
                  {eventVals.type === "bonus" && pickupDays.length > 0 && (
                    <div style={{ fontSize: "9px", color: "#555", marginTop: "4px" }}>
                      Est. {pickupDays.length} pickup shift{pickupDays.length !== 1 ? "s" : ""} × {config.shiftHours}h × ${config.baseRate}/hr = ${(pickupDays.length * config.shiftHours * config.baseRate).toFixed(2)} gross (pre-tax)
                    </div>
                  )}
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
                <div style={{ padding: "10px 14px", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: "6px", fontSize: "11px" }}>
                  <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#555", textTransform: "uppercase", marginBottom: "8px" }}>Pay impact</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                    <div style={{ color: "#666" }}>Projected week</div>
                    <div style={{ textAlign: "right", color: "#888" }}>{f2(previewImpact.baseGross)}</div>
                    <div style={{ color: "#666" }}>Estimated actual</div>
                    <div style={{ textAlign: "right", color: "#c8a84b" }}>{f2(previewImpact.netLost > 0 ? previewImpact.baseGross - previewImpact.grossLost : previewImpact.baseGross + previewImpact.grossGained)}</div>
                    <div style={{ gridColumn: "1/-1", borderTop: "1px solid #1e1e1e", paddingTop: "5px", marginTop: "2px", display: "flex", justifyContent: "space-between", color: previewImpact.netLost > 0 ? "#e8856a" : "#6dbf8a", fontWeight: "bold" }}>
                      <span>Net {previewImpact.netLost > 0 ? "lost" : "gained"}</span>
                      <span>{previewImpact.netLost > 0 ? "−" : "+"}{f2(previewImpact.netLost || previewImpact.netGained)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Layer 2 footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setLayer(1)} style={{
                background: "transparent", border: "none", color: "#555",
                fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                fontFamily: "'Courier New',monospace", cursor: "pointer", padding: "6px 0",
              }}>
                ← Back
              </button>
              <button onClick={handleConfirmLayer2} style={{
                background: "#6dbf8a", color: "#0a0a0a", border: "none",
                borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer",
                fontFamily: "'Courier New',monospace", fontWeight: "bold",
              }}>
                Log &amp; Confirm
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
