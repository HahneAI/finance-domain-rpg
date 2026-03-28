import { useState, useMemo, useEffect } from "react";
import { PHASES, CATEGORY_COLORS, CATEGORY_BG, FISCAL_YEAR_START } from "../constants/config.js";
import { getEffectiveAmount, computeGoalTimeline, computeLoanPayoffDate, buildLoanHistory, loanPaymentsRemaining, loanWeeklyAmount, loanRunwayStartDate, toLocalIso, getPhaseIndex } from "../lib/finance.js";
import { Card, VT, SmBtn, SH, iS, lS } from "./ui.jsx";

// TODO: tune — total particle count (12); must divide evenly into rings below
// 12 particles evenly distributed around 360°, two distance rings, cycling symbols
const BURST_PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const r = i % 2 === 0 ? 60 : 88; // TODO: tune — inner ring (60px) and outer ring (88px) radii
  return {
    dx: Math.round(Math.cos(angle) * r),
    dy: Math.round(Math.sin(angle) * r),
    symbol: ['$', '✓', '▪', '+', '◆', '▸', '$', '✓', '▪', '+', '◆', '▸'][i], // TODO: tune — particle symbols; swap for other chars
    delay: `${(i % 4) * 0.04}s`, // TODO: tune — stagger step (0.04s); raise for more wave-like spread
  };
});

const GOAL_LANES = {
  Expenses: {
    tint: "rgba(217, 112, 112, 0.16)",
    border: "rgba(217, 112, 112, 0.45)",
    text: "#d97070",
  },
  Lifestyle: {
    tint: "rgba(122, 139, 191, 0.16)",
    border: "rgba(122, 139, 191, 0.45)",
    text: "#7a8bbf",
  },
};

