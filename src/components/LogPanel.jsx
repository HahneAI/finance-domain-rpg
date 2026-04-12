import { useState } from "react";
import { EVENT_TYPES } from "../constants/config.js";
import { calcEventImpact, dhlEmployerMatchRate, toLocalIso } from "../lib/finance.js";
import { FISCAL_WEEKS_PER_YEAR, formatFiscalWeekLabel, getFiscalWeekNumber } from "../lib/fiscalWeek.js";
import { Card, iS, lS, SmBtn } from "./ui.jsx";

import { formatRotationDisplay } from "../lib/rotation.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Normalize missedDays to array (handles legacy string format)
const normalizeDays = (v) =>
  Array.isArray(v) ? v : (v ? v.split(",").map(s => s.trim()).filter(Boolean) : []);

const LOG_MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtMonth = yyyyMM => {
  if (!yyyyMM || !yyyyMM.includes("-")) return "—";
  const [y, m] = yyyyMM.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "—";
  return `${LOG_MONTH_SHORT[m - 1]} ${y}`;
};
const fmtDate  = iso => {
  if (!iso || !iso.includes("-")) return "—";
  const [, m, d] = iso.split("-").map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return "—";
  return `${LOG_MONTH_SHORT[m - 1]} ${d}`;
};
const SH = ({ children }) => (
  <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>
    {children}
  </div>
);
const EMPTY_FORM = { label: "", hoursNeeded: "", targetDate: "", negativeBalanceCap: "40" };

