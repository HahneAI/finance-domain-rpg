import { useState } from "react";
import { EVENT_TYPES, PTO_RATE } from "../constants/config.js";
import { calcEventImpact, toLocalIso } from "../lib/finance.js";
import { Card, iS, lS } from "./ui.jsx";

export function LogPanel({ logs, setLogs, config, projectedAnnualNet, baseWeeklyUnallocated, futureWeeks, allWeeks, currentWeek, goals }) {
  const blank = { weekEnd: "", weekIdx: "", weekRotation: "Week 2", type: "missed_unpaid", shiftsLost: 1, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0, workedDays: "", missedDays: "", note: "" };
  const [adding, setAdding] = useState(false);
  const [nEv, setNEv] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [cdel, setCdel] = useState(null);

  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const f0 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const weeksLeft = futureWeeks.length || 1;
  const tot = logs.reduce((a, e) => {
    const i = calcEventImpact(e, config);
    a.gL += i.grossLost; a.gG += i.grossGained; a.nL += i.netLost; a.nG += i.netGained;
    a.k4 += i.k401kLost; a.pto += i.hoursLostForPTO; a.bucket += i.bucketHoursDeducted;
    return a;
  }, { gL: 0, gG: 0, nL: 0, nG: 0, k4: 0, pto: 0, bucket: 0 });

  const adjTH   = projectedAnnualNet - tot.nL + tot.nG;
  const adjWA   = baseWeeklyUnallocated - (tot.nL / weeksLeft) + (tot.nG / weeksLeft);
  const projS   = adjWA * weeksLeft;
  const totGoals = goals.filter(g => !g.completed).reduce((s, g) => s + g.target, 0);
  const ok = projS >= totGoals;

  // ── Week resolution ──
  const resolveWeek = (dateStr) => {
    if (!dateStr) return { weekIdx: "", weekRotation: "Week 2" };
    const match = allWeeks.find(w => toLocalIso(w.weekEnd) === dateStr);
    return match ? { weekIdx: match.idx, weekRotation: match.rotation } : { weekIdx: "", weekRotation: "Week 2" };
  };

  // ── Add handlers ──
  const handleWeekEndChange = (dateStr) => setNEv(v => ({ ...v, weekEnd: dateStr, ...resolveWeek(dateStr) }));
  const addLog = () => {
    setLogs(p => [...p, { ...nEv, id: Date.now(), shiftsLost: parseInt(nEv.shiftsLost)||0, weekendShifts: parseInt(nEv.weekendShifts)||0, ptoHours: parseFloat(nEv.ptoHours)||0, hoursLost: parseFloat(nEv.hoursLost)||0, amount: parseFloat(nEv.amount)||0 }]);
    setAdding(false); setNEv(blank);
  };

  // ── Edit handlers ──
  const startEdit = (entry) => { setEditId(entry.id); setEditVals({ ...entry }); setCdel(null); setAdding(false); };
  const handleEditWeekEndChange = (dateStr) => setEditVals(v => ({ ...v, weekEnd: dateStr, ...resolveWeek(dateStr) }));
  const saveEdit = () => {
    setLogs(p => p.map(e => e.id !== editId ? e : { ...editVals, id: editId, shiftsLost: parseInt(editVals.shiftsLost)||0, weekendShifts: parseInt(editVals.weekendShifts)||0, ptoHours: parseFloat(editVals.ptoHours)||0, hoursLost: parseFloat(editVals.hoursLost)||0, amount: parseFloat(editVals.amount)||0 }));
    setEditId(null);
  };

  // ── Shared form fields renderer ──
  const FormFields = ({ vals, set, onWeekEndChange }) => <>
    <div><label style={lS}>Pay Week Ending</label><input type="date" value={vals.weekEnd} onChange={e => onWeekEndChange(e.target.value)} style={iS} /></div>
    <div><label style={lS}>Week Rotation</label>
      <div style={{ ...iS, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "default" }}>
        <span style={{ color: vals.weekRotation === "Week 2" ? "#c8a84b" : "#7a8bbf" }}>{vals.weekEnd ? vals.weekRotation : "— pick a date"}</span>
        {vals.weekIdx !== "" && <span style={{ fontSize: "10px", color: "#555" }}>wk {vals.weekIdx}</span>}
      </div>
    </div>
    <div><label style={lS}>Event Type</label>
      <select value={vals.type} onChange={e => set(v => ({ ...v, type: e.target.value }))} style={iS}>
        {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
    {vals.type === "missed_unpaid" && <>
      <div><label style={lS}>Shifts Lost</label><input type="number" min="1" max="6" value={vals.shiftsLost} onChange={e => set(v => ({ ...v, shiftsLost: e.target.value }))} style={iS} /></div>
      <div><label style={lS}>Weekend Shifts Lost</label><input type="number" min="0" max="2" value={vals.weekendShifts} onChange={e => set(v => ({ ...v, weekendShifts: e.target.value }))} style={iS} /></div>
      <div><label style={lS}>Days Missed</label><input type="text" placeholder="e.g. Tue, Wed, Thu" value={vals.missedDays} onChange={e => set(v => ({ ...v, missedDays: e.target.value }))} style={iS} /></div>
      <div><label style={lS}>Days Worked</label><input type="text" placeholder="e.g. Fri, Sat, Sun" value={vals.workedDays} onChange={e => set(v => ({ ...v, workedDays: e.target.value }))} style={iS} /></div>
    </>}
    {vals.type === "missed_unapproved" && <>
      <div><label style={lS}>Hours Missed (of {config.shiftHours})</label><input type="number" min="0" max={config.shiftHours} step="0.5" value={vals.hoursLost} onChange={e => set(v => ({ ...v, hoursLost: e.target.value }))} style={iS} /></div>
      <div><label style={lS}>Days Missed</label><input type="text" placeholder="e.g. Tue, Wed" value={vals.missedDays} onChange={e => set(v => ({ ...v, missedDays: e.target.value }))} style={iS} /></div>
      <div><label style={lS}>Days Worked</label><input type="text" placeholder="e.g. Fri, Sat, Sun" value={vals.workedDays} onChange={e => set(v => ({ ...v, workedDays: e.target.value }))} style={iS} /></div>
    </>}
    {vals.type === "pto" && <div><label style={lS}>PTO Hours (${PTO_RATE}/hr flat)</label><input type="number" min="0" value={vals.ptoHours} onChange={e => set(v => ({ ...v, ptoHours: e.target.value }))} style={iS} /></div>}
    {vals.type === "partial" && <div><label style={lS}>Hours Lost</label><input type="number" min="0" value={vals.hoursLost} onChange={e => set(v => ({ ...v, hoursLost: e.target.value }))} style={iS} /></div>}
    {(vals.type === "bonus" || vals.type === "other_loss") && <div><label style={lS}>Amount ($)</label><input type="number" min="0" value={vals.amount} onChange={e => set(v => ({ ...v, amount: e.target.value }))} style={iS} /></div>}
    <div style={{ gridColumn: "1 / -1" }}><label style={lS}>Note</label><input type="text" placeholder="Optional" value={vals.note} onChange={e => set(v => ({ ...v, note: e.target.value }))} style={iS} /></div>
  </>;

  return (<div>

    {/* Current week indicator */}
    {currentWeek && <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "10px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#555", textTransform: "uppercase" }}>Current fiscal week</div>
      <div style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "11px" }}>
        <span style={{ color: "#c8a84b", fontWeight: "bold" }}>Week ending {currentWeek.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span style={{ color: "#666" }}>{currentWeek.rotation}</span>
        <span style={{ color: "#6dbf8a", fontWeight: "bold" }}>Week {currentWeek.idx} of 52</span>
      </div>
    </div>}

    {/* Summary cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "14px" }}>
      <Card label="Total Gross Lost" val={f(tot.gL)} color="#e8856a" />
      <Card label="Total Net Lost"   val={f(tot.nL)} color="#e8856a" />
      <Card label="Adjusted Take-Home"    val={f0(adjTH)} color="#6dbf8a" />
      <Card label="Adj. Weekly Unalloc." val={f(adjWA)}  color={adjWA > 0 ? "#6dbf8a" : "#e8856a"} />
    </div>
    {(tot.k4 > 0 || tot.bucket > 0) && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
      {tot.k4 > 0    && <Card label="401k Lost"          val={f(tot.k4)}                              sub="Events after May 15"     color="#7a8bbf" />}
      {tot.pto > 0   && <Card label="PTO Accrual Lost"   val={`${(tot.pto / 20).toFixed(1)} hrs`}     sub={`${tot.pto}h ÷ 20`}      color="#888" />}
      {tot.bucket > 0 && <Card label="Bucket Hrs Deducted" val={`${tot.bucket}h`}                     sub="Unapproved absences"     color="#e8622a" />}
    </div>}

    {/* Goals impact */}
    <div style={{ background: ok ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${ok ? "#6dbf8a" : "#e8856a"}`, borderRadius: "6px", padding: "14px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: ok ? "#6dbf8a" : "#e8856a", textTransform: "uppercase", marginBottom: "4px" }}>Goals Impact</div>
          <div style={{ fontSize: "12px", color: "#aaa" }}>Adj. savings: <span style={{ color: "#c8a84b", fontWeight: "bold" }}>{f0(projS)}</span> · Goals: <span style={{ color: "#c8a84b" }}>{f0(totGoals)}</span></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "14px", fontWeight: "bold", color: ok ? "#6dbf8a" : "#e8856a" }}>{ok ? "All goals on track" : "Goals at risk"}</div>
          <div style={{ fontSize: "11px", color: "#666" }}>{Math.ceil(totGoals / adjWA)} wks to fund all goals</div>
        </div>
      </div>
    </div>

    {/* Log header + add button */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#888", textTransform: "uppercase" }}>Event Log ({logs.length})</div>
      <button onClick={() => { setAdding(true); setEditId(null); }} style={{ background: "#c8a84b", color: "#0d0d0d", border: "none", borderRadius: "4px", padding: "6px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>+ LOG EVENT</button>
    </div>

    {/* Add form */}
    {adding && <div style={{ background: "#141414", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>New Event</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <FormFields vals={nEv} set={setNEv} onWeekEndChange={handleWeekEndChange} />
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={addLog} style={{ background: "#6dbf8a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>SAVE</button>
        <button onClick={() => setAdding(false)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
      </div>
    </div>}

    {logs.length === 0 && <div style={{ textAlign: "center", padding: "40px", color: "#444", fontSize: "13px" }}>No events logged yet.</div>}

    {/* Log entries */}
    {logs.map(entry => {
      const imp  = calcEventImpact(entry, config);
      const ev   = EVENT_TYPES[entry.type] ?? { label: entry.type, color: "#888", icon: "?" };
      const isB  = entry.type === "bonus";
      const isUA = entry.type === "missed_unapproved";
      const ak   = entry.weekEnd && new Date(entry.weekEnd) >= new Date(config.k401StartDate);
      const isEditing = editId === entry.id;

      return <div key={entry.id} style={{ background: "#141414", border: `1px solid ${isEditing ? ev.color : ev.color + "33"}`, borderRadius: "8px", padding: "16px", marginBottom: "10px" }}>

        {isEditing ? (
          /* ── Inline edit form ── */
          <>
            <div style={{ fontSize: "11px", letterSpacing: "2px", color: ev.color, textTransform: "uppercase", marginBottom: "14px" }}>Edit Event</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <FormFields vals={editVals} set={setEditVals} onWeekEndChange={handleEditWeekEndChange} />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} style={{ background: "#6dbf8a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>SAVE</button>
              <button onClick={() => setEditId(null)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
            </div>
          </>
        ) : (
          /* ── Read view ── */
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", background: ev.color + "22", color: ev.color, padding: "2px 8px", borderRadius: "3px" }}>{ev.icon} {ev.label}</span>
                  <span style={{ fontSize: "11px", color: "#777" }}>{entry.weekRotation}</span>
                  {isUA && <span style={{ fontSize: "9px", background: "#e8622a22", color: "#e8622a", padding: "2px 6px", borderRadius: "3px", fontWeight: "bold" }}>⚠ BUCKET HIT</span>}
                  {ak   && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "3px" }}>401k</span>}
                </div>
                <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "2px" }}>Week ending {entry.weekEnd || "—"}</div>
                {entry.missedDays && <div style={{ fontSize: "11px", color: "#777" }}>Missed: {entry.missedDays}{entry.workedDays ? ` · Worked: ${entry.workedDays}` : ""}</div>}
                {entry.note && <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>{entry.note}</div>}
              </div>
              <div style={{ textAlign: "right", marginLeft: "16px" }}>
                <div style={{ fontSize: "18px", fontWeight: "bold", color: isB ? "#6dbf8a" : "#e8856a" }}>{isB ? "+" : "-"}{f(isB ? imp.grossGained : imp.grossLost)}</div>
                <div style={{ fontSize: "10px", color: "#666" }}>gross · proj {f(imp.baseGross)}</div>
                <div style={{ fontSize: "13px", color: isB ? "#6dbf8a" : "#e8856a", marginTop: "2px" }}>{isB ? "+" : "-"}{f(isB ? imp.netGained : imp.netLost)} net</div>
                {ak && imp.k401kLost > 0 && <div style={{ fontSize: "10px", color: "#7a8bbf", marginTop: "2px" }}>-{f(imp.k401kLost)} 401k</div>}
                {imp.hoursLostForPTO > 0 && <div style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}>-{(imp.hoursLostForPTO / 20).toFixed(2)} PTO accrual</div>}
                {isUA && <div style={{ fontSize: "10px", color: "#e8622a", marginTop: "2px" }}>-{imp.bucketHoursDeducted}h bucket</div>}
              </div>
            </div>
            <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "10px", color: "#666" }}>
                {entry.type === "missed_unpaid"     && `${entry.shiftsLost} shift(s) · ${entry.weekendShifts} wknd · ${entry.shiftsLost * config.shiftHours}h`}
                {entry.type === "missed_unapproved" && `${entry.hoursLost}h of ${config.shiftHours}h shift · unapproved`}
                {entry.type === "pto"               && `${entry.ptoHours}h PTO @ $${PTO_RATE}`}
                {entry.type === "partial"           && `${entry.hoursLost}h partial`}
                {entry.type === "bonus"             && `+${f(entry.amount)} bonus`}
                {entry.type === "other_loss"        && `-${f(entry.amount)} other`}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => startEdit(entry)} style={{ background: "transparent", border: "1px solid #444", color: "#999", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>EDIT</button>
                {cdel === entry.id
                  ? <>
                      <button onClick={() => { setLogs(p => p.filter(e => e.id !== entry.id)); setCdel(null); }} style={{ background: "#e8856a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CONFIRM</button>
                      <button onClick={() => setCdel(null)} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
                    </>
                  : <button onClick={() => setCdel(entry.id)} style={{ background: "transparent", border: "1px solid #333", color: "#555", borderRadius: "3px", padding: "4px 10px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>DELETE</button>
                }
              </div>
            </div>
          </>
        )}
      </div>;
    })}

    <div style={{ marginTop: "24px", padding: "12px", background: "#141414", borderRadius: "6px", fontSize: "10px", color: "#555", lineHeight: "2" }}>
      Missed shift loss = projected gross − actual gross (full OT collapse). Unapproved absence = hours × base rate + bucket deduction. FICA {(config.ficaRate * 100).toFixed(2)}% always applied. 401k impact only on events after {config.k401StartDate}. PTO still accrues while on PTO.
    </div>
  </div>);
}