export function BudgetPanel({ expenses, setExpenses, goals, setGoals, adjustedWeeklyAvg, baseWeeklyUnallocated, logNetLost, logNetGained, weeklyIncome, futureWeeks, futureWeekNets, futureEventDeductions, currentWeek, today }) {
  // TODAY_ISO from App — reactive, advances at midnight automatically
  const TODAY_ISO = today;

  const currentPhaseIdx = useMemo(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0, [currentWeek]);
  const [ap, setAp] = useState(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0);
  const [view, setView] = useState("overview");
  // Expense CRUD state
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [addingExp, setAddingExp] = useState(false);
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", p4: "0", note: "" });
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
  const [newGoal, setNewGoal] = useState({ label: "", target: "", color: "var(--color-gold)", note: "", category: "Expenses" });
  const [delGoalId, setDelGoalId] = useState(null);
  const [draggingGoalId, setDraggingGoalId] = useState(null);
  const [dragOverGoalId, setDragOverGoalId] = useState(null);
  const [dragPreviewCategory, setDragPreviewCategory] = useState(null);
  // Resolve the current effective amount for an expense at the active phase
  const currentEffective = (exp, phaseIdx) => getEffectiveAmount(exp, new Date(), phaseIdx);

  // Full-year annual cost: sums across all 4 quarters using a representative date per quarter.
  // Using a date within each quarter means getEffectiveAmount picks the correct history entry —
  // loans that pay off mid-year will return $0 for quarters after the payoff date.
  const Q_REP_DATES = [new Date("2026-02-15"), new Date("2026-05-15"), new Date("2026-08-15"), new Date("2026-11-15")];
  const WEEKS_PER_Q = [13, 13, 13, 13]; // 52 weeks total
  const yearlyExpenseCost = (exp) =>
    [0, 1, 2, 3].reduce((s, q) => s + getEffectiveAmount(exp, Q_REP_DATES[q], q) * WEEKS_PER_Q[q], 0);

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
      : { weekly: exp.weekly ?? [0, 0, 0, 0] };
    setEditId(exp.id);
    setEditVals({ p1: latest.weekly[0], p2: latest.weekly[1], p3: latest.weekly[2], p4: latest.weekly[3] ?? latest.weekly[2] ?? 0 });
  };
  const saveEditExp = (id) => {
    const newWeekly = [parseFloat(editVals.p1) || 0, parseFloat(editVals.p2) || 0, parseFloat(editVals.p3) || 0, parseFloat(editVals.p4) || 0];
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
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
    const p1 = parseFloat(newExp.p1) || 0, p2 = parseFloat(newExp.p2) || 0, p3 = parseFloat(newExp.p3) || 0, p4 = parseFloat(newExp.p4) || 0;
    setExpenses(prev => [...prev, { id: `exp_${Date.now()}`, category: newExp.category, label: newExp.label, note: [newExp.note, newExp.note, newExp.note, newExp.note], history: [{ effectiveFrom: TODAY_ISO, weekly: [p1, p2, p3, p4] }] }]);
    setAddingExp(false); setNewExp({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", p4: "0", note: "" });
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
  const activeGoals = goals.filter(g => !g.completed).map(g => ({ ...g, category: g.category === "Lifestyle" ? "Lifestyle" : "Expenses" }));
  const completedGoals = goals.filter(g => g.completed);
  const startEditGoal = (g) => { setEditGoalId(g.id); setEditGoalVals({ label: g.label, target: g.target, color: g.color, note: g.note, category: g.category === "Lifestyle" ? "Lifestyle" : "Expenses" }); };
  const saveEditGoal = (id) => {
    setGoals(p => p.map(g => g.id === id ? {
      ...g,
      ...editGoalVals,
      category: editGoalVals.category === "Lifestyle" ? "Lifestyle" : "Expenses",
      target: parseFloat(editGoalVals.target) || 0,
    } : g));
    setEditGoalId(null);
  };
  const addGoal = () => {
    setGoals(p => [...p, {
      id: `g_${Date.now()}`,
      label: newGoal.label,
      target: parseFloat(newGoal.target) || 0,
      color: newGoal.color || "var(--color-gold)",
      note: newGoal.note,
      category: newGoal.category === "Lifestyle" ? "Lifestyle" : "Expenses",
      completed: false
    }]);
    setAddingGoal(false); setNewGoal({ label: "", target: "", color: "var(--color-gold)", note: "", category: "Expenses" });
  };
  const deleteGoal = (id) => { setGoals(p => p.filter(g => g.id !== id)); setDelGoalId(null); };
  const toggleComplete = (id) => setGoals(p => p.map(g => g.id === id ? { ...g, completed: !g.completed } : g));
  const [fundingId, setFundingId] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const handleMarkDone = (id) => {
    setFundingId(id);
    // TODO: tune — total celebration window (1800ms); must be >= longest CSS animation
    setTimeout(() => {
      setGoals(p => p.map(g => g.id === id ? { ...g, completed: true, completedAt: new Date().toISOString() } : g));
      setFundingId(null);
      setShowCompleted(true);
    }, 1800);
  };
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
  const reorderGoalByDrag = (draggedId, overId, lane) => {
    setGoals(prev => {
      const active = prev.filter(g => !g.completed).map(g => ({ ...g, category: g.category === "Lifestyle" ? "Lifestyle" : "Expenses" }));
      const completed = prev.filter(g => g.completed);
      const dragged = active.find(g => g.id === draggedId);
      if (!dragged) return prev;

      const targetLane = lane ?? dragged.category;
      const activeWithoutDragged = active.filter(g => g.id !== draggedId);
      const draggedNext = { ...dragged, category: targetLane };

      let insertIndex = activeWithoutDragged.length;
      if (overId) {
        const overIndex = activeWithoutDragged.findIndex(g => g.id === overId);
        if (overIndex !== -1) insertIndex = overIndex;
      } else {
        const laneLastIndex = activeWithoutDragged.reduce((lastIdx, goal, idx) =>
          goal.category === targetLane ? idx : lastIdx, -1);
        insertIndex = laneLastIndex + 1;
      }

      const reordered = [...activeWithoutDragged];
      reordered.splice(insertIndex, 0, draggedNext);
      return [...reordered, ...completed];
    });
  };
  const onGoalDragStart = (goal) => {
    setDraggingGoalId(goal.id);
    setDragPreviewCategory(goal.category);
  };
  const onGoalDragEnd = () => {
    setDraggingGoalId(null);
    setDragOverGoalId(null);
    setDragPreviewCategory(null);
  };

  const weeksLeft = futureWeeks?.length ?? 44;

  // Goal timeline — computed at component level so useEffect can read it
  const tl = useMemo(
    () => computeGoalTimeline(activeGoals, futureWeeks ?? [], futureWeekNets ?? [], expenses, logNetLost, logNetGained ?? 0, futureEventDeductions ?? {}),
    [activeGoals, futureWeeks, futureWeekNets, expenses, logNetLost, logNetGained, futureEventDeductions]
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
      {PHASES.map((p, i) => { const isCurrent = i === currentPhaseIdx; return <button key={p.id} onClick={() => setAp(i)} style={{ flex: 1, padding: "10px", borderRadius: "6px", cursor: "pointer", background: ap === i ? p.color : "var(--color-bg-surface)", color: ap === i ? "#0a0a0a" : "#666", border: "2px solid " + (ap === i ? p.color : isCurrent ? p.color + "55" : "#222"), fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", position: "relative" }}>{isCurrent && ap !== i && <span style={{ position: "absolute", top: "5px", right: "6px", width: "6px", height: "6px", borderRadius: "50%", background: p.color }} />}{p.label}<br /><span style={{ fontSize: "9px", fontWeight: "normal" }}>{p.description}</span>{isCurrent && <span style={{ display: "block", fontSize: "8px", marginTop: "2px", opacity: ap === i ? 0.7 : 0.9 }}>● now</span>}</button>; })}
    </div>
    {/* Summary cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "16px" }}>
      <Card label="Weekly Income" val={f2(weeklyIncome)} color="#7eb8c9" />
      <Card label="Weekly Spend" val={f2(ts)} color="var(--color-red)" />
      <Card label="Weekly Left" val={f2(wr)} color={wr >= 0 ? "var(--color-green)" : "var(--color-red)"} />
    </div>
    {logNetLost > 0 && <div style={{ background: "#1a1a2d", border: "1px solid #7a8bbf44", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
      <span style={{ color: "var(--color-text-secondary)" }}>Adj. weekly unallocated (after events):</span>
      <span style={{ fontWeight: "bold", color: "var(--color-gold)" }}>{f2(adjustedWeeklyAvg)}/wk</span>
    </div>}
    {/* Spend bar */}
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#aaa", marginBottom: "6px" }}><span>SPEND vs INCOME</span><span style={{ color: sp > 90 ? "var(--color-red)" : "var(--color-green)" }}>{sp.toFixed(1)}%</span></div>
      <div style={{ height: "8px", background: "#1e1e1e", borderRadius: "4px", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: "4px", width: `${sp}%`, background: sp > 90 ? "var(--color-red)" : sp > 70 ? "var(--color-gold)" : "var(--color-green)", transition: "width 0.3s" }} /></div>
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
          <SH color={CATEGORY_COLORS[cat]} right={f2(cTot) + "/wk"}>{cat}</SH>
          {cExp.map(exp => {
            const effAmt = currentEffective(exp, ap);
            const latestEntry = exp.history?.length ? exp.history.reduce((b, e) => e.effectiveFrom > b.effectiveFrom ? e : b) : null;
            return <div key={exp.id} style={{ background: CATEGORY_BG[cat], border: "1px solid #1e1e1e", borderRadius: "6px", padding: "10px 12px", marginBottom: "6px" }}>
              {editId === exp.id ? <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>{exp.label}</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(80px,1fr))", gap: "6px" }}>
                  {["p1", "p2", "p3", "p4"].map((k, i) => <div key={k} style={{ textAlign: "center" }}><div style={{ fontSize: "9px", color: PHASES[i].color, marginBottom: "2px" }}>{PHASES[i].label}/wk</div><input type="number" value={editVals[k] ?? 0} onChange={e => setEditVals(v => ({ ...v, [k]: e.target.value }))} style={{ ...iS, width: "100%" }} /></div>)}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => saveEditExp(exp.id)} style={{ background: "var(--color-green)", color: "#0a0a0a", border: "none", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontSize: "10px", flex: 1 }}>SAVE</button>
                  <button onClick={() => setEditId(null)} style={{ background: "var(--color-border-subtle)", color: "var(--color-text-secondary)", border: "none", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontSize: "10px", }}>✕</button>
                </div>
              </div> : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: "13px" }}>{exp.label}</div>{exp.note[ap] && <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{exp.note[ap]}</div>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "#777" }}>{f(effAmt * 52 / 12)}/mo</div>
                    {latestEntry && <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginTop: "1px" }}>since {latestEntry.effectiveFrom}</div>}
                  </div>
                  <SmBtn onClick={() => startEditExp(exp)}>EDIT</SmBtn>
                  {delExpId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteExp(exp.id)} c="var(--color-red)" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelExpId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelExpId(exp.id)} c="var(--color-red)">✕</SmBtn>}
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
                    <span style={{ fontSize: "9px", background: "rgba(201,168,76,0.13)", color: "var(--color-gold)", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span style={{ fontSize: "9px", color: "var(--color-green)" }}>✓ PAID OFF</span>}
                    {!isPaidOff && !inRunway && dropsOff && <span style={{ fontSize: "9px", color: "var(--color-green)" }}>drops off {payoffDate}</span>}
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
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: isPaidOff ? "#555" : CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "#777" }}>{f(effAmt * 52 / 12)}/mo</div>
                  </div>
                  <SmBtn onClick={() => startEditLoan(exp)} c="var(--color-gold)">EDIT</SmBtn>
                  {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteLoan(exp.id)} c="var(--color-red)" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="var(--color-red)">✕</SmBtn>}
                </div>
              </div>}
            </div>;
          })}
        </div>;
      })}

      {/* Add expense form */}
      {addingExp ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>New Expense Line</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div><label style={lS}>Label</label><input type="text" value={newExp.label} onChange={e => setNewExp(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Insurance" /></div>
          <div><label style={lS}>Category</label><select value={newExp.category} onChange={e => setNewExp(v => ({ ...v, category: e.target.value }))} style={iS}><option>Needs</option><option>Lifestyle</option><option>Transfers</option></select></div>
          <div><label style={{ ...lS, color: PHASES[0].color }}>Jan–Mar Weekly ($)</label><input type="number" value={newExp.p1} onChange={e => setNewExp(v => ({ ...v, p1: e.target.value }))} style={iS} /></div>
          <div><label style={{ ...lS, color: PHASES[1].color }}>Apr–Jun Weekly ($)</label><input type="number" value={newExp.p2} onChange={e => setNewExp(v => ({ ...v, p2: e.target.value }))} style={iS} /></div>
          <div><label style={{ ...lS, color: PHASES[2].color }}>Jul–Sep Weekly ($)</label><input type="number" value={newExp.p3} onChange={e => setNewExp(v => ({ ...v, p3: e.target.value }))} style={iS} /></div>
          <div><label style={{ ...lS, color: PHASES[3].color }}>Oct–Dec Weekly ($)</label><input type="number" value={newExp.p4} onChange={e => setNewExp(v => ({ ...v, p4: e.target.value }))} style={iS} /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note (optional)</label><input type="text" value={newExp.note} onChange={e => setNewExp(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="Short description" /></div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={addExp} disabled={!newExp.label} style={{ background: newExp.label ? "var(--color-green)" : "var(--color-border-subtle)", color: newExp.label ? "var(--color-bg-base)" : "#666", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: newExp.label ? "pointer" : "default", fontWeight: "bold" }}>ADD</button>
          <button onClick={() => { setAddingExp(false); setNewExp({ label: "", category: "Needs", p1: "0", p2: "0", p3: "0", p4: "0", note: "" }); }} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
        </div>
      </div> : <button onClick={() => setAddingExp(true)} style={{ background: "var(--color-bg-surface)", color: "var(--color-gold)", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD EXPENSE LINE</button>}
    </div>}

    {/* BREAKDOWN */}
    {view === "breakdown" && (() => {
      // Full-year figures — independent of the selected quarter tab
      const tsAnnual = expenses.filter(e => e.category !== "Transfers").reduce((s, e) => s + yearlyExpenseCost(e), 0);
      const tsWeeklyAvg = tsAnnual / 52;
      const wrAnnual = weeklyIncome * 52 - tsAnnual;
      const wrWeeklyAvg = wrAnnual / 52;
      return <div>
        {cats.filter(c => c !== "Transfers").map(cat => {
          const cT = regularExpenses.filter(e => e.category === cat).reduce((s, e) => s + yearlyExpenseCost(e) / 52, 0);
          const pct = (cT / weeklyIncome) * 100;
          return <div key={cat} style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><span style={{ fontSize: "11px", letterSpacing: "2px", color: CATEGORY_COLORS[cat], textTransform: "uppercase" }}>{cat}</span><span>{f2(cT)}/wk avg · {pct.toFixed(1)}%</span></div>
            <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: CATEGORY_COLORS[cat], borderRadius: "3px" }} /></div>
          </div>;
        })}
        <div style={{ height: "1px", background: "var(--color-bg-raised)", margin: "20px 0" }} />
        <SH>Annual Projection (Full Year)</SH>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead><tr style={{ borderBottom: "1px solid #333", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}><th style={{ textAlign: "left", padding: "8px 4px" }}>Expense</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Wk Avg</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Monthly</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Annual</th></tr></thead>
          <tbody>{expenses.map(exp => {
            const annual = yearlyExpenseCost(exp);
            const weeklyAvg = annual / 52;
            const isLoan = exp.type === "loan";
            return <tr key={exp.id} style={{ borderBottom: "1px solid #181818" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "8px 4px" }}>
                <span style={{ fontSize: "10px", color: isLoan ? "var(--color-gold)" : CATEGORY_COLORS[exp.category], marginRight: "6px" }}>▸</span>
                {exp.label}
                {isLoan && <span style={{ fontSize: "9px", background: "rgba(201,168,76,0.13)", color: "var(--color-gold)", padding: "1px 4px", borderRadius: "2px", marginLeft: "5px" }}>LOAN</span>}
              </td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: isLoan ? "var(--color-gold)" : CATEGORY_COLORS[exp.category] }}>{f2(weeklyAvg)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "var(--color-text-secondary)" }}>{f(annual / 12)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "#666" }}>{f(annual)}</td>
            </tr>;
          })}</tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #333", fontWeight: "bold" }}><td style={{ padding: "10px 4px", color: "var(--color-gold)" }}>TRUE SPEND</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-red)" }}>{f2(tsWeeklyAvg)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-red)" }}>{f(tsAnnual / 12)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-red)" }}>{f(tsAnnual)}</td></tr>
            <tr style={{ fontWeight: "bold" }}><td style={{ padding: "6px 4px", color: "var(--color-green)" }}>REMAINING</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f2(wrWeeklyAvg)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(wrAnnual / 12)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(wrAnnual)}</td></tr>
          </tfoot>
        </table>
      </div>;
    })()}

    {/* CASHFLOW */}
    {view === "cashflow" && <div>
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "10px", letterSpacing: "2px", color: "#7eb8c9", textTransform: "uppercase", marginBottom: "4px" }}>Weekly Take-Home</div><div style={{ fontSize: "22px", fontWeight: "bold", color: "#7eb8c9" }}>{f2(weeklyIncome)}</div></div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)", textAlign: "right" }}>Live from<br />income engine</div></div>
      </div>
      {(() => {
        const checkingTot = regularExpenses.filter(e => e.category !== "Transfers").reduce((s, e) => s + currentEffective(e, ap), 0);
        const checkingDesc = regularExpenses.filter(e => e.category !== "Transfers").map(e => e.label).join(", ");
        const loansTot = loans.reduce((s, e) => s + currentEffective(e, ap), 0);
        const loansDesc = loans.map(e => e.label).join(", ");
        const transferTot = regularExpenses.filter(e => e.category === "Transfers").reduce((s, e) => s + currentEffective(e, ap), 0);
        const transferDesc = regularExpenses.filter(e => e.category === "Transfers").map(e => e.label).join(", ");
        return <>
          <div style={{ background: CATEGORY_BG["Needs"], border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"], marginBottom: "4px" }}>Checking Needs</div><div style={{ fontSize: "10px", color: "#666" }}>{checkingDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"] }}>{f2(checkingTot)}</div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{((checkingTot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
          </div>
          {loans.length > 0 && <div style={{ background: "#1a1a14", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--color-gold)", marginBottom: "4px" }}>Loans</div><div style={{ fontSize: "10px", color: "#666" }}>{loansDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-gold)" }}>{f2(loansTot)}</div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{((loansTot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
          </div>}
          <div style={{ background: CATEGORY_BG["Transfers"], border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: CATEGORY_COLORS["Transfers"], marginBottom: "4px" }}>CashApp Transfer</div><div style={{ fontSize: "10px", color: "#666" }}>{transferDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS["Transfers"] }}>{f2(transferTot)}</div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{((transferTot / weeklyIncome) * 100).toFixed(1)}%</div></div></div>
          </div>
        </>;
      })()}
      <div style={{ background: wr >= 0 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${wr >= 0 ? "var(--color-green)" : "var(--color-red)"}`, borderRadius: "6px", padding: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: wr >= 0 ? "var(--color-green)" : "var(--color-red)", marginBottom: "4px" }}>Unallocated / Savings</div><div style={{ fontSize: "10px", color: "#666" }}>See Goals view for event-adjusted timeline</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: wr >= 0 ? "var(--color-green)" : "var(--color-red)" }}>{f2(wr)}</div><div style={{ fontSize: "10px", color: "#666" }}>{f(wr * 52 / 12)}/mo</div></div></div>
      </div>
    </div>}

    {/* GOALS */}
    {view === "goals" && (() => {
      const nowIdx = currentWeek?.idx ?? 0;
      const totG = goals.reduce((s, g) => !g.completed ? s + g.target : s, 0);
      const projS = adjustedWeeklyAvg * weeksLeft;
      const lastGoalEW = tl.length ? (tl[tl.length - 1].eW ?? weeksLeft + 1) : 0;
      const goalsByLane = {
        Expenses: tl.filter(g => g.category !== "Lifestyle"),
        Lifestyle: tl.filter(g => g.category === "Lifestyle"),
      };
      return <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <Card label="Adj. Weekly Available" val={f2(adjustedWeeklyAvg)} color="var(--color-green)" />
          <Card label="Active Goals Total" val={f(totG)} color="var(--color-gold)" />
          <Card label="Weeks to Complete All" val={`~${Math.ceil(lastGoalEW)} wks`} color={projS >= totG ? "var(--color-green)" : "var(--color-red)"} />
        </div>
        {adjustedWeeklyAvg < baseWeeklyUnallocated && <div style={{ background: "#2d1a1a", border: "1px solid #e8856a44", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "var(--color-text-secondary)" }}>Event log reduced avg by <span style={{ color: "var(--color-red)", fontWeight: "bold" }}>{f2(baseWeeklyUnallocated - adjustedWeeklyAvg)}/wk</span></div>}

        {Object.entries(goalsByLane).map(([lane, laneGoals]) => <div
          key={lane}
          onDragOver={(e) => {
            e.preventDefault();
            setDragPreviewCategory(lane);
            setDragOverGoalId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (!draggingGoalId) return;
            reorderGoalByDrag(draggingGoalId, null, lane);
            onGoalDragEnd();
          }}
          style={{
            marginBottom: "16px",
            padding: "12px",
            borderRadius: "10px",
            border: `1px solid ${dragPreviewCategory === lane ? GOAL_LANES[lane].border : "#222"}`,
            background: dragPreviewCategory === lane ? GOAL_LANES[lane].tint : "rgba(16,16,16,0.55)",
            transition: "background 220ms ease, border-color 220ms ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: laneGoals.length ? "10px" : "0" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: GOAL_LANES[lane].text }}>{lane} Goals</div>
            <div style={{ fontSize: "10px", color: "#666" }}>{laneGoals.length}</div>
          </div>
          {!laneGoals.length && <div style={{ border: `1px dashed ${GOAL_LANES[lane].border}`, borderRadius: "8px", padding: "10px 12px", fontSize: "10px", color: "#666", letterSpacing: "1px", textTransform: "uppercase" }}>Drop a goal here</div>}
          {laneGoals.map((g) => {
          const ok = g.eW !== null && g.eW <= weeksLeft;
          const isEditing = editGoalId === g.id;
          const celebrating = fundingId === g.id;
          const isDragging = draggingGoalId === g.id;
          const isDropTarget = dragOverGoalId === g.id;
          const previewLane = dragPreviewCategory ?? g.category;
          const lanePreviewingMove = isDragging && previewLane !== g.category;
          // TODO: tune — card glow animation duration (1.8s) and easing (ease-out)
          return <div
            key={g.id}
            draggable={!isEditing}
            onDragStart={() => onGoalDragStart(g)}
            onDragEnd={onGoalDragEnd}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverGoalId(g.id);
              setDragPreviewCategory(lane);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!draggingGoalId) return;
              reorderGoalByDrag(draggingGoalId, g.id, lane);
              onGoalDragEnd();
            }}
            style={{
              background: lanePreviewingMove ? GOAL_LANES[previewLane].tint : "var(--color-bg-surface)",
              border: `1px solid ${isDropTarget ? GOAL_LANES[lane].text : (celebrating ? "var(--color-green)" : g.color + "33")}`,
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "12px",
              position: "relative",
              overflow: "visible",
              animation: celebrating ? "goalFundedGlow 1.8s ease-out forwards" : undefined,
              opacity: isDragging ? 0.65 : 1,
              cursor: isEditing ? "default" : "grab",
              transform: isDragging ? "scale(0.985)" : "scale(1)",
              transition: "background 220ms ease, border-color 220ms ease, opacity 150ms ease, transform 150ms ease",
            }}
          >
            {isEditing ? <div>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>Editing Goal</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={editGoalVals.label} onChange={e => setEditGoalVals(v => ({ ...v, label: e.target.value }))} style={iS} /></div>
                <div><label style={lS}>Target ($)</label><input type="number" value={editGoalVals.target} onChange={e => setEditGoalVals(v => ({ ...v, target: e.target.value }))} style={iS} /></div>
                <div><label style={lS}>Category</label><select value={editGoalVals.category} onChange={e => setEditGoalVals(v => ({ ...v, category: e.target.value }))} style={iS}><option value="Expenses">Expenses</option><option value="Lifestyle">Lifestyle</option></select></div>
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
                <button onClick={() => saveEditGoal(g.id)} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>SAVE</button>
                <button onClick={() => setEditGoalId(null)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
              </div>
            </div> : <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10px", background: g.color + "22", color: g.color, padding: "2px 8px", borderRadius: "12px" }}>#{i + 1}</span>
                    <span style={{ fontSize: "9px", background: GOAL_LANES[g.category].tint, color: GOAL_LANES[g.category].text, padding: "2px 7px", borderRadius: "12px", letterSpacing: "1px", textTransform: "uppercase" }}>{g.category}</span>
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>{g.label}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#777" }}>{g.note}</div>
                </div>
                <div style={{ textAlign: "right", marginLeft: "12px" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: g.color }}>{f(g.target)}</div>
                  <div style={{ fontSize: "10px", color: ok ? "var(--color-green)" : "var(--color-red)" }}>{ok ? `Wk ${nowIdx + Math.ceil(g.eW)} of 52` : `Wk ${nowIdx + Math.ceil(g.sW + g.wN)} of 52`}</div>
                  {g.dueWeek && nowIdx > g.dueWeek && <div style={{ fontSize: "9px", color: "var(--color-red)", background: "#2d1a1a", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px" }}>PAST DUE · Wk {g.dueWeek}</div>}
                </div>
              </div>
              {/* TODO: tune — progress bar fill transition duration (0.4s) and easing (ease-out) */}
              <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden", marginBottom: "4px" }}><div style={{ position: "relative", left: celebrating ? 0 : `${Math.min((g.sW / weeksLeft) * 100, 100)}%`, width: celebrating ? "100%" : `${Math.min((g.wN / weeksLeft) * 100, 100 - (g.sW / weeksLeft) * 100)}%`, height: "100%", background: celebrating ? "var(--color-green)" : g.color, borderRadius: "3px", opacity: celebrating ? 1 : (ok ? 1 : 0.4), transition: "all 0.4s ease-out" }} /></div>
              {celebrating && <>
                {/* TODO: tune — particle burst container; adjust top/left to reposition burst origin */}
                <div style={{ position: "absolute", top: "50%", left: "50%", pointerEvents: "none", zIndex: 10 }}>
                  {/* TODO: tune — particle fontSize (13px), animation duration (0.85s), cubic-bezier easing */}
                  {BURST_PARTICLES.map((p, pi) => (
                    <span key={pi} style={{ position: "absolute", fontSize: "13px", color: g.color, "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animation: `goalParticle 0.85s cubic-bezier(0.25,0.46,0.45,0.94) ${p.delay} forwards`, transform: "translate(-50%,-50%)", userSelect: "none" }}>{p.symbol}</span>
                  ))}
                </div>
                {/* TODO: tune — stamp entrance duration (0.45s), bounce easing, entrance delay (0.1s) */}
                <div style={{ position: "absolute", top: "50%", left: "50%", pointerEvents: "none", zIndex: 11, animation: "goalStampIn 0.45s cubic-bezier(0.175,0.885,0.32,1.275) 0.1s both" }}>
                  {/* TODO: tune — stamp border width (3px), fontSize (20px), letterSpacing (7px), textShadow glow radius (14px) */}
                  <div style={{ border: "3px solid #6dbf8a", borderRadius: "4px", padding: "8px 20px", fontSize: "20px", fontWeight: "bold", letterSpacing: "7px", color: "var(--color-green)", textTransform: "uppercase", background: "rgba(13,13,13,0.93)", whiteSpace: "nowrap", textShadow: "0 0 14px rgba(109,191,138,0.65)" }}>FUNDED</div>
                </div>
              </>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px" }}><span>Wk {nowIdx}</span><span>Wk 52</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <div style={{ fontSize: "10px", color: "#666" }}><span style={{ color: g.color }}>{f2(adjustedWeeklyAvg)}/wk</span> · {g.wN.toFixed(1)} weeks to fund</div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <SmBtn onClick={() => moveGoal(g.id, -1)} c="#666">↑</SmBtn>
                  <SmBtn onClick={() => moveGoal(g.id, 1)} c="#666">↓</SmBtn>
                  <SmBtn onClick={() => startEditGoal(g)} c="var(--color-gold)">EDIT</SmBtn>
                  <SmBtn onClick={() => !celebrating && handleMarkDone(g.id)} c="var(--color-green)">✓ DONE</SmBtn>
                  {delGoalId === g.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteGoal(g.id)} c="var(--color-red)" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelGoalId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelGoalId(g.id)} c="var(--color-red)">✕</SmBtn>}
                </div>
              </div>
            </div>}
          </div>;
        })}
        </div>)}

        {addingGoal ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>New Goal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={newGoal.label} onChange={e => setNewGoal(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Emergency Fund" /></div>
            <div><label style={lS}>Target ($)</label><input type="number" value={newGoal.target} onChange={e => setNewGoal(v => ({ ...v, target: e.target.value }))} style={iS} /></div>
            <div><label style={lS}>Category</label><select value={newGoal.category} onChange={e => setNewGoal(v => ({ ...v, category: e.target.value }))} style={iS}><option value="Expenses">Expenses</option><option value="Lifestyle">Lifestyle</option></select></div>
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
            <button onClick={addGoal} disabled={!newGoal.label || !newGoal.target} style={{ background: (newGoal.label && newGoal.target) ? "var(--color-green)" : "var(--color-border-subtle)", color: (newGoal.label && newGoal.target) ? "var(--color-bg-base)" : "#666", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: (newGoal.label && newGoal.target) ? "pointer" : "default", fontWeight: "bold" }}>ADD GOAL</button>
            <button onClick={() => { setAddingGoal(false); setNewGoal({ label: "", target: "", color: "var(--color-gold)", note: "", category: "Expenses" }); }} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
          </div>
        </div> : <button onClick={() => setAddingGoal(true)} style={{ background: "var(--color-bg-surface)", color: "var(--color-gold)", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD GOAL</button>}

        {completedGoals.length > 0 && <div style={{ marginTop: "8px", border: "1px solid #1e1e1e", borderRadius: "8px", overflow: "hidden" }}>
          {/* Toggle header */}
          <button onClick={() => setShowCompleted(v => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111", border: "none", padding: "12px 16px", cursor: "pointer", }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "10px", color: showCompleted ? "var(--color-green)" : "#555", transition: "color 0.2s" }}>{showCompleted ? "▼" : "▶"}</span>
              <span style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Funded History</span>
              <span style={{ fontSize: "10px", background: "rgba(76,175,125,0.09)", color: "var(--color-green)", padding: "2px 8px", borderRadius: "12px", letterSpacing: "1px" }}>{completedGoals.length}</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: "bold", color: "#444" }}>{f(completedGoals.reduce((s, g) => s + g.target, 0))}</span>
          </button>

          {showCompleted && <>
            {completedGoals.map((g, i) => {
              const dateFunded = g.completedAt
                ? new Date(g.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;
              return <div key={g.id} style={{ borderTop: "1px solid #1a1a1a", borderLeft: `3px solid ${g.color}55`, background: "#0e0e0e", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: g.note ? "3px" : 0 }}>
                    <span style={{ fontSize: "11px", color: "#3a3a3a", textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                    <span style={{ fontSize: "9px", background: "rgba(76,175,125,0.09)", color: "rgba(76,175,125,0.53)", padding: "1px 5px", borderRadius: "12px", flexShrink: 0 }}>✓ FUNDED</span>
                  </div>
                  {g.note && <div style={{ fontSize: "9px", color: "#2e2e2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.note}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {dateFunded && <span style={{ fontSize: "9px", color: "var(--color-border-subtle)", letterSpacing: "1px" }}>{dateFunded}</span>}
                  <span style={{ fontSize: "13px", fontWeight: "bold", color: "#383838", minWidth: "60px", textAlign: "right" }}>{f(g.target)}</span>
                  <SmBtn onClick={() => toggleComplete(g.id)} c="#555">UNDO</SmBtn>
                  {delGoalId === g.id
                    ? <div style={{ display: "flex", gap: "4px" }}>
                        <SmBtn onClick={() => deleteGoal(g.id)} c="var(--color-red)" bg="#2d1a1a">DEL</SmBtn>
                        <SmBtn onClick={() => setDelGoalId(null)}>NO</SmBtn>
                      </div>
                    : <SmBtn onClick={() => setDelGoalId(g.id)} c="var(--color-border-subtle)">✕</SmBtn>}
                </div>
              </div>;
            })}
            <div style={{ background: "var(--color-bg-base)", borderTop: "1px solid #1a1a1a", padding: "9px 14px 9px 17px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "9px", letterSpacing: "2px", color: "#2e2e2e", textTransform: "uppercase" }}>{completedGoals.length} goal{completedGoals.length !== 1 ? "s" : ""} funded</span>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "rgba(76,175,125,0.33)" }}>{f(completedGoals.reduce((s, g) => s + g.target, 0))}</span>
            </div>
          </>}
        </div>}

        <div style={{ background: "#1a2d1e", border: "1px solid #6dbf8a", borderRadius: "8px", padding: "16px", marginTop: "8px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-green)", textTransform: "uppercase", marginBottom: "10px" }}>Year-End Outlook</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
            <div style={{ color: "var(--color-text-secondary)" }}>Weeks remaining</div><div style={{ textAlign: "right" }}>{weeksLeft}</div>
            <div style={{ color: "var(--color-text-secondary)" }}>Adj. projected savings</div><div style={{ textAlign: "right", color: "var(--color-green)" }}>{f(projS)}</div>
            <div style={{ color: "var(--color-text-secondary)" }}>Active goals total</div><div style={{ textAlign: "right", color: "var(--color-gold)" }}>{f(totG)}</div>
            <div style={{ color: "var(--color-text-secondary)" }}>Surplus after all goals</div><div style={{ textAlign: "right", color: projS - totG >= 0 ? "var(--color-green)" : "var(--color-red)" }}>{f(projS - totG)}</div>
          </div>
          <div style={{ borderTop: "1px solid #6dbf8a33", marginTop: "12px", paddingTop: "12px", display: "flex", alignItems: "center", gap: "12px" }}>
            <button onClick={() => setGoals(prev => prev.map(({ dueWeek: _dueWeek, ...rest }) => rest))} style={{ background: "transparent", color: "rgba(76,175,125,0.4)", border: "1px solid #6dbf8a33", borderRadius: "12px", padding: "5px 10px", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}>Reset Timelines</button>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <Card label="Total Loan Balance" val={f(totalOwed)} color="var(--color-gold)" />
          <Card label="Weekly Committed" val={f2(weeklyCommitted)} color="var(--color-red)" />
          <Card label="Debt-Free In" val={debtFreeDate ? `${weeksToDebtFree} wks` : "—"} color={debtFreeDate && debtFreeDate <= fiscalYearEnd ? "var(--color-green)" : "var(--color-gold)"} />
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

          return <div key={exp.id} style={{ background: "var(--color-bg-surface)", border: `1px solid ${isPaidOff ? "rgba(76,175,125,0.27)" : inRunway ? "#7a8bbf44" : "var(--color-border-accent)"}`, borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
            {isEditing ? <LoanEditForm vals={editLoanVals} setVals={setEditLoanVals} onSave={() => saveEditLoan(exp.id)} onCancel={() => setEditLoanId(null)} iS={iS} lS={lS} /> :
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>{exp.label}</span>
                    <span style={{ fontSize: "9px", background: "rgba(201,168,76,0.13)", color: "var(--color-gold)", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span style={{ fontSize: "9px", background: "rgba(76,175,125,0.13)", color: "var(--color-green)", padding: "2px 6px", borderRadius: "2px" }}>✓ PAID OFF</span>}
                  </div>
                  {exp.note[0] && <div style={{ fontSize: "10px", color: "#666" }}>{exp.note[0]}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: isPaidOff ? "#555" : inRunway ? "#7a8bbf" : "var(--color-gold)" }}>{f2(weeklyAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
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
                  <div style={{ height: "100%", width: inRunway ? "100%" : `${progressPct}%`, background: isPaidOff ? "var(--color-green)" : inRunway ? "#7a8bbf" : "var(--color-gold)", borderRadius: "3px", transition: "width 0.3s", opacity: inRunway ? 0.5 : 1 }} />
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: "8px", fontSize: "11px", marginBottom: "10px" }}>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "9px", marginBottom: "2px" }}>{inRunway ? "FIRST PAYMENT" : "PAYMENTS LEFT"}</div>
                  <div style={{ color: inRunway ? "#7a8bbf" : isPaidOff ? "var(--color-green)" : "var(--color-text-primary)", fontWeight: "bold", fontSize: "10px" }}>{inRunway ? meta.firstPaymentDate : paymentsLeft}</div>
                </div>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "9px", marginBottom: "2px" }}>PAYOFF DATE</div>
                  <div style={{ color: dropsThisYear ? "var(--color-green)" : "var(--color-text-primary)", fontWeight: "bold", fontSize: "10px" }}>{payoffDate}</div>
                </div>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "#666", fontSize: "9px", marginBottom: "2px" }}>TERM PAYMENT</div>
                  <div style={{ color: "var(--color-text-primary)", fontWeight: "bold", fontSize: "10px" }}>{f2(payAmt)} / {freqShort}</div>
                </div>
              </div>

              {/* Runway banner */}
              {inRunway && <div style={{ background: "#1a1a2d", border: "1px solid #7a8bbf44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", fontSize: "10px", color: "#7a8bbf" }}>
                Setting aside {f2(weeklyAmt)}/wk — {weeksUntilFirst} check{weeksUntilFirst !== 1 ? "s" : ""} until first {f2(payAmt)}/{freqShort} payment on {meta.firstPaymentDate}
              </div>}

              {/* Drop-off banner */}
              {!isPaidOff && !inRunway && dropsThisYear && <div style={{ background: "#1a2d1e", border: "1px solid #6dbf8a44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", fontSize: "10px", color: "var(--color-green)" }}>
                ✓ Drops off in {weeksUntilPayoff} weeks — goals auto-improve after payoff
              </div>}

              {/* Actions */}
              <div style={{ display: "flex", gap: "6px", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <SmBtn onClick={() => startEditLoan(exp)} c="var(--color-gold)">EDIT</SmBtn>
                {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                  <SmBtn onClick={() => deleteLoan(exp.id)} c="var(--color-red)" bg="#2d1a1a">DEL</SmBtn>
                  <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="var(--color-red)">✕</SmBtn>}
              </div>
            </div>}
          </div>;
        })}

        {/* Add loan form */}
        {addingLoan ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid #c8a84b", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>New Loan</div>
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
                <span style={{ color: "#666" }}>Weekly cost: <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(weeklyAmt)}/wk</span></span>
                <span style={{ color: "#666" }}>{total} payments ({freqLabel})</span>
                <span style={{ color: "#666" }}>Payoff: <span style={{ color: payoff <= fiscalYearEnd ? "var(--color-green)" : "var(--color-text-primary)" }}>{payoff}</span></span>
              </div>
            </div>;
          })()}
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addLoan} disabled={!newLoan.label || !newLoan.totalAmount || !newLoan.paymentAmount} style={{ background: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "var(--color-green)" : "var(--color-border-subtle)", color: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "var(--color-bg-base)" : "#666", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "pointer" : "default", fontWeight: "bold" }}>ADD LOAN</button>
            <button onClick={() => { setAddingLoan(false); setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" }); }} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
          </div>
        </div> : <button onClick={() => setAddingLoan(true)} style={{ background: "#1a1a14", color: "var(--color-gold)", border: "1px solid #c8a84b44", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD LOAN</button>}
      </div>;
    })()}
  </div>);
}

// Shared loan edit form (used in both overview and loans tab)
function LoanEditForm({ vals, setVals, onSave, onCancel, iS, lS }) {
  return <div>
    <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "12px" }}>Edit Loan</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
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
      <button onClick={onSave} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>SAVE</button>
      <button onClick={onCancel} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
    </div>
  </div>;
}
