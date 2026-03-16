import { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
// CONFIG — all income constants, fully editable
// taxedWeeks replaces taxedRanges — flat array, togglable per week
// ─────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  baseRate: 21.15, shiftHours: 12, diffRate: 3.00, otThreshold: 40, otMultiplier: 1.5,
  ltd: 2.00, k401Rate: 0.06, k401MatchRate: 0.05, k401StartDate: "2026-05-15",
  firstActiveIdx: 7, w2FedRate: 0.1283, w2StateRate: 0.040, w1FedRate: 0.0784, w1StateRate: 0.0338,
  ficaRate: 0.0765, fedStdDeduction: 15000, moFlatRate: 0.047, targetOwedAtFiling: 1000,
  taxedWeeks: [7, 8, 19, 20, 21, 22, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
};

const PTO_RATE = 19.65;
const WEEKS_REMAINING = 44;
// Approximate phase weights out of 44 remaining weeks
const PHASE_WEIGHTS = [6, 13, 25];

const FED_BRACKETS = [[11925, 0.10], [48475, 0.12], [103350, 0.22], [Infinity, 0.24]];

// ─────────────────────────────────────────────────────────────
// PURE FUNCTIONS
// ─────────────────────────────────────────────────────────────
function fedTax(income) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of FED_BRACKETS) { if (income <= prev) break; tax += (Math.min(income, limit) - prev) * rate; prev = limit; }
  return tax;
}

function buildYear(cfg) {
  const weeks = [], k401Start = new Date(cfg.k401StartDate), taxedSet = new Set(cfg.taxedWeeks);
  let d = new Date(2026, 0, 5), idx = 0;
  while (d <= new Date(2027, 0, 4)) {
    const weekEnd = new Date(d), weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - 7);
    const isWeek2 = idx % 2 === 0;
    const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(x.getDate() + i); return x; });
    const worked = isWeek2 ? [days[1], days[2], days[3], days[4], days[5], days[6]] : [days[0], days[2], days[3], days[4]];
    const totalHours = worked.length * cfg.shiftHours;
    const regularHours = Math.min(totalHours, cfg.otThreshold);
    const overtimeHours = Math.max(totalHours - cfg.otThreshold, 0);
    const weekendHours = worked.filter(w => w.getDay() === 0 || w.getDay() === 6).length * cfg.shiftHours;
    const grossPay = regularHours * cfg.baseRate + overtimeHours * cfg.baseRate * cfg.otMultiplier + weekendHours * cfg.diffRate;
    const active = idx >= cfg.firstActiveIdx;
    const has401k = active && weekEnd >= k401Start;
    const k401kEmployee = has401k ? grossPay * cfg.k401Rate : 0;
    const k401kEmployer = has401k ? grossPay * cfg.k401MatchRate : 0;
    const taxableGross = active ? grossPay - cfg.ltd - k401kEmployee : 0;
    const isTaxed = active && taxedSet.has(idx);
    weeks.push({
      idx, weekEnd, weekStart, rotation: isWeek2 ? "Week 2" : "Week 1",
      workedDayNames: worked.map(w => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.getDay()]),
      totalHours, regularHours, overtimeHours, weekendHours,
      grossPay: active ? grossPay : 0, taxableGross, active, has401k, k401kEmployee, k401kEmployer, taxedBySchedule: isTaxed
    });
    d.setDate(d.getDate() + 7); idx++;
  }
  return weeks;
}

function computeNet(w, cfg, extraPerCheck, showExtra) {
  if (!w.active) return 0;
  const fica = w.grossPay * cfg.ficaRate, ded = cfg.ltd + w.k401kEmployee;
  if (!w.taxedBySchedule) return w.grossPay - fica - ded;
  const isW2 = w.rotation === "Week 2";
  const fed = w.taxableGross * (isW2 ? cfg.w2FedRate : cfg.w1FedRate) + (showExtra ? extraPerCheck : 0);
  const st = w.taxableGross * (isW2 ? cfg.w2StateRate : cfg.w1StateRate);
  return w.grossPay - fed - st - fica - ded;
}

function projectedGross(isWeek2, cfg) {
  const ns = isWeek2 ? 6 : 4, totalH = ns * cfg.shiftHours;
  const reg = Math.min(totalH, cfg.otThreshold), ot = Math.max(totalH - cfg.otThreshold, 0);
  const wknd = isWeek2 ? 2 * cfg.shiftHours : 0;
  return reg * cfg.baseRate + ot * cfg.baseRate * cfg.otMultiplier + wknd * cfg.diffRate;
}

function calcEventImpact(event, cfg) {
  const isWeek2 = event.weekRotation === "Week 2";
  const normalShifts = isWeek2 ? 6 : 4, normalWeekendShifts = isWeek2 ? 2 : 0;
  const baseGross = projectedGross(isWeek2, cfg);
  let grossLost = 0, grossGained = 0, hoursLostForPTO = 0;
  if (event.type === "missed_unpaid") {
    const actualShifts = Math.max(normalShifts - (event.shiftsLost || 0), 0);
    const actualHours = actualShifts * cfg.shiftHours;
    const actualWknd = Math.max(normalWeekendShifts - (event.weekendShifts || 0), 0);
    const actualReg = Math.min(actualHours, cfg.otThreshold), actualOT = Math.max(actualHours - cfg.otThreshold, 0);
    const actualGross = actualReg * cfg.baseRate + actualOT * cfg.baseRate * cfg.otMultiplier + actualWknd * cfg.shiftHours * cfg.diffRate;
    grossLost = Math.max(baseGross - actualGross, 0); hoursLostForPTO = (event.shiftsLost || 0) * cfg.shiftHours;
  } else if (event.type === "pto") {
    const ptoH = event.ptoHours || 0, normalH = normalShifts * cfg.shiftHours;
    const normalOT = Math.max(normalH - cfg.otThreshold, 0), actualOT = Math.max(normalH - ptoH - cfg.otThreshold, 0);
    grossLost = ptoH * (cfg.baseRate - PTO_RATE) + (normalOT - actualOT) * cfg.baseRate * (cfg.otMultiplier - 1);
  } else if (event.type === "partial") {
    grossLost = (event.hoursLost || 0) * cfg.baseRate; hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "bonus") {
    grossGained = event.amount || 0;
  } else if (event.type === "other_loss") { grossLost = event.amount || 0; }
  const netLost = grossLost * (1 - cfg.ficaRate), netGained = grossGained * (1 - cfg.ficaRate);
  const weekDate = event.weekEnd ? new Date(event.weekEnd) : null;
  const affectsK401 = weekDate && weekDate >= new Date(cfg.k401StartDate);
  return {
    grossLost, grossGained, netLost, netGained, baseGross, hoursLostForPTO,
    k401kLost: affectsK401 ? grossLost * cfg.k401Rate : 0,
    k401kMatchLost: affectsK401 ? grossLost * cfg.k401MatchRate : 0,
    k401kGained: affectsK401 ? grossGained * cfg.k401Rate : 0,
    k401kMatchGained: affectsK401 ? grossGained * cfg.k401MatchRate : 0
  };
}

// ─────────────────────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────────────────────
const PHASES = [
  { id: "p1", label: "Phase 1", description: "Now → Mid-April", color: "#7eb8c9" },
  { id: "p2", label: "Phase 2", description: "Mid-April → July", color: "#c9a96e" },
  { id: "p3", label: "Phase 3", description: "August → Year End", color: "#a96ec9" },
];

const INITIAL_EXPENSES = [
  { id: "housing", category: "Needs", label: "Housing", weekly: [50, 125, 125], note: ["Staying w/ family", "Trailer split w/ brother (incl. electric + internet)", "Trailer split w/ brother (incl. electric + internet)"] },
  { id: "kids", category: "Needs", label: "Kids / Angel", weekly: [450, 350, 350], note: ["Extra support, pregnancy help", "Minimum child support baseline", "Minimum child support baseline"] },
  { id: "food", category: "Needs", label: "Food", weekly: [65, 65, 65], note: ["", "", ""] },
  { id: "jesse", category: "Needs", label: "Jesse (Loan + Phone)", weekly: [100, 100, 60], note: ["Loan $35 + phone $15 + extra", "Loan $35 + phone $15 + extra", "Loan paid off — phone only"] },
  { id: "nicotine", category: "Lifestyle", label: "Nicotine", weekly: [35, 35, 35], note: ["", "", ""] },
  { id: "rumble", category: "Lifestyle", label: "Rumble", weekly: [2.50, 2.50, 2.50], note: ["", "", ""] },
  { id: "walmart", category: "Lifestyle", label: "Walmart+", weekly: [3.75, 3.75, 3.75], note: ["", "", ""] },
  { id: "fireflood", category: "Lifestyle", label: "Fireflood", weekly: [17.50, 17.50, 17.50], note: ["$70/mo", "$70/mo", "$70/mo"] },
  { id: "cashapp", category: "Transfers", label: "CashApp Transfer", weekly: [125, 125, 125], note: ["Direct deposit benefit trigger", "Direct deposit benefit trigger", "Direct deposit benefit trigger"] },
];

const INITIAL_GOALS = [
  { id: "g1", label: "Tickets & Fines", target: 600, color: "#e8856a", note: "Traffic tickets — may be more than $600", completed: false },
  { id: "g2", label: "SUV (Cash Purchase)", target: 3000, color: "#c9a96e", note: "Full cash buy of used vehicle", completed: false },
  { id: "g3", label: "Angel Emergency Fund", target: 1000, color: "#7eb8c9", note: "Safety net for Angel & baby", completed: false },
  { id: "g4", label: "New Phone", target: 1200, color: "#7a8bbf", note: "Personal device upgrade", completed: false },
  { id: "g5", label: "Laptop Repair", target: 300, color: "#a96ec9", note: "Dev/work laptop", completed: false },
  { id: "g6", label: "Furniture & Equipment", target: 500, color: "#6dbf8a", note: "Trailer setup", completed: false },
  { id: "g7", label: "FHA Down Payment", target: 3000, color: "#c8a84b", note: "Save $3k cash + 401k loan for remainder", completed: false },
];

const INITIAL_LOGS = [{
  id: 1, weekEnd: "2026-03-16", weekIdx: 10, weekRotation: "Week 2",
  type: "missed_unpaid", shiftsLost: 3, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0,
  workedDays: "Fri, Sat, Sun", missedDays: "Tue, Wed, Thu",
  note: "Worked Fri/Sat/Sun only (36h instead of 72h) — 3 days missed unpaid",
}];

