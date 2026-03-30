import { useState } from "react";
import { Card, iS, lS, SmBtn } from "./ui.jsx";
import { dhlEmployerMatchRate } from "../lib/finance.js";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtMonth = yyyyMM => {
  if (!yyyyMM || !yyyyMM.includes("-")) return "—";
  const [y, m] = yyyyMM.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return "—";
  return `${MONTH_SHORT[m - 1]} ${y}`;
};
const fmtDate  = iso => {
  if (!iso || !iso.includes("-")) return "—";
  const [, m, d] = iso.split("-").map(Number);
  if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return "—";
  return `${MONTH_SHORT[m - 1]} ${d}`;
};

const SH = ({ children }) => (
  <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>
    {children}
  </div>
);

const EMPTY_FORM = { label: "", hoursNeeded: "", targetDate: "", negativeBalanceCap: "40" };

export function BenefitsPanel({ allWeeks, config, isDHL, logK401kLost, logK401kMatchLost,
  logK401kGained, logK401kMatchGained, logPTOHoursLost, currentWeek, bucketModel,
  ptoGoal, setPtoGoal }) {

  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // ── 401k computations ──────────────────────────────────────────────────────
  const bE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
  const k401Start = config.k401StartDate ? new Date(config.k401StartDate) : null;
  const hasValid401Start = Boolean(k401Start && !Number.isNaN(k401Start.getTime()));
  const k401Active = hasValid401Start && currentWeek ? currentWeek.weekEnd >= k401Start : false;
  const weeksUntil401k = hasValid401Start && !k401Active && currentWeek
    ? allWeeks.filter(w => w.active && w.weekEnd >= currentWeek.weekEnd && w.weekEnd < k401Start).length
    : null;
  const bM = allWeeks.reduce((s, w) => s + w.k401kEmployer, 0);
  const aE = Math.max(bE - logK401kLost + (logK401kGained ?? 0), 0);
  const aM = Math.max(bM - logK401kMatchLost + (logK401kMatchGained ?? 0), 0);

  // ── PTO Goal computations (DHL only) ───────────────────────────────────────
  // Accrual rate: 1 hour per 20 hours worked.
  // Cutoff date: ptoGoal.targetDate (when leave starts — app projects accrual up to that date).
  // Available = accrued hours (adj for lost PTO) + negative balance cap.
  const ptoCutoffRaw = ptoGoal?.targetDate ? new Date(ptoGoal.targetDate) : null;
  const ptoCutoff = ptoCutoffRaw && !Number.isNaN(ptoCutoffRaw.getTime()) ? ptoCutoffRaw : null;
  const ptoBs     = ptoCutoff
    ? allWeeks.filter(w => w.active && w.weekEnd <= ptoCutoff).reduce((s, w) => s + w.totalHours, 0) / 20
    : 0;
  const adjP      = Math.max(ptoBs - logPTOHoursLost / 20, 0);
  const negCap    = ptoGoal?.negativeBalanceCap ?? 40;
  const avail     = adjP + negCap;
  const hoursNeed = ptoGoal?.hoursNeeded ?? 0;
  const onTrack   = avail >= hoursNeed;

  // ── PTO Goal form state ────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [formVals, setFormVals] = useState(EMPTY_FORM);
  const [editMode, setEditMode] = useState(false);

  const shiftHours = config.shiftHours ?? 12;

  function openAdd() {
    setFormVals(EMPTY_FORM);
    setEditMode(false);
    setFormOpen(true);
  }
  function openEdit() {
    if (!ptoGoal) return;
    setFormVals({
      label:              ptoGoal.label,
      hoursNeeded:        String(ptoGoal.hoursNeeded),
      targetDate:         ptoGoal.targetDate,
      negativeBalanceCap: String(ptoGoal.negativeBalanceCap),
    });
    setEditMode(true);
    setFormOpen(true);
  }
  function saveForm() {
    const hrs = parseFloat(formVals.hoursNeeded) || 0;
    const cap = parseFloat(formVals.negativeBalanceCap) || 40;
    if (!formVals.label.trim() || !hrs || !formVals.targetDate) return;
    setPtoGoal({
      label:              formVals.label.trim(),
      hoursNeeded:        hrs,
      targetDate:         formVals.targetDate,
      negativeBalanceCap: cap,
    });
    setFormOpen(false);
  }

  return (<div>

    {/* ── 401k status banner ── */}
    {currentWeek && <div style={{ background: k401Active ? "#1a3a20" : "#1e1e2a", border: `1px solid ${k401Active ? "rgba(76,175,125,0.27)" : "#7a8bbf44"}`, borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>401k Status</div>
      {!hasValid401Start
        ? <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Enrollment start date not set yet</div>
        : k401Active
        ? <div style={{ fontSize: "11px", color: "var(--color-green)", fontWeight: "bold" }}>Active — contributions running since {config.k401StartDate}</div>
        : <div style={{ fontSize: "11px", color: "#7a8bbf" }}><strong style={{ color: "var(--color-text-primary)" }}>{weeksUntil401k} week{weeksUntil401k !== 1 ? "s" : ""}</strong> until enrollment ({config.k401StartDate})</div>}
    </div>}

    {/* ── 401k projections ── */}
    <div style={{ marginBottom: "24px" }}>
      <SH>401k Projections</SH>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card label="Base Your Contributions" val={f(bE)} color="#7a8bbf" size="18px" />
        <Card label="Base Employer Match" val={f(bM)} color="var(--color-green)" size="18px" />
        <Card label="Base Total Balance" val={f(bE + bM)} color="var(--color-gold)" size="18px" />
      </div>
      {(logK401kLost > 0 || logK401kMatchLost > 0 || logK401kGained > 0 || logK401kMatchGained > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card label="Adj. Your Contributions" val={f(aE)} sub={[logK401kLost > 0 && `-${f(logK401kLost)} lost`, logK401kGained > 0 && `+${f(logK401kGained)} bonus`].filter(Boolean).join(" · ")} color="#7a8bbf" size="18px" />
        <Card label="Adj. Employer Match" val={f(aM)} sub={[logK401kMatchLost > 0 && `-${f(logK401kMatchLost)} lost`, logK401kMatchGained > 0 && `+${f(logK401kMatchGained)} bonus`].filter(Boolean).join(" · ")} color="var(--color-green)" size="18px" />
        <Card label="Adj. Total Balance" val={f(aE + aM)} color="var(--color-gold)" size="18px" />
      </div>}

      {/* Monthly breakdown table */}
      {(() => {
        const matchRate = config.employerPreset === "DHL" ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
        let r401 = 0;
        const mo401 = allWeeks
          .reduce((acc, w) => {
            if (!w.active) return acc;
            const mi = w.weekEnd.getMonth();
            if (!acc[mi]) acc[mi] = { name: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][mi], gross: 0, k4E: 0, k4M: 0 };
            acc[mi].gross += w.grossPay;
            acc[mi].k4E  += w.k401kEmployee;
            acc[mi].k4M  += w.k401kEmployer;
            return acc;
          }, {});
        const rows = Object.values(mo401).filter(m => m.k4E > 0).map(m => { r401 += m.k4E + m.k4M; return { ...m, running: r401 }; });
        if (!rows.length) return null;
        return (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "360px" }}>
              <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
                <th style={{ textAlign: "left", padding: "8px 4px" }}>Month</th>
                <th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th>
                <th style={{ textAlign: "right", padding: "8px 4px" }}>Your {(config.k401Rate * 100).toFixed(0)}%</th>
                <th style={{ textAlign: "right", padding: "8px 4px" }}>Match {(matchRate * 100).toFixed(1)}%</th>
                <th style={{ textAlign: "right", padding: "8px 4px" }}>Mo Total</th>
                <th style={{ textAlign: "right", padding: "8px 4px" }}>Running</th>
              </tr></thead>
              <tbody>{rows.map(m => (
                <tr key={m.name} style={{ borderBottom: "1px solid #161616" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "7px 4px", fontWeight: "bold", color: "var(--color-gold)" }}>{m.name}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right" }}>{f(m.gross)}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", color: "#7a8bbf" }}>{f2(m.k4E)}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", color: "var(--color-green)" }}>{f2(m.k4M)}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right" }}>{f2(m.k4E + m.k4M)}</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", color: "var(--color-gold)", fontWeight: "bold" }}>{f2(m.running)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{ borderTop: "2px solid #c8a84b", fontWeight: "bold", color: "var(--color-gold)" }}>
                <td colSpan={2} style={{ padding: "10px 4px" }}>Year-End Total</td>
                <td style={{ padding: "10px 4px", textAlign: "right", color: "#7a8bbf" }}>{f(bE)}</td>
                <td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(bM)}</td>
                <td style={{ padding: "10px 4px", textAlign: "right" }}>{f(bE + bM)}</td>
                <td style={{ padding: "10px 4px", textAlign: "right" }}>{f(bE + bM)}</td>
              </tr></tfoot>
            </table>
          </div>
        );
      })()}
    </div>

    {/* ── PTO Accrual + Leave Goal — DHL users only ── */}
    {isDHL && (
      <div style={{ marginBottom: "24px" }}>
        <SH>PTO Accrual</SH>

        {/* Accrual metric cards — cutoff driven by goal targetDate if set */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
          <Card label="Accrual Rate" val="1 hr / 20 worked" color="#7eb8c9" size="14px" />
          {ptoGoal ? (
            <>
              <Card
                label={`Base Accrued by ${fmtDate(ptoGoal.targetDate)}`}
                val={`~${ptoBs.toFixed(1)} hrs`}
                color="var(--color-text-primary)"
                size="18px"
              />
              {logPTOHoursLost > 0
                ? <Card label={`Adj. Accrued by ${fmtDate(ptoGoal.targetDate)}`} val={`~${adjP.toFixed(1)} hrs`} sub={`-${(logPTOHoursLost / 20).toFixed(1)} hrs from events`} color="var(--color-gold)" size="18px" />
                : <Card label="Negative Balance Cap" val={`${negCap} hrs (after 90d)`} color="#888" size="14px" />
              }
            </>
          ) : (
            <>
              <Card label="Accrued by Leave Date" val="— set a goal" color="var(--color-text-disabled)" size="14px" />
              <Card label="Negative Balance Cap" val="40 hrs (after 90d)" color="#888" size="14px" />
            </>
          )}
        </div>

        {/* ── PTO Leave Goal tracker / form ── */}
        {!formOpen && ptoGoal && (
          <div style={{ background: onTrack ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${onTrack ? "var(--color-green)" : "var(--color-red)"}`, borderRadius: "6px", padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <div style={{ fontSize: "11px", color: onTrack ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold", marginBottom: "4px" }}>
                  {ptoGoal.label}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                  Need {hoursNeed} hrs · {adjP.toFixed(1)} accrued + {negCap} neg cap = <strong style={{ color: "var(--color-text-primary)" }}>{avail.toFixed(1)} available</strong>
                </div>
                <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", marginTop: "3px" }}>
                  Leave starts {fmtDate(ptoGoal.targetDate)} · ≈ {Math.ceil(hoursNeed / shiftHours)} shifts
                </div>
              </div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: "bold", color: onTrack ? "var(--color-green)" : "var(--color-red)" }}>
                  {onTrack ? "On Track" : "Shortfall"}
                </div>
                {!onTrack && <div style={{ fontSize: "10px", color: "var(--color-red)" }}>Short {(hoursNeed - avail).toFixed(1)} hrs</div>}
                <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                  <SmBtn onClick={openEdit} c="var(--color-text-secondary)" bg="var(--color-bg-raised)">Edit</SmBtn>
                  <SmBtn onClick={() => setPtoGoal(null)} c="var(--color-red)" bg="var(--color-bg-raised)">Clear</SmBtn>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* No goal set — prompt */}
        {!formOpen && !ptoGoal && (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              No PTO leave goal set. Add one to track your accrual progress toward a leave target.
            </div>
            <SmBtn onClick={openAdd} c="var(--color-gold)" bg="var(--color-bg-raised)">Set Goal</SmBtn>
          </div>
        )}

        {/* Inline add / edit form */}
        {formOpen && (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>
              {editMode ? "Edit Leave Goal" : "New Leave Goal"}
            </div>

            <div>
              <label style={lS}>Goal Label</label>
              <input
                {...iS} style={{ ...iS }}
                type="text"
                value={formVals.label}
                onChange={e => setFormVals(v => ({ ...v, label: e.target.value }))}
                placeholder="e.g. Paternity Leave"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={lS}>Hours Needed</label>
                <input
                  {...iS} style={{ ...iS }}
                  type="number" min="0" step="1"
                  value={formVals.hoursNeeded}
                  onChange={e => setFormVals(v => ({ ...v, hoursNeeded: e.target.value }))}
                  placeholder="e.g. 134"
                />
                {formVals.hoursNeeded && (
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                    ≈ {Math.ceil(parseFloat(formVals.hoursNeeded) / shiftHours)} shifts at {shiftHours}h
                  </div>
                )}
              </div>
              <div>
                <label style={lS}>Negative Balance Cap (hrs)</label>
                <input
                  {...iS} style={{ ...iS }}
                  type="number" min="0" step="1"
                  value={formVals.negativeBalanceCap}
                  onChange={e => setFormVals(v => ({ ...v, negativeBalanceCap: e.target.value }))}
                  placeholder="40"
                />
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                  Hours DHL allows you to borrow
                </div>
              </div>
            </div>

            <div>
              <label style={lS}>Leave Start Date</label>
              <input
                {...iS} style={{ ...iS }}
                type="date"
                value={formVals.targetDate}
                onChange={e => setFormVals(v => ({ ...v, targetDate: e.target.value }))}
              />
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                App projects your PTO accrual up to this date.
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setFormOpen(false)}
                style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={saveForm}
                disabled={!formVals.label.trim() || !formVals.hoursNeeded || !formVals.targetDate}
                style={{ background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", fontWeight: "bold", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", opacity: (!formVals.label.trim() || !formVals.hoursNeeded || !formVals.targetDate) ? 0.4 : 1 }}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    )}

    {/* ── Attendance Bucket (DHL only — bucketModel only provided for DHL users) ── */}
    {bucketModel && (() => {
      const bm = bucketModel;
      const cap = config.bucketCap ?? 128;
      const bandColor = bm.status === "safe" ? "var(--color-green)" : bm.status === "caution" ? "var(--color-gold)" : "var(--color-red)";
      const bandBg    = bm.status === "safe" ? "#1a2d1e"  : bm.status === "caution" ? "#2d2710"  : "#2d1a1a";
      const pct = Math.min((bm.currentBalance / cap) * 100, 100);
      return (
        <div style={{ marginBottom: "24px" }}>
          <SH>Attendance Bucket</SH>

          {/* Balance bar */}
          <div style={{ background: "var(--color-bg-surface)", border: `1px solid ${bandColor}33`, borderRadius: "8px", padding: "16px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Bucket Balance</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: bandColor }}>{bm.currentBalance}h <span style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>/ {cap}h</span></span>
                <span style={{ fontSize: "9px", background: bandColor + "22", color: bandColor, padding: "2px 8px", borderRadius: "12px", letterSpacing: "2px" }}>● {bm.status.toUpperCase()}</span>
              </div>
            </div>
            <div style={{ height: "8px", background: "#1e1e1e", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: bandColor, borderRadius: "4px", transition: "width 0.3s" }} />
            </div>
          </div>

          {/* Current month strip */}
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "10px 14px", marginBottom: "10px", fontSize: "11px" }}>
            <span style={{ color: "var(--color-text-secondary)", marginRight: "8px" }}>{fmtMonth(currentMonthStr)} — Tier {bm.currentTier}</span>
            {bm.currentTier === 1 && <span style={{ color: "var(--color-green)" }}>perfect so far · any unapproved absence changes tier</span>}
            {bm.currentTier === 2 && <span style={{ color: "var(--color-gold)" }}>{bm.currentM}h unapproved · {bm.hoursToNextTier}h to next tier drop</span>}
            {bm.currentTier === 3 && <span style={{ color: "var(--color-red)" }}>{bm.currentM}h unapproved · {bm.hoursToNextTier}h to worst tier</span>}
            {bm.currentTier === 4 && <span style={{ color: "var(--color-red)" }}>worst tier · {bm.currentM}h unapproved this month</span>}
          </div>

          {/* Month table */}
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid #1e1e1e", borderRadius: "8px", overflow: "hidden", marginBottom: "10px" }}>
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #222", color: "var(--color-text-disabled)", fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left" }}>Month</th>
                  <th style={{ padding: "8px 8px", textAlign: "right" }}>Unappr.</th>
                  <th style={{ padding: "8px 8px", textAlign: "right" }}>Net</th>
                  <th style={{ padding: "8px 8px", textAlign: "right" }}>Balance</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Overflow Payout</th>
                </tr>
              </thead>
              <tbody>
                {bm.monthHistory.map(row => (
                  <tr key={row.month} style={{ borderBottom: "1px solid #181818" }}>
                    <td style={{ padding: "7px 12px", color: "var(--color-text-primary)" }}>{fmtMonth(row.month)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: row.M > 0 ? "var(--color-red)" : "#444" }}>{row.M > 0 ? `${row.M}h` : "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: row.net >= 0 ? "var(--color-green)" : "var(--color-red)" }}>{row.net >= 0 ? "+" : ""}{row.net}h</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-secondary)" }}>{row.closingBalance}h</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: row.payout > 0 ? "var(--color-gold)" : "#444" }}>{row.payout > 0 ? f2(row.payout) : "—"}</td>
                  </tr>
                ))}
                <tr style={{ borderBottom: "1px solid #252525", background: "var(--color-bg-surface)" }}>
                  <td style={{ padding: "7px 12px", color: "var(--color-gold)" }}>{fmtMonth(currentMonthStr)} <span style={{ fontSize: "9px", color: "var(--color-text-disabled)" }}>in progress</span></td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: bm.currentM > 0 ? "var(--color-red)" : "#444" }}>{bm.currentM > 0 ? `${bm.currentM}h` : "—"}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#444" }}>—</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#666" }}>{bm.currentBalance}h</td>
                  <td style={{ padding: "7px 12px", textAlign: "right", color: "#444" }}>—</td>
                </tr>
                {bm.projectedHistory.map(row => (
                  <tr key={row.month} style={{ borderBottom: "1px solid #181818", opacity: 0.45 }}>
                    <td style={{ padding: "7px 12px", color: "#666", fontStyle: "italic" }}>{fmtMonth(row.month)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#444" }}>—</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-disabled)" }}>+{row.net}h</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--color-text-disabled)" }}>{row.closingBalance}h</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: row.payout > 0 ? "#8a6e20" : "#444" }}>{row.payout > 0 ? f2(row.payout) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Year-end summary */}
          <div style={{ background: bandBg, border: `1px solid ${bandColor}33`, borderRadius: "6px", padding: "12px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 16px", fontSize: "11px", alignItems: "center" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Realized overflow payout:</span>
              <span style={{ textAlign: "right", color: bm.realizedPayout > 0 ? "var(--color-gold)" : "#555" }}>{f2(bm.realizedPayout)}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>Projected (perfect attendance):</span>
              <span style={{ textAlign: "right", color: "var(--color-green)" }}>{f2(bm.projectedPayout)}</span>
              <span style={{ color: "var(--color-text-primary)", fontWeight: "bold", borderTop: "1px solid #ffffff11", paddingTop: "6px" }}>Total projected bonus income:</span>
              <span style={{ textAlign: "right", color: "var(--color-gold)", fontWeight: "bold", borderTop: "1px solid #ffffff11", paddingTop: "6px" }}>{f2(bm.totalProjectedBonus)}</span>
            </div>
          </div>
        </div>
      );
    })()}
  </div>);
}
