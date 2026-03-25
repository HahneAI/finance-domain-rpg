import { useState } from "react";
import { MONTH_FULL } from "../constants/config.js";
import { STATE_TAX_TABLE } from "../constants/stateTaxTable.js";
import { computeNet } from "../lib/finance.js";
import { Card, VT, SH, iS, lS } from "./ui.jsx";

export function IncomePanel({ allWeeks, config, setConfig, showExtra, setShowExtra, taxDerived, logNetLost, logNetGained, adjustedTakeHome, projectedAnnualNet, currentWeek, isAdmin }) {
  const [view, setView] = useState("summary");
  const [subview, setSubview] = useState("overview");
  const [editCfg, setEditCfg] = useState(null);
  const [showSharpener, setShowSharpener] = useState(false);
  const [showWeekDetail, setShowWeekDetail] = useState(false);

  // ── Sharpen Rates modal state ──────────────────────────────────────────────
  const [sg1, setSg1] = useState("");
  const [sf1, setSf1] = useState("");
  const [ss1, setSs1] = useState("");
  const [sg2, setSg2] = useState("");
  const [sf2, setSf2] = useState("");
  const [ss2, setSs2] = useState("");
  function sharpenDr(gross, withheld) {
    const g = parseFloat(gross) || 0;
    if (!g) return null;
    return +((parseFloat(withheld) || 0) / g).toFixed(4);
  }
  const isVariable = config.scheduleIsVariable;
  const stateConfig = config.userState ? STATE_TAX_TABLE[config.userState] : null;
  const isNoTax = stateConfig?.model === "NONE";
  const sFed1 = sharpenDr(sg1, sf1);
  const sSta1 = sharpenDr(sg1, ss1);
  const sFed2 = isVariable ? sharpenDr(sg2, sf2) : null;
  const sSta2 = isVariable ? sharpenDr(sg2, ss2) : null;
  const canSharpenerApply = sFed1 !== null;
  function applySharpener() {
    if (!canSharpenerApply) return;
    setConfig(prev => ({
      ...prev,
      fedRateLow:    sFed1,
      stateRateLow:  sSta1 ?? 0,
      fedRateHigh:   isVariable && sFed2 != null ? sFed2 : sFed1,
      stateRateHigh: isVariable && sSta2 != null ? sSta2 : (sSta1 ?? 0),
      // Keep legacy fields in sync
      w1FedRate: sFed1, w1StateRate: sSta1 ?? 0,
      w2FedRate: isVariable && sFed2 != null ? sFed2 : sFed1,
      w2StateRate: isVariable && sSta2 != null ? sSta2 : (sSta1 ?? 0),
      taxRatesEstimated: false,
    }));
    setShowSharpener(false);
    setSg1(""); setSf1(""); setSs1("");
    setSg2(""); setSf2(""); setSs2("");
  }
  const sPct = n => n != null ? (n * 100).toFixed(2) + "%" : "—";
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
  const sc = t => t ? "#7a8bbf" : "var(--color-green)", sb = t => t ? "#1e1e3a" : "#1e4a30", sbd = t => t ? "#7a8bbf" : "var(--color-green)";

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

    {/* ── Sharpen Rates modal ─────────────────────────────────────────────────── */}
    {showSharpener && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}>
        <div style={{
          width: "100%", maxWidth: "440px",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "16px", padding: "24px",
          display: "flex", flexDirection: "column", gap: "20px",
        }}>
          <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>
            Sharpen Your Tax Rates
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            Enter values from your paycheck stub to replace the estimated rates with exact figures.
          </div>

          {/* Week 1 */}
          <div style={{ background: "var(--color-bg-raised)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
              {isVariable ? "Shorter Week Paystub" : "Typical Paycheck"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lS}>Gross Pay ($)</label>
                <input style={iS} type="number" min="0" step="0.01" value={sg1} onChange={e => setSg1(e.target.value)} placeholder="e.g. 1050" />
              </div>
              <div>
                <label style={lS}>Fed Income Tax Withheld ($)</label>
                <input style={iS} type="number" min="0" step="0.01" value={sf1} onChange={e => setSf1(e.target.value)} placeholder="e.g. 82" />
              </div>
            </div>
            {!isNoTax && (
              <div>
                <label style={lS}>State Income Tax Withheld ($)</label>
                <input style={iS} type="number" min="0" step="0.01" value={ss1} onChange={e => setSs1(e.target.value)} placeholder="e.g. 35" />
              </div>
            )}
            {sFed1 !== null && (
              <div style={{ fontSize: "11px", color: "var(--color-green)" }}>
                → Fed {sPct(sFed1)}{!isNoTax && sSta1 != null ? `  ·  State ${sPct(sSta1)}` : ""}
              </div>
            )}
          </div>

          {/* Week 2 — variable only */}
          {isVariable && (
            <div style={{ background: "var(--color-bg-raised)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
                Longer Week Paystub
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={lS}>Gross Pay ($)</label>
                  <input style={iS} type="number" min="0" step="0.01" value={sg2} onChange={e => setSg2(e.target.value)} placeholder="e.g. 1450" />
                </div>
                <div>
                  <label style={lS}>Fed Income Tax Withheld ($)</label>
                  <input style={iS} type="number" min="0" step="0.01" value={sf2} onChange={e => setSf2(e.target.value)} placeholder="e.g. 186" />
                </div>
              </div>
              {!isNoTax && (
                <div>
                  <label style={lS}>State Income Tax Withheld ($)</label>
                  <input style={iS} type="number" min="0" step="0.01" value={ss2} onChange={e => setSs2(e.target.value)} placeholder="e.g. 58" />
                </div>
              )}
              {sFed2 !== null && (
                <div style={{ fontSize: "11px", color: "var(--color-green)" }}>
                  → Fed {sPct(sFed2)}{!isNoTax && sSta2 != null ? `  ·  State ${sPct(sSta2)}` : ""}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button onClick={() => setShowSharpener(false)} style={{
              background: "var(--color-bg-raised)", color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
              padding: "8px 16px", fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", cursor: "pointer",
            }}>
              Cancel
            </button>
            <button onClick={applySharpener} disabled={!canSharpenerApply} style={{
              background: canSharpenerApply ? "var(--color-green)" : "var(--color-bg-raised)",
              color: canSharpenerApply ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 18px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold", cursor: canSharpenerApply ? "pointer" : "not-allowed",
            }}>
              Confirm Rates
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Estimated rates banner ──────────────────────────────────────────────── */}
    {config.taxRatesEstimated && (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "12px", padding: "10px 14px", marginBottom: "16px",
        background: "rgba(201,168,76,0.07)",
        border: "1px solid rgba(201,168,76,0.25)",
        borderRadius: "8px",
      }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
          Tax rates are <strong style={{ color: "var(--color-gold)" }}>estimated</strong> — net figures are approximate until you confirm from a paystub.
        </div>
        <button onClick={() => setShowSharpener(true)} style={{
          fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
          background: "transparent", color: "var(--color-gold)",
          border: "1px solid rgba(201,168,76,0.4)", borderRadius: "10px",
          padding: "5px 12px", cursor: "pointer", flexShrink: 0,
        }}>
          Sharpen Rates
        </button>
      </div>
    )}

    <div style={{ background: "#111", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
      <SH>Year Summary</SH>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: (logNetLost > 0 || logNetGained > 0) ? "14px" : "0" }}>
        <Card label="Gross (Year)" val={f(yG)} />
        <Card label="Projected Net" val={f(yN)} color="var(--color-green)" />
        <Card label="Your 401k" val={f(yE)} color="#7a8bbf" />
        <Card label="401k w/ Match" val={f(yT)} color="var(--color-gold)" />
      </div>
      {(logNetLost > 0 || logNetGained > 0) && <div style={{ background: logNetLost > logNetGained ? "#2d1a1a" : "#1a2d1e", border: `1px solid ${logNetLost > logNetGained ? "rgba(224,92,92,0.33)" : "rgba(76,175,125,0.33)"}`, borderRadius: "6px", padding: "11px 14px", marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <span>Event log:</span>
          {logNetLost > 0 && <span style={{ color: "var(--color-red)", fontWeight: "bold" }}>-{f(logNetLost)} lost</span>}
          {logNetGained > 0 && <span style={{ color: "var(--color-green)", fontWeight: "bold" }}>+{f(logNetGained)} gained</span>}
          <span>· Adjusted take-home:</span>
        </div>
        <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--color-gold)" }}>{f(adjustedTakeHome)}</div>
      </div>}
    </div>
    <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
      {["summary", "401k", "config"].map(v => <VT key={v} label={v} active={view === v} onClick={() => setView(v)} />)}
    </div>

    {/* SUMMARY — subtabs */}
    {view === "summary" && <div style={{ display: "flex", gap: "6px", marginBottom: "18px", flexWrap: "wrap" }}>
      {["overview", "monthly", "weekly", ...(isAdmin ? ["tax schedule"] : [])].map(v => <button key={v} onClick={() => setSubview(v)} style={{ padding: "5px 12px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", background: subview === v ? "#2a2318" : "transparent", color: subview === v ? "var(--color-gold)" : "#555", border: "1px solid " + (subview === v ? "rgba(201,168,76,0.4)" : "var(--color-border-subtle)"), borderRadius: "12px", cursor: "pointer", }}>{v}</button>)}
    </div>}

    {/* OVERVIEW */}
    {view === "summary" && subview === "overview" && <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%" }}><table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
      <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
        <th style={{ textAlign: "left", padding: "8px 6px", width: "4px", paddingLeft: 0 }}></th><th style={{ textAlign: "left", padding: "8px 6px" }}>Month</th><th style={{ textAlign: "center", padding: "8px 6px" }}>Chks</th><th style={{ textAlign: "right", padding: "8px 6px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 6px" }}>Take Home</th>
      </tr></thead>
      <tbody>{mo.map(m => {
        const statusColor = m.n === 0 ? "var(--color-border-subtle)" : m.tx === m.n ? "#7a8bbf" : m.ex === m.n ? "var(--color-green)" : "var(--color-gold)";
        return <tr key={m.name} style={{ borderBottom: "1px solid #1a1a1a" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <td style={{ padding: 0, width: "4px", backgroundColor: statusColor, borderRadius: "2px 0 0 2px" }}></td>
          <td style={{ padding: "10px 6px", fontWeight: "bold" }}>{m.name}</td>
          <td style={{ padding: "10px 6px", textAlign: "center", color: "#aaa" }}>{m.n}</td>
          <td style={{ padding: "10px 6px", textAlign: "right" }}>{m.gross > 0 ? f(m.gross) : "—"}</td>
          <td style={{ padding: "10px 6px", textAlign: "right", color: m.ex === m.n ? "var(--color-green)" : "var(--color-text-primary)" }}>{m.net > 0 ? f(m.net) : "—"}</td>
        </tr>;
      })}</tbody>
      <tfoot><tr style={{ borderTop: "2px solid #c8a84b", fontWeight: "bold", color: "var(--color-gold)" }}>
        <td style={{ padding: 0 }}></td><td style={{ padding: "10px 6px" }}>TOTAL</td><td style={{ padding: "10px 6px", textAlign: "center", color: "#aaa" }}>{allWeeks.filter(w => w.active).length}</td><td style={{ padding: "10px 6px", textAlign: "right" }}>{f(yG)}</td><td style={{ padding: "10px 6px", textAlign: "right", color: "var(--color-green)" }}>{f(yN)}</td>
      </tr></tfoot>
    </table></div>}

    {/* MONTHLY */}
    {view === "summary" && subview === "monthly" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "14px" }}>
      {mo.filter(m => m.n > 0).map(m => <div key={m.name} style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: "var(--color-gold)" }}>{m.name}</div>
          <span style={{ fontSize: "9px", padding: "3px 7px", borderRadius: "12px", background: m.ex === m.n ? "#1e4a30" : m.tx === m.n ? "#1e1e3a" : "#3a3210", color: m.ex === m.n ? "var(--color-green)" : m.tx === m.n ? "#7a8bbf" : "var(--color-gold)", border: "1px solid " + (m.ex === m.n ? "var(--color-green)" : m.tx === m.n ? "#7a8bbf" : "var(--color-gold)") }}>{m.ex === m.n ? "EXEMPT" : m.tx === m.n ? "TAXED" : "MIXED"}</span>
        </div>
        {m.wks.map(w => <div key={w.idx} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #1e1e1e" }}>
          <div><div style={{ fontSize: "11px", color: "#777" }}>Ends {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div><div style={{ fontSize: "10px", color: "#999" }}>{w.rotation} · {w.totalHours}h{w.has401k ? " · 401k✓" : ""}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: "13px", fontWeight: "bold", color: w.taxedBySchedule ? "var(--color-text-primary)" : "var(--color-green)" }}>{f2(gN(w))}</div><div style={{ fontSize: "9px", color: sc(w.taxedBySchedule) }}>{w.taxedBySchedule ? "TAXED" : "EXEMPT"}</div></div>
        </div>)}
        <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "11px" }}>
          <span style={{ color: "#aaa" }}>Gross: {f(m.gross)}</span><span style={{ color: "var(--color-green)", textAlign: "right" }}>Net: {f(m.net)}</span>
          {m.k4E > 0 && <><span style={{ color: "#7a8bbf" }}>401k: {f(m.k4E)}</span><span style={{ color: "var(--color-gold)", textAlign: "right" }}>+Match: {f(m.k4M)}</span></>}
        </div>
      </div>)}
    </div>}

    {/* WEEKLY — slimmed to 4 cols; full detail available via modal */}
    {view === "summary" && subview === "weekly" && <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>52 Weeks</span>
        <button onClick={() => setShowWeekDetail(true)} style={{ fontSize: "10px", letterSpacing: "1px", padding: "4px 10px", borderRadius: "12px", cursor: "pointer", background: "transparent", color: "var(--color-gold)", border: "1px solid rgba(201,168,76,0.35)", textTransform: "uppercase" }}>⊞ Full Detail</button>
      </div>
      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
          <th style={{ textAlign: "left", padding: "8px 4px" }}>Wk End</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Take Home</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Status</th>
        </tr></thead>
        <tbody>{allWeeks.map(w => { const isCurrent = currentWeek && w.idx === currentWeek.idx; return <tr key={w.idx} style={{ borderBottom: "1px solid #161616", opacity: w.active ? 1 : 0.35, background: isCurrent ? "#1a2a14" : "transparent" }} onMouseEnter={e => { if (w.active) e.currentTarget.style.background = isCurrent ? "#1e3018" : "var(--color-bg-surface)"; }} onMouseLeave={e => e.currentTarget.style.background = isCurrent ? "#1a2a14" : "transparent"}>
          <td style={{ padding: "7px 4px" }}><span>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>{isCurrent && <span style={{ marginLeft: "6px", fontSize: "8px", color: "var(--color-green)", letterSpacing: "1px" }}>← now</span>}</td>
          <td style={{ padding: "7px 4px", textAlign: "right" }}>{w.active ? f2(w.grossPay) : "—"}</td>
          <td style={{ padding: "7px 4px", textAlign: "right", color: w.active ? (w.taxedBySchedule ? "var(--color-text-primary)" : "var(--color-green)") : "#666" }}>{w.active ? f2(gN(w)) : "—"}</td>
          <td style={{ padding: "7px 4px", textAlign: "center" }}>{w.active && <span style={{ fontSize: "8px", padding: "2px 6px", borderRadius: "2px", background: sb(w.taxedBySchedule), color: sc(w.taxedBySchedule), border: "1px solid " + sbd(w.taxedBySchedule) }}>{w.taxedBySchedule ? "TX" : "EX"}</span>}</td>
        </tr>; })}</tbody>
      </table>
    </div>}

    {/* 401K */}
    {view === "401k" && <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "12px", marginBottom: "24px" }}>
        <Card label="Your Contributions" val={f(yE)} sub={`${(config.k401Rate * 100).toFixed(0)}% · starts ${config.k401StartDate}`} color="#7a8bbf" size="22px" />
        <Card label="Employer Match" val={f(allWeeks.reduce((s, w) => s + w.k401kEmployer, 0))} sub={`${(config.k401MatchRate * 100).toFixed(0)}% match`} color="var(--color-green)" size="22px" />
        <Card label="Total 401k Balance" val={f(yT)} sub="Projected year-end 2026" color="var(--color-gold)" size="22px" />
      </div>
      {(() => {
        let r401 = 0;
        const mo401 = mo.filter(m => m.k4E > 0).map(m => { r401 += m.k4E + m.k4M; return { ...m, running: r401 }; });
        return <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", maxWidth: "100%" }}><table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "360px" }}>
          <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>Month</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Your {(config.k401Rate * 100).toFixed(0)}%</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Match</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Mo Total</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Running</th>
          </tr></thead>
          <tbody>{mo401.map(m => <tr key={m.name} style={{ borderBottom: "1px solid #161616" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <td style={{ padding: "7px 4px", fontWeight: "bold", color: "var(--color-gold)" }}>{m.name}</td>
            <td style={{ padding: "7px 4px", textAlign: "right" }}>{f(m.gross)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "#7a8bbf" }}>{f2(m.k4E)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "var(--color-green)" }}>{f2(m.k4M)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right" }}>{f2(m.k4E + m.k4M)}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: "var(--color-gold)", fontWeight: "bold" }}>{f2(m.running)}</td>
          </tr>)}</tbody>
          <tfoot><tr style={{ borderTop: "2px solid #c8a84b", fontWeight: "bold", color: "var(--color-gold)" }}>
            <td colSpan={2} style={{ padding: "10px 4px" }}>YEAR-END TOTAL</td>
            <td style={{ padding: "10px 4px", textAlign: "right", color: "#7a8bbf" }}>{f(yE)}</td>
            <td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(allWeeks.reduce((s, w) => s + w.k401kEmployer, 0))}</td>
            <td style={{ padding: "10px 4px", textAlign: "right" }}>{f(yT)}</td>
            <td style={{ padding: "10px 4px", textAlign: "right" }}>{f(yT)}</td>
          </tr></tfoot>
        </table></div>;
      })()}
    </div>}

    {/* TAX SCHEDULE — debt overview + per-week toggle (admin only) */}
    {isAdmin && view === "summary" && subview === "tax schedule" && <div>
      {/* Extra withholding quick-toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", padding: "10px 14px", background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px" }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", flex: 1 }}>Apply extra withholding <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(extraPerCheck)}/check</span> on taxed weeks → ~{f(config.targetOwedAtFiling)} owed at filing</div>
        <button onClick={() => setShowExtra(v => !v)} style={{ fontSize: "9px", letterSpacing: "2px", padding: "5px 12px", borderRadius: "12px", cursor: "pointer", background: showExtra ? "#3a3210" : "var(--color-bg-surface)", color: showExtra ? "var(--color-gold)" : "#aaa", border: "1px solid " + (showExtra ? "var(--color-gold)" : "var(--color-border-subtle)"), textTransform: "uppercase", flexShrink: 0 }}>{showExtra ? "ON" : "OFF"}</button>
      </div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "12px", marginBottom: "20px" }}>
        <Card label="Full Year Fed Liability" val={f(fedLiability)} sub={`On ${f(fedAGI)} AGI`} color="var(--color-red)" size="20px" />
        <Card label="Full Year MO Liability" val={f(moLiability)} sub="4.7% flat" color="var(--color-gold)" size="20px" />
        <Card label="FICA (Always Paid)" val={f(ficaTotal)} sub="7.65% every check" color="#888" size="20px" />
      </div>

      {/* Tax gap analysis */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}>
        <SH>Tax Gap Analysis</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
          {[{ l: "Fed withheld (taxed weeks)", v: f(fedWithheldBase), c: "var(--color-green)" }, { l: "MO withheld (taxed weeks)", v: f(moWithheldBase), c: "var(--color-green)" }, { l: "Federal gap", v: f(fedGap), c: "var(--color-red)" }, { l: "Missouri gap", v: f(moGap), c: "var(--color-red)" }, { l: "Total income tax gap", v: f(totalGap), c: "var(--color-red)" }, { l: "Target owed at filing", v: f(config.targetOwedAtFiling), c: "var(--color-gold)" }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "#777" }}>{r.l}</span><span style={{ fontWeight: "bold", color: r.c }}>{r.v}</span></div>)}
        </div>
      </div>

      {/* Extra withholding plan */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #c8a84b", borderRadius: "8px", padding: "20px", marginBottom: "28px" }}>
        <SH>Extra Withholding Plan</SH>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "12px", marginBottom: "16px" }}>
          {[{ l: "Extra Needed", v: f(targetExtraTotal), c: "var(--color-red)" }, { l: "Taxed Checks", v: taxedWeekCount, c: "var(--color-text-primary)" }, { l: "Extra Per Check", v: f2(extraPerCheck), c: "var(--color-gold)" }].map(c => <div key={c.l} style={{ textAlign: "center", padding: "12px", background: "var(--color-bg-base)", borderRadius: "6px" }}><div style={{ fontSize: "9px", letterSpacing: "2px", color: "#aaa", textTransform: "uppercase", marginBottom: "6px" }}>{c.l}</div><div style={{ fontSize: "20px", fontWeight: "bold", color: c.c }}>{c.v}</div></div>)}
        </div>
        <div style={{ fontSize: "11px", color: "#aaa", lineHeight: "1.8" }}>Add <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(extraPerCheck)}</span> extra federal withholding on each of your <span style={{ color: "var(--color-gold)" }}>{taxedWeekCount} taxed checks</span>.</div>
      </div>

      {/* Per-week toggle schedule */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <SH>Weekly Tax Schedule</SH>
        <div style={{ display: "flex", gap: "10px", fontSize: "10px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#7a8bbf", display: "inline-block" }} />Taxed weeks: <strong style={{ color: "var(--color-red)" }}>{config.taxedWeeks.length}</strong></span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "var(--color-green)", display: "inline-block" }} />Exempt weeks: <strong style={{ color: "var(--color-green)" }}>{allWeeks.filter(w => w.active).length - config.taxedWeeks.length}</strong></span>
        </div>
      </div>

      {scheduleByMonth.map(m => <div key={m.name} style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "8px" }}>{m.name}</div>
        {m.wks.map(w => {
          const taxed = config.taxedWeeks.includes(w.idx);
          return <div key={w.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--color-bg-surface)", border: `1px solid ${taxed ? "#7a8bbf22" : "rgba(76,175,125,0.13)"}`, borderRadius: "6px", marginBottom: "6px" }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "bold" }}>Ends {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{w.rotation} · {w.totalHours}h · idx {w.idx}{w.has401k ? " · 401k✓" : ""}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{f2(w.grossPay)} gross</div>
                <div style={{ fontSize: "11px", color: taxed ? "var(--color-text-primary)" : "var(--color-green)" }}>{f2(gN(w))} net</div>
              </div>
            </div>
            {/* Two-segment toggle pill */}
            <div style={{ display: "flex", background: "var(--color-bg-base)", border: "1px solid #2a2a2a", borderRadius: "5px", overflow: "hidden" }}>
              <button onClick={() => !taxed && toggleWeek(w.idx)} style={{
                padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                border: "none", cursor: taxed ? "default" : "pointer",
                background: taxed ? "#1e1e3a" : "transparent",
                color: taxed ? "#7a8bbf" : "var(--color-border-subtle)",
                fontWeight: taxed ? "bold" : "normal",
                transition: "all 0.12s",
              }}>Taxed</button>
              <div style={{ width: "1px", background: "var(--color-border-subtle)" }} />
              <button onClick={() => taxed && toggleWeek(w.idx)} style={{
                padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                border: "none", cursor: !taxed ? "default" : "pointer",
                background: !taxed ? "#1e4a30" : "transparent",
                color: !taxed ? "var(--color-green)" : "var(--color-border-subtle)",
                fontWeight: !taxed ? "bold" : "normal",
                transition: "all 0.12s",
              }}>Exempt</button>
            </div>
          </div>;
        })}
      </div>)}
      <div style={{ padding: "12px", background: "var(--color-bg-surface)", borderRadius: "6px", fontSize: "10px", color: "#444", lineHeight: "1.9" }}>
        Toggling a week instantly recalculates projected net, tax gap, extra withholding per check, and all downstream totals.
      </div>
    </div>}

    {/* CONFIG */}
    {view === "config" && <div>
      {editCfg === null ? <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Income & Schedule Configuration</div>
          <button onClick={() => setEditCfg({ ...config })} style={{ background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none", borderRadius: "4px", padding: "7px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>EDIT CONFIG</button>
        </div>
        {[
          { section: "Pay Structure", rows: [{ l: "Base Hourly Rate", v: `$${config.baseRate}/hr` }, { l: "Shift Length", v: `${config.shiftHours}h` }, { l: "Weekend Differential", v: `+$${config.diffRate}/hr` }, ...(config.dhlNightShift ? [{ l: "Night Differential", v: `+$${config.nightDiffRate}/hr` }] : []), { l: "OT Threshold", v: `${config.otThreshold}h/wk` }, { l: "OT Multiplier", v: `${config.otMultiplier}×` }] },
          { section: "Deductions", rows: [{ l: "LTD (weekly)", v: `$${config.ltd}` }, { l: "401k Employee", v: `${(config.k401Rate * 100).toFixed(0)}%` }, { l: "401k Employer Match", v: `${(config.k401MatchRate * 100).toFixed(0)}%` }, { l: "401k Start Date", v: config.k401StartDate }] },
          { section: "Tax Rates (from paychecks)", rows: [{ l: `Long / ${isVariable ? "High" : "Only"} Fed`, v: `${(config.fedRateHigh * 100).toFixed(2)}%${config.taxRatesEstimated ? " est." : ""}` }, { l: `Long / ${isVariable ? "High" : "Only"} State`, v: `${(config.stateRateHigh * 100).toFixed(2)}%${config.taxRatesEstimated ? " est." : ""}` }, { l: "Short / Low Fed", v: isVariable ? `${(config.fedRateLow * 100).toFixed(2)}%${config.taxRatesEstimated ? " est." : ""}` : "—" }, { l: "Short / Low State", v: isVariable ? `${(config.stateRateLow * 100).toFixed(2)}%${config.taxRatesEstimated ? " est." : ""}` : "—" }, { l: "FICA", v: `${(config.ficaRate * 100).toFixed(2)}%` }] },
          { section: "Annual Tax Strategy", rows: [{ l: "Federal Std Deduction", v: `$${config.fedStdDeduction.toLocaleString()}` }, { l: "MO Flat Rate", v: `${(config.moFlatRate * 100).toFixed(1)}%` }, { l: "Target Owed at Filing", v: `$${config.targetOwedAtFiling}` }, { l: "First Active Week Index", v: `idx ${config.firstActiveIdx}` }] },
        ].map(g => <div key={g.section} style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SH>{g.section}</SH>
            {g.section === "Tax Rates (from paychecks)" && (
              <button onClick={() => setShowSharpener(true)} style={{
                fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
                background: "transparent",
                color: config.taxRatesEstimated ? "var(--color-gold)" : "var(--color-text-disabled)",
                border: `1px solid ${config.taxRatesEstimated ? "rgba(201,168,76,0.4)" : "var(--color-border-subtle)"}`,
                borderRadius: "8px", padding: "4px 10px", cursor: "pointer", marginBottom: "12px",
              }}>
                {config.taxRatesEstimated ? "⚠ Sharpen" : "Recalculate"}
              </button>
            )}
          </div>
          {g.rows.map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}><span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{r.l}</span><span style={{ fontSize: "12px", fontWeight: "bold", color: r.v.includes("est.") ? "var(--color-gold)" : "var(--color-text-primary)" }}>{r.v}</span></div>)}
        </div>)}
      </div> : <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <SH>Editing — recalculates on save</SH>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => { setConfig(prev => ({ ...editCfg, taxedWeeks: prev.taxedWeeks })); setEditCfg(null); }} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "7px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>SAVE & RECALCULATE</button>
            <button onClick={() => setEditCfg(null)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {[
            { l: "Base Hourly Rate ($)", f: "baseRate", t: "number", s: "0.01" },
            { l: "Shift Length (hrs)", f: "shiftHours", t: "number", s: "1" },
            { l: "Weekend Diff ($/hr)", f: "diffRate", t: "number", s: "0.01" },
            { l: "Night Diff ($/hr)", f: "nightDiffRate", t: "number", s: "0.01" },
            { l: "OT Threshold (hrs/wk)", f: "otThreshold", t: "number", s: "1" },
            { l: "OT Multiplier", f: "otMultiplier", t: "number", s: "0.1" },
            { l: "LTD Weekly ($)", f: "ltd", t: "number", s: "0.01" },
            { l: "401k Employee % (decimal)", f: "k401Rate", t: "number", s: "0.01" },
            { l: "401k Match % (decimal)", f: "k401MatchRate", t: "number", s: "0.01" },
            { l: "401k Start Date", f: "k401StartDate", t: "date" },
            { l: "First Active Week Index", f: "firstActiveIdx", t: "number", s: "1" },
            { l: "Long / High Fed Rate", f: "w2FedRate", t: "number", s: "0.0001" },
            { l: "Long / High State Rate", f: "w2StateRate", t: "number", s: "0.0001" },
            { l: "Short / Low Fed Rate", f: "w1FedRate", t: "number", s: "0.0001" },
            { l: "Short / Low State Rate", f: "w1StateRate", t: "number", s: "0.0001" },
            { l: "FICA Rate", f: "ficaRate", t: "number", s: "0.0001" },
            { l: "Federal Std Deduction ($)", f: "fedStdDeduction", t: "number", s: "100" },
            { l: "MO Flat Rate", f: "moFlatRate", t: "number", s: "0.001" },
            { l: "Target Owed at Filing ($)", f: "targetOwedAtFiling", t: "number", s: "100" },
          ].map(fi => <div key={fi.f}><label style={lS}>{fi.l}</label><input type={fi.t} step={fi.s} value={editCfg[fi.f]} onChange={e => setEditCfg(v => ({ ...v, [fi.f]: fi.t === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))} style={iS} /></div>)}
        </div>
      </div>}
    </div>}

    {/* FULL-DETAIL WEEKLY MODAL */}
    {showWeekDetail && <div onClick={() => setShowWeekDetail(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, overflowY: "auto", padding: "16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-bg-surface)", borderRadius: "8px", maxWidth: "860px", margin: "0 auto", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <span style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase" }}>Weekly Breakdown — Full Detail</span>
          <button onClick={() => setShowWeekDetail(false)} style={{ background: "transparent", border: "none", color: "#888", fontSize: "16px", cursor: "pointer", padding: "4px 8px" }}>✕</button>
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}><table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "680px" }}>
          <thead><tr style={{ borderBottom: "1px solid #c8a84b", color: "var(--color-gold)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>
            <th style={{ textAlign: "left", padding: "8px 4px" }}>Wk End</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Rot</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Hrs</th><th style={{ textAlign: "center", padding: "8px 4px" }}>OT</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Wknd</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Gross</th><th style={{ textAlign: "right", padding: "8px 4px" }}>401k</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Take Home</th><th style={{ textAlign: "center", padding: "8px 4px" }}>Status</th>
          </tr></thead>
          <tbody>{allWeeks.map(w => { const isCurrent = currentWeek && w.idx === currentWeek.idx; return <tr key={w.idx} style={{ borderBottom: "1px solid #161616", opacity: w.active ? 1 : 0.35, background: isCurrent ? "#1a2a14" : "transparent" }} onMouseEnter={e => { if (w.active) e.currentTarget.style.background = isCurrent ? "#1e3018" : "var(--color-bg-surface)"; }} onMouseLeave={e => e.currentTarget.style.background = isCurrent ? "#1a2a14" : "transparent"}>
            <td style={{ padding: "7px 4px" }}><span>{w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>{isCurrent && <span style={{ marginLeft: "6px", fontSize: "8px", color: "var(--color-green)", letterSpacing: "1px" }}>← now</span>}</td>
            <td style={{ padding: "7px 4px", textAlign: "center", fontSize: "10px", color: w.rotation === "6-Day" ? "var(--color-gold)" : w.rotation === "4-Day" ? "#7a8bbf" : "var(--color-text-disabled)" }}>{w.rotation === "6-Day" ? "Long" : w.rotation === "4-Day" ? "Short" : "Std"}</td>
            <td style={{ padding: "7px 4px", textAlign: "center", color: "var(--color-text-secondary)" }}>{w.active ? w.totalHours : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "center", color: w.active && w.overtimeHours > 0 ? "var(--color-red)" : "#666" }}>{w.active && w.overtimeHours > 0 ? w.overtimeHours : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "center", color: w.active && w.weekendHours > 0 ? "var(--color-gold)" : "#666" }}>{w.active && w.weekendHours > 0 ? w.weekendHours : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "right" }}>{w.active ? f2(w.grossPay) : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: w.has401k ? "#7a8bbf" : "#666" }}>{w.has401k ? f2(w.k401kEmployee) : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "right", color: w.active ? (w.taxedBySchedule ? "var(--color-text-primary)" : "var(--color-green)") : "#666" }}>{w.active ? f2(gN(w)) : "—"}</td>
            <td style={{ padding: "7px 4px", textAlign: "center" }}>{w.active && <span style={{ fontSize: "8px", padding: "2px 6px", borderRadius: "2px", background: sb(w.taxedBySchedule), color: sc(w.taxedBySchedule), border: "1px solid " + sbd(w.taxedBySchedule) }}>{w.taxedBySchedule ? "TX" : "EX"}</span>}</td>
          </tr>; })}</tbody>
        </table></div>
      </div>
    </div>}
  </div>);
}
