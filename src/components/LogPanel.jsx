import { useState } from "react";
import { EVENT_TYPES, PTO_RATE } from "../constants/config.js";
import { calcEventImpact, toLocalIso } from "../lib/finance.js";
import { Card, iS, lS } from "./ui.jsx";

export function LogPanel({ logs, setLogs, config, projectedAnnualNet, baseWeeklyUnallocated, futureWeeks, allWeeks, currentWeek, goals }) {
  const [adding, setAdding] = useState(false);
  const blank = { weekEnd: "", weekIdx: "", weekRotation: "Week 2", type: "missed_unpaid", shiftsLost: 1, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0, workedDays: "", missedDays: "", note: "" };
  const [nEv, setNEv] = useState(blank);
  const [cdel, setCdel] = useState(null);
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const weeksLeft = futureWeeks.length || 1;
  const tot = logs.reduce((a, e) => { const i = calcEventImpact(e, config); a.gL += i.grossLost; a.gG += i.grossGained; a.nL += i.netLost; a.nG += i.netGained; a.k4 += i.k401kLost; a.pto += i.hoursLostForPTO; return a; }, { gL: 0, gG: 0, nL: 0, nG: 0, k4: 0, pto: 0 });
  const adjTH = projectedAnnualNet - tot.nL + tot.nG;
  const adjWA = baseWeeklyUnallocated - (tot.nL / weeksLeft) + (tot.nG / weeksLeft);
  const projS = adjWA * weeksLeft;
  const totGoals = goals.filter(g => !g.completed).reduce((s, g) => s + g.target, 0);
  const ok = projS >= totGoals;

  // Auto-detect week metadata from a selected date
  const resolveWeek = (dateStr) => {
    if (!dateStr) return { weekIdx: "", weekRotation: "Week 2" };
    const match = allWeeks.find(w => toLocalIso(w.weekEnd) === dateStr);
    if (!match) return { weekIdx: "", weekRotation: "Week 2" };
    return { weekIdx: match.idx, weekRotation: match.rotation };
  };

  const handleWeekEndChange = (dateStr) => {
    const resolved = resolveWeek(dateStr);
    setNEv(v => ({ ...v, weekEnd: dateStr, ...resolved }));
  };

  const addLog = () => { setLogs(p => [...p, { ...nEv, id: Date.now(), shiftsLost: parseInt(nEv.shiftsLost) || 0, weekendShifts: parseInt(nEv.weekendShifts) || 0, ptoHours: parseFloat(nEv.ptoHours) || 0, hoursLost: parseFloat(nEv.hoursLost) || 0, amount: parseFloat(nEv.amount) || 0 }]); setAdding(false); setNEv(blank); };

  return (<div>
    {/* Current week indicator */}
    {currentWeek && <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "10px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#555", textTransform: "uppercase" }}>Current fiscal week</div>
      <div style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "11px" }}>
        <span style={{ color: "#c8a84b", fontWeight: "bold" }}>Week ending {currentWeek.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span style={{ color: "#666" }}>{currentWeek.rotation}</span>
        <span style={{ color: "#555" }}>idx {currentWeek.idx}</span>
        <span style={{ color: "#555" }}>{weeksLeft} weeks remaining</span>
      </div>
    </div>}
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
        <div><label style={lS}>Pay Week Ending</label><input type="date" value={nEv.weekEnd} onChange={e => handleWeekEndChange(e.target.value)} style={iS} /></div>
        <div><label style={lS}>Week Rotation</label><div style={{ ...iS, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "default" }}><span style={{ color: nEv.weekRotation === "Week 2" ? "#c8a84b" : "#7a8bbf" }}>{nEv.weekEnd ? nEv.weekRotation : "— pick a date"}</span>{nEv.weekIdx !== "" && <span style={{ fontSize: "10px", color: "#555" }}>idx {nEv.weekIdx}</span>}</div></div>
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
