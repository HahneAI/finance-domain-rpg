import { useState } from "react";
import { EVENT_TYPES } from "../constants/config.js";
import { calcEventImpact, toLocalIso, computeNet } from "../lib/finance.js";
import { iS, lS } from "./ui.jsx";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Formats a Date as "Mar 20"
const fmtDate = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

// Dollar formatter
const f2 = n => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Returns the Date for each day of the week given the week's Monday Date
function weekDayDates(weekStart) {
  return DAY_NAMES.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function WeekConfirmModal({ week, config, onConfirm, onDismiss }) {
  // Initialize: scheduled days default to worked (true), off days null (non-interactive)
  const [dayToggles, setDayToggles] = useState(() =>
    Object.fromEntries(DAY_NAMES.map(d => [d, week.workedDayNames.includes(d) ? true : null]))
  );
  const [layer, setLayer] = useState(1);
  const [eventType, setEventType] = useState("missed_unpaid");

  const scheduledDays = week.workedDayNames;
  const missedScheduledDays = scheduledDays.filter(d => dayToggles[d] === false);
  const dayDates = weekDayDates(week.weekStart);

  // ── Pay impact preview (Layer 2) ──
  const previewEntry = missedScheduledDays.length ? {
    weekEnd: toLocalIso(week.weekEnd),
    weekIdx: week.idx,
    weekRotation: week.rotation,
    type: eventType,
    shiftsLost: missedScheduledDays.length,
    weekendShifts: missedScheduledDays.filter(d => d === "Sat" || d === "Sun").length,
    hoursLost: missedScheduledDays.length * config.shiftHours,
    ptoHours: 0, amount: 0,
    missedDays: missedScheduledDays,
  } : null;
  const impact = previewEntry ? calcEventImpact(previewEntry, config) : null;

  // ── Confirm handlers ──
  const handleSave = () => {
    if (missedScheduledDays.length > 0) {
      setLayer(2);
    } else {
      // All scheduled shifts worked — confirm clean
      onConfirm({
        confirmedAt: new Date().toISOString(),
        dayToggles,
        scheduledDays,
        missedScheduledDays: [],
        eventId: null,
      }, null);
    }
  };

  const handleConfirmLayer2 = () => {
    const logEntry = {
      ...previewEntry,
      id: Date.now(),
      note: "Auto-logged via weekly work confirmation",
    };
    const confirmation = {
      confirmedAt: new Date().toISOString(),
      dayToggles,
      scheduledDays,
      missedScheduledDays,
      eventId: logEntry.id,
    };
    onConfirm(confirmation, logEntry);
  };

  // ── Week header dates ──
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
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1e1e1e" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "5px" }}>
                Week {week.idx} Check-In
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", color: "#e8e0d0" }}>
                {weekStartDate} — {weekEndDate}
              </div>
            </div>
            <span style={{
              fontSize: "9px", letterSpacing: "2px", color: "#888",
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              padding: "4px 9px", borderRadius: "3px", textTransform: "uppercase",
              marginTop: "2px",
            }}>
              {week.rotation}
            </span>
          </div>
          {layer === 1 && (
            <div style={{ marginTop: "8px", fontSize: "10px", color: "#555" }}>
              Mark each scheduled shift as worked or missed.
            </div>
          )}
        </div>

        {/* ────────── LAYER 1 — Day grid ────────── */}
        {layer === 1 && (
          <>
            <div style={{ padding: "8px 0" }}>
              {DAY_NAMES.map((day, i) => {
                const isScheduled = scheduledDays.includes(day);
                const toggle = dayToggles[day]; // true=worked, false=missed, null=off day
                const date = dayDates[i];

                return (
                  <div key={day} style={{
                    display: "flex", alignItems: "center",
                    padding: "9px 20px",
                    borderBottom: "1px solid #161616",
                    opacity: isScheduled ? 1 : 0.35,
                  }}>
                    {/* Day + date */}
                    <div style={{ width: "90px" }}>
                      <div style={{ fontSize: "11px", fontWeight: "bold", color: "#ddd8cc", letterSpacing: "1px" }}>{day}</div>
                      <div style={{ fontSize: "9px", color: "#555" }}>{fmtDate(date)}</div>
                    </div>

                    {/* Scheduled badge */}
                    <div style={{ flex: 1 }}>
                      {isScheduled ? (
                        <span style={{ fontSize: "9px", letterSpacing: "1px", color: "#666", textTransform: "uppercase" }}>
                          {config.shiftHours}h shift
                        </span>
                      ) : (
                        <span style={{ fontSize: "9px", color: "#333", textTransform: "uppercase", letterSpacing: "1px" }}>off</span>
                      )}
                    </div>

                    {/* Pill toggle — only for scheduled days */}
                    {isScheduled && (
                      <div style={{ display: "flex", borderRadius: "4px", overflow: "hidden", border: "1px solid #2a2a2a" }}>
                        <button
                          onClick={() => setDayToggles(t => ({ ...t, [day]: true }))}
                          style={{
                            padding: "5px 13px", fontSize: "9px", letterSpacing: "1.5px",
                            textTransform: "uppercase", cursor: "pointer", border: "none",
                            fontFamily: "'Courier New',monospace", fontWeight: toggle === true ? "bold" : "normal",
                            background: toggle === true ? "#6dbf8a22" : "#141414",
                            color: toggle === true ? "#6dbf8a" : "#444",
                            borderRight: "1px solid #2a2a2a",
                            transition: "background 0.15s, color 0.15s",
                          }}
                        >
                          Worked
                        </button>
                        <button
                          onClick={() => setDayToggles(t => ({ ...t, [day]: false }))}
                          style={{
                            padding: "5px 13px", fontSize: "9px", letterSpacing: "1.5px",
                            textTransform: "uppercase", cursor: "pointer", border: "none",
                            fontFamily: "'Courier New',monospace", fontWeight: toggle === false ? "bold" : "normal",
                            background: toggle === false ? "#e8856a22" : "#141414",
                            color: toggle === false ? "#e8856a" : "#444",
                            transition: "background 0.15s, color 0.15s",
                          }}
                        >
                          Missed
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Layer 1 footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={onDismiss}
                style={{
                  background: "transparent", border: "none", color: "#444",
                  fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                  fontFamily: "'Courier New',monospace", cursor: "pointer", padding: "6px 0",
                }}
              >
                Skip for now
              </button>
              <button
                onClick={handleSave}
                style={{
                  background: "#c8a84b", color: "#0a0a0a", border: "none",
                  borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                  letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer",
                  fontFamily: "'Courier New',monospace", fontWeight: "bold",
                }}
              >
                {missedScheduledDays.length > 0 ? "Next →" : "Confirm Week"}
              </button>
            </div>
          </>
        )}

        {/* ────────── LAYER 2 — Double-check ────────── */}
        {layer === 2 && (
          <>
            <div style={{ padding: "18px 20px" }}>

              {/* Mismatch summary */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#e8856a", fontWeight: "bold", marginBottom: "8px", letterSpacing: "1px" }}>
                  {missedScheduledDays.length} of {scheduledDays.length} scheduled shift{scheduledDays.length !== 1 ? "s" : ""} not worked
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {missedScheduledDays.map(d => (
                    <span key={d} style={{
                      fontSize: "10px", background: "#e8856a18", color: "#e8856a",
                      padding: "3px 9px", borderRadius: "3px", letterSpacing: "1px",
                    }}>{d}</span>
                  ))}
                </div>
              </div>

              {/* Pay impact */}
              {impact && (
                <div style={{
                  background: "#0d0d0d", border: "1px solid #1e1e1e",
                  borderRadius: "6px", padding: "12px 14px", marginBottom: "16px",
                }}>
                  <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#555", textTransform: "uppercase", marginBottom: "10px" }}>Pay impact</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "11px" }}>
                    <div style={{ color: "#666" }}>Full week (projected)</div>
                    <div style={{ textAlign: "right", color: "#888" }}>{f2(impact.baseGross - impact.grossLost + impact.grossLost)}</div>
                    <div style={{ color: "#666" }}>Estimated actual</div>
                    <div style={{ textAlign: "right", color: "#c8a84b" }}>{f2(impact.baseGross - impact.grossLost)}</div>
                    <div style={{ color: "#e8856a", gridColumn: "1/-1", borderTop: "1px solid #1e1e1e", paddingTop: "6px", marginTop: "2px", display: "flex", justifyContent: "space-between" }}>
                      <span>Net lost (est.)</span>
                      <span style={{ fontWeight: "bold" }}>−{f2(impact.netLost)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Reason prompt */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#888", marginBottom: "10px" }}>
                  You didn't work what we projected for this week. What happened?
                </div>
                <label style={lS}>Event Type</label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  style={{ ...iS, marginTop: "4px" }}
                >
                  {Object.entries(EVENT_TYPES)
                    .filter(([k]) => k !== "bonus")
                    .map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                </select>
              </div>

            </div>

            {/* Layer 2 footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={() => setLayer(1)}
                style={{
                  background: "transparent", border: "none", color: "#555",
                  fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                  fontFamily: "'Courier New',monospace", cursor: "pointer", padding: "6px 0",
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleConfirmLayer2}
                style={{
                  background: "#6dbf8a", color: "#0a0a0a", border: "none",
                  borderRadius: "4px", padding: "9px 22px", fontSize: "10px",
                  letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer",
                  fontFamily: "'Courier New',monospace", fontWeight: "bold",
                }}
              >
                Log &amp; Confirm
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
