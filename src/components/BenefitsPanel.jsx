import { Card } from "./ui.jsx";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtMonth = yyyyMM => { const [y, m] = yyyyMM.split("-").map(Number); return `${MONTH_SHORT[m - 1]} ${y}`; };

export function BenefitsPanel({ allWeeks, config, logK401kLost, logK401kMatchLost, logK401kGained, logK401kMatchGained, logPTOHoursLost, currentWeek, bucketModel }) {
  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const bE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
  const k401Active = currentWeek ? currentWeek.weekEnd >= new Date(config.k401StartDate) : false;
  const weeksUntil401k = !k401Active && currentWeek
    ? allWeeks.filter(w => w.active && w.weekEnd >= currentWeek.weekEnd && w.weekEnd < new Date(config.k401StartDate)).length
    : null;
  const bM = allWeeks.reduce((s, w) => s + w.k401kEmployer, 0);
  const aE = Math.max(bE - logK401kLost + (logK401kGained ?? 0), 0);
  const aM = Math.max(bM - logK401kMatchLost + (logK401kMatchGained ?? 0), 0);
  const ptoBs = allWeeks.filter(w => w.active && w.weekEnd <= new Date(2026, 8, 14)).reduce((s, w) => s + w.totalHours, 0) / 20;
  const adjP = Math.max(ptoBs - logPTOHoursLost / 20, 0);
  const avail = adjP + 40;
  return (<div>
    {/* 401k status banner */}
    {currentWeek && <div style={{ background: k401Active ? "#1a3a20" : "#1e1e2a", border: `1px solid ${k401Active ? "rgba(76,175,125,0.27)" : "#7a8bbf44"}`, borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>401k Status</div>
      {k401Active
        ? <div style={{ fontSize: "11px", color: "var(--color-green)", fontWeight: "bold" }}>Active — contributions running since {config.k401StartDate}</div>
        : <div style={{ fontSize: "11px", color: "#7a8bbf" }}><strong style={{ color: "var(--color-text-primary)" }}>{weeksUntil401k} week{weeksUntil401k !== 1 ? "s" : ""}</strong> until enrollment ({config.k401StartDate})</div>}
    </div>}
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>401k Projections</div>
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
      <div style={{ padding: "12px 14px", background: "#3a3210", border: "1px solid #c8a84b44", borderRadius: "6px", fontSize: "11px", color: "#aaa", lineHeight: "1.8" }}>FHA: save <span style={{ color: "var(--color-gold)" }}>$3,000 cash</span> + borrow <span style={{ color: "#7a8bbf" }}>{f(aE)} from 401k</span> = <span style={{ color: "var(--color-green)" }}>~{f(aE + 3000)}+ toward FHA</span></div>
    </div>
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>PTO Accrual</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
        <Card label="Accrual Rate" val="1 hr / 20 worked" color="#7eb8c9" size="14px" />
        <Card label="Base Accrued by Sep 15" val={`~${ptoBs.toFixed(1)} hrs`} color="var(--color-text-primary)" size="18px" />
        {logPTOHoursLost > 0 ? <Card label="Adj. Accrued by Sep 15" val={`~${adjP.toFixed(1)} hrs`} sub={`-${(logPTOHoursLost / 20).toFixed(1)} hrs from events`} color="var(--color-gold)" size="18px" /> : <Card label="Negative Balance Cap" val="40 hrs (after 90d)" color="#888" size="14px" />}
      </div>
      <div style={{ background: avail >= 134 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${avail >= 134 ? "var(--color-green)" : "var(--color-red)"}`, borderRadius: "6px", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div><div style={{ fontSize: "11px", color: avail >= 134 ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold", marginBottom: "4px" }}>Paternity Leave Plan</div><div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Need ~134 hrs · {adjP.toFixed(1)} accrued + 40 neg = <strong style={{ color: "var(--color-text-primary)" }}>{avail.toFixed(1)} available</strong></div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: "14px", fontWeight: "bold", color: avail >= 134 ? "var(--color-green)" : "var(--color-red)" }}>{avail >= 134 ? "On Track" : "Shortfall"}</div>{avail < 134 && <div style={{ fontSize: "10px", color: "var(--color-red)" }}>Short {(134 - avail).toFixed(1)} hrs</div>}</div>
        </div>
      </div>
    </div>
    {bucketModel && (() => {
      const bm = bucketModel;
      const cap = config.bucketCap ?? 128;
      const bandColor = bm.status === "safe" ? "var(--color-green)" : bm.status === "caution" ? "var(--color-gold)" : "var(--color-red)";
      const bandBg    = bm.status === "safe" ? "#1a2d1e"  : bm.status === "caution" ? "#2d2710"  : "#2d1a1a";
      const pct = Math.min((bm.currentBalance / cap) * 100, 100);
      return (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>Attendance Bucket</div>

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
