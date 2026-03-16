import { useState } from "react";
import { MONTH_FULL } from "../constants/config.js";
import { computeNet } from "../lib/finance.js";
import { Card, VT, iS, lS } from "./ui.jsx";

export function IncomePanel({ allWeeks, config, setConfig, showExtra, setShowExtra, taxDerived, logNetLost, adjustedTakeHome, projectedAnnualNet }) {
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
        Toggling a week instantly recalculates projected net, tax gap, extra withholding per check, and all downstream totals.
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
