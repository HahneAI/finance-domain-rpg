import { Card } from "./ui.jsx";

export function BenefitsPanel({ allWeeks, config, logK401kLost, logK401kMatchLost, logK401kGained, logK401kMatchGained, logPTOHoursLost, currentWeek }) {
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
    {currentWeek && <div style={{ background: k401Active ? "#1a3a20" : "#1e1e2a", border: `1px solid ${k401Active ? "#6dbf8a44" : "#7a8bbf44"}`, borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#555", textTransform: "uppercase" }}>401k Status</div>
      {k401Active
        ? <div style={{ fontSize: "11px", color: "#6dbf8a", fontWeight: "bold" }}>Active — contributions running since {config.k401StartDate}</div>
        : <div style={{ fontSize: "11px", color: "#7a8bbf" }}><strong style={{ color: "#e8e0d0" }}>{weeksUntil401k} week{weeksUntil401k !== 1 ? "s" : ""}</strong> until enrollment ({config.k401StartDate})</div>}
    </div>}
    <div style={{ marginBottom: "24px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "12px" }}>401k Projections</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
        <Card label="Base Your Contributions" val={f(bE)} color="#7a8bbf" size="18px" />
        <Card label="Base Employer Match" val={f(bM)} color="#6dbf8a" size="18px" />
        <Card label="Base Total Balance" val={f(bE + bM)} color="#c8a84b" size="18px" />
      </div>
      {(logK401kLost > 0 || logK401kMatchLost > 0 || logK401kGained > 0 || logK401kMatchGained > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
        <Card label="Adj. Your Contributions" val={f(aE)} sub={[logK401kLost > 0 && `-${f(logK401kLost)} lost`, logK401kGained > 0 && `+${f(logK401kGained)} bonus`].filter(Boolean).join(" · ")} color="#7a8bbf" size="18px" />
        <Card label="Adj. Employer Match" val={f(aM)} sub={[logK401kMatchLost > 0 && `-${f(logK401kMatchLost)} lost`, logK401kMatchGained > 0 && `+${f(logK401kMatchGained)} bonus`].filter(Boolean).join(" · ")} color="#6dbf8a" size="18px" />
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