const EVENT_TYPES = {
  missed_unpaid: { label: "Missed Shift (Unpaid)", color: "#e8856a", icon: "✕" },
  pto: { label: "PTO Used", color: "#7a8bbf", icon: "◷" },
  partial: { label: "Partial Shift", color: "#c8a84b", icon: "◑" },
  bonus: { label: "Bonus / Extra Pay", color: "#6dbf8a", icon: "+" },
  other_loss: { label: "Other Income Loss", color: "#888", icon: "−" },
};

const CATEGORY_COLORS = { Needs: "#e8856a", Lifestyle: "#7a8bbf", Transfers: "#888" };
const CATEGORY_BG = { Needs: "#2a1a16", Lifestyle: "#1a1a2d", Transfers: "#1e1e1e" };
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ─────────────────────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────
const iS = { background: "#0d0d0d", border: "1px solid #333", color: "#ddd8cc", padding: "6px 8px", borderRadius: "3px", fontSize: "12px", fontFamily: "'Courier New',monospace", width: "100%", boxSizing: "border-box" };
const lS = { fontSize: "9px", letterSpacing: "2px", color: "#666", textTransform: "uppercase", marginBottom: "4px", display: "block" };

function NT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "7px 15px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "#c8a84b" : "#1a1a1a", color: active ? "#0d0d0d" : "#888", border: "1px solid " + (active ? "#c8a84b" : "#333"), borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{label}</button>; }
function VT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "6px 13px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "#c8a84b" : "#1a1a1a", color: active ? "#0d0d0d" : "#888", border: "1px solid " + (active ? "#c8a84b" : "#333"), borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{label}</button>; }
function Card({ label, val, sub, color, size = "17px" }) {
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "12px 10px" }}>
      <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#aaa", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: size, fontWeight: "bold", color: color || "#e8e0d0" }}>{val}</div>
      {sub && <div style={{ fontSize: "10px", color: "#999", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
function SmBtn({ children, onClick, c = "#888", bg = "#1a1a1a" }) { return <button onClick={onClick} style={{ background: bg, color: c, border: `1px solid ${c}44`, borderRadius: "3px", padding: "3px 8px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{children}</button>; }

// ─────────────────────────────────────────────────────────────
// INCOME PANEL
// ─────────────────────────────────────────────────────────────
function IncomePanel({ allWeeks, config, setConfig, showExtra, setShowExtra, taxDerived, logNetLost, adjustedTakeHome, projectedAnnualNet }) {
  const [view, setView] = useState("summary");
  const [editCfg, setEditCfg] = useState(null);
  const { extraPerCheck, taxedWeekCount, fedLiability, moLiability, ficaTotal, fedWithheldBase, moWithheldBase, fedGap, moGap, totalGap, targetExtraTotal, fedAGI } = taxDerived;
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gN = w => computeNet(w, config, extraPerCheck, showExtra);
  let rE = 0, rM = 0;
  const wR = allWeeks.map(w => { rE += w.k401kEmployee; rM += w.k401kEmployer; return { ...w, rE, rM }; });
  const mo = MONTH_FULL.map((name, mi) => {
    const wks = allWeeks.filter(w => w.active && w.weekEnd.getFullYear() === 2026 && w.weekEnd.getMonth() === mi);
    return {
      name, gross: wks.reduce((s, w) => s + w.grossPay, 0), net: wks.reduce((s, w) => s + gN(w), 0),
      k4E: wks.reduce((s, w) => s + w.k401kEmployee, 0), k4M: wks.reduce((s, w) => s + w.k401kEmployer, 0),
      wks, n: wks.length, tx: wks.filter(w => w.taxedBySchedule).length, ex: wks.filter(w => !w.taxedBySchedule).length
    };
  });
  const yG = allWeeks.filter(w => w.active).reduce((s, w) => s + w.grossPay, 0);
  const yN = projectedAnnualNet;
  const yE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
  const yT = allWeeks.reduce((s, w) => s + w.k401kEmployee + w.k401kEmployer, 0);
  const sc = t => t ? "#7a8bbf" : "#6dbf8a", sb = t => t ? "#1e1e3a" : "#1e4a30", sbd = t => t ? "#7a8bbf" : "#6dbf8a";

  // Tax schedule toggle
  const toggleWeek = (idx) => setConfig(prev => {
    const s = new Set(prev.taxedWeeks);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    return { ...prev, taxedWeeks: [...s].sort((a, b) => a - b) };
  });

  // Active weeks grouped by month for schedule view
  const scheduleByMonth = MONTH_FULL.map((name, mi) => {
    const wks = allWeeks.filter(w => w.active && w.weekEnd.getFullYear() === 2026 && w.weekEnd.getMonth() === mi);
    return { name, wks };
  }).filter(m => m.wks.length > 0);

  return (<div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "14px" }}>
      <Card label="Gross (Year)" val={f(yG)} />
      <Card label="Projected Net" val={f(yN)} color="#6dbf8a" />
      <Card label="Your 401k" val={f(yE)} color="#7a8bbf" />
      <Card label="401k w/ Match" val={f(yT)} color="#c8a84b" />
    </div>
    {logNetLost > 0 && <div style={{ background: "#2d1a1a", border: "1px solid #e8856a55", borderRadius: "6px", padding: "11px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "11px", color: "#888" }}>Event log: <span style={{ color: "#e8856a", fontWeight: "bold" }}>-{f(logNetLost)} net</span> · Adjusted take-home:</div>
      <div style={{ fontSize: "18px", fontWeight: "bold", color: "#c8a84b" }}>{f(adjustedTakeHome)}</div>
    </div>}
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", padding: "10px 14px", background: "#141414", border: "1px solid #2a2a2a", borderRadius: "6px" }}>
      <div style={{ fontSize: "11px", color: "#888", flex: 1 }}>Extra withholding <span style={{ color: "#c8a84b", fontWeight: "bold" }}>{f2(extraPerCheck)}/check</span> on taxed weeks → ~{f(config.targetOwedAtFiling)} owed at filing</div>
      <button onClick={() => setShowExtra(v => !v)} style={{ fontSize: "9px", letterSpacing: "2px", padding: "5px 12px", borderRadius: "3px", cursor: "pointer", background: showExtra ? "#3a3210" : "#1a1a1a", color: showExtra ? "#c8a84b" : "#aaa", border: "1px solid " + (showExtra ? "#c8a84b" : "#333"), textTransform: "uppercase", fontFamily: "'Courier New',monospace" }}>{showExtra ? "ON" : "OFF"}</button>
    </div>
    <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
      {["summary", "monthly", "weekly", "401k", "tax debt", "schedule", "config"].map(v => <VT key={v} label={v} active={view === v} onClick={() => setView(v)} />)}
    </div>

    {/* SUMMARY */}
    {view === "summary" && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
      <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "#c8a84b", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
        <th style={{ textAlign: "left", padding: "8px 6px" }}>Month</th><th style={{ textAlign: "center", padding: "8px 6px" }}>Chks</th><th style={{ textAlign: "right", padding: "8px 6px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 6px" }}>Take Home</th><th style={{ textAlign: "right", padding: "8px 6px" }}>Your 401k</th><th style={{ textAlign: "right", padding: "8px 6px" }}>w/ Match</th><th style={{ textAlign: "center", padding: "8px 6px" }}>Status</th>
      </tr></thead>
      <tbody>{mo.map(m => <tr key={m.name} style={{ borderBottom: "1px solid #1a1a1a" }} onMouseEnter={e => e.currentTarget.style.background = "#141414"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <td style={{ padding: "10px 6px", fontWeight: "bold" }}>{m.name}</td>
        <td style={{ padding: "10px 6px", textAlign: "center", color: "#aaa" }}>{m.n}</td>
        <td style={{ padding: "10px 6px", textAlign: "right" }}>{m.gross > 0 ? f(m.gross) : "—"}</td>
        <td style={{ padding: "10px 6px", textAlign: "right", color: m.ex === m.n ? "#6dbf8a" : "#e8e0d0" }}>{m.net > 0 ? f(m.net) : "—"}</td>
        <td style={{ padding: "10px 6px", textAlign: "right", color: m.k4E > 0 ? "#7a8bbf" : "#666" }}>{m.k4E > 0 ? f(m.k4E) : "—"}</td>
        <td style={{ padding: "10px 6px", textAlign: "right", color: m.k4M > 0 ? "#c8a84b" : "#666" }}>{m.k4M > 0 ? f(m.k4E + m.k4M) : "—"}</td>
        <td style={{ padding: "10px 6px", textAlign: "center" }}>{m.n === 0 ? "—" : m.tx === m.n ? <span style={{ fontSize: "9px", padding: "3px 7px", borderRadius: "3px", background: "#1e1e3a", color: "#7a8bbf", border: "1px solid #7a8bbf" }}>TAXED</span> : m.ex === m.n ? <span style={{ fontSize: "9px", padding: "3px 7px", borderRadius: "3px", background: "#1e4a30", color: "#6dbf8a", border: "1px solid #6dbf8a" }}>EXEMPT</span> : <span style={{ fontSize: "9px", padding: "3px 7px", borderRadius: "3px", background: "#3a3210", color: "#c8a84b", border: "1px solid #c8a84b" }}>MIXED</span>}</td>
      </tr>)}</tbody>
      <tfoot><tr style={{ borderTop: "2px solid #c8a84b", fontWeight: "bold", color: "#c8a84b" }}>
        <td style={{ padding: "10px 6px" }}>TOTAL</td><td style={{ padding: "10px 6px", textAlign: "center", color: "#aaa" }}>{allWeeks.filter(w => w.active).length}</td><td style={{ padding: "10px 6px", textAlign: "right" }}>{f(yG)}</td><td style={{ padding: "10px 6px", textAlign: "right", color: "#6dbf8a" }}>{f(yN)}</td><td style={{ padding: "10px 6px", textAlign: "right", color: "#7a8bbf" }}>{f(yE)}</td><td style={{ padding: "10px 6px", textAlign: "right" }}>{f(yT)}</td><td></td>
      </tr></tfoot>
    </table>}

    {/* MONTHLY */}
    {view === "monthly" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "14px" }}>
      {mo.filter(m => m.n > 0).map(m => <div key={m.name} style={{ background: "#141414", border: "1px solid #222", borderRadius: "8px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "#c8a84b" }}>{m.name}</div>
          <span style={{ fontSize: "9px", padding: "3px 7px", borderRadius: "3px", background: m.ex === m.n ? "#1e4a30" : m.tx === m.n ? "#1e1e3a" : "#3a3210", color: m.ex === m.n ? "#6dbf8a" : m.tx === m.n ? "#7a8bbf" : "#c8a84b", border: "1px solid " + (m.ex === m.n ? "#6dbf8a" : m.tx === m.n ? "#7a8bbf" : "#c8a84b") }}>{m.ex === m.n ? "EXEMPT" : m.tx === m.n ? "TAXED" : "MIXED"}</span>
        </div>
        {m.wks.map(w => <div key={w.idx} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #1e1e1e" }}>
          <div><div style={{ fontSize: "11px", color: "#777" }}>Ends {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div><div style={{ fontSize: "10px", color: "#999" }}>{w.rotation} · {w.totalHours}h{w.has401k ? " · 401k✓" : ""}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: "13px", fontWeight: "bold", color: w.taxedBySchedule ? "#e8e0d0" : "#6dbf8a" }}>{f2(gN(w))}</div><div style={{ fontSize: "9px", color: sc(w.taxedBySchedule) }}>{w.taxedBySchedule ? "TAXED" : "EXEMPT"}</div></div>
        </div>)}
        <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "11px" }}>
          <span style={{ color: "#aaa" }}>Gross: {f(m.gross)}</span><span style={{ color: "#6dbf8a", textAlign: "right" }}>Net: {f(m.net)}</span>
          {m.k4E > 0 && <><span style={{ color: "#7a8bbf" }}>401k: {f(m.k4E)}</span><span style={{ color: "#c8a84b", textAlign: "right" }}>+Match: {f(m.k4M)}</span></>}
        </div>
      </div>)}
    </div>}

    {/* WEEKLY */}
    {view === "weekly" && <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "680px" }}>
      <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "#c8a84b", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
        <th style={{ textAlign: "left", padding: "8px 4px" }}>Wk End</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Rot</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Hrs</th><th style={{ textAlign: "center", padding: "8px 4px" }}>OT</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Wknd</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>401k</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Take Home</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Status</th>
      </tr></thead>
      <tbody>{allWeeks.map(w => <tr key={w.idx} style={{ borderBottom: "1px solid #161616", opacity: w.active ? 1 : 0.35 }} onMouseEnter={e => { if (w.active) e.currentTarget.style.background = "#141414"; }} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <td style={{ padding: "7px 4px" }}>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
        <td style={{ padding: "7px 4px", textAlign: "center", fontSize: "10px", color: w.rotation === "Week 2" ? "#c8a84b" : "#7a8bbf" }}>{w.rotation}</td>
        <td style={{ padding: "7px 4px", textAlign: "center", color: "#888" }}>{w.active ? w.totalHours : "—"}</td>
        <td style={{ padding: "7px 4px", textAlign: "center", color: w.active && w.overtimeHours > 0 ? "#e8856a" : "#666" }}>{w.active && w.overtimeHours > 0 ? w.overtimeHours : "—"}</td>
        <td style={{ padding: "7px 4px", textAlign: "center", color: w.active && w.weekendHours > 0 ? "#c8a84b" : "#666" }}>{w.active && w.weekendHours > 0 ? w.weekendHours : "—"}</td>
        <td style={{ padding: "7px 4px", textAlign: "right" }}>{w.active ? f2(w.grossPay) : "—"}</td>
        <td style={{ padding: "7px 4px", textAlign: "right", color: w.has401k ? "#7a8bbf" : "#666" }}>{w.has401k ? f2(w.k401kEmployee) : "—"}</td>
        <td style={{ padding: "7px 4px", textAlign: "right", color: w.active ? (w.taxedBySchedule ? "#e8e0d0" : "#6dbf8a") : "#666" }}>{w.active ? f2(gN(w)) : "—"}</td>
        <td style={{ padding: "7px 4px", textAlign: "center" }}>{w.active && <span style={{ fontSize: "8px", padding: "2px 6px", borderRadius: "2px", background: sb(w.taxedBySchedule), color: sc(w.taxedBySchedule), border: "1px solid " + sbd(w.taxedBySchedule) }}>{w.taxedBySchedule ? "TX" : "EX"}</span>}</td>
      </tr>)}</tbody>
    </table></div>}

    {/* 401K */}
    {view === "401k" && <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
        <Card label="Your Contributions" val={f(yE)} sub={`${(config.k401Rate * 100).toFixed(0)}% · starts ${config.k401StartDate}`} color="#7a8bbf" size="22px" />
        <Card label="Employer Match" val={f(allWeeks.reduce((s, w) => s + w.k401kEmployer, 0))} sub={`${(config.k401MatchRate * 100).toFixed(0)}% match`} color="#6dbf8a" size="22px" />
        <Card label="Total 401k Balance" val={f(yT)} sub="Projected year-end 2026" color="#c8a84b" size="22px" />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "#c8a84b", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
          <th style={{ textAlign: "left", padding: "8px 4px" }}>Wk End</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Rot</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Your {(config.k401Rate * 100).toFixed(0)}%</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Match</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Wk Total</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Running</th>
        </tr></thead>
        <tbody>{wR.filter(w => w.has401k).map(w => <tr key={w.idx} style={{ borderBottom: "1px solid #161616" }} onMouseEnter={e => e.currentTarget.style.background = "#141414"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <td style={{ padding: "7px 4px" }}>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
          <td style={{ padding: "7px 4px", textAlign: "center", fontSize: "10px", color: w.rotation === "Week 2" ? "#c8a84b" : "#7a8bbf" }}>{w.rotation}</td>
          <td style={{ padding: "7px 4px", textAlign: "right" }}>{f2(w.grossPay)}</td>
          <td style={{ padding: "7px 4px", textAlign: "right", color: "#7a8bbf" }}>{f2(w.k401kEmployee)}</td>
          <td style={{ padding: "7px 4px", textAlign: "right", color: "#6dbf8a" }}>{f2(w.k401kEmployer)}</td>
          <td style={{ padding: "7px 4px", textAlign: "right" }}>{f2(w.k401kEmployee + w.k401kEmployer)}</td>
          <td style={{ padding: "7px 4px", textAlign: "right", color: "#c8a84b", fontWeight: "bold" }}>{f2(w.rE + w.rM)}</td>
        </tr>)}</tbody>
        <tfoot><tr style={{ borderTop: "2px solid #c8a84b", fontWeight: "bold", color: "#c8a84b" }}>
          <td colSpan={3} style={{ padding: "10px 4px" }}>YEAR-END TOTAL</td>
          <td style={{ padding: "10px 4px", textAlign: "right", color: "#7a8bbf" }}>{f(yE)}</td>
          <td style={{ padding: "10px 4px", textAlign: "right", color: "#6dbf8a" }}>{f(allWeeks.reduce((s, w) => s + w.k401kEmployer, 0))}</td>
          <td style={{ padding: "10px 4px", textAlign: "right" }}>{f(yT)}</td>
          <td style={{ padding: "10px 4px", textAlign: "right" }}>{f(yT)}</td>
        </tr></tfoot>
      </table>
    </div>}

    {/* TAX DEBT */}
    {view === "tax debt" && <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card label="Full Year Fed Liability" val={f(fedLiability)} sub={`On ${f(fedAGI)} AGI`} color="#e8856a" size="20px" />
        <Card label="Full Year MO Liability" val={f(moLiability)} sub="4.7% flat" color="#c8a84b" size="20px" />
        <Card label="FICA (Always Paid)" val={f(ficaTotal)} sub="7.65% every check" color="#888" size="20px" />
      </div>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>Tax Gap Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
          {[{ l: "Fed withheld (taxed weeks)", v: f(fedWithheldBase), c: "#6dbf8a" }, { l: "MO withheld (taxed weeks)", v: f(moWithheldBase), c: "#6dbf8a" }, { l: "Federal gap", v: f(fedGap), c: "#e8856a" }, { l: "Missouri gap", v: f(moGap), c: "#e8856a" }, { l: "Total income tax gap", v: f(totalGap), c: "#e8856a" }, { l: "Target owed at filing", v: f(config.targetOwedAtFiling), c: "#c8a84b" }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "#777" }}>{r.l}</span><span style={{ fontWeight: "bold", color: r.c }}>{r.v}</span></div>)}
        </div>
      </div>
      <div style={{ background: "#141414", border: "1px solid #c8a84b", borderRadius: "8px", padding: "20px", marginBottom: "20px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>Extra Withholding Plan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "16px" }}>
          {[{ l: "Extra Needed", v: f(targetExtraTotal), c: "#e8856a" }, { l: "Taxed Checks", v: taxedWeekCount, c: "#e8e0d0" }, { l: "Extra Per Check", v: f2(extraPerCheck), c: "#c8a84b" }].map(c => <div key={c.l} style={{ textAlign: "center", padding: "12px", background: "#0d0d0d", borderRadius: "6px" }}><div style={{ fontSize: "9px", letterSpacing: "2px", color: "#aaa", textTransform: "uppercase", marginBottom: "6px" }}>{c.l}</div><div style={{ fontSize: "20px", fontWeight: "bold", color: c.c }}>{c.v}</div></div>)}
        </div>
        <div style={{ fontSize: "11px", color: "#aaa", lineHeight: "1.8" }}>Add <span style={{ color: "#c8a84b", fontWeight: "bold" }}>{f2(extraPerCheck)}</span> extra federal withholding on each of your <span style={{ color: "#c8a84b" }}>{taxedWeekCount} taxed checks</span>.</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "#c8a84b", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
          <th style={{ textAlign: "left", padding: "8px 4px" }}>Wk End</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Rot</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Base Tax</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Extra</th><th style={{ textAlign: "right", padding: "8px 4px" }}>FICA</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Take Home</th>
        </tr></thead>
        <tbody>{allWeeks.filter(w => w.active && w.taxedBySchedule).map(w => {
          const isW2 = w.rotation === "Week 2";
          const bT = w.taxableGross * (isW2 ? config.w2FedRate + config.w2StateRate : config.w1FedRate + config.w1StateRate);
          const fica = w.grossPay * config.ficaRate;
          return <tr key={w.idx} style={{ borderBottom: "1px solid #161616" }} onMouseEnter={e => e.currentTarget.style.background = "#141414"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <td style={{ padding: "7px 4px" }}>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
            <td style={{ padding: "7px 4px", textAlign: "center", fontSize: "10px", color: isW2 ? "#c8a84b" : "#7a8bbf" }}>{w.rotation}</td>
            <td style={{ padding: "7px 4px", textAlign: "right" }}>{f2(w.grossPay)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "#e8856a" }}>{f2(bT)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "#c8a84b" }}>{showExtra ? f2(extraPerCheck) : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "#888" }}>{f2(fica)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "#e8e0d0", fontWeight: "bold" }}>{f2(gN(w))}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    {/* TAX SCHEDULE — toggle taxed/exempt per week */}
    {view === "schedule" && <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#888", textTransform: "uppercase" }}>Toggle Taxed / Exempt Per Week</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "11px", color: "#aaa" }}>
          <span style={{ background: "#1e1e3a", color: "#7a8bbf", padding: "3px 8px", borderRadius: "3px", border: "1px solid #7a8bbf", fontSize: "9px" }}>TAXED = fed+state withheld</span>
          <span style={{ background: "#1e4a30", color: "#6dbf8a", padding: "3px 8px", borderRadius: "3px", border: "1px solid #6dbf8a", fontSize: "9px" }}>EXEMPT = FICA only</span>
        </div>
      </div>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "12px 14px", marginBottom: "16px", display: "flex", gap: "20px", fontSize: "11px", color: "#aaa" }}>
        <span>Taxed weeks: <strong style={{ color: "#e8856a" }}>{config.taxedWeeks.length}</strong></span>
        <span>Exempt weeks: <strong style={{ color: "#6dbf8a" }}>{allWeeks.filter(w => w.active).length - config.taxedWeeks.length}</strong></span>
        <span>Extra/check: <strong style={{ color: "#c8a84b" }}>{f2(extraPerCheck)}</strong></span>
      </div>
      {scheduleByMonth.map(m => <div key={m.name} style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "8px" }}>{m.name}</div>
        {m.wks.map(w => {
          const taxed = config.taxedWeeks.includes(w.idx);
          return <div key={w.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#141414", border: `1px solid ${taxed ? "#7a8bbf22" : "#6dbf8a22"}`, borderRadius: "6px", marginBottom: "6px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "bold" }}>Ends {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                <div style={{ fontSize: "10px", color: "#666" }}>{w.rotation} · {w.totalHours}h · idx {w.idx}{w.has401k ? " · 401k✓" : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", color: "#888" }}>{f2(w.grossPay)} gross</div>
                <div style={{ fontSize: "11px", color: taxed ? "#e8e0d0" : "#6dbf8a" }}>{f2(gN(w))} net</div>
              </div>
            </div>
            <button onClick={() => toggleWeek(w.idx)} style={{
              padding: "6px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              background: taxed ? "#1e1e3a" : "#1e4a30",
              color: taxed ? "#7a8bbf" : "#6dbf8a",
              border: `1px solid ${taxed ? "#7a8bbf" : "#6dbf8a"}`,
              borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold"
            }}>{taxed ? "TAXED →EXEMPT" : "EXEMPT →TAXED"}</button>
          </div>;
        })}
      </div>)}
      <div style={{ padding: "12px", background: "#141414", borderRadius: "6px", fontSize: "10px", color: "#555", lineHeight: "1.9" }}>
        Toggling a week instantly recalculates projected net, tax gap, extra withholding per check, and all downstream totals. Changes persist in session only — reset by refreshing the page.
      </div>
    </div>}

    {/* CONFIG */}
    {view === "config" && <div>
      {editCfg === null ? <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#888", textTransform: "uppercase" }}>Income & Schedule Configuration</div>
          <button onClick={() => setEditCfg({ ...config })} style={{ background: "#c8a84b", color: "#0d0d0d", border: "none", borderRadius: "4px", padding: "7px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>EDIT CONFIG</button>
        </div>
        {[
          { section: "Pay Structure", rows: [{ l: "Base Hourly Rate", v: `$${config.baseRate}/hr` }, { l: "Shift Length", v: `${config.shiftHours}h` }, { l: "Weekend Differential", v: `+$${config.diffRate}/hr` }, { l: "OT Threshold", v: `${config.otThreshold}h/wk` }, { l: "OT Multiplier", v: `${config.otMultiplier}×` }] },
          { section: "Deductions", rows: [{ l: "LTD (weekly)", v: `$${config.ltd}` }, { l: "401k Employee", v: `${(config.k401Rate * 100).toFixed(0)}%` }, { l: "401k Employer Match", v: `${(config.k401MatchRate * 100).toFixed(0)}%` }, { l: "401k Start Date", v: config.k401StartDate }] },
          { section: "Tax Rates (from paychecks)", rows: [{ l: "Week 2 Federal", v: `${(config.w2FedRate * 100).toFixed(2)}%` }, { l: "Week 2 MO State", v: `${(config.w2StateRate * 100).toFixed(2)}%` }, { l: "Week 1 Federal", v: `${(config.w1FedRate * 100).toFixed(2)}%` }, { l: "Week 1 MO State", v: `${(config.w1StateRate * 100).toFixed(2)}%` }, { l: "FICA", v: `${(config.ficaRate * 100).toFixed(2)}%` }] },
          { section: "Annual Tax Strategy", rows: [{ l: "Federal Std Deduction", v: `$${config.fedStdDeduction.toLocaleString()}` }, { l: "MO Flat Rate", v: `${(config.moFlatRate * 100).toFixed(1)}%` }, { l: "Target Owed at Filing", v: `$${config.targetOwedAtFiling}` }, { l: "First Active Week Index", v: `idx ${config.firstActiveIdx}` }] },
        ].map(g => <div key={g.section} style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "10px" }}>{g.section}</div>
          {g.rows.map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}><span style={{ fontSize: "12px", color: "#888" }}>{r.l}</span><span style={{ fontSize: "12px", fontWeight: "bold", color: "#e8e0d0" }}>{r.v}</span></div>)}
        </div>)}
      </div> : <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase" }}>Editing — recalculates on save</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => { setConfig(prev => ({ ...editCfg, taxedWeeks: prev.taxedWeeks })); setEditCfg(null); }} style={{ background: "#6dbf8a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "7px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>SAVE & RECALCULATE</button>
            <button onClick={() => setEditCfg(null)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "7px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {[
            { l: "Base Hourly Rate ($)", f: "baseRate", t: "number", s: "0.01" },
            { l: "Shift Length (hrs)", f: "shiftHours", t: "number", s: "1" },
            { l: "Weekend Diff ($/hr)", f: "diffRate", t: "number", s: "0.01" },
            { l: "OT Threshold (hrs/wk)", f: "otThreshold", t: "number", s: "1" },
            { l: "OT Multiplier", f: "otMultiplier", t: "number", s: "0.1" },
            { l: "LTD Weekly ($)", f: "ltd", t: "number", s: "0.01" },
            { l: "401k Employee % (decimal)", f: "k401Rate", t: "number", s: "0.01" },
            { l: "401k Match % (decimal)", f: "k401MatchRate", t: "number", s: "0.01" },
            { l: "401k Start Date", f: "k401StartDate", t: "date" },
            { l: "First Active Week Index", f: "firstActiveIdx", t: "number", s: "1" },
            { l: "Week 2 Federal Rate", f: "w2FedRate", t: "number", s: "0.0001" },
            { l: "Week 2 MO State Rate", f: "w2StateRate", t: "number", s: "0.0001" },
            { l: "Week 1 Federal Rate", f: "w1FedRate", t: "number", s: "0.0001" },
            { l: "Week 1 MO State Rate", f: "w1StateRate", t: "number", s: "0.0001" },
            { l: "FICA Rate", f: "ficaRate", t: "number", s: "0.0001" },
            { l: "Federal Std Deduction ($)", f: "fedStdDeduction", t: "number", s: "100" },
            { l: "MO Flat Rate", f: "moFlatRate", t: "number", s: "0.001" },
            { l: "Target Owed at Filing ($)", f: "targetOwedAtFiling", t: "number", s: "100" },
          ].map(fi => <div key={fi.f}><label style={lS}>{fi.l}</label><input type={fi.t} step={fi.s} value={editCfg[fi.f]} onChange={e => setEditCfg(v => ({ ...v, [fi.f]: fi.t === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))} style={iS} /></div>)}
        </div>
      </div>}
    </div>}
  </div>);
}

