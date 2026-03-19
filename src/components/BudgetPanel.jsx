import { useState, useMemo, useEffect } from "react";
import { PHASES, CATEGORY_COLORS, CATEGORY_BG, FISCAL_YEAR_START } from "../constants/config.js";
import { getEffectiveAmount, computeGoalTimeline, computeLoanPayoffDate, buildLoanHistory, loanPaymentsRemaining, loanWeeklyAmount, loanRunwayStartDate, toLocalIso, getPhaseIndex } from "../lib/finance.js";
import { Card, VT, SmBtn, iS, lS } from "./ui.jsx";

export function BudgetPanel({ expenses, setExpenses, goals, setGoals, adjustedWeeklyAvg, baseWeeklyUnallocated, logNetLost, logNetGained, weeklyIncome, futureWeeks, currentWeek, today }) {
  // TODAY_ISO from App — reactive, advances at midnight automatically
  const TODAY_ISO = today;

  const currentPhaseIdx = useMemo(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0, [currentWeek]);
  const [ap, setAp] = useState(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0);
  const [view, setView] = useState("overview");
  // Expense CRUD state
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [addingExp, setAddingExp] = useState(false);
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", note: "" });
  const [delExpId, setDelExpId] = useState(null);
  // Loan CRUD state
  const [editLoanId, setEditLoanId] = useState(null);
  const [editLoanVals, setEditLoanVals] = useState({});
  const [addingLoan, setAddingLoan] = useState(false);
  const [newLoan, setNewLoan] = useState({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" });
  const [delLoanId, setDelLoanId] = useState(null);
  // Goal CRUD state
  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalVals, setEditGoalVals] = useState({});
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ label: "", target: "", color: "#c8a84b", note: "" });
  const [delGoalId, setDelGoalId] = useState(null);
  // Resolve the current effective amount for an expense at the active phase
  const currentEffective = (exp, phaseIdx) => getEffectiveAmount(exp, new Date(), phaseIdx);

  // Split loans from regular expenses for display purposes
  const loans = expenses.filter(e => e.type === "loan");
  const regularExpenses = expenses.filter(e => e.type !== "loan");

  const ph = PHASES[ap];
  const ts = expenses.filter(e => e.category !== "Transfers").reduce((s, e) => s + currentEffective(e, ap), 0);
  const wr = weeklyIncome - ts;
  const sp = Math.min((ts / weeklyIncome) * 100, 100);
  const cats = [...new Set(regularExpenses.map(e => e.category))];
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Fiscal year end for drop-off detection
  const fiscalYearEnd = futureWeeks?.length ? toLocalIso(futureWeeks[futureWeeks.length - 1].weekEnd) : "2027-01-04";

  // Expense helpers
  const startEditExp = (exp) => {
    const latest = exp.history?.length
      ? exp.history.reduce((b, e) => e.effectiveFrom > b.effectiveFrom ? e : b)
      : { weekly: exp.weekly ?? [0, 0, 0] };
    setEditId(exp.id);
    setEditVals({ p1: latest.weekly[0], p2: latest.weekly[1], p3: latest.weekly[2] });
  };
  const saveEditExp = (id) => {
    const newWeekly = [parseFloat(editVals.p1) || 0, parseFloat(editVals.p2) || 0, parseFloat(editVals.p3) || 0];
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0] }];
      const latest = existing.reduce((b, entry) => entry.effectiveFrom > b.effectiveFrom ? entry : b, existing[0]);
      const daysDiff = (new Date(TODAY_ISO) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 3) {
        return { ...e, history: existing.map(entry =>
          entry.effectiveFrom === latest.effectiveFrom
            ? { effectiveFrom: TODAY_ISO, weekly: newWeekly }
            : entry
        )};
      }
      return { ...e, history: [...existing, { effectiveFrom: TODAY_ISO, weekly: newWeekly }] };
    }));
    setEditId(null);
  };
  const addExp = () => {
    const p1 = parseFloat(newExp.p1) || 0, p2 = parseFloat(newExp.p2) || 0, p3 = parseFloat(newExp.p3) || 0;
    setExpenses(prev => [...prev, { id: `exp_${Date.now()}`, category: newExp.category, label: newExp.label, note: [newExp.note, newExp.note, newExp.note], history: [{ effectiveFrom: TODAY_ISO, weekly: [p1, p2, p3] }] }]);
    setAddingExp(false); setNewExp({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", note: "" });
  };
  const deleteExp = (id) => { setExpenses(p => p.filter(e => e.id !== id)); setDelExpId(null); };

  // Loan helpers
  const startEditLoan = (exp) => {
    setEditLoanId(exp.id);
    setEditLoanVals({ label: exp.label, note: exp.note[0] ?? "", ...exp.loanMeta });
  };
  const saveEditLoan = (id) => {
    const meta = {
      totalAmount: parseFloat(editLoanVals.totalAmount) || 0,
      paymentAmount: parseFloat(editLoanVals.paymentAmount) || 0,
      paymentFrequency: editLoanVals.paymentFrequency || "monthly",
      firstPaymentDate: editLoanVals.firstPaymentDate || TODAY_ISO,
    };
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      return { ...e, label: editLoanVals.label, note: [editLoanVals.note, editLoanVals.note, editLoanVals.note], loanMeta: meta, history: buildLoanHistory(meta) };
    }));
    setEditLoanId(null);
  };
  const addLoan = () => {
    const meta = {
      totalAmount: parseFloat(newLoan.totalAmount) || 0,
      paymentAmount: parseFloat(newLoan.paymentAmount) || 0,
      paymentFrequency: newLoan.paymentFrequency || "monthly",
      firstPaymentDate: newLoan.firstPaymentDate || TODAY_ISO,
    };
    setExpenses(prev => [...prev, {
      id: `loan_${Date.now()}`, type: "loan", category: "Loans",
      label: newLoan.label, note: [newLoan.note, newLoan.note, newLoan.note],
      loanMeta: meta, history: buildLoanHistory(meta)
    }]);
    setAddingLoan(false);
    setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" });
  };
  const deleteLoan = (id) => { setExpenses(p => p.filter(e => e.id !== id)); setDelLoanId(null); };

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

  const weeksLeft = futureWeeks?.length ?? 44;

  // Goal timeline — computed at component level so useEffect can read it
  const tl = useMemo(
    () => computeGoalTimeline(activeGoals, futureWeeks ?? [], weeklyIncome, expenses, logNetLost, logNetGained ?? 0),
    [activeGoals, futureWeeks, weeklyIncome, expenses, logNetLost, logNetGained]
  );

  // Auto-set dueWeek (fiscal week) on goals that have a projection but no stored due date
  useEffect(() => {
    if (!currentWeek) return;
    const needsUpdate = tl.filter(g => g.eW !== null && !g.dueWeek);
    if (!needsUpdate.length) return;
    setGoals(prev => prev.map(goal => {
      const match = needsUpdate.find(g => g.id === goal.id);
      return match ? { ...goal, dueWeek: currentWeek.idx + Math.ceil(match.eW) } : goal;
    }));
  }, [tl, currentWeek, setGoals]);

  return (<div>
    {/* Phase tabs */}
    <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
      {PHASES.map((p, i) => { const isCurrent = i === currentPhaseIdx; return <button key={p.id} onClick={() => setAp(i)} style={{ flex: 1, padding: "10px", borderRadius: "6px", cursor: "pointer", background: ap === i ? p.color : "#141414", color: ap === i ? "#0a0a0a" : "#666", border: "2px solid " + (ap === i ? p.color : isCurrent ? p.color + "55" : "#222"), fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", fontFamily: "'Courier New',monospace", position: "relative" }}>{isCurrent && ap !== i && <span style={{ position: "absolute", top: "5px", right: "6px", width: "6px", height: "6px", borderRadius: "50%", background: p.color }} />}{p.label}<br /><span style={{ fontSize: "9px", fontWeight: "normal" }}>{p.description}</span>{isCurrent && <span style={{ display: "block", fontSize: "8px", marginTop: "2px", opacity: ap === i ? 0.7 : 0.9 }}>● now</span>}</button>; })}
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
      {["overview", "breakdown", "cashflow", "goals", "loans"].map(v => <VT key={v} label={v} active={view === v} onClick={() => setView(v)} />)}
    </div>

    {/* OVERVIEW — expense list; loans rendered inside Needs */}
    {view === "overview" && <div>
      {cats.map(cat => {
        const cExp = regularExpenses.filter(e => e.category === cat);
        const loanItems = cat === "Needs" ? loans : [];
        const cTot = cExp.reduce((s, e) => s + currentEffective(e, ap), 0)
                   + loanItems.reduce((s, e) => s + currentEffective(e, ap), 0);
        return <div key={cat} style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "3px", color: CATEGORY_COLORS[cat], textTransform: "uppercase" }}>{cat}</div>
            <div style={{ fontSize: "12px", color: CATEGORY_COLORS[cat] }}>{f2(cTot)}/wk</div>
          </div>
          {cExp.map(exp => {
            const effAmt = currentEffective(exp, ap);
            const latestEntry = exp.history?.length ? exp.history.reduce((b, e) => e.effectiveFrom > b.effectiveFrom ? e : b) : null;
            return <div key={exp.id} style={{ background: CATEGORY_BG[cat], border: "1px solid #1e1e1e", borderRadius: "6px", padding: "10px 12px", marginBottom: "6px" }}>
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
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "#666" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "#555" }}>{f(effAmt * 52 / 12)}/mo</div>
                    {latestEntry && <div style={{ fontSize: "9px", color: "#444", marginTop: "1px" }}>since {latestEntry.effectiveFrom}</div>}
                  </div>
                  <SmBtn onClick={() => startEditExp(exp)}>EDIT</SmBtn>
                  {delExpId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteExp(exp.id)} c="#e8856a" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelExpId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelExpId(exp.id)} c="#e8856a">✕</SmBtn>}
                </div>
              </div>}
            </div>;
          })}
          {loanItems.map(exp => {
            const effAmt = currentEffective(exp, ap);
            const meta = exp.loanMeta;
            const payoffDate = meta ? computeLoanPayoffDate(meta) : null;
            const dropsOff = payoffDate && payoffDate <= fiscalYearEnd;
            const isPaidOff = payoffDate && payoffDate <= TODAY_ISO;
            const inRunway = meta && !isPaidOff && TODAY_ISO < meta.firstPaymentDate;
            const freq = meta ? (meta.paymentFrequency ?? meta.payFrequency ?? "weekly") : "weekly";
            const freqLabel = { weekly: "week", biweekly: "2 wks", monthly: "month" }[freq] ?? freq;
            return <div key={exp.id} style={{ background: CATEGORY_BG[cat], border: "1px solid #1e1e1e", borderRadius: "6px", padding: "10px 12px", marginBottom: "6px" }}>
              {editLoanId === exp.id ? <LoanEditForm vals={editLoanVals} setVals={setEditLoanVals} onSave={() => saveEditLoan(exp.id)} onCancel={() => setEditLoanId(null)} iS={iS} lS={lS} /> :
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "13px" }}>{exp.label}</span>
                    <span style={{ fontSize: "9px", background: "#c8a84b22", color: "#c8a84b", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span style={{ fontSize: "9px", color: "#6dbf8a" }}>✓ PAID OFF</span>}
                    {!isPaidOff && !inRunway && dropsOff && <span style={{ fontSize: "9px", color: "#6dbf8a" }}>drops off {payoffDate}</span>}
                  </div>
                  {meta && <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>
                    {inRunway
                      ? `saving toward ${meta.firstPaymentDate} · ${f(meta.paymentAmount ?? 0)}/${freqLabel} due`
                      : `${loanPaymentsRemaining(meta)} payments left · ${f(meta.paymentAmount ?? meta.paymentPerCheck ?? 0)}/${freqLabel} · ${f(meta.totalAmount)} total`
                    }
                  </div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: isPaidOff ? "#555" : CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "#666" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "#555" }}>{f(effAmt * 52 / 12)}/mo</div>
                  </div>
                  <SmBtn onClick={() => startEditLoan(exp)} c="#c8a84b">EDIT</SmBtn>
                  {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteLoan(exp.id)} c="#e8856a" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="#e8856a">✕</SmBtn>}
                </div>
              </div>}
            </div>;
          })}
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
        const cT = regularExpenses.filter(e => e.category === cat).reduce((s, e) => s + currentEffective(e, ap), 0);
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
        <tbody>{expenses.map(exp => {
          const amt = currentEffective(exp, ap);
          const isLoan = exp.type === "loan";
          return <tr key={exp.id} style={{ borderBottom: "1px solid #181818" }} onMouseEnter={e => e.currentTarget.style.background = "#141414"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <td style={{ padding: "8px 4px" }}>
              <span style={{ fontSize: "10px", color: isLoan ? "#c8a84b" : CATEGORY_COLORS[exp.category], marginRight: "6px" }}>▸</span>
              {exp.label}
              {isLoan && <span style={{ fontSize: "9px", background: "#c8a84b22", color: "#c8a84b", padding: "1px 4px", borderRadius: "2px", marginLeft: "5px" }}>LOAN</span>}
            </td>
            <td style={{ padding: "8px 4px", textAlign: "right", color: isLoan ? "#c8a84b" : CATEGORY_COLORS[exp.category] }}>{f2(amt)}</td>
            <td style={{ padding: "8px 4px", textAlign: "right", color: "#888" }}>{f(amt * 52 / 12)}</td>
            <td style={{ padding: "8px 4px", textAlign: "right", color: "#666" }}>{f(amt * 52)}</td>
          </tr>;
        })}</tbody>
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
      {(() => {
        const checkingTot = regularExpenses.filter(e => e.category !== "Transfers").reduce((s, e) => s + currentEffective(e, ap), 0);
        const checkingDesc = regularExpenses.filter(e => e.category !== "Transfers").map(e => e.label).join(", ");
        const loansTot = loans.reduce((s, e) => s + currentEffective(e, ap), 0);
        const loansDesc = loans.map(e => e.label).join(", ");
        const transferTot = regularExpenses.filter(e => e.category === "Transfers").reduce((s, e) => s + currentEffective(e, ap), 0);
        const transferDesc = regularExpenses.filter(e => e.category === "Transfers").map(e => e.label).join(", ");
        return <>
          <div style={{ background: CATEGORY_BG["Needs"], border: "1px solid #222", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"], marginBottom: "4px" }}>Checking Needs</div><div style={{ fontSize: "10px", color: "#666" }}>{checkingDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"] }}>{f2(checkingTot)}</div><div style={{ fontSize: "10px", color: "#555" }}>{((checkingTot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
          </div>
          {loans.length > 0 && <div style={{ background: "#1a1a14", border: "1px solid #222", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: "#c8a84b", marginBottom: "4px" }}>Loans</div><div style={{ fontSize: "10px", color: "#666" }}>{loansDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: "#c8a84b" }}>{f2(loansTot)}</div><div style={{ fontSize: "10px", color: "#555" }}>{((loansTot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
          </div>}
          <div style={{ background: CATEGORY_BG["Transfers"], border: "1px solid #222", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: CATEGORY_COLORS["Transfers"], marginBottom: "4px" }}>CashApp Transfer</div><div style={{ fontSize: "10px", color: "#666" }}>{transferDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS["Transfers"] }}>{f2(transferTot)}</div><div style={{ fontSize: "10px", color: "#555" }}>{((transferTot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
          </div>
        </>;
      })()}
      <div style={{ background: wr >= 0 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${wr >= 0 ? "#6dbf8a" : "#e8856a"}`, borderRadius: "6px", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: wr >= 0 ? "#6dbf8a" : "#e8856a", marginBottom: "4px" }}>Unallocated / Savings</div><div style={{ fontSize: "10px", color: "#666" }}>See Goals view for event-adjusted timeline</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: wr >= 0 ? "#6dbf8a" : "#e8856a" }}>{f2(wr)}</div><div style={{ fontSize: "10px", color: "#666" }}>{f(wr * 52 / 12)}/mo</div></div></div>
      </div>
    </div>}

    {/* GOALS */}
    {view === "goals" && (() => {
      const nowIdx = currentWeek?.idx ?? 0;
      const totG = goals.reduce((s, g) => !g.completed ? s + g.target : s, 0);
      const projS = adjustedWeeklyAvg * weeksLeft;
      const lastGoalEW = tl.length ? (tl[tl.length - 1].eW ?? weeksLeft + 1) : 0;
      return <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "20px" }}>
          <Card label="Adj. Weekly Available" val={f2(adjustedWeeklyAvg)} color="#6dbf8a" />
          <Card label="Active Goals Total" val={f(totG)} color="#c8a84b" />
          <Card label="Weeks to Complete All" val={`~${Math.ceil(lastGoalEW)} wks`} color={projS >= totG ? "#6dbf8a" : "#e8856a"} />
        </div>
        {adjustedWeeklyAvg < baseWeeklyUnallocated && <div style={{ background: "#2d1a1a", border: "1px solid #e8856a44", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "#888" }}>Event log reduced avg by <span style={{ color: "#e8856a", fontWeight: "bold" }}>{f2(baseWeeklyUnallocated - adjustedWeeklyAvg)}/wk</span></div>}

        {tl.map((g, i) => {
          const ok = g.eW !== null && g.eW <= weeksLeft;
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
                  <div style={{ fontSize: "10px", color: ok ? "#6dbf8a" : "#e8856a" }}>{ok ? `Wk ${nowIdx + Math.ceil(g.eW)} of 52` : `Wk ${nowIdx + Math.ceil(g.sW + g.wN)} of 52`}</div>
                  {g.dueWeek && nowIdx > g.dueWeek && <div style={{ fontSize: "9px", color: "#e8856a", background: "#2d1a1a", padding: "2px 6px", borderRadius: "3px", marginTop: "3px", letterSpacing: "1px" }}>PAST DUE · Wk {g.dueWeek}</div>}
                </div>
              </div>
              <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden", marginBottom: "4px" }}><div style={{ position: "relative", left: `${Math.min((g.sW / weeksLeft) * 100, 100)}%`, width: `${Math.min((g.wN / weeksLeft) * 100, 100 - (g.sW / weeksLeft) * 100)}%`, height: "100%", background: g.color, borderRadius: "3px", opacity: ok ? 1 : 0.4 }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#555", marginBottom: "10px" }}><span>Wk {nowIdx}</span><span>Wk 52</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <div style={{ fontSize: "10px", color: "#666" }}><span style={{ color: g.color }}>{f2(adjustedWeeklyAvg)}/wk</span> · {g.wN.toFixed(1)} weeks to fund</div>
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

        <div style={{ background: "#1a2d1e", border: "1px solid #6dbf8a", borderRadius: "8px", padding: "16px", marginTop: "8px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#6dbf8a", textTransform: "uppercase", marginBottom: "10px" }}>Year-End Outlook</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
            <div style={{ color: "#888" }}>Weeks remaining</div><div style={{ textAlign: "right" }}>{weeksLeft}</div>
            <div style={{ color: "#888" }}>Adj. projected savings</div><div style={{ textAlign: "right", color: "#6dbf8a" }}>{f(projS)}</div>
            <div style={{ color: "#888" }}>Active goals total</div><div style={{ textAlign: "right", color: "#c8a84b" }}>{f(totG)}</div>
            <div style={{ color: "#888" }}>Surplus after all goals</div><div style={{ textAlign: "right", color: projS - totG >= 0 ? "#6dbf8a" : "#e8856a" }}>{f(projS - totG)}</div>
          </div>
          <div style={{ borderTop: "1px solid #6dbf8a33", marginTop: "12px", paddingTop: "12px", display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setGoals(prev => prev.map(({ dueWeek, ...rest }) => rest))} style={{ background: "transparent", color: "#6dbf8a66", border: "1px solid #6dbf8a33", borderRadius: "3px", padding: "5px 10px", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", whiteSpace: "nowrap" }}>Reset Timelines</button>
            <div style={{ fontSize: "9px", color: "#444" }}>Clears stored due dates — re-anchors all projections to current week</div>
          </div>
        </div>
      </div>;
    })()}

    {/* LOANS TAB */}
    {view === "loans" && (() => {
      const totalOwed = loans.reduce((s, e) => s + (e.loanMeta?.totalAmount ?? 0), 0);
      const weeklyCommitted = loans.reduce((s, e) => s + currentEffective(e, ap), 0);
      const allPayoffDates = loans.map(e => e.loanMeta ? computeLoanPayoffDate(e.loanMeta) : null).filter(Boolean);
      const debtFreeDate = allPayoffDates.length ? allPayoffDates.reduce((a, b) => a > b ? a : b) : null;
      const weeksToDebtFree = debtFreeDate ? Math.max(Math.ceil((new Date(debtFreeDate) - new Date(TODAY_ISO)) / (7 * 24 * 60 * 60 * 1000)), 0) : 0;

      return <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "20px" }}>
          <Card label="Total Loan Balance" val={f(totalOwed)} color="#c8a84b" />
          <Card label="Weekly Committed" val={f2(weeklyCommitted)} color="#e8856a" />
          <Card label="Debt-Free In" val={debtFreeDate ? `${weeksToDebtFree} wks` : "—"} color={debtFreeDate && debtFreeDate <= fiscalYearEnd ? "#6dbf8a" : "#c8a84b"} />
        </div>

        {loans.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "#444", fontSize: "12px", letterSpacing: "1px" }}>No active loans. Add one below.</div>}

        {loans.map(exp => {
          const meta = exp.loanMeta;
          if (!meta) return null;
          const payoffDate = computeLoanPayoffDate(meta);
          const payAmt = meta.paymentAmount ?? meta.paymentPerCheck ?? 0;
          const paymentsTotal = payAmt > 0 ? Math.ceil(meta.totalAmount / payAmt) : 0;
          const paymentsLeft = loanPaymentsRemaining(meta);
          const paymentsMade = paymentsTotal - paymentsLeft;
          const progressPct = paymentsTotal > 0 ? Math.min((paymentsMade / paymentsTotal) * 100, 100) : 0;
          const dropsThisYear = payoffDate <= fiscalYearEnd;
          const isPaidOff = payoffDate <= TODAY_ISO;
          const weeklyAmt = currentEffective(exp, ap);
          const isEditing = editLoanId === exp.id;
          const inRunway = !isPaidOff && TODAY_ISO < meta.firstPaymentDate;
          const weeksUntilPayoff = Math.max(Math.ceil((new Date(payoffDate) - new Date(TODAY_ISO)) / (7 * 24 * 60 * 60 * 1000)), 0);
          const weeksUntilFirst = Math.max(Math.ceil((new Date(meta.firstPaymentDate) - new Date(TODAY_ISO)) / (7 * 24 * 60 * 60 * 1000)), 0);
          const freqShort = { weekly: "wk", biweekly: "2wks", monthly: "mo" }[(meta.paymentFrequency ?? meta.payFrequency ?? "weekly")];

          return <div key={exp.id} style={{ background: "#141414", border: `1px solid ${isPaidOff ? "#6dbf8a44" : inRunway ? "#7a8bbf44" : "#c8a84b33"}`, borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
            {isEditing ? <LoanEditForm vals={editLoanVals} setVals={setEditLoanVals} onSave={() => saveEditLoan(exp.id)} onCancel={() => setEditLoanId(null)} iS={iS} lS={lS} /> :
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>{exp.label}</span>
                    <span style={{ fontSize: "9px", background: "#c8a84b22", color: "#c8a84b", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span style={{ fontSize: "9px", background: "#6dbf8a22", color: "#6dbf8a", padding: "2px 6px", borderRadius: "2px" }}>✓ PAID OFF</span>}
                  </div>
                  {exp.note[0] && <div style={{ fontSize: "10px", color: "#666" }}>{exp.note[0]}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: isPaidOff ? "#555" : inRunway ? "#7a8bbf" : "#c8a84b" }}>{f2(weeklyAmt)}<span style={{ fontSize: "10px", color: "#666" }}>/wk</span></div>
                  <div style={{ fontSize: "10px", color: "#666" }}>{f(meta.totalAmount)} total</div>
                </div>
              </div>

              {/* Progress bar — during runway shows savings progress toward first payment */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#666", marginBottom: "4px" }}>
                  {inRunway
                    ? <span>saving toward first payment · {weeksUntilFirst} week{weeksUntilFirst !== 1 ? "s" : ""} away</span>
                    : <span>{paymentsMade} of {paymentsTotal} payments made</span>
                  }
                  <span>{inRunway ? "pre-save" : `${progressPct.toFixed(0)}%`}</span>
                </div>
                <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: inRunway ? "100%" : `${progressPct}%`, background: isPaidOff ? "#6dbf8a" : inRunway ? "#7a8bbf" : "#c8a84b", borderRadius: "3px", transition: "width 0.3s", opacity: inRunway ? 0.5 : 1 }} />
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "11px", marginBottom: "10px" }}>
                <div style={{ background: "#1a1a1a", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "9px", marginBottom: "2px" }}>{inRunway ? "FIRST PAYMENT" : "PAYMENTS LEFT"}</div>
                  <div style={{ color: inRunway ? "#7a8bbf" : isPaidOff ? "#6dbf8a" : "#e8e0d0", fontWeight: "bold", fontSize: "10px" }}>{inRunway ? meta.firstPaymentDate : paymentsLeft}</div>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "9px", marginBottom: "2px" }}>PAYOFF DATE</div>
                  <div style={{ color: dropsThisYear ? "#6dbf8a" : "#e8e0d0", fontWeight: "bold", fontSize: "10px" }}>{payoffDate}</div>
                </div>
                <div style={{ background: "#1a1a1a", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "9px", marginBottom: "2px" }}>TERM PAYMENT</div>
                  <div style={{ color: "#e8e0d0", fontWeight: "bold", fontSize: "10px" }}>{f2(payAmt)} / {freqShort}</div>
                </div>
              </div>

              {/* Runway banner */}
              {inRunway && <div style={{ background: "#1a1a2d", border: "1px solid #7a8bbf44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", fontSize: "10px", color: "#7a8bbf" }}>
                Setting aside {f2(weeklyAmt)}/wk — {weeksUntilFirst} check{weeksUntilFirst !== 1 ? "s" : ""} until first {f2(payAmt)}/{freqShort} payment on {meta.firstPaymentDate}
              </div>}

              {/* Drop-off banner */}
              {!isPaidOff && !inRunway && dropsThisYear && <div style={{ background: "#1a2d1e", border: "1px solid #6dbf8a44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", fontSize: "10px", color: "#6dbf8a" }}>
                ✓ Drops off in {weeksUntilPayoff} weeks — goals auto-improve after payoff
              </div>}

              {/* Actions */}
              <div style={{ display: "flex", gap: "6px", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <SmBtn onClick={() => startEditLoan(exp)} c="#c8a84b">EDIT</SmBtn>
                {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                  <SmBtn onClick={() => deleteLoan(exp.id)} c="#e8856a" bg="#2d1a1a">DEL</SmBtn>
                  <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="#e8856a">✕</SmBtn>}
              </div>
            </div>}
          </div>;
        })}

        {/* Add loan form */}
        {addingLoan ? <div style={{ background: "#141414", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "16px" }}>New Loan</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Loan Name</label><input type="text" value={newLoan.label} onChange={e => setNewLoan(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Note" /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Total Amount Owed ($)</label><input type="number" value={newLoan.totalAmount} onChange={e => setNewLoan(v => ({ ...v, totalAmount: e.target.value }))} style={iS} placeholder="2400" /></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lS}>Term Payment</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#666", fontSize: "13px" }}>$</span>
                <input type="number" value={newLoan.paymentAmount} onChange={e => setNewLoan(v => ({ ...v, paymentAmount: e.target.value }))} style={{ ...iS, flex: 1 }} placeholder="150" />
                <span style={{ color: "#666", fontSize: "12px", whiteSpace: "nowrap" }}>every</span>
                <select value={newLoan.paymentFrequency} onChange={e => setNewLoan(v => ({ ...v, paymentFrequency: e.target.value }))} style={{ ...iS, flex: 1 }}>
                  <option value="monthly">Month</option>
                  <option value="biweekly">Two Weeks</option>
                  <option value="weekly">Week</option>
                </select>
              </div>
            </div>
            <div><label style={lS}>First Payment Date</label><input type="date" value={newLoan.firstPaymentDate} onChange={e => setNewLoan(v => ({ ...v, firstPaymentDate: e.target.value }))} style={iS} /></div>
            <div><label style={lS}>Note (optional)</label><input type="text" value={newLoan.note} onChange={e => setNewLoan(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="e.g. Jesse's loan" /></div>
          </div>
          {newLoan.totalAmount && newLoan.paymentAmount && newLoan.firstPaymentDate && (() => {
            const meta = { totalAmount: parseFloat(newLoan.totalAmount) || 0, paymentAmount: parseFloat(newLoan.paymentAmount) || 0, paymentFrequency: newLoan.paymentFrequency, firstPaymentDate: newLoan.firstPaymentDate };
            if (meta.totalAmount <= 0 || meta.paymentAmount <= 0) return null;
            const payoff = computeLoanPayoffDate(meta);
            const total = Math.ceil(meta.totalAmount / meta.paymentAmount);
            const weeklyAmt = loanWeeklyAmount(meta);
            const freqLabel = { weekly: "week", biweekly: "2 weeks", monthly: "month" }[meta.paymentFrequency];
            return <div style={{ background: "#1a1a14", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", fontSize: "11px" }}>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                <span style={{ color: "#666" }}>Weekly cost: <span style={{ color: "#c8a84b", fontWeight: "bold" }}>{f2(weeklyAmt)}/wk</span></span>
                <span style={{ color: "#666" }}>{total} payments ({freqLabel})</span>
                <span style={{ color: "#666" }}>Payoff: <span style={{ color: payoff <= fiscalYearEnd ? "#6dbf8a" : "#e8e0d0" }}>{payoff}</span></span>
              </div>
            </div>;
          })()}
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addLoan} disabled={!newLoan.label || !newLoan.totalAmount || !newLoan.paymentAmount} style={{ background: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "#6dbf8a" : "#333", color: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "#0d0d0d" : "#666", border: "none", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "pointer" : "default", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>ADD LOAN</button>
            <button onClick={() => { setAddingLoan(false); setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" }); }} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
          </div>
        </div> : <button onClick={() => setAddingLoan(true)} style={{ background: "#1a1a14", color: "#c8a84b", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", marginBottom: "16px" }}>+ ADD LOAN</button>}
      </div>;
    })()}
  </div>);
}

// Shared loan edit form (used in both overview and loans tab)
function LoanEditForm({ vals, setVals, onSave, onCancel, iS, lS }) {
  return <div>
    <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "12px" }}>Edit Loan</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
      <div style={{ gridColumn: "1/-1" }}><label style={lS}>Loan Name</label><input type="text" value={vals.label ?? ""} onChange={e => setVals(v => ({ ...v, label: e.target.value }))} style={iS} /></div>
      <div style={{ gridColumn: "1/-1" }}><label style={lS}>Total Amount ($)</label><input type="number" value={vals.totalAmount ?? ""} onChange={e => setVals(v => ({ ...v, totalAmount: e.target.value }))} style={iS} /></div>
      <div style={{ gridColumn: "1/-1" }}>
        <label style={lS}>Term Payment</label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ color: "#666", fontSize: "13px" }}>$</span>
          <input type="number" value={vals.paymentAmount ?? vals.paymentPerCheck ?? ""} onChange={e => setVals(v => ({ ...v, paymentAmount: e.target.value }))} style={{ ...iS, flex: 1 }} placeholder="150" />
          <span style={{ color: "#666", fontSize: "12px", whiteSpace: "nowrap" }}>every</span>
          <select value={vals.paymentFrequency ?? vals.payFrequency ?? "monthly"} onChange={e => setVals(v => ({ ...v, paymentFrequency: e.target.value }))} style={{ ...iS, flex: 1 }}>
            <option value="monthly">Month</option>
            <option value="biweekly">Two Weeks</option>
            <option value="weekly">Week</option>
          </select>
        </div>
      </div>
      <div><label style={lS}>First Payment Date</label><input type="date" value={vals.firstPaymentDate ?? ""} onChange={e => setVals(v => ({ ...v, firstPaymentDate: e.target.value }))} style={iS} /></div>
      <div><label style={lS}>Note</label><input type="text" value={vals.note ?? ""} onChange={e => setVals(v => ({ ...v, note: e.target.value }))} style={iS} /></div>
    </div>
    <div style={{ display: "flex", gap: "8px" }}>
      <button onClick={onSave} style={{ background: "#6dbf8a", color: "#0d0d0d", border: "none", borderRadius: "3px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace", fontWeight: "bold" }}>SAVE</button>
      <button onClick={onCancel} style={{ background: "#222", color: "#888", border: "1px solid #333", borderRadius: "3px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>CANCEL</button>
    </div>
  </div>;
}