export function LogPanel({
  logs, setLogs, config, projectedAnnualNet, baseWeeklyUnallocated, futureWeeks, allWeeks, currentWeek, goals,
  fundedGoalSpend = 0, bucketModel, fiscalWeekInfo, isDHL = false, isAdmin = false, setConfig,
  logK401kLost = 0, logK401kMatchLost = 0, logK401kGained = 0, logK401kMatchGained = 0, logPTOHoursLost = 0,
  ptoGoal, setPtoGoal,
}) {
  const blank = {
    weekEnd: "", weekIdx: "", weekRotation: "6-Day", type: "missed_unpaid",
    shiftsLost: 0, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0,
    shiftsGained: 0, hoursGained: 0,
    missedDays: [], note: ""
  };
  const [adding, setAdding] = useState(false);
  const [nEv, setNEv] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [cdel, setCdel] = useState(null);
  const [histOpen, setHistOpen] = useState(false);
  const [addConfirming, setAddConfirming] = useState(false);
  const [editConfirming, setEditConfirming] = useState(false);
  const [cancelWarning, setCancelWarning] = useState(false);

  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fiscalWeekLabel = formatFiscalWeekLabel(fiscalWeekInfo);
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const weeksLeft = futureWeeks.length || 1;
  const tot = logs.reduce((a, e) => {
    const i = calcEventImpact(e, config);
    a.gL += i.grossLost; a.gG += i.grossGained; a.nL += i.netLost; a.nG += i.netGained;
    a.k4 += i.k401kLost; a.pto += i.hoursLostForPTO; a.bucket += i.bucketHoursDeducted;
    return a;
  }, { gL: 0, gG: 0, nL: 0, nG: 0, k4: 0, pto: 0, bucket: 0 });

  const adjTH   = projectedAnnualNet - tot.nL + tot.nG;
  const adjWA   = baseWeeklyUnallocated - (tot.nL / weeksLeft) + (tot.nG / weeksLeft);
  const projS   = adjWA * weeksLeft - fundedGoalSpend;
  const totGoals = goals.filter(g => !g.completed).reduce((s, g) => s + g.target, 0);
  const ok = projS >= totGoals;

  // Ported from BenefitsPanel for 401k + PTO sections.
  const bE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
  const bM = allWeeks.reduce((s, w) => s + w.k401kEmployer, 0);
  const aE = Math.max(bE - logK401kLost + (logK401kGained ?? 0), 0);
  const aM = Math.max(bM - logK401kMatchLost + (logK401kMatchGained ?? 0), 0);
  const raw401StartIso = config.k401StartDate || config.benefitsStartDate || null;
  const k401StartSource = config.k401StartDate ? "k401" : (config.benefitsStartDate ? "benefits" : null);
  const k401Start = raw401StartIso ? new Date(raw401StartIso) : null;
  const hasValid401Start = Boolean(k401Start && !Number.isNaN(k401Start.getTime()));
  const k401Active = currentWeek ? (!hasValid401Start || currentWeek.weekEnd >= k401Start) : false;
  const weeksUntil401k = hasValid401Start && !k401Active && currentWeek
    ? allWeeks.filter(w => w.active && w.weekEnd >= currentWeek.weekEnd && w.weekEnd < k401Start).length
    : null;
  const ptoCutoffRaw = ptoGoal?.targetDate ? new Date(ptoGoal.targetDate) : null;
  const ptoCutoff = ptoCutoffRaw && !Number.isNaN(ptoCutoffRaw.getTime()) ? ptoCutoffRaw : null;
  const ptoBs = ptoCutoff
    ? allWeeks.filter(w => w.active && w.weekEnd <= ptoCutoff).reduce((s, w) => s + w.totalHours, 0) / 20
    : 0;
  const adjP = Math.max(ptoBs - logPTOHoursLost / 20, 0);
  const effectiveAdjP = config.ptoHoursOverride != null ? config.ptoHoursOverride : adjP;
  const negCap = ptoGoal?.negativeBalanceCap ?? 40;
  const avail = effectiveAdjP + negCap;
  const hoursNeed = ptoGoal?.hoursNeeded ?? 0;
  const onTrack = ptoGoal ? avail >= hoursNeed : false;
  const shiftHours = config.shiftHours ?? 12;

  const [formOpen, setFormOpen] = useState(false);
  const [formVals, setFormVals] = useState(EMPTY_FORM);
  const [editMode, setEditMode] = useState(false);
  const [editingPto, setEditingPto] = useState(false);
  const [ptoInput, setPtoInput] = useState("");

  function openAdd() {
    setFormVals(EMPTY_FORM);
    setEditMode(false);
    setFormOpen(true);
  }
  function openEdit() {
    if (!ptoGoal) return;
    setFormVals({
      label: ptoGoal.label,
      hoursNeeded: String(ptoGoal.hoursNeeded),
      targetDate: ptoGoal.targetDate,
      negativeBalanceCap: String(ptoGoal.negativeBalanceCap),
    });
    setEditMode(true);
    setFormOpen(true);
  }
  function saveForm() {
    const hrs = parseFloat(formVals.hoursNeeded) || 0;
    const cap = parseFloat(formVals.negativeBalanceCap) || 40;
    if (!setPtoGoal || !formVals.label.trim() || !hrs || !formVals.targetDate) return;
    setPtoGoal({
      label: formVals.label.trim(),
      hoursNeeded: hrs,
      targetDate: formVals.targetDate,
      negativeBalanceCap: cap,
    });
    setFormOpen(false);
  }

  // Active weeks for the dropdown (all active, sorted chronologically)
  const activeWeeks = allWeeks.filter(w => w.active);

  // ── Attendance History ──
  // Only absence-type events feed the history view; bonus/other_loss are irrelevant here.
  const attendanceLogs = logs.filter(e => ["missed_unpaid", "missed_unapproved", "partial"].includes(e.type));

  // Group by calendar month (YYYY-MM) for the monthly breakdown table.
  // missed_unpaid     → shiftsLost (full approved shifts)
  // missed_unapproved → days from missedDays array + raw hoursLost (bucket-hit events)
  // partial           → count of partial-shift events + hoursLost
  const byMonth = {};
  for (const e of attendanceLogs) {
    if (!e.weekEnd) continue;
    const month = e.weekEnd.slice(0, 7); // "YYYY-MM"
    if (!byMonth[month]) byMonth[month] = { unpaid: 0, unapproved: 0, unapprovedH: 0, partial: 0, partialH: 0 };
    const m = byMonth[month];
    if (e.type === "missed_unpaid")     m.unpaid       += parseInt(e.shiftsLost) || 0;
    if (e.type === "missed_unapproved") { m.unapproved += normalizeDays(e.missedDays).length; m.unapprovedH += parseFloat(e.hoursLost) || 0; }
    if (e.type === "partial")           { m.partial    += 1;                                  m.partialH    += parseFloat(e.hoursLost) || 0; }
  }

  // Count how many times each day-of-week appears across missed/unapproved events.
  // Partials excluded — a partial shift isn't a full absence.
  const dowCounts = {};
  for (const e of logs.filter(e => ["missed_unpaid", "missed_unapproved"].includes(e.type))) {
    for (const d of normalizeDays(e.missedDays)) dowCounts[d] = (dowCounts[d] || 0) + 1;
  }
  // Sorted descending so the most-missed day leads in the pill row.
  const dowSorted = Object.entries(dowCounts).sort((a, b) => b[1] - a[1]);
  const totalMissedDays = dowSorted.reduce((s, [, c]) => s + c, 0);

  // YTD roll-ups: drive the header badge and the three summary tiles.
  const ytdUnpaid     = Object.values(byMonth).reduce((s, m) => s + m.unpaid, 0);
  const ytdUnapproved = Object.values(byMonth).reduce((s, m) => s + m.unapproved, 0);
  const ytdPartial    = Object.values(byMonth).reduce((s, m) => s + m.partial, 0);

  // Resolve a weekEnd ISO string → weekIdx + weekRotation
  const resolveWeek = (dateStr) => {
    if (!dateStr) return { weekIdx: "", weekRotation: "6-Day" };
    const match = allWeeks.find(w => toLocalIso(w.weekEnd) === dateStr);
    return match ? { weekIdx: match.idx, weekRotation: match.rotation } : { weekIdx: "", weekRotation: "6-Day" };
  };

  // Returns scheduled day names for a given weekEnd ISO string
  const scheduledDaysFor = (weekEndStr) => {
    const match = allWeeks.find(w => toLocalIso(w.weekEnd) === weekEndStr);
    return match?.workedDayNames ?? [];
  };

  // ── Day picker state updater — drives shiftsLost, weekendShifts, hoursLost ──
  const toggleDay = (day, vals, set) => {
    const prev = normalizeDays(vals.missedDays);
    const next = prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day];
    const weekendShifts = next.filter(d => d === "Fri" || d === "Sat" || d === "Sun").length;
    set(v => ({
      ...v,
      missedDays: next,
      shiftsLost: next.length,
      weekendShifts,
      hoursLost: next.length * config.shiftHours,
    }));
  };

  // ── Add handlers ──
  const handleWeekEndChange = (dateStr) => setNEv(v => ({ ...v, weekEnd: dateStr, ...resolveWeek(dateStr), missedDays: [], shiftsLost: 0, weekendShifts: 0, hoursLost: 0 }));
  const addLog = () => {
    setLogs(p => [...p, {
      ...nEv, id: Date.now(),
      shiftsLost: parseInt(nEv.shiftsLost) || 0,
      weekendShifts: parseInt(nEv.weekendShifts) || 0,
      ptoHours: parseFloat(nEv.ptoHours) || 0,
      hoursLost: parseFloat(nEv.hoursLost) || 0,
      amount: parseFloat(nEv.amount) || 0,
      shiftsGained: parseInt(nEv.shiftsGained) || 0,
      hoursGained: parseFloat(nEv.hoursGained) || 0,
    }]);
    setAdding(false); setNEv(blank); setAddConfirming(false);
  };

  // ── Edit handlers ──
  const startEdit = (entry) => {
    setEditId(entry.id);
    setEditVals({ ...entry, missedDays: normalizeDays(entry.missedDays) });
    setCdel(null); setAdding(false);
  };
  const handleEditWeekEndChange = (dateStr) => setEditVals(v => ({ ...v, weekEnd: dateStr, ...resolveWeek(dateStr), missedDays: [], shiftsLost: 0, weekendShifts: 0, hoursLost: 0 }));
  const saveEdit = () => {
    setLogs(p => p.map(e => e.id !== editId ? e : {
      ...editVals, id: editId,
      shiftsLost: parseInt(editVals.shiftsLost) || 0,
      weekendShifts: parseInt(editVals.weekendShifts) || 0,
      ptoHours: parseFloat(editVals.ptoHours) || 0,
      hoursLost: parseFloat(editVals.hoursLost) || 0,
      amount: parseFloat(editVals.amount) || 0,
      shiftsGained: parseInt(editVals.shiftsGained) || 0,
      hoursGained: parseFloat(editVals.hoursGained) || 0,
    }));
    setEditId(null); setEditConfirming(false);
  };

  // ── Day picker component ──
  const DayPicker = ({ vals, set }) => {
    const scheduled = scheduledDaysFor(vals.weekEnd);
    const missed = normalizeDays(vals.missedDays);
    return (
      <div>
        <label style={lS}>Days Missed</label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
          {DAY_NAMES.map(day => {
            const isScheduled = scheduled.includes(day);
            const isMissed = missed.includes(day);
            return (
              <button key={day} type="button" onClick={() => toggleDay(day, vals, set)} style={{
                padding: "6px 10px", borderRadius: "12px", fontSize: "10px", letterSpacing: "1px",
                cursor: "pointer",
                border: isMissed ? "1px solid #e8856a" : isScheduled ? "1px solid #444" : "1px solid #222",
                background: isMissed ? "rgba(224,92,92,0.13)" : isScheduled ? "var(--color-bg-surface)" : "#111",
                color: isMissed ? "var(--color-red)" : isScheduled ? "#888" : "var(--color-border-subtle)",
                fontWeight: isMissed ? "bold" : "normal",
                textTransform: "uppercase",
              }}>
                {day}
              </button>
            );
          })}
        </div>
        {missed.length > 0 && (
          <div style={{ fontSize: "10px", color: "#666", marginTop: "6px" }}>
            {missed.length} day(s) · {missed.length * config.shiftHours}h missed
            {missed.some(d => d === "Sat" || d === "Sun") && ` · ${missed.filter(d => d === "Sat" || d === "Sun").length} wknd`}
          </div>
        )}
      </div>
    );
  };

  // ── Week select dropdown ──
  const WeekSelect = ({ vals, onWeekEndChange }) => (
    <div style={{ gridColumn: "1 / -1" }}>
      <label style={lS}>Pay Week</label>
      <select value={vals.weekEnd} onChange={e => onWeekEndChange(e.target.value)} style={iS}>
        <option value="">— select pay week —</option>
        {activeWeeks.map(w => {
          const endStr = toLocalIso(w.weekEnd);
          const startFmt = w.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          const endFmt   = w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <option key={endStr} value={endStr}>
              Wk {getFiscalWeekNumber(w.idx) ?? "—"} · {startFmt} – {endFmt} ({formatRotationDisplay(w, { isAdmin })})
            </option>
          );
        })}
      </select>
      {vals.weekEnd && (() => {
        const inlineWeekNumber = getFiscalWeekNumber(Number(vals.weekIdx));
        const inlineWeekLabel = inlineWeekNumber != null
          ? `week ${inlineWeekNumber}, ${Math.max(FISCAL_WEEKS_PER_YEAR - inlineWeekNumber, 0)} left`
          : "week —";
        return (
          <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", marginTop: "4px" }}>
            {formatRotationDisplay(vals.weekRotation, { isAdmin })} · {inlineWeekLabel}
            {scheduledDaysFor(vals.weekEnd).length > 0 && ` · scheduled: ${scheduledDaysFor(vals.weekEnd).join(", ")}`}
          </div>
        );
      })()}
    </div>
  );

  // ── Shared form fields ──
  const FormFields = ({ vals, set, onWeekEndChange }) => <>
    <WeekSelect vals={vals} onWeekEndChange={onWeekEndChange} />

    <div style={{ gridColumn: "1 / -1" }}>
      <label style={lS}>Event Type</label>
      <select value={vals.type} onChange={e => set(v => ({ ...v, type: e.target.value, missedDays: [], shiftsLost: 0, weekendShifts: 0, hoursLost: 0 }))} style={iS}>
        {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>

    {/* missed_unpaid: day picker drives shiftsLost + weekendShifts; editable override below */}
    {vals.type === "missed_unpaid" && (
      <div style={{ gridColumn: "1 / -1" }}>
        <DayPicker vals={vals} set={set} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
          <div>
            <label style={lS}>Shifts Missed</label>
            <input type="number" min="0" value={vals.shiftsLost ?? 0}
              onChange={e => set(v => ({ ...v, shiftsLost: e.target.value }))}
              style={{ ...iS, marginTop: "4px" }} />
          </div>
          <div>
            <label style={lS}>Hours Missed</label>
            <input type="number" min="0" step="0.5" value={vals.hoursLost ?? 0}
              onChange={e => set(v => ({ ...v, hoursLost: e.target.value }))}
              style={{ ...iS, marginTop: "4px" }} />
          </div>
          {(() => {
            const s = parseInt(vals.shiftsLost) || 0;
            const h = parseFloat(vals.hoursLost) || 0;
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

    {/* missed_unapproved: day picker drives hoursLost; editable override below */}
    {vals.type === "missed_unapproved" && (
      <div style={{ gridColumn: "1 / -1" }}>
        <DayPicker vals={vals} set={set} />
        <div style={{ marginTop: "8px", padding: "8px 10px", background: "#1e1210", border: "1px solid #e8622a44", borderRadius: "4px", fontSize: "10px", color: "#e8622a", lineHeight: "1.6" }}>
          ⚠ Unapproved — hits attendance bucket ({normalizeDays(vals.missedDays).length * config.shiftHours}h deducted this entry)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
          <div>
            <label style={lS}>Days / Shifts</label>
            <input type="number" min="0" readOnly value={normalizeDays(vals.missedDays).length}
              style={{ ...iS, marginTop: "4px", opacity: 0.5 }} />
          </div>
          <div>
            <label style={lS}>Hours Missed</label>
            <input type="number" min="0" step="0.5" value={vals.hoursLost ?? 0}
              onChange={e => set(v => ({ ...v, hoursLost: e.target.value }))}
              style={{ ...iS, marginTop: "4px" }} />
          </div>
          {(() => {
            const s = normalizeDays(vals.missedDays).length;
            const h = parseFloat(vals.hoursLost) || 0;
            const expected = s * config.shiftHours;
            return expected > 0 && Math.abs(h - expected) > 0.01 ? (
              <div style={{ gridColumn: "1/-1", fontSize: "9px", color: "var(--color-gold)", padding: "4px 8px", background: "rgba(0,200,150,0.07)", borderRadius: "4px" }}>
                ⚠ Hours overridden — expected {s} × {config.shiftHours}h = {expected}h · bucket hit uses override amount
              </div>
            ) : null;
          })()}
        </div>
      </div>
    )}

    {vals.type === "pto" && (
      <div><label style={lS}>PTO Hours (${config.baseRate}/hr flat)</label>
        <input type="number" min="0" value={vals.ptoHours} onChange={e => set(v => ({ ...v, ptoHours: e.target.value }))} style={iS} />
      </div>
    )}

    {/* partial: hours input + optional day picker + info note */}
    {vals.type === "partial" && <>
      <div><label style={lS}>Hours Lost (of {config.shiftHours})</label>
        <input type="number" min="0" max={config.shiftHours} step="0.5" value={vals.hoursLost} onChange={e => set(v => ({ ...v, hoursLost: e.target.value }))} style={iS} />
      </div>
      <div style={{ gridColumn: "1 / -1", padding: "8px 10px", background: "#141e14", border: "1px solid #6dbf8a44", borderRadius: "4px", fontSize: "10px", color: "var(--color-green)", lineHeight: "1.6" }}>
        Partial shift (approved) — reduces pay and PTO accrual. Does not hit attendance bucket.
      </div>
    </>}

    {(vals.type === "bonus" || vals.type === "other_loss") && (
      <div><label style={lS}>Amount ($)</label>
        <input type="number" min="0" value={vals.amount} onChange={e => set(v => ({ ...v, amount: e.target.value }))} style={iS} />
      </div>
    )}

    {vals.type === "bonus" && (
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
          <div>
            <label style={lS}>Shifts Gained</label>
            <input type="number" min="0" value={vals.shiftsGained ?? 0}
              onChange={e => set(v => ({ ...v, shiftsGained: e.target.value }))}
              style={{ ...iS, marginTop: "4px" }} />
          </div>
          <div>
            <label style={lS}>Hours Gained</label>
            <input type="number" min="0" step="0.5" value={vals.hoursGained ?? 0}
              onChange={e => set(v => ({ ...v, hoursGained: e.target.value }))}
              style={{ ...iS, marginTop: "4px" }} />
          </div>
        </div>
      </div>
    )}

    <div style={{ gridColumn: "1 / -1" }}>
      <label style={lS}>Note</label>
      <input type="text" placeholder="Optional" value={vals.note} onChange={e => set(v => ({ ...v, note: e.target.value }))} style={iS} />
    </div>
  </>;

  return (<div>

    {/* Top priority metrics (DHL only) */}
    {isDHL && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card
          label="PTO Balance"
          val={`${effectiveAdjP.toFixed(1)} hrs`}
          sub="Current available accrual"
          status={effectiveAdjP >= 0 ? "green" : "red"}
          color={effectiveAdjP >= 0 ? "var(--color-green)" : "var(--color-red)"}
        />
        <Card
          label="Bucket Hours"
          val={bucketModel ? `${bucketModel.currentBalance} hrs` : "—"}
          sub={bucketModel ? `Tier ${bucketModel.currentTier} · ${bucketModel.status}` : "No bucket data"}
          status={bucketModel?.status === "safe" ? "green" : (bucketModel?.status === "caution" ? "gold" : "red")}
          color={bucketModel?.status === "safe" ? "var(--color-green)" : (bucketModel?.status === "caution" ? "var(--color-gold)" : "var(--color-red)")}
        />
      </div>
    )}

    {/* Current week indicator */}
    {currentWeek && <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "10px 14px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Current fiscal week</div>
      <div style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "11px" }}>
        <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>Week ending {currentWeek.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span style={{ color: "#666" }}>{formatRotationDisplay(currentWeek, { isAdmin })}</span>
        <span style={{ color: "var(--color-green)", fontWeight: "bold" }}>{fiscalWeekLabel}</span>
      </div>
    </div>}

    {/* Hero cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
      <Card label="Total Net Lost" val={f(tot.nL)} rawVal={tot.nL} color="var(--color-red)" />
      <Card label="PTO Accrual Lost" val={`${(tot.pto / 20).toFixed(1)} hrs`} sub={`${tot.pto}h ÷ 20`} color="#888" />
      <Card label="Bucket Hrs Deducted" val={`${tot.bucket}h`} sub="Unapproved absences" color="#e8622a" />
    </div>

    {/* Compact bucket status widget */}
    {bucketModel && (() => {
      const bm = bucketModel;
      const cap = config.bucketCap ?? 128;
      const bandColor = bm.status === "safe" ? "var(--color-green)" : bm.status === "caution" ? "var(--color-gold)" : "var(--color-red)";
      const pct = Math.min((bm.currentBalance / cap) * 100, 100);
      const now = new Date();
      const monthLabel = LOG_MONTH_SHORT[now.getMonth()];
      return (
        <div style={{ background: "var(--color-bg-surface)", border: `1px solid ${bandColor}33`, borderRadius: "6px", padding: "12px 14px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Bucket Balance</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: bandColor }}>{bm.currentBalance}h <span style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>/ {cap}h</span></span>
              <span style={{ fontSize: "9px", background: bandColor + "22", color: bandColor, padding: "2px 7px", borderRadius: "12px", letterSpacing: "1.5px" }}>● {bm.status.toUpperCase()}</span>
            </div>
          </div>
          <div style={{ height: "5px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden", marginBottom: "7px" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: bandColor, borderRadius: "3px" }} />
          </div>
          <div style={{ fontSize: "10px" }}>
            <span style={{ color: "#666" }}>{monthLabel}: </span>
            {bm.currentTier === 1 && <span style={{ color: "var(--color-green)" }}>Tier 1 · any unapproved absence changes tier · see Benefits for full breakdown</span>}
            {bm.currentTier === 2 && <span style={{ color: "var(--color-gold)" }}>Tier 2 · {bm.currentM}h unapproved · {bm.hoursToNextTier}h to next tier drop</span>}
            {bm.currentTier === 3 && <span style={{ color: "var(--color-red)" }}>Tier 3 · {bm.currentM}h unapproved · {bm.hoursToNextTier}h to worst tier</span>}
            {bm.currentTier === 4 && <span style={{ color: "var(--color-red)" }}>Tier 4 · worst tier · {bm.currentM}h unapproved this month</span>}
          </div>
        </div>
      );
    })()}

    {/* Consolidated pre-log summary */}
    <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "14px", marginBottom: "20px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "10px" }}>
        Log Effect Summary
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px 14px", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Total Gross Lost</div>
          <div style={{ fontSize: "14px", color: "var(--color-red)", fontWeight: "bold" }}>{f(tot.gL)}</div>
        </div>
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Adjusted Take-Home</div>
          <div style={{ fontSize: "14px", color: "var(--color-green)", fontWeight: "bold" }}>{f0(adjTH)}</div>
        </div>
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Adj. Weekly Unalloc.</div>
          <div style={{ fontSize: "14px", color: adjWA > 0 ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold" }}>{f(adjWA)}</div>
        </div>
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>401k Lost</div>
          <div style={{ fontSize: "14px", color: "#7a8bbf", fontWeight: "bold" }}>{f(tot.k4)}</div>
        </div>
      </div>
      <div style={{ borderTop: "1px solid #1f1f1f", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: ok ? "var(--color-green)" : "var(--color-red)", textTransform: "uppercase", marginBottom: "4px" }}>Goals Impact</div>
          <div style={{ fontSize: "12px", color: "#aaa" }}>Adj. savings: <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f0(projS)}</span> · Goals: <span style={{ color: "var(--color-gold)" }}>{f0(totGoals)}</span></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: ok ? "var(--color-green)" : "var(--color-red)" }}>{ok ? "All goals on track" : "Goals at risk"}</div>
          <div style={{ fontSize: "11px", color: "#666" }}>{Math.ceil(totGoals / adjWA)} wks to fund all goals</div>
        </div>
      </div>
    </div>

    {/* Attendance History */}
    {attendanceLogs.length > 0 && (
      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={() => setHistOpen(o => !o)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: histOpen ? "6px 6px 0 0" : "6px", padding: "10px 14px", cursor: "pointer" }}
        >
          <span style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Attendance History</span>
          <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {(ytdUnpaid + ytdUnapproved) > 0 && <span style={{ fontSize: "11px", color: "var(--color-red)" }}>{ytdUnpaid + ytdUnapproved} days missed YTD</span>}
            <span style={{ fontSize: "10px", color: "#666" }}>{histOpen ? "▲" : "▼"}</span>
          </span>
        </button>

        {histOpen && (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "14px" }}>

            {/* YTD summary tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
              <div style={{ textAlign: "center", padding: "8px", background: "var(--color-bg-raised)", borderRadius: "4px" }}>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-red)", fontFamily: "var(--font-mono)" }}>{ytdUnpaid}</div>
                <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Unpaid Shifts</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px", background: "var(--color-bg-raised)", borderRadius: "4px" }}>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "#e8622a", fontFamily: "var(--font-mono)" }}>{ytdUnapproved}</div>
                <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Unapprov. Days</div>
              </div>
              <div style={{ textAlign: "center", padding: "8px", background: "var(--color-bg-raised)", borderRadius: "4px" }}>
                <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{ytdPartial}</div>
                <div style={{ fontSize: "9px", letterSpacing: "1px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Partial Shifts</div>
              </div>
            </div>

            {/* Monthly breakdown */}
            {Object.keys(byMonth).length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "6px" }}>By Month</div>
                <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr", gap: "4px 8px", fontSize: "9px", color: "#444", textTransform: "uppercase", marginBottom: "4px" }}>
                  <span>Month</span><span>Unpaid</span><span>Unapprov.</span><span>Partial</span>
                </div>
                {Object.entries(byMonth).sort().map(([month, m]) => {
                  const [yr, mo] = month.split("-");
                  const label = `${LOG_MONTH_SHORT[parseInt(mo) - 1]} ${yr}`;
                  return (
                    <div key={month} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr", gap: "4px 8px", padding: "4px 0", borderBottom: "1px solid #1a1a1a" }}>
                      <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{label}</span>
                      <span style={{ fontSize: "11px", color: m.unpaid > 0 ? "var(--color-red)" : "#333", fontFamily: "var(--font-mono)" }}>{m.unpaid > 0 ? `${m.unpaid}sh` : "—"}</span>
                      <span style={{ fontSize: "11px", color: m.unapproved > 0 ? "#e8622a" : "#333", fontFamily: "var(--font-mono)" }}>{m.unapproved > 0 ? `${m.unapproved}d·${m.unapprovedH}h` : "—"}</span>
                      <span style={{ fontSize: "11px", color: m.partial > 0 ? "var(--color-text-secondary)" : "#333", fontFamily: "var(--font-mono)" }}>{m.partial > 0 ? `${m.partial}·${m.partialH}h` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Day-of-week pattern */}
            {dowSorted.length > 0 && (
              <div>
                <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "6px" }}>Day Pattern</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {dowSorted.map(([day, count]) => {
                    const pct = totalMissedDays > 0 ? count / totalMissedDays : 0;
                    const isWeekend = day === "Sat" || day === "Sun";
                    const col = pct >= 0.3 ? "var(--color-red)" : pct >= 0.15 ? "var(--color-gold)" : "var(--color-text-secondary)";
                    return (
                      <div key={day} style={{ display: "flex", alignItems: "center", gap: "5px", background: "var(--color-bg-raised)", padding: "4px 10px", borderRadius: "12px" }}>
                        <span style={{ fontSize: "10px", color: isWeekend ? "var(--color-gold)" : col, fontWeight: pct >= 0.2 ? "bold" : "normal", textTransform: "uppercase", letterSpacing: "1px" }}>{day.toUpperCase()}</span>
                        <span style={{ fontSize: "11px", color: col, fontFamily: "var(--font-mono)", fontWeight: "bold" }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: "10px", color: "#444", marginTop: "6px" }}>{totalMissedDays} total missed day{totalMissedDays !== 1 ? "s" : ""} logged</div>
              </div>
            )}

          </div>
        )}
      </div>
    )}

    {/* Log header + add button */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Event Log ({logs.length})</div>
      <button onClick={() => { setAdding(true); setEditId(null); }} style={{ background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none", borderRadius: "4px", padding: "6px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>+ LOG EVENT</button>
    </div>

    {/* Add form */}
    {adding && <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>New Event</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <FormFields vals={nEv} set={setNEv} onWeekEndChange={handleWeekEndChange} />
      </div>
      {addConfirming && (
        <div style={{ marginBottom: "10px", padding: "12px", background: "#1a2d1e", border: "1px solid rgba(76,175,125,0.4)", borderRadius: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
          <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-green)", textTransform: "uppercase", marginBottom: "8px" }}>Confirm entry?</div>
          {(nEv.type === "missed_unpaid" || nEv.type === "missed_unapproved") && (() => {
            const s = parseInt(nEv.shiftsLost) || 0;
            const h = parseFloat(nEv.hoursLost) || 0;
            const expected = s * config.shiftHours;
            const overridden = expected > 0 && Math.abs(h - expected) > 0.01;
            return <div>{s} shift(s) · {h}h missed{overridden && <span style={{ color: "var(--color-gold)", marginLeft: "6px", fontSize: "9px" }}>⚠ hours overridden (expected {expected}h)</span>}</div>;
          })()}
          {nEv.type === "bonus" && <div>+${parseFloat(nEv.amount) || 0} · {parseInt(nEv.shiftsGained) || 0} shift(s) · {parseFloat(nEv.hoursGained) || 0}h gained</div>}
          {nEv.type === "partial" && <div>{parseFloat(nEv.hoursLost) || 0}h partial shift</div>}
          {nEv.type === "pto" && <div>{parseFloat(nEv.ptoHours) || 0}h PTO</div>}
          {nEv.type === "other_loss" && <div>-${parseFloat(nEv.amount) || 0} other loss</div>}
        </div>
      )}
      {cancelWarning && (
        <div style={{ marginBottom: "10px", padding: "12px", background: "#2d1a1a", border: "1px solid rgba(224,92,92,0.4)", borderRadius: "6px", fontSize: "11px" }}>
          <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-red)", textTransform: "uppercase", marginBottom: "6px" }}>Leave without saving?</div>
          <div style={{ color: "var(--color-text-secondary)", marginBottom: "10px", fontSize: "10px" }}>This event will be discarded.</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => { setAdding(false); setNEv(blank); setAddConfirming(false); setCancelWarning(false); }} style={{ background: "var(--color-red)", color: "#0a0a0a", border: "none", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>Yes, Discard</button>
            <button onClick={() => setCancelWarning(false)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Keep Editing</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        {!addConfirming ? (
          <>
            <button onClick={() => setAddConfirming(true)} disabled={!nEv.weekEnd} style={{ background: nEv.weekEnd ? "var(--color-green)" : "var(--color-border-subtle)", color: nEv.weekEnd ? "var(--color-bg-base)" : "#555", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: nEv.weekEnd ? "pointer" : "default", fontWeight: "bold" }}>SAVE</button>
            <button onClick={() => nEv.weekEnd ? setCancelWarning(true) : (setAdding(false), setNEv(blank), setAddConfirming(false))} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>CANCEL</button>
          </>
        ) : (
          <>
            <button onClick={addLog} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>YES, LOG IT</button>
            <button onClick={() => setAddConfirming(false)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>EDIT</button>
          </>
        )}
      </div>
    </div>}

    {logs.length === 0 && !adding && <div style={{ textAlign: "center", padding: "40px", color: "#444", fontSize: "13px" }}>No events logged yet.</div>}

    {/* Log entries */}
    {logs.map(entry => {
      const imp  = calcEventImpact(entry, config);
      const ev   = EVENT_TYPES[entry.type] ?? { label: entry.type, color: "var(--color-text-secondary)", icon: "?" };
      const isB  = entry.type === "bonus";
      const isUA = entry.type === "missed_unapproved";
      const ak   = entry.weekEnd && new Date(entry.weekEnd) >= new Date(config.k401StartDate);
      const isEditing = editId === entry.id;
      const missedArr = normalizeDays(entry.missedDays);

      return <div key={entry.id} style={{ background: "var(--color-bg-surface)", border: `1px solid ${isEditing ? ev.color : ev.color + "33"}`, borderRadius: "8px", padding: "16px", marginBottom: "10px" }}>

        {isEditing ? (
          <>
            <div style={{ fontSize: "11px", letterSpacing: "2px", color: ev.color, textTransform: "uppercase", marginBottom: "14px" }}>Edit Event</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <FormFields vals={editVals} set={setEditVals} onWeekEndChange={handleEditWeekEndChange} />
            </div>
            {editConfirming && (
              <div style={{ marginBottom: "10px", padding: "12px", background: "#1a2d1e", border: "1px solid rgba(76,175,125,0.4)", borderRadius: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
                <div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-green)", textTransform: "uppercase", marginBottom: "8px" }}>Confirm changes?</div>
                {(editVals.type === "missed_unpaid" || editVals.type === "missed_unapproved") && (() => {
                  const s = parseInt(editVals.shiftsLost) || 0;
                  const h = parseFloat(editVals.hoursLost) || 0;
                  const expected = s * config.shiftHours;
                  const overridden = expected > 0 && Math.abs(h - expected) > 0.01;
                  return <div>{s} shift(s) · {h}h missed{overridden && <span style={{ color: "var(--color-gold)", marginLeft: "6px", fontSize: "9px" }}>⚠ hours overridden (expected {expected}h)</span>}</div>;
                })()}
                {editVals.type === "bonus" && <div>+${parseFloat(editVals.amount) || 0} · {parseInt(editVals.shiftsGained) || 0} shift(s) · {parseFloat(editVals.hoursGained) || 0}h gained</div>}
                {editVals.type === "partial" && <div>{parseFloat(editVals.hoursLost) || 0}h partial shift</div>}
                {editVals.type === "pto" && <div>{parseFloat(editVals.ptoHours) || 0}h PTO</div>}
                {editVals.type === "other_loss" && <div>-${parseFloat(editVals.amount) || 0} other loss</div>}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              {!editConfirming ? (
                <>
                  <button onClick={() => setEditConfirming(true)} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>SAVE</button>
                  <button onClick={() => { setEditId(null); setEditConfirming(false); }} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>CANCEL</button>
                </>
              ) : (
                <>
                  <button onClick={saveEdit} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>YES, SAVE</button>
                  <button onClick={() => setEditConfirming(false)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>EDIT</button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", background: ev.color + "22", color: ev.color, padding: "2px 8px", borderRadius: "12px" }}>{ev.icon} {ev.label}</span>
                  <span style={{ fontSize: "11px", color: "#777" }}>{formatRotationDisplay(entry.weekRotation, { isAdmin })}</span>
                  {isUA && <span style={{ fontSize: "9px", background: "#e8622a22", color: "#e8622a", padding: "2px 6px", borderRadius: "12px", fontWeight: "bold" }}>⚠ BUCKET HIT</span>}
                  {ak   && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "12px" }}>401k</span>}
                </div>
                <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "2px" }}>Week ending {entry.weekEnd || "—"}</div>
                {missedArr.length > 0 && <div style={{ fontSize: "11px", color: "#777" }}>Missed: {missedArr.join(", ")}</div>}
                {entry.note && <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>{entry.note}</div>}
              </div>
              <div style={{ textAlign: "right", marginLeft: "16px" }}>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: isB ? "var(--color-green)" : "var(--color-red)" }}>{isB ? "+" : "-"}{f(isB ? imp.grossGained : imp.grossLost)}</div>
                <div style={{ fontSize: "10px", color: "#666" }}>gross · proj {f(imp.baseGross)}</div>
                <div style={{ fontSize: "13px", color: isB ? "var(--color-green)" : "var(--color-red)", marginTop: "2px" }}>{isB ? "+" : "-"}{f(isB ? imp.netGained : imp.netLost)} net</div>
                {ak && imp.k401kLost > 0 && <div style={{ fontSize: "10px", color: "#7a8bbf", marginTop: "2px" }}>-{f(imp.k401kLost)} 401k</div>}
                {imp.hoursLostForPTO > 0 && <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginTop: "2px" }}>-{(imp.hoursLostForPTO / 20).toFixed(2)} PTO accrual</div>}
                {isUA && <div style={{ fontSize: "10px", color: "#e8622a", marginTop: "2px" }}>-{imp.bucketHoursDeducted}h bucket</div>}
              </div>
            </div>
            <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "10px", color: "#666" }}>
                {entry.type === "missed_unpaid"     && `${entry.shiftsLost} shift(s) · ${entry.weekendShifts} wknd · ${entry.shiftsLost * config.shiftHours}h`}
                {entry.type === "missed_unapproved" && `${entry.hoursLost}h unapproved`}
                {entry.type === "pto"               && `${entry.ptoHours}h PTO @ $${config.baseRate}`}
                {entry.type === "partial"           && `${entry.hoursLost}h partial`}
                {entry.type === "bonus"             && `+${f(entry.amount)} bonus`}
                {entry.type === "other_loss"        && `-${f(entry.amount)} other`}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => startEdit(entry)} style={{ background: "transparent", border: "1px solid #444", color: "#999", borderRadius: "12px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", }}>EDIT</button>
                {cdel === entry.id
                  ? <>
                      <button onClick={() => { setLogs(p => p.filter(e => e.id !== entry.id)); setCdel(null); }} style={{ background: "var(--color-red)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", }}>CONFIRM</button>
                      <button onClick={() => setCdel(null)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", }}>CANCEL</button>
                    </>
                  : <button onClick={() => setCdel(entry.id)} style={{ background: "transparent", border: "1px solid #333", color: "var(--color-text-disabled)", borderRadius: "12px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", }}>DELETE</button>
                }
              </div>
            </div>
          </>
        )}
      </div>;
    })}

    {/* Bottom stack ported from BenefitsPanel */}
    {currentWeek && <div style={{ background: k401Active ? "#1a3a20" : "#1e1e2a", border: `1px solid ${k401Active ? "rgba(76,175,125,0.27)" : "#7a8bbf44"}`, borderRadius: "6px", padding: "10px 14px", margin: "24px 0 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>401k Status</div>
      {!hasValid401Start ? (
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Enrollment start date not set yet</div>
      ) : k401Active ? (
        <div style={{ fontSize: "11px", color: "var(--color-green)", fontWeight: "bold" }}>
          Active — contributions running since {fmtDate(raw401StartIso)}
          {k401StartSource === "benefits" && (
            <span style={{ fontSize: "10px", color: "var(--color-text-disabled)", fontWeight: "normal" }}> (benefits start)</span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: "11px", color: "#7a8bbf" }}>
          <strong style={{ color: "var(--color-text-primary)" }}>{weeksUntil401k} week{weeksUntil401k !== 1 ? "s" : ""}</strong> until enrollment ({fmtDate(raw401StartIso)})
          <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", marginTop: "4px" }}>
            Projected totals below assume contributions begin on this date.
          </div>
        </div>
      )}
    </div>}

    <div style={{ marginBottom: "24px" }}>
      <SH>401k Projections</SH>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card label="Proj. Your Contributions" val={f(bE)} rawVal={bE} color="#7a8bbf" size="18px" />
        <Card label="Proj. Employer Match" val={f(bM)} rawVal={bM} color="var(--color-green)" size="18px" />
        <Card label="Proj. Year-End Balance" val={f(bE + bM)} rawVal={bE + bM} color="var(--color-gold)" size="18px" />
      </div>
      {(logK401kLost > 0 || logK401kMatchLost > 0 || logK401kGained > 0 || logK401kMatchGained > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card label="Proj. Your Contributions (adj.)" val={f(aE)} rawVal={aE} sub={[logK401kLost > 0 && `-${f(logK401kLost)} lost`, logK401kGained > 0 && `+${f(logK401kGained)} bonus`].filter(Boolean).join(" · ")} color="#7a8bbf" size="18px" />
        <Card label="Proj. Employer Match (adj.)" val={f(aM)} rawVal={aM} sub={[logK401kMatchLost > 0 && `-${f(logK401kMatchLost)} lost`, logK401kMatchGained > 0 && `+${f(logK401kMatchGained)} bonus`].filter(Boolean).join(" · ")} color="var(--color-green)" size="18px" />
        <Card label="Proj. Year-End Balance (adj.)" val={f(aE + aM)} rawVal={aE + aM} color="var(--color-gold)" size="18px" />
      </div>}
      {(() => {
        const matchRate = config.employerPreset === "DHL" ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
        let r401 = 0;
        const mo401 = allWeeks.reduce((acc, w) => {
          if (!w.active) return acc;
          const mi = w.weekEnd.getMonth();
          if (!acc[mi]) acc[mi] = { name: LOG_MONTH_SHORT[mi], gross: 0, k4E: 0, k4M: 0 };
          acc[mi].gross += w.grossPay;
          acc[mi].k4E += w.k401kEmployee;
          acc[mi].k4M += w.k401kEmployer;
          return acc;
        }, {});
        const rows = Object.values(mo401).filter(m => m.k4E > 0).map(m => ({ ...m, running: (r401 += m.k4E + m.k4M) }));
        if (!rows.length) return null;
        return (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "360px" }}>
              <thead><tr style={{ borderBottom: "1px solid var(--color-accent-primary)", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
                <th style={{ textAlign: "left", padding: "8px 4px" }}>Month</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Your {(config.k401Rate * 100).toFixed(0)}%</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Match {(matchRate * 100).toFixed(1)}%</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Mo Total</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Running</th>
              </tr></thead>
              <tbody>{rows.map(m => <tr key={m.name} style={{ borderBottom: "1px solid #161616" }}><td style={{ padding: "7px 4px", fontWeight: "bold", color: "var(--color-gold)" }}>{m.name}</td><td style={{ padding: "7px 4px", textAlign: "right" }}>{f(m.gross)}</td><td style={{ padding: "7px 4px", textAlign: "right", color: "#7a8bbf" }}>{f2(m.k4E)}</td><td style={{ padding: "7px 4px", textAlign: "right", color: "var(--color-green)" }}>{f2(m.k4M)}</td><td style={{ padding: "7px 4px", textAlign: "right" }}>{f2(m.k4E + m.k4M)}</td><td style={{ padding: "7px 4px", textAlign: "right", color: "var(--color-gold)", fontWeight: "bold" }}>{f2(m.running)}</td></tr>)}</tbody>
              <tfoot><tr style={{ borderTop: "2px solid var(--color-accent-primary)", fontWeight: "bold", color: "var(--color-gold)" }}>
                <td colSpan={2} style={{ padding: "10px 4px" }}>Year-End Total</td><td style={{ padding: "10px 4px", textAlign: "right", color: "#7a8bbf" }}>{f(bE)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(bM)}</td><td style={{ padding: "10px 4px", textAlign: "right" }}>{f(bE + bM)}</td><td style={{ padding: "10px 4px", textAlign: "right" }}>{f(bE + bM)}</td>
              </tr></tfoot>
            </table>
          </div>
        );
      })()}
    </div>

    {isDHL && (
      <div style={{ marginBottom: "24px" }}>
        <SH>PTO Accrual</SH>
        <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "14px 16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingPto ? "10px" : "0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>PTO Balance</div>
              {config.ptoHoursOverride != null && <span style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "1px" }}>(manual)</span>}
            </div>
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--color-text-primary)" }}>{effectiveAdjP.toFixed(1)} hrs</span>
          </div>
          {editingPto ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <input {...iS} style={{ ...iS, width: "100px", padding: "6px 10px" }} type="number" min="0" step="0.5" value={ptoInput} onChange={e => setPtoInput(e.target.value)} placeholder="hours" autoFocus />
              <SmBtn onClick={() => { const val = parseFloat(ptoInput); if (setConfig && Number.isFinite(val) && val >= 0) setConfig(c => ({ ...c, ptoHoursOverride: val })); setEditingPto(false); }} c="var(--color-bg-base)" bg="var(--color-gold)">Save</SmBtn>
              <SmBtn onClick={() => setEditingPto(false)} c="var(--color-text-secondary)" bg="var(--color-bg-raised)">Cancel</SmBtn>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <SmBtn onClick={() => { setPtoInput(String(effectiveAdjP.toFixed(1))); setEditingPto(true); }} c="var(--color-text-secondary)" bg="var(--color-bg-raised)">Set Balance</SmBtn>
              {config.ptoHoursOverride != null && <SmBtn onClick={() => setConfig?.(c => ({ ...c, ptoHoursOverride: null }))} c="var(--color-text-disabled)" bg="var(--color-bg-raised)">Clear Override</SmBtn>}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
          <Card label="Accrual Rate" val="1 hr / 20 worked" color="#7eb8c9" size="14px" />
          {ptoGoal ? (<>
            <Card label={`Base Accrued by ${fmtDate(ptoGoal.targetDate)}`} val={`~${ptoBs.toFixed(1)} hrs`} color="var(--color-text-primary)" size="18px" />
            {logPTOHoursLost > 0 ? <Card label={`Proj. Accrued by ${fmtDate(ptoGoal.targetDate)}`} val={`~${effectiveAdjP.toFixed(1)} hrs`} sub={`-${(logPTOHoursLost / 20).toFixed(1)} hrs from events`} color="var(--color-gold)" size="18px" /> : <Card label="Negative Balance Cap" val={`${negCap} hrs (after 90d)`} color="#888" size="14px" />}
          </>) : (<>
            <Card label="Accrued by Leave Date" val="— set a goal" color="var(--color-text-disabled)" size="14px" />
            <Card label="Negative Balance Cap" val="40 hrs (after 90d)" color="#888" size="14px" />
          </>)}
        </div>

        {!formOpen && ptoGoal && (
          <div style={{ background: onTrack ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${onTrack ? "var(--color-green)" : "var(--color-red)"}`, borderRadius: "6px", padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
              <div><div style={{ fontSize: "11px", color: onTrack ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold", marginBottom: "4px" }}>{ptoGoal.label}</div><div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Need {hoursNeed} hrs · {effectiveAdjP.toFixed(1)} accrued + {negCap} neg cap = <strong style={{ color: "var(--color-text-primary)" }}>{avail.toFixed(1)} available</strong></div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)", marginTop: "3px" }}>Leave starts {fmtDate(ptoGoal.targetDate)} · ≈ {Math.ceil(hoursNeed / shiftHours)} shifts</div></div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: "bold", color: onTrack ? "var(--color-green)" : "var(--color-red)" }}>{onTrack ? "On Track" : "Shortfall"}</div>
                {!onTrack && <div style={{ fontSize: "10px", color: "var(--color-red)" }}>Short {(hoursNeed - avail).toFixed(1)} hrs</div>}
                <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                  <SmBtn onClick={openEdit} c="var(--color-text-secondary)" bg="var(--color-bg-raised)">Edit</SmBtn>
                  <SmBtn onClick={() => setPtoGoal?.(null)} c="var(--color-red)" bg="var(--color-bg-raised)">Clear</SmBtn>
                </div>
              </div>
            </div>
          </div>
        )}
        {!formOpen && !ptoGoal && (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>No PTO leave goal set. Add one to track your accrual progress toward a leave target.</div>
            <SmBtn onClick={openAdd} c="var(--color-gold)" bg="var(--color-bg-raised)">Set Goal</SmBtn>
          </div>
        )}
        {formOpen && (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>{editMode ? "Edit Leave Goal" : "New Leave Goal"}</div>
            <div><label style={lS}>Goal Label</label><input {...iS} style={{ ...iS }} type="text" value={formVals.label} onChange={e => setFormVals(v => ({ ...v, label: e.target.value }))} placeholder="e.g. Paternity Leave" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div><label style={lS}>Hours Needed</label><input {...iS} style={{ ...iS }} type="number" min="0" step="1" value={formVals.hoursNeeded} onChange={e => setFormVals(v => ({ ...v, hoursNeeded: e.target.value }))} placeholder="e.g. 134" />{formVals.hoursNeeded && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>≈ {Math.ceil(parseFloat(formVals.hoursNeeded) / shiftHours)} shifts at {shiftHours}h</div>}</div>
              <div><label style={lS}>Negative Balance Cap (hrs)</label><input {...iS} style={{ ...iS }} type="number" min="0" step="1" value={formVals.negativeBalanceCap} onChange={e => setFormVals(v => ({ ...v, negativeBalanceCap: e.target.value }))} placeholder="40" /><div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>Hours DHL allows you to borrow</div></div>
            </div>
            <div><label style={lS}>Leave Start Date</label><input {...iS} style={{ ...iS }} type="date" value={formVals.targetDate} onChange={e => setFormVals(v => ({ ...v, targetDate: e.target.value }))} /><div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>App projects your PTO accrual up to this date.</div></div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setFormOpen(false)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button onClick={saveForm} disabled={!formVals.label.trim() || !formVals.hoursNeeded || !formVals.targetDate} style={{ background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", fontWeight: "bold", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", opacity: (!formVals.label.trim() || !formVals.hoursNeeded || !formVals.targetDate) ? 0.4 : 1 }}>Save</button>
            </div>
          </div>
        )}
      </div>
    )}

    {bucketModel && (() => {
      const bm = bucketModel;
      const bandColor = bm.status === "safe" ? "var(--color-green)" : bm.status === "caution" ? "var(--color-gold)" : "var(--color-red)";
      const bandBg = bm.status === "safe" ? "#1a2d1e" : bm.status === "caution" ? "#2d2710" : "#2d1a1a";
      return (
        <div style={{ marginBottom: "24px" }}>
          <SH>Attendance Bucket</SH>
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "10px 14px", marginBottom: "10px", fontSize: "11px" }}>
            <span style={{ color: "var(--color-text-secondary)", marginRight: "8px" }}>{fmtMonth(currentMonthStr)} — Tier {bm.currentTier}</span>
            {bm.currentTier === 1 && <span style={{ color: "var(--color-green)" }}>perfect so far · any unapproved absence changes tier</span>}
            {bm.currentTier === 2 && <span style={{ color: "var(--color-gold)" }}>{bm.currentM}h unapproved · {bm.hoursToNextTier}h to next tier drop</span>}
            {bm.currentTier === 3 && <span style={{ color: "var(--color-red)" }}>{bm.currentM}h unapproved · {bm.hoursToNextTier}h to worst tier</span>}
            {bm.currentTier === 4 && <span style={{ color: "var(--color-red)" }}>worst tier · {bm.currentM}h unapproved this month</span>}
          </div>
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #1e1e1e", borderRadius: "8px", overflow: "hidden", marginBottom: "10px" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead><tr style={{ borderBottom: "1px solid #222", color: "var(--color-text-disabled)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase" }}><th style={{ padding: "8px 12px", textAlign: "left" }}>Month</th><th style={{ padding: "8px 8px", textAlign: "right" }}>Unappr.</th><th style={{ padding: "8px 8px", textAlign: "right" }}>Net</th><th style={{ padding: "8px 8px", textAlign: "right" }}>Balance</th><th style={{ padding: "8px 12px", textAlign: "right" }}>Overflow Payout</th></tr></thead>
              <tbody>
                {bm.monthHistory.map(row => <tr key={row.month} style={{ borderBottom: "1px solid #181818" }}><td style={{ padding: "7px 12px", color: "var(--color-text-primary)" }}>{fmtMonth(row.month)}</td><td style={{ padding: "7px 8px", textAlign: "right", color: row.M > 0 ? "var(--color-red)" : "#444" }}>{row.M > 0 ? `${row.M}h` : "—"}</td><td style={{ padding: "7px 8px", textAlign: "right", color: row.net >= 0 ? "var(--color-green)" : "var(--color-red)" }}>{row.net >= 0 ? "+" : ""}{row.net}h</td><td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-secondary)" }}>{row.closingBalance}h</td><td style={{ padding: "7px 12px", textAlign: "right", color: row.payout > 0 ? "var(--color-gold)" : "#444" }}>{row.payout > 0 ? f2(row.payout) : "—"}</td></tr>)}
                <tr style={{ borderBottom: "1px solid #252525", background: "var(--color-bg-surface)" }}><td style={{ padding: "7px 12px", color: "var(--color-gold)" }}>{fmtMonth(currentMonthStr)} <span style={{ fontSize: "9px", color: "var(--color-text-disabled)" }}>in progress</span></td><td style={{ padding: "7px 8px", textAlign: "right", color: bm.currentM > 0 ? "var(--color-red)" : "#444" }}>{bm.currentM > 0 ? `${bm.currentM}h` : "—"}</td><td style={{ padding: "7px 8px", textAlign: "right", color: "#444" }}>—</td><td style={{ padding: "7px 8px", textAlign: "right", color: "#666" }}>{bm.currentBalance}h</td><td style={{ padding: "7px 12px", textAlign: "right", color: "#444" }}>—</td></tr>
                {bm.projectedHistory.map(row => <tr key={row.month} style={{ borderBottom: "1px solid #181818", opacity: 0.45 }}><td style={{ padding: "7px 12px", color: "#666", fontStyle: "italic" }}>{fmtMonth(row.month)}</td><td style={{ padding: "7px 8px", textAlign: "right", color: "#444" }}>—</td><td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-disabled)" }}>+{row.net}h</td><td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-disabled)" }}>{row.closingBalance}h</td><td style={{ padding: "7px 12px", textAlign: "right", color: row.payout > 0 ? "#8a6e20" : "#444" }}>{row.payout > 0 ? f2(row.payout) : "—"}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div style={{ background: bandBg, border: `1px solid ${bandColor}33`, borderRadius: "6px", padding: "12px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 16px", fontSize: "11px", alignItems: "center" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Realized overflow payout:</span><span style={{ textAlign: "right", color: bm.realizedPayout > 0 ? "var(--color-gold)" : "#555" }}>{f2(bm.realizedPayout)}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>Projected (perfect attendance):</span><span style={{ textAlign: "right", color: "var(--color-green)" }}>{f2(bm.projectedPayout)}</span>
              <span style={{ color: "var(--color-text-primary)", fontWeight: "bold", borderTop: "1px solid #ffffff11", paddingTop: "6px" }}>Total projected bonus income:</span><span style={{ textAlign: "right", color: "var(--color-gold)", fontWeight: "bold", borderTop: "1px solid #ffffff11", paddingTop: "6px" }}>{f2(bm.totalProjectedBonus)}</span>
            </div>
          </div>
        </div>
      );
    })()}

  </div>);
}