// ─────────────────────────────────────────────────────────────
// BUDGET PANEL — expense CRUD + goal CRUD
// ─────────────────────────────────────────────────────────────
function BudgetPanel({ expenses, setExpenses, goals, setGoals, adjustedWeeklyAvg, baseWeeklyUnallocated, logNetLost, weeklyIncome }) {
  const [ap, setAp] = useState(0);
  const [view, setView] = useState("overview");
  // Expense CRUD state
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [addingExp, setAddingExp] = useState(false);
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", note: "" });
  const [delExpId, setDelExpId] = useState(null);
  // Goal CRUD state
  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalVals, setEditGoalVals] = useState({});
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ label: "", target: "", color: "#c8a84b", note: "" });
  const [delGoalId, setDelGoalId] = useState(null);

  const ph = PHASES[ap];
  const ts = expenses.filter(e => e.category !== "Transfers").reduce((s, e) => s + e.weekly[ap], 0);
  const wr = weeklyIncome - ts;
  const sp = Math.min((ts / weeklyIncome) * 100, 100);
  const cats = [...new Set(expenses.map(e => e.category))];
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Expense helpers
  const startEditExp = (exp) => { setEditId(exp.id); setEditVals({ p1: exp.weekly[0], p2: exp.weekly[1], p3: exp.weekly[2] }); };
  const saveEditExp = (id) => { setExpenses(p => p.map(e => e.id === id ? { ...e, weekly: [parseFloat(editVals.p1) || 0, parseFloat(editVals.p2) || 0, parseFloat(editVals.p3) || 0] } : e)); setEditId(null); };
  const addExp = () => {
    const p1 = parseFloat(newExp.p1) || 0, p2 = parseFloat(newExp.p2) || 0, p3 = parseFloat(newExp.p3) || 0;
    setExpenses(p => [...p, { id: `exp_${Date.now()}`, category: newExp.category, label: newExp.label, weekly: [p1, p2, p3], note: [newExp.note, newExp.note, newExp.note] }]);
    setAddingExp(false); setNewExp({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", note: "" });
  };
  const deleteExp = (id) => { setExpenses(p => p.filter(e => e.id !== id)); setDelExpId(null); };

  // Goal helpers
  const activeGoals = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g => g.completed);
  const startEditGoal = (g) => { setEditGoalId(g.id); setEditGoalVals({ label: g.label, target: g.target, color: g.color, note: g.note }); };
  const saveEditGoal = (id) => { setGoals(p => p.map(g => g.id === id ? { ...g, ...editGoalVals, target: parseFloat(editGoalVals.target) || 0 } : g)); setEditGoalId(null); };
  const addGoal = () => {
    setGoals(p => [...p, { id: `g_${Date.now()}`, label: newGoal.label, target: parseFloat(newGoal.target) || 0, color: newGoal.color || "#c8a84b", note: newGoal.note, completed: false }]);
    setAddingGoal(false); setNewGoal({ label: "", target: "", color: "#c8a84b", note: "" });
  };
  const deleteGoal = (id) => { setGoals(p => p.filter(g => g.id !== id)); setDelGoalId(null); };
  const toggleComplete = (id) => setGoals(p => p.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  const moveGoal = (id, dir) => {
    setGoals(prev => {
      const idx = prev.findIndex(g => g.id === id);
      if (idx === -1) return prev;
      const arr = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return prev;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
  };

  return (<div>
    {/* Phase tabs */}
    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
      {PHASES.map((p, i) => <button key={p.id} onClick={() => setAp(i)} style={{ flex: 1, padding: "10px", borderRadius: "6px", cursor: "pointer", background: ap === i ? p.color : "#141414", color: ap === i ? "#0a0a0a" : "#666", border: "2px solid " + (ap === i ? p.color : "#222"), fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", fontFamily: "'Courier New',monospace" }}>{p.label}<br /><span style={{ fontSize: "9px", fontWeight: "normal" }}>{p.description}</span></button>)}
    </div>
    {/* Summary cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "16px" }}>
      <Card label="Weekly Income" val={f2(weeklyIncome)} color="#7eb8c9" />
      <Card label="Weekly Spend" val={f2(ts)} color="#e8856a" />
      <Card label="Weekly Left" val={f2(wr)} color={wr >= 0 ? "#6dbf8a" : "#e8856a"} />
    </div>
    {logNetLost > 0 && <div style={{ background: "#1a1a2d", border: "1px solid #7a8bbf44", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
      <span style={{ color: "#888" }}>Adj. weekly unallocated (after events):</span>
      <span style={{ fontWeight: "bold", color: "#c8a84b" }}>{f2(adjustedWeeklyAvg)}/wk</span>
    </div>}
    {/* Spend bar */}
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#666", marginBottom: "6px" }}><span>SPEND vs INCOME</span><span style={{ color: sp > 90 ? "#e8856a" : "#6dbf8a" }}>{sp.toFixed(1)}%</span></div>
      <div style={{ height: "8px", background: "#1e1e1e", borderRadius: "4px", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: "4px", width: `${sp}%`, background: sp > 90 ? "#e8856a" : sp > 70 ? "#c8a84b" : "#6dbf8a", transition: "width 0.3s" }} /></div>
    </div>
    {/* View tabs */}
    <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
      {["overview", "breakdown", "cashflow", "goals"].map(v => <VT key={v} label={v} active={view === v} onClick={() => setView(v)} />)}
    </div>

    {/* OVERVIEW — expense list + add/delete */}
    {view === "overview" && <div>
      {cats.map(cat => {
        const cExp = expenses.filter(e => e.category === cat);
        const cTot = cExp.reduce((s, e) => s + e.weekly[ap], 0);
        return <div key={cat} style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "3px", color: CATEGORY_COLORS[cat], textTransform: "uppercase" }}>{cat}</div>
            <div style={{ fontSize: "12px", color: CATEGORY_COLORS[cat] }}>{f2(cTot)}/wk</div>
          </div>
          {cExp.map(exp => <div key={exp.id} style={{ background: CATEGORY_BG[cat], border: "1px solid #1e1e1e", borderRadius: "6px", padding: "10px 12px", marginBottom: "6px" }}>
            {editId === exp.id ? <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", flex: 1, minWidth: "120px" }}>{exp.label}</span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                {["p1", "p2", "p3"].map((k, i) => <div key={k} style={{ textAlign: "center" }}><div style={{ fontSize: "9px", color: PHASES[i].color, marginBottom: "2px" }}>P{i + 1}/wk</div><input type="number" value={editVals[k]} onChange={e => setEditVals(v => ({ ...v, [k]: e.target.value }))} style={{ ...iS, width: "65px" }} /></div>)}
                <button onClick={() => saveEditExp(exp.id)} style={{ background: "#6dbf8a", color: "#0a0a0a", border: "none", borderRadius: "3px", padding: "6px 10px", cursor: "pointer", fontSize: "10px", fontFamily: "'Courier New',monospace" }}>SAVE</button>
                <button onClick={() => setEditId(null)} style={{ background: "#333", color: "#888", border: "none", borderRadius: "3px", padding: "6px 10px", cursor: "pointer", fontSize: "10px", fontFamily: "'Courier New',monospace" }}>✕</button>
              </div>
            </div> : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: "13px" }}>{exp.label}</div>{exp.note[ap] && <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{exp.note[ap]}</div>}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: "14px", fontWeight: "bold", color: CATEGORY_COLORS[cat] }}>{f2(exp.weekly[ap])}<span style={{ fontSize: "10px", color: "#666" }}>/wk</span></div><div style={{ fontSize: "10px", color: "#555" }}>{f(exp.weekly[ap] * 52 / 12)}/mo</div></div>
                <SmBtn onClick={() => startEditExp(exp)}>EDIT</SmBtn>
                {delExpId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                  <SmBtn onClick={() => deleteExp(exp.id)} c="#e8856a" bg="#2d1a1a">DEL</SmBtn>
                  <SmBtn onClick={() => setDelExpId(null)}>NO</SmBtn>
                </div> : <SmBtn onClick={() => setDelExpId(exp.id)} c="#e8856a">✕</SmBtn>}
              </div>
            </div>}
          </div>)}
        </div>;
      })}
      {/* Add expense form */}
      {addingExp ? <div style={{ background: "#141414", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>New Expense Line</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div><label style={lS}>Label</label><input type="text" value={newExp.label} onChange={e => setNewExp(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Insurance" /></div>
          <div><label style={lS}>Category</label><select value={newExp.category} onChange={e => setNewExp(v => ({ ...v, category: e.target.value }))} style={iS}><option>Needs</option><option>Lifestyle</option><option>Transfers</option></select></div>
          <div><label style={lS}>Phase 1 Weekly ($)</label><input type="number" value={newExp.p1} onChange={e => setNewExp(v => ({ ...v, p1: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Phase 2 Weekly ($)</label><input type="number" value={newExp.p2} onChange={e => setNewExp(v => ({ ...v, p2: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Phase 3 Weekly ($)</label><input type="number" value={newExp.p3} onChange={e => setNewExp(v => ({ ...v, p3: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Note (optional)</label><input type="text" value={newExp.note} onChange={e => setNewExp(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="Short description" /></div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={addExp} disabled={!newExp.label} style={{ background: newExp.label ? "#6dbf8a" : "#333", color: newExp.label ? "#0d0d0d" : "#666", border: "none", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: newExp.label ? "pointer" : "default", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>ADD</button>
          <button onClick={() => { setAddingExp(false); setNewExp({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", note: "" }); }} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
        </div>
      </div> : <button onClick={() => setAddingExp(true)} style={{ background: "#1a1a1a", color: "#c8a84b", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", marginBottom: "16px" }}>+ ADD EXPENSE LINE</button>}
    </div>}

    {/* BREAKDOWN */}
    {view === "breakdown" && <div>
      {cats.filter(c => c !== "Transfers").map(cat => {
        const cT = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.weekly[ap], 0);
        const pct = (cT / weeklyIncome) * 100;
        return <div key={cat} style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><span style={{ fontSize: "11px", letterSpacing: "2px", color: CATEGORY_COLORS[cat], textTransform: "uppercase" }}>{cat}</span><span>{f2(cT)}/wk · {pct.toFixed(1)}%</span></div>
          <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: CATEGORY_COLORS[cat], borderRadius: "3px" }} /></div>
        </div>;
      })}
      <div style={{ height: "1px", background: "#222", margin: "20px 0" }} />
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#888", textTransform: "uppercase", marginBottom: "12px" }}>Annual Projection ({ph.label})</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead><tr style={{ borderBottom: "1px solid #333", color: "#888", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}><th style={{ textAlign: "left", padding: "8px 4px" }}>Expense</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Weekly</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Monthly</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Annual</th></tr></thead>
        <tbody>{expenses.map(exp => <tr key={exp.id} style={{ borderBottom: "1px solid #181818" }} onMouseEnter={e => e.currentTarget.style.background = "#141414"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <td style={{ padding: "8px 4px" }}><span style={{ fontSize: "10px", color: CATEGORY_COLORS[exp.category], marginRight: "6px" }}>▸</span>{exp.label}</td>
          <td style={{ padding: "8px 4px", textAlign: "right", color: CATEGORY_COLORS[exp.category] }}>{f2(exp.weekly[ap])}</td>
          <td style={{ padding: "8px 4px", textAlign: "right", color: "#888" }}>{f(exp.weekly[ap] * 52 / 12)}</td>
          <td style={{ padding: "8px 4px", textAlign: "right", color: "#666" }}>{f(exp.weekly[ap] * 52)}</td>
        </tr>)}</tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid #333", fontWeight: "bold" }}><td style={{ padding: "10px 4px", color: "#c8a84b" }}>TRUE SPEND</td><td style={{ padding: "10px 4px", textAlign: "right", color: "#e8856a" }}>{f2(ts)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "#e8856a" }}>{f(ts * 52 / 12)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "#e8856a" }}>{f(ts * 52)}</td></tr>
          <tr style={{ fontWeight: "bold" }}><td style={{ padding: "6px 4px", color: "#6dbf8a" }}>REMAINING</td><td style={{ padding: "6px 4px", textAlign: "right", color: "#6dbf8a" }}>{f2(wr)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "#6dbf8a" }}>{f(wr * 52 / 12)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "#6dbf8a" }}>{f(wr * 52)}</td></tr>
        </tfoot>
      </table>
    </div>}

    {/* CASHFLOW */}
    {view === "cashflow" && <div>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "10px", letterSpacing: "2px", color: "#7eb8c9", textTransform: "uppercase", marginBottom: "4px" }}>Weekly Take-Home</div><div style={{ fontSize: "22px", fontWeight: "bold", color: "#7eb8c9" }}>{f2(weeklyIncome)}</div></div><div style={{ fontSize: "10px", color: "#555", textAlign: "right" }}>Live from<br />income engine</div></div>
      </div>
      {[{ label: "Checking Needs", cat: "Needs", desc: "Housing, kids, food, Jesse" }, { label: "Credit Builder", cat: "Lifestyle", desc: "Nicotine, Rumble, Walmart+, Fireflood" }, { label: "CashApp Transfer", cat: "Transfers", desc: "Direct deposit perks — not spent" }].map(row => {
        const tot = expenses.filter(e => e.category === row.cat).reduce((s, e) => s + e.weekly[ap], 0);
        return <div key={row.cat} style={{ background: CATEGORY_BG[row.cat], border: "1px solid #222", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: CATEGORY_COLORS[row.cat], marginBottom: "4px" }}>{row.label}</div><div style={{ fontSize: "10px", color: "#666" }}>{row.desc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS[row.cat] }}>{f2(tot)}</div><div style={{ fontSize: "10px", color: "#555" }}>{((tot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
        </div>;
      })}
      <div style={{ background: wr >= 0 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${wr >= 0 ? "#6dbf8a" : "#e8856a"}`, borderRadius: "6px", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: wr >= 0 ? "#6dbf8a" : "#e8856a", marginBottom: "4px" }}>Unallocated / Savings</div><div style={{ fontSize: "10px", color: "#666" }}>See Goals view for event-adjusted timeline</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: wr >= 0 ? "#6dbf8a" : "#e8856a" }}>{f2(wr)}</div><div style={{ fontSize: "10px", color: "#666" }}>{f(wr * 52 / 12)}/mo</div></div></div>
      </div>
    </div>}

    {/* GOALS — full CRUD */}
    {view === "goals" && (() => {
      let wb = 0;
      const tl = activeGoals.map(g => { const wN = g.target / adjustedWeeklyAvg; const sW = wb; wb += wN; return { ...g, wN, sW, eW: wb }; });
      const totG = goals.reduce((s, g) => !g.completed ? s + g.target : s, 0);
      const projS = adjustedWeeklyAvg * WEEKS_REMAINING;
      return <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "20px" }}>
          <Card label="Adj. Weekly Available" val={f2(adjustedWeeklyAvg)} color="#6dbf8a" />
          <Card label="Active Goals Total" val={f(totG)} color="#c8a84b" />
          <Card label="Weeks to Complete All" val={`~${Math.ceil(wb)} wks`} color={projS >= totG ? "#6dbf8a" : "#e8856a"} />
        </div>
        {adjustedWeeklyAvg < baseWeeklyUnallocated && <div style={{ background: "#2d1a1a", border: "1px solid #e8856a44", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "#888" }}>Event log reduced avg by <span style={{ color: "#e8856a", fontWeight: "bold" }}>{f2(baseWeeklyUnallocated - adjustedWeeklyAvg)}/wk</span></div>}

        {/* Active goals */}
        {tl.map((g, i) => {
          const ok = g.eW <= WEEKS_REMAINING;
          const isEditing = editGoalId === g.id;
          return <div key={g.id} style={{ background: "#141414", border: `1px solid ${g.color}33`, borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
            {isEditing ? <div>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "12px" }}>Editing Goal</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={editGoalVals.label} onChange={e => setEditGoalVals(v => ({ ...v, label: e.target.value }))} style={iS} /></div>
                <div><label style={lS}>Target ($)</label><input type="number" value={editGoalVals.target} onChange={e => setEditGoalVals(v => ({ ...v, target: e.target.value }))} style={iS} /></div>
                <div><label style={lS}>Color (hex)</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="text" value={editGoalVals.color} onChange={e => setEditGoalVals(v => ({ ...v, color: e.target.value }))} style={{ ...iS, flex: 1 }} />
                    <div style={{ width: "28px", height: "28px", borderRadius: "4px", background: editGoalVals.color, border: "1px solid #333", flexShrink: 0 }} />
                    <input type="color" value={editGoalVals.color} onChange={e => setEditGoalVals(v => ({ ...v, color: e.target.value }))} style={{ width: "28px", height: "28px", padding: 0, border: "none", background: "transparent", cursor: "pointer" }} />
                  </div>
                </div>
                <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note</label><input type="text" value={editGoalVals.note} onChange={e => setEditGoalVals(v => ({ ...v, note: e.target.value }))} style={iS} /></div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => saveEditGoal(g.id)} style={{ background: "#6dbf8a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>SAVE</button>
                <button onClick={() => setEditGoalId(null)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
              </div>
            </div> : <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10px", background: g.color + "22", color: g.color, padding: "2px 8px", borderRadius: "3px" }}>#{i + 1}</span>
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>{g.label}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#777" }}>{g.note}</div>
                </div>
                <div style={{ textAlign: "right", marginLeft: "12px" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: g.color }}>{f(g.target)}</div>
                  <div style={{ fontSize: "10px", color: ok ? "#6dbf8a" : "#e8856a" }}>{ok ? `~wk ${Math.ceil(g.eW)}` : "Stretch goal"}</div>
                </div>
              </div>
              <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden", marginBottom: "4px" }}><div style={{ position: "relative", left: `${Math.min((g.sW / WEEKS_REMAINING) * 100, 100)}%`, width: `${Math.min((g.wN / WEEKS_REMAINING) * 100, 100 - (g.sW / WEEKS_REMAINING) * 100)}%`, height: "100%", background: g.color, borderRadius: "3px", opacity: ok ? 1 : 0.4 }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#555", marginBottom: "10px" }}><span>Now</span><span>Week {WEEKS_REMAINING}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <div style={{ fontSize: "10px", color: "#666" }}><span style={{ color: g.color }}>{f2(adjustedWeeklyAvg)}/wk</span> · {f2(g.wN)} weeks to fund</div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <SmBtn onClick={() => moveGoal(g.id, -1)} c="#666">↑</SmBtn>
                  <SmBtn onClick={() => moveGoal(g.id, 1)} c="#666">↓</SmBtn>
                  <SmBtn onClick={() => startEditGoal(g)} c="#c8a84b">EDIT</SmBtn>
                  <SmBtn onClick={() => toggleComplete(g.id)} c="#6dbf8a">✓ DONE</SmBtn>
                  {delGoalId === g.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteGoal(g.id)} c="#e8856a" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelGoalId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelGoalId(g.id)} c="#e8856a">✕</SmBtn>}
                </div>
              </div>
            </div>}
          </div>;
        })}

        {/* Add goal form */}
        {addingGoal ? <div style={{ background: "#141414", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>New Goal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={newGoal.label} onChange={e => setNewGoal(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Emergency Fund" /></div>
            <div><label style={lS}>Target ($)</label><input type="number" value={newGoal.target} onChange={e => setNewGoal(v => ({ ...v, target: e.target.value }))} style={iS} /></div>
            <div><label style={lS}>Color (hex)</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="text" value={newGoal.color} onChange={e => setNewGoal(v => ({ ...v, color: e.target.value }))} style={{ ...iS, flex: 1 }} />
                <div style={{ width: "28px", height: "28px", borderRadius: "4px", background: newGoal.color, border: "1px solid #333", flexShrink: 0 }} />
                <input type="color" value={newGoal.color} onChange={e => setNewGoal(v => ({ ...v, color: e.target.value }))} style={{ width: "28px", height: "28px", padding: 0, border: "none", background: "transparent", cursor: "pointer" }} />
              </div>
            </div>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note</label><input type="text" value={newGoal.note} onChange={e => setNewGoal(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="Optional description" /></div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addGoal} disabled={!newGoal.label || !newGoal.target} style={{ background: (newGoal.label && newGoal.target) ? "#6dbf8a" : "#333", color: (newGoal.label && newGoal.target) ? "#0d0d0d" : "#666", border: "none", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: (newGoal.label && newGoal.target) ? "pointer" : "default", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>ADD GOAL</button>
            <button onClick={() => { setAddingGoal(false); setNewGoal({ label: "", target: "", color: "#c8a84b", note: "" }); }} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
          </div>
        </div> : <button onClick={() => setAddingGoal(true)} style={{ background: "#1a1a1a", color: "#c8a84b", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", marginBottom: "16px" }}>+ ADD GOAL</button>}

        {/* Completed goals */}
        {completedGoals.length > 0 && <div style={{ marginTop: "8px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#444", textTransform: "uppercase", marginBottom: "10px" }}>Completed ({completedGoals.length})</div>
          {completedGoals.map(g => <div key={g.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "12px 16px", marginBottom: "8px", opacity: 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "#444", textDecoration: "line-through" }}>{g.label}</span>
                <span style={{ fontSize: "10px", background: "#6dbf8a22", color: "#6dbf8a", padding: "2px 6px", borderRadius: "3px" }}>✓</span>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: "#444" }}>{f(g.target)}</span>
                <SmBtn onClick={() => toggleComplete(g.id)} c="#888">UNDO</SmBtn>
                {delGoalId === g.id ? <div style={{ display: "flex", gap: "4px" }}>
                  <SmBtn onClick={() => deleteGoal(g.id)} c="#e8856a" bg="#2d1a1a">DEL</SmBtn>
                  <SmBtn onClick={() => setDelGoalId(null)}>NO</SmBtn>
                </div> : <SmBtn onClick={() => setDelGoalId(g.id)} c="#e8856a">✕</SmBtn>}
              </div>
            </div>
          </div>)}
        </div>}

        {/* Year-end outlook */}
        <div style={{ background: "#1a2d1e", border: "1px solid #6dbf8a", borderRadius: "8px", padding: "16px", marginTop: "8px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#6dbf8a", textTransform: "uppercase", marginBottom: "10px" }}>Year-End Outlook</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
            <div style={{ color: "#888" }}>Weeks remaining</div><div style={{ textAlign: "right" }}>{WEEKS_REMAINING}</div>
            <div style={{ color: "#888" }}>Adj. projected savings</div><div style={{ textAlign: "right", color: "#6dbf8a" }}>{f(projS)}</div>
            <div style={{ color: "#888" }}>Active goals total</div><div style={{ textAlign: "right", color: "#c8a84b" }}>{f(totG)}</div>
            <div style={{ color: "#888" }}>Surplus after all goals</div><div style={{ textAlign: "right", color: projS - totG >= 0 ? "#6dbf8a" : "#e8856a" }}>{f(projS - totG)}</div>
          </div>
        </div>
      </div>;
    })()}
  </div>);
}

// ─────────────────────────────────────────────────────────────
// BENEFITS PANEL
// ─────────────────────────────────────────────────────────────
function BenefitsPanel({ allWeeks, config, logK401kLost, logK401kMatchLost, logPTOHoursLost }) {
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const bE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
  const bM = allWeeks.reduce((s, w) => s + w.k401kEmployer, 0);
  const aE = Math.max(bE - logK401kLost, 0), aM = Math.max(bM - logK401kMatchLost, 0);
  const ptoBs = allWeeks.filter(w => w.active && w.weekEnd <= new Date(2026, 8, 14)).reduce((s, w) => s + w.totalHours, 0) / 20;
  const adjP = Math.max(ptoBs - logPTOHoursLost / 20, 0);
  const avail = adjP + 40;
  return (<div>
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "12px" }}>401k Projections</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
        <Card label="Base Your Contributions" val={f(bE)} color="#7a8bbf" size="18px" />
        <Card label="Base Employer Match" val={f(bM)} color="#6dbf8a" size="18px" />
        <Card label="Base Total Balance" val={f(bE + bM)} color="#c8a84b" size="18px" />
      </div>
      {(logK401kLost > 0 || logK401kMatchLost > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
        <Card label="Adj. Your Contributions" val={f(aE)} sub={`-${f(logK401kLost)} from events`} color="#7a8bbf" size="18px" />
        <Card label="Adj. Employer Match" val={f(aM)} sub={`-${f(logK401kMatchLost)} from events`} color="#6dbf8a" size="18px" />
        <Card label="Adj. Total Balance" val={f(aE + aM)} color="#c8a84b" size="18px" />
      </div>}
      <div style={{ padding: "12px 14px", background: "#3a3210", border: "1px solid #c8a84b44", borderRadius: "6px", fontSize: "11px", color: "#aaa", lineHeight: "1.8" }}>FHA: save <span style={{ color: "#c8a84b" }}>$3,000 cash</span> + borrow <span style={{ color: "#7a8bbf" }}>{f(aE)} from 401k</span> = <span style={{ color: "#6dbf8a" }}>~{f(aE + 3000)}+ toward FHA</span></div>
    </div>
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "12px" }}>PTO Accrual</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
        <Card label="Accrual Rate" val="1 hr / 20 worked" color="#7eb8c9" size="14px" />
        <Card label="Base Accrued by Sep 15" val={`~${ptoBs.toFixed(1)} hrs`} color="#e8e0d0" size="18px" />
        {logPTOHoursLost > 0 ? <Card label="Adj. Accrued by Sep 15" val={`~${adjP.toFixed(1)} hrs`} sub={`-${(logPTOHoursLost / 20).toFixed(1)} hrs from events`} color="#c8a84b" size="18px" /> : <Card label="Negative Balance Cap" val="40 hrs (after 90d)" color="#888" size="14px" />}
      </div>
      <div style={{ background: avail >= 134 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${avail >= 134 ? "#6dbf8a" : "#e8856a"}`, borderRadius: "6px", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div><div style={{ fontSize: "11px", color: avail >= 134 ? "#6dbf8a" : "#e8856a", fontWeight: "bold", marginBottom: "4px" }}>Paternity Leave Plan</div><div style={{ fontSize: "11px", color: "#888" }}>Need ~134 hrs · {adjP.toFixed(1)} accrued + 40 neg = <strong style={{ color: "#e8e0d0" }}>{avail.toFixed(1)} available</strong></div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: "14px", fontWeight: "bold", color: avail >= 134 ? "#6dbf8a" : "#e8856a" }}>{avail >= 134 ? "On Track" : "Shortfall"}</div>{avail < 134 && <div style={{ fontSize: "10px", color: "#e8856a" }}>Short {(134 - avail).toFixed(1)} hrs</div>}</div>
        </div>
      </div>
    </div>
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "12px" }}>Attendance Bonus</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
        <Card label="Per Month" val="$200" color="#c8a84b" />
        <Card label="Possible Payouts" val="7" color="#e8e0d0" />
        <Card label="Max Bonus Jun–Dec" val="$1,400" color="#6dbf8a" />
      </div>
      <div style={{ padding: "12px 14px", background: "#1a2d1e", border: "1px solid #6dbf8a44", borderRadius: "6px", fontSize: "11px", color: "#888", lineHeight: "1.8" }}>Eligible from Month 5 (May). First payout June. Not in projections. <span style={{ color: "#6dbf8a" }}>Each $200 = accelerated goal funding.</span></div>
    </div>
  </div>);
}

// ─────────────────────────────────────────────────────────────
// LOG PANEL
// ─────────────────────────────────────────────────────────────
function LogPanel({ logs, setLogs, config, projectedAnnualNet, baseWeeklyUnallocated }) {
  const [adding, setAdding] = useState(false);
  const blank = { weekEnd: "", weekIdx: "", weekRotation: "Week 2", type: "missed_unpaid", shiftsLost: 1, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0, workedDays: "", missedDays: "", note: "" };
  const [nEv, setNEv] = useState(blank);
  const [cdel, setCdel] = useState(null);
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const tot = logs.reduce((a, e) => { const i = calcEventImpact(e, config); a.gL += i.grossLost; a.gG += i.grossGained; a.nL += i.netLost; a.nG += i.netGained; a.k4 += i.k401kLost; a.pto += i.hoursLostForPTO; return a; }, { gL: 0, gG: 0, nL: 0, nG: 0, k4: 0, pto: 0 });
  const adjTH = projectedAnnualNet - tot.nL + tot.nG;
  const adjWA = baseWeeklyUnallocated - (tot.nL / WEEKS_REMAINING) + (tot.nG / WEEKS_REMAINING);
  const projS = adjWA * WEEKS_REMAINING;
  const totGoals = INITIAL_GOALS.reduce((s, g) => s + g.target, 0);
  const ok = projS >= totGoals;
  const addLog = () => { setLogs(p => [...p, { ...nEv, id: Date.now(), weekIdx: parseInt(nEv.weekIdx) || 0, shiftsLost: parseInt(nEv.shiftsLost) || 0, weekendShifts: parseInt(nEv.weekendShifts) || 0, ptoHours: parseFloat(nEv.ptoHours) || 0, hoursLost: parseFloat(nEv.hoursLost) || 0, amount: parseFloat(nEv.amount) || 0 }]); setAdding(false); setNEv(blank); };

  return (<div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "14px" }}>
      <Card label="Total Gross Lost" val={f(tot.gL)} color="#e8856a" />
      <Card label="Total Net Lost" val={f(tot.nL)} color="#e8856a" />
      <Card label="Adjusted Take-Home" val={f0(adjTH)} color="#6dbf8a" />
      <Card label="Adj. Weekly Unalloc." val={f(adjWA)} color={adjWA > 0 ? "#6dbf8a" : "#e8856a"} />
    </div>
    {tot.k4 > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
      <Card label="401k Contributions Lost" val={f(tot.k4)} sub="Events after May 15 only" color="#7a8bbf" />
      <Card label="PTO Hours Not Accrued" val={`${(tot.pto / 20).toFixed(1)} hrs`} sub={`${tot.pto}h unworked ÷ 20`} color="#888" />
    </div>}
    <div style={{ background: ok ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${ok ? "#6dbf8a" : "#e8856a"}`, borderRadius: "6px", padding: "14px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div><div style={{ fontSize: "10px", letterSpacing: "2px", color: ok ? "#6dbf8a" : "#e8856a", textTransform: "uppercase", marginBottom: "4px" }}>Goals Impact</div><div style={{ fontSize: "12px", color: "#aaa" }}>Adj. savings: <span style={{ color: "#c8a84b", fontWeight: "bold" }}>{f0(projS)}</span> · Goals: <span style={{ color: "#c8a84b" }}>{f0(totGoals)}</span></div></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: "14px", fontWeight: "bold", color: ok ? "#6dbf8a" : "#e8856a" }}>{ok ? "All goals on track" : "Goals at risk"}</div><div style={{ fontSize: "11px", color: "#666" }}>~{Math.ceil(totGoals / adjWA)} weeks to complete all</div></div>
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#888", textTransform: "uppercase" }}>Event Log ({logs.length})</div>
      <button onClick={() => setAdding(true)} style={{ background: "#c8a84b", color: "#0d0d0d", border: "none", borderRadius: "4px", padding: "6px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>+ LOG EVENT</button>
    </div>
    {adding && <div style={{ background: "#141414", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>New Event</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div><label style={lS}>Pay Week Ending</label><input type="date" value={nEv.weekEnd} onChange={e => setNEv(v => ({ ...v, weekEnd: e.target.value }))} style={iS} /></div>
        <div><label style={lS}>Week Rotation</label><select value={nEv.weekRotation} onChange={e => setNEv(v => ({ ...v, weekRotation: e.target.value }))} style={iS}><option>Week 2</option><option>Week 1</option></select></div>
        <div><label style={lS}>Event Type</label><select value={nEv.type} onChange={e => setNEv(v => ({ ...v, type: e.target.value }))} style={iS}>{Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        {nEv.type === "missed_unpaid" && <>
          <div><label style={lS}>Shifts Lost</label><input type="number" min="1" max="6" value={nEv.shiftsLost} onChange={e => setNEv(v => ({ ...v, shiftsLost: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Weekend Shifts Lost</label><input type="number" min="0" max="2" value={nEv.weekendShifts} onChange={e => setNEv(v => ({ ...v, weekendShifts: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Days Missed</label><input type="text" placeholder="e.g. Tue, Wed, Thu" value={nEv.missedDays} onChange={e => setNEv(v => ({ ...v, missedDays: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Days Worked</label><input type="text" placeholder="e.g. Fri, Sat, Sun" value={nEv.workedDays} onChange={e => setNEv(v => ({ ...v, workedDays: e.target.value }))} style={iS} /></div>
        </>}
        {nEv.type === "pto" && <div><label style={lS}>PTO Hours (${PTO_RATE}/hr flat)</label><input type="number" min="0" value={nEv.ptoHours} onChange={e => setNEv(v => ({ ...v, ptoHours: e.target.value }))} style={iS} /></div>}
        {nEv.type === "partial" && <div><label style={lS}>Hours Lost</label><input type="number" min="0" value={nEv.hoursLost} onChange={e => setNEv(v => ({ ...v, hoursLost: e.target.value }))} style={iS} /></div>}
        {(nEv.type === "bonus" || nEv.type === "other_loss") && <div><label style={lS}>Amount ($)</label><input type="number" min="0" value={nEv.amount} onChange={e => setNEv(v => ({ ...v, amount: e.target.value }))} style={iS} /></div>}
        <div style={{ gridColumn: "1 / -1" }}><label style={lS}>Note</label><input type="text" placeholder="Optional" value={nEv.note} onChange={e => setNEv(v => ({ ...v, note: e.target.value }))} style={iS} /></div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={addLog} style={{ background: "#6dbf8a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>SAVE</button>
        <button onClick={() => setAdding(false)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
      </div>
    </div>}
    {logs.length === 0 && <div style={{ textAlign: "center", padding: "40px", color: "#444", fontSize: "13px" }}>No events logged yet.</div>}
    {logs.map(entry => {
      const imp = calcEventImpact(entry, config);
      const ev = EVENT_TYPES[entry.type];
      const isB = entry.type === "bonus";
      const ak = entry.weekEnd && new Date(entry.weekEnd) >= new Date(config.k401StartDate);
      return <div key={entry.id} style={{ background: "#141414", border: `1px solid ${ev.color}33`, borderRadius: "8px", padding: "16px", marginBottom: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", background: ev.color + "22", color: ev.color, padding: "2px 8px", borderRadius: "3px" }}>{ev.icon} {ev.label}</span>
              <span style={{ fontSize: "11px", color: "#777" }}>{entry.weekRotation}</span>
              {ak && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "3px" }}>401k</span>}
            </div>
            <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "2px" }}>Week ending {entry.weekEnd || "—"}</div>
            {entry.missedDays && <div style={{ fontSize: "11px", color: "#777" }}>Missed: {entry.missedDays} · Worked: {entry.workedDays}</div>}
            {entry.note && <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>{entry.note}</div>}
          </div>
          <div style={{ textAlign: "right", marginLeft: "16px" }}>
            <div style={{ fontSize: "18px", fontWeight: "bold", color: isB ? "#6dbf8a" : "#e8856a" }}>{isB ? "+" : "-"}{f(isB ? imp.grossGained : imp.grossLost)}</div>
            <div style={{ fontSize: "10px", color: "#666" }}>gross · proj {f(imp.baseGross)}</div>
            <div style={{ fontSize: "13px", color: isB ? "#6dbf8a" : "#e8856a", marginTop: "2px" }}>{isB ? "+" : "-"}{f(isB ? imp.netGained : imp.netLost)} net</div>
            {ak && imp.k401kLost > 0 && <div style={{ fontSize: "10px", color: "#7a8bbf", marginTop: "2px" }}>-{f(imp.k401kLost)} 401k</div>}
            {imp.hoursLostForPTO > 0 && <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>-{(imp.hoursLostForPTO / 20).toFixed(2)} PTO accrual</div>}
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "10px", color: "#666" }}>
            {entry.type === "missed_unpaid" && `${entry.shiftsLost} shift(s) · ${entry.weekendShifts} wknd · ${entry.shiftsLost * 12}h`}
            {entry.type === "pto" && `${entry.ptoHours}h PTO @ $${PTO_RATE}`}
            {entry.type === "partial" && `${entry.hoursLost}h partial`}
            {entry.type === "bonus" && `+${f(entry.amount)} bonus`}
            {entry.type === "other_loss" && `-${f(entry.amount)} other`}
          </div>
          {cdel === entry.id ? <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => { setLogs(p => p.filter(e => e.id !== entry.id)); setCdel(null); }} style={{ background: "#e8856a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CONFIRM</button>
            <button onClick={() => setCdel(null)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
          </div> : <button onClick={() => setCdel(entry.id)} style={{ background: "transparent", border: "1px solid #333", color: "#666", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>DELETE</button>}
        </div>
      </div>;
    })}
    <div style={{ marginTop: "24px", padding: "12px", background: "#141414", borderRadius: "6px", fontSize: "10px", color: "#555", lineHeight: "2" }}>
      Missed shift loss = projected gross − actual gross (full OT collapse). FICA {(config.ficaRate * 100).toFixed(2)}% always applied. 401k impact only on events after {config.k401StartDate}. PTO accrual lost = unworked hrs ÷ 20. Weekly income baseline pulled live from income engine.
    </div>
  </div>);
}

// ─────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showExtra, setShowExtra] = useState(true);
  const [topNav, setTopNav] = useState("income");
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const [goals, setGoals] = useState(INITIAL_GOALS);

  // ── Build year reactively from config ──
  const allWeeks = useMemo(() => buildYear(config), [config]);

  // ── Tax derived values ──
  const taxDerived = useMemo(() => {
    const tt = allWeeks.filter(w => w.active).reduce((s, w) => s + w.taxableGross, 0);
    const fAGI = Math.max(tt - config.fedStdDeduction, 0);
    const fL = fedTax(fAGI), mL = tt * config.moFlatRate;
    const ficaT = allWeeks.filter(w => w.active).reduce((s, w) => s + w.grossPay * config.ficaRate, 0);
    const fWB = allWeeks.filter(w => w.active && w.taxedBySchedule).reduce((s, w) => s + w.taxableGross * (w.rotation === "Week 2" ? config.w2FedRate : config.w1FedRate), 0);
    const mWB = allWeeks.filter(w => w.active && w.taxedBySchedule).reduce((s, w) => s + w.taxableGross * (w.rotation === "Week 2" ? config.w2StateRate : config.w1StateRate), 0);
    const fG = fL - fWB, mG = mL - mWB, tG = fG + mG, tET = Math.max(tG - config.targetOwedAtFiling, 0);
    const twC = allWeeks.filter(w => w.active && w.taxedBySchedule).length;
    return { fedAGI: fAGI, fedLiability: fL, moLiability: mL, ficaTotal: ficaT, fedWithheldBase: fWB, moWithheldBase: mWB, fedGap: fG, moGap: mG, totalGap: tG, targetExtraTotal: tET, taxedWeekCount: twC, extraPerCheck: twC > 0 ? tET / twC : 0 };
  }, [allWeeks, config]);

  // ── Live projected net from income engine ──
  const projectedAnnualNet = useMemo(() =>
    allWeeks.filter(w => w.active).reduce((s, w) => s + computeNet(w, config, taxDerived.extraPerCheck, showExtra), 0)
    , [allWeeks, config, taxDerived, showExtra]);

  const weeklyIncome = projectedAnnualNet / 52;

  // ── Weighted average phase spend from current expenses ──
  const baseWeeklyUnallocated = useMemo(() => {
    const spend = i => expenses.filter(e => e.category !== "Transfers").reduce((s, e) => s + e.weekly[i], 0);
    const wAvgSpend = (spend(0) * PHASE_WEIGHTS[0] + spend(1) * PHASE_WEIGHTS[1] + spend(2) * PHASE_WEIGHTS[2]) / WEEKS_REMAINING;
    return weeklyIncome - wAvgSpend;
  }, [expenses, weeklyIncome]);

  // ── Event log cascade ──
  const logTotals = useMemo(() => {
    let nL = 0, nG = 0, k4L = 0, k4ML = 0, ptoL = 0;
    logs.forEach(e => { const i = calcEventImpact(e, config); nL += i.netLost; nG += i.netGained; k4L += i.k401kLost; k4ML += i.k401kMatchLost; ptoL += i.hoursLostForPTO; });
    return {
      netLost: nL, netGained: nG, k401kLost: k4L, k401kMatchLost: k4ML, ptoHoursLost: ptoL,
      adjustedTakeHome: projectedAnnualNet - nL + nG,
      adjustedWeeklyAvg: baseWeeklyUnallocated - (nL / WEEKS_REMAINING) + (nG / WEEKS_REMAINING)
    };
  }, [logs, config, projectedAnnualNet, baseWeeklyUnallocated]);

  return (
    <div style={{ fontFamily: "'Courier New',monospace", background: "#0d0d0d", minHeight: "100vh", color: "#e8e0d0" }}>
      <div style={{ borderBottom: "2px solid #c8a84b", padding: "14px 20px", background: "#0d0d0d", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "2px" }}>DHL / P&G — Jackson MO</div>
            <div style={{ fontSize: "19px", fontWeight: "bold" }}>2026 Financial Dashboard</div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <NT label="Income" active={topNav === "income"} onClick={() => setTopNav("income")} />
            <NT label="Budget" active={topNav === "budget"} onClick={() => setTopNav("budget")} />
            <NT label="Benefits" active={topNav === "benefits"} onClick={() => setTopNav("benefits")} />
            <NT label="Log" active={topNav === "log"} onClick={() => setTopNav("log")} />
          </div>
        </div>
      </div>
      <div style={{ padding: "22px 20px" }}>
        {topNav === "income" && <IncomePanel
          allWeeks={allWeeks} config={config} setConfig={setConfig}
          showExtra={showExtra} setShowExtra={setShowExtra}
          taxDerived={taxDerived}
          logNetLost={logTotals.netLost}
          adjustedTakeHome={logTotals.adjustedTakeHome}
          projectedAnnualNet={projectedAnnualNet}
        />}
        {topNav === "budget" && <BudgetPanel
          expenses={expenses} setExpenses={setExpenses}
          goals={goals} setGoals={setGoals}
          adjustedWeeklyAvg={logTotals.adjustedWeeklyAvg}
          baseWeeklyUnallocated={baseWeeklyUnallocated}
          logNetLost={logTotals.netLost}
          weeklyIncome={weeklyIncome}
        />}
        {topNav === "benefits" && <BenefitsPanel
          allWeeks={allWeeks} config={config}
          logK401kLost={logTotals.k401kLost}
          logK401kMatchLost={logTotals.k401kMatchLost}
          logPTOHoursLost={logTotals.ptoHoursLost}
        />}
        {topNav === "log" && <LogPanel
          logs={logs} setLogs={setLogs} config={config}
          projectedAnnualNet={projectedAnnualNet}
          baseWeeklyUnallocated={baseWeeklyUnallocated}
        />}
      </div>
    </div>
  );
}