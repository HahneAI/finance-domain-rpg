import { useState, useMemo } from "react";
import { DEFAULT_CONFIG, INITIAL_EXPENSES, INITIAL_GOALS, INITIAL_LOGS, PHASE_WEIGHTS, WEEKS_REMAINING } from "./constants/config.js";
import { buildYear, computeNet, fedTax, calcEventImpact } from "./lib/finance.js";
import { useLocalStorage } from "./hooks/useLocalStorage.js";
import { IncomePanel } from "./components/IncomePanel.jsx";
import { BudgetPanel } from "./components/BudgetPanel.jsx";
import { BenefitsPanel } from "./components/BenefitsPanel.jsx";
import { LogPanel } from "./components/LogPanel.jsx";

const NAV_ITEMS = [
  { key: "income",   label: "Income" },
  { key: "budget",   label: "Budget" },
  { key: "benefits", label: "Benefits" },
  { key: "log",      label: "Log" },
];

function SidebarNavItem({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 20px",
        fontSize: "11px",
        letterSpacing: "2px",
        textTransform: "uppercase",
        fontFamily: "'Courier New',monospace",
        background: active ? "#1a1a1a" : "transparent",
        color: active ? "#c8a84b" : "#666",
        borderLeft: active ? "3px solid #c8a84b" : "3px solid transparent",
        border: "none",
        borderLeft: active ? "3px solid #c8a84b" : "3px solid transparent",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {item.label}
    </button>
  );
}

export default function App() {
  const [config, setConfig] = useLocalStorage("life-rpg:config", DEFAULT_CONFIG);
  const [showExtra, setShowExtra] = useLocalStorage("life-rpg:showExtra", true);
  const [logs, setLogs] = useLocalStorage("life-rpg:logs", INITIAL_LOGS);
  const [expenses, setExpenses] = useLocalStorage("life-rpg:expenses", INITIAL_EXPENSES);
  const [goals, setGoals] = useLocalStorage("life-rpg:goals", INITIAL_GOALS);
  const [topNav, setTopNav] = useState("income");

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

  const activePanel = (
    <>
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
    </>
  );

  return (
    <div style={{ fontFamily: "'Courier New',monospace", background: "#0d0d0d", minHeight: "100vh", color: "#e8e0d0", display: "flex" }}>
      <style>{`
        @media (max-width: 767px) {
          .sidebar { display: none !important; }
          .mobile-header { display: flex !important; }
          .mobile-bottom-nav { display: flex !important; }
          .main-content { padding-bottom: 62px !important; }
        }
        @media (min-width: 768px) {
          .mobile-header { display: none !important; }
          .mobile-bottom-nav { display: none !important; }
        }
      `}</style>

      {/* ── Sidebar (desktop) ── */}
      <div
        className="sidebar"
        style={{
          width: "190px",
          minWidth: "190px",
          background: "#111",
          borderRight: "1px solid #222",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 10,
        }}
      >
        {/* Sidebar header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #222" }}>
          <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "4px" }}>DHL / P&G — Jackson MO</div>
          <div style={{ fontSize: "14px", fontWeight: "bold", lineHeight: "1.3" }}>2026 Financial Dashboard</div>
        </div>

        {/* Nav items */}
        <nav style={{ marginTop: "8px", flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <SidebarNavItem
              key={item.key}
              item={item}
              active={topNav === item.key}
              onClick={() => setTopNav(item.key)}
            />
          ))}
        </nav>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Mobile header (hidden on desktop) */}
        <div
          className="mobile-header"
          style={{
            display: "none",
            borderBottom: "2px solid #c8a84b",
            padding: "12px 16px",
            background: "#0d0d0d",
            position: "sticky",
            top: 0,
            zIndex: 10,
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8a84b", textTransform: "uppercase" }}>DHL / P&G — Jackson MO</div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>2026 Financial Dashboard</div>
        </div>

        {/* Panel content */}
        <div className="main-content" style={{ padding: "22px 20px", flex: 1 }}>
          {activePanel}
        </div>
      </div>

      {/* ── Mobile bottom nav (hidden on desktop) ── */}
      <div
        className="mobile-bottom-nav"
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "56px",
          background: "#151515",
          borderTop: "1px solid #2e2e2e",
          boxShadow: "0 -4px 20px rgba(0,0,0,0.85)",
          zIndex: 20,
        }}
      >
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            onClick={() => setTopNav(item.key)}
            style={{
              flex: 1,
              height: "100%",
              background: "transparent",
              border: "none",
              borderTop: topNav === item.key ? "2px solid #c8a84b" : "2px solid transparent",
              color: topNav === item.key ? "#c8a84b" : "#999",
              fontSize: "11px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              fontFamily: "'Courier New',monospace",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
