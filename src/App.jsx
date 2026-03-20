import { useState, useMemo, useEffect, useRef } from "react";
import { DEFAULT_CONFIG, INITIAL_EXPENSES, INITIAL_GOALS, INITIAL_LOGS } from "./constants/config.js";
import { buildYear, computeNet, fedTax, calcEventImpact, computeRemainingSpend, computeBucketModel, toLocalIso } from "./lib/finance.js";
import { loadUserData, saveUserData } from "./lib/db.js";
import { IncomePanel } from "./components/IncomePanel.jsx";
import { BudgetPanel } from "./components/BudgetPanel.jsx";
import { BenefitsPanel } from "./components/BenefitsPanel.jsx";
import { LogPanel } from "./components/LogPanel.jsx";
import { WeekConfirmModal } from "./components/WeekConfirmModal.jsx";

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
        padding: "14px 20px",
        fontSize: "11px",
        letterSpacing: "2px",
        textTransform: "uppercase",
        fontFamily: "'Courier New',monospace",
        background: active ? "#1a1a1a" : "transparent",
        color: active ? "#c8a84b" : "#888",
        borderLeft: active ? "3px solid #c8a84b" : "3px solid transparent",
        border: "none",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {item.label}
    </button>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showExtra, setShowExtra] = useState(true);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [expenses, setExpenses] = useState(INITIAL_EXPENSES);
  const [goals, setGoals] = useState(INITIAL_GOALS);
  const [topNav, setTopNav] = useState("income");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [weekConfirmations, setWeekConfirmations] = useState({});

  const navigate = (key) => {
    setTopNav(key);
    setDrawerOpen(false);
  };

  // ── Load from Supabase on mount ──
  useEffect(() => {
    loadUserData().then((data) => {
      setConfig(data.config);
      setShowExtra(data.showExtra);
      setLogs(data.logs);
      setExpenses(data.expenses);
      setGoals(data.goals);
      setWeekConfirmations(data.weekConfirmations ?? {});
      setLoading(false);
    });
  }, []);

  // ── Debounced save to Supabase (800ms) ──
  const saveTimer = useRef(null);
  useEffect(() => {
    if (loading) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations });
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [config, expenses, goals, logs, showExtra, weekConfirmations, loading]);

  // ── today: reactive date string — ticks at midnight so everything auto-advances ──
  const [today, setToday] = useState(() => toLocalIso(new Date()));
  useEffect(() => {
    const scheduleNextTick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight - now;
      return setTimeout(() => {
        setToday(toLocalIso(new Date()));
        timerId.current = scheduleNextTick();
      }, msUntilMidnight);
    };
    const timerId = { current: scheduleNextTick() };
    return () => clearTimeout(timerId.current);
  }, []);

  // ── Build year reactively from config ──
  const allWeeks = useMemo(() => buildYear(config), [config]);

  // ── Future active weeks: today onward, used for spend/goal simulation ──
  const futureWeeks = useMemo(() => {
    return allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) >= today);
  }, [allWeeks, today]);

  // ── Current week: first active week whose end date >= today ──
  const currentWeek = useMemo(() => {
    return allWeeks.find(w => w.active && toLocalIso(w.weekEnd) >= today) ?? null;
  }, [allWeeks, today]);

  // ── Week confirmation modal trigger ──
  // Surfaces the most-recent unconfirmed past week when today is on/after payPeriodEndDay.
  const confirmTriggerWeek = useMemo(() => {
    const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today);
    if (!pastWeeks.length) return null;
    const recent = pastWeeks[pastWeeks.length - 1];
    const todayDOW = new Date(today).getDay(); // 0=Sun … 6=Sat
    const endDay = config.payPeriodEndDay ?? 0;
    if (todayDOW < endDay) return null;
    if (weekConfirmations[recent.idx]) return null;
    return recent;
  }, [allWeeks, today, config, weekConfirmations]);

  // Count of all past active weeks that have no confirmation record yet
  const unconfirmedCount = useMemo(() => {
    const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today);
    return pastWeeks.filter(w => !weekConfirmations[w.idx]).length;
  }, [allWeeks, today, weekConfirmations]);

  const [confirmDismissed, setConfirmDismissed] = useState(false);

  // ── Fiscal week stamp: raw idx out of 52 (standard calendar year = 52 paychecks) ──
  const currentWeekNumber = currentWeek
    ? { num: currentWeek.idx, total: 52 }
    : null;

  // ── Tax derived values ──
  const taxDerived = useMemo(() => {
    const tt = allWeeks.filter(w => w.active).reduce((s, w) => s + w.taxableGross, 0);
    const fAGI = Math.max(tt - config.fedStdDeduction, 0);
    const fL = fedTax(fAGI), mL = tt * config.moFlatRate;
    const ficaT = allWeeks.filter(w => w.active).reduce((s, w) => s + w.grossPay * config.ficaRate, 0);
    const fWB = allWeeks.filter(w => w.active && w.taxedBySchedule).reduce((s, w) => s + w.taxableGross * (w.rotation === "6-Day" ? config.w2FedRate : config.w1FedRate), 0);
    const mWB = allWeeks.filter(w => w.active && w.taxedBySchedule).reduce((s, w) => s + w.taxableGross * (w.rotation === "6-Day" ? config.w2StateRate : config.w1StateRate), 0);
    const fG = fL - fWB, mG = mL - mWB, tG = fG + mG, tET = Math.max(tG - config.targetOwedAtFiling, 0);
    const twC = allWeeks.filter(w => w.active && w.taxedBySchedule).length;
    return { fedAGI: fAGI, fedLiability: fL, moLiability: mL, ficaTotal: ficaT, fedWithheldBase: fWB, moWithheldBase: mWB, fedGap: fG, moGap: mG, totalGap: tG, targetExtraTotal: tET, taxedWeekCount: twC, extraPerCheck: twC > 0 ? tET / twC : 0 };
  }, [allWeeks, config]);

  // ── Live projected net from income engine ──
  const projectedAnnualNet = useMemo(() =>
    allWeeks.filter(w => w.active).reduce((s, w) => s + computeNet(w, config, taxDerived.extraPerCheck, showExtra), 0)
    , [allWeeks, config, taxDerived, showExtra]);

  const weeklyIncome = projectedAnnualNet / 52;

  const futureWeekNets = useMemo(
    () => futureWeeks.map(w => computeNet(w, config, taxDerived.extraPerCheck, showExtra)),
    [futureWeeks, config, taxDerived, showExtra]
  );

  // ── Week-by-week remaining spend using history-aware amounts ──
  const remainingSpend = useMemo(() => computeRemainingSpend(expenses, futureWeeks), [expenses, futureWeeks]);
  const baseWeeklyUnallocated = weeklyIncome - remainingSpend.avgWeeklySpend;

  // ── Event log cascade ──
  const logTotals = useMemo(() => {
    let nL = 0, nG = 0, k4L = 0, k4ML = 0, k4G = 0, k4MG = 0, ptoL = 0, bucket = 0;
    logs.forEach(e => {
      const i = calcEventImpact(e, config);
      nL += i.netLost; nG += i.netGained;
      k4L += i.k401kLost; k4ML += i.k401kMatchLost;
      k4G += i.k401kGained; k4MG += i.k401kMatchGained;
      ptoL += i.hoursLostForPTO; bucket += i.bucketHoursDeducted;
    });
    return {
      netLost: nL, netGained: nG,
      k401kLost: k4L, k401kMatchLost: k4ML,
      k401kGained: k4G, k401kMatchGained: k4MG,
      ptoHoursLost: ptoL, bucketHours: bucket,
      adjustedTakeHome: projectedAnnualNet - nL + nG,
      adjustedWeeklyAvg: baseWeeklyUnallocated - (nL / (futureWeeks.length || 1)) + (nG / (futureWeeks.length || 1))
    };
  }, [logs, config, projectedAnnualNet, baseWeeklyUnallocated, futureWeeks]);

  // ── Attendance bucket model ──
  const bucketModel = useMemo(() => computeBucketModel(logs, config), [logs, config]);

  // ── Per-week targeted deductions for current/future-week events ──────────────────
  // Shape: { [weekIdx: number]: netLost (dollars) }
  //
  // WHY TWO PATHS EXIST:
  //   Past events (weekEnd < today) → smeared evenly across remaining weeks via
  //   logNetLost in computeGoalTimeline. The money is already gone; a uniform
  //   budget reduction across the rest of the year is the right model.
  //
  //   Current/future events (weekEnd >= today) → land on their specific week in the
  //   goals loop so the timeline shows the actual dip at the right week rather than
  //   hiding it in a per-week average.
  //
  // HOW IT'S BUILT:
  //   calcEventImpact() is re-run here (not cached from logTotals) to get the
  //   week-aware netLost: rotation (6-Day/4-Day) sets the shift count and
  //   withholding tier; weekIdx checked against cfg.taxedWeeks sets whether
  //   fed+state rates apply. Result is indexed by Number(weekIdx) to match week.idx.
  //
  // REUSE:
  //   Any feature that needs to know "how much net pay is lost on a specific future
  //   week due to logged events" can read this map directly — e.g. a cash-flow
  //   waterfall chart, a per-week surplus sparkline, or a "next paycheck" estimate
  //   that accounts for already-logged partial shifts.
  // ─────────────────────────────────────────────────────────────────────────────────
  const futureEventDeductions = useMemo(() => {
    const map = {};
    logs.forEach(e => {
      if (!e.weekEnd || e.weekEnd < today) return;
      const impact = calcEventImpact(e, config);
      if (!impact.netLost) return;
      const idx = Number(e.weekIdx);
      map[idx] = (map[idx] || 0) + impact.netLost;
    });
    return map;
  }, [logs, config, today]);

  if (loading) {
    return (
      <div style={{ fontFamily: "'Courier New',monospace", background: "#0d0d0d",
        minHeight: "100vh", color: "#c8a84b", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: "14px",
        letterSpacing: "4px" }}>
        LOADING...
      </div>
    );
  }

  const activePanel = (
    <>
      {topNav === "income" && <IncomePanel
        allWeeks={allWeeks} config={config} setConfig={setConfig}
        showExtra={showExtra} setShowExtra={setShowExtra}
        taxDerived={taxDerived}
        logNetLost={logTotals.netLost}
        logNetGained={logTotals.netGained}
        adjustedTakeHome={logTotals.adjustedTakeHome}
        projectedAnnualNet={projectedAnnualNet}
        currentWeek={currentWeek}
      />}
      {topNav === "budget" && <BudgetPanel
        expenses={expenses} setExpenses={setExpenses}
        goals={goals} setGoals={setGoals}
        adjustedWeeklyAvg={logTotals.adjustedWeeklyAvg}
        baseWeeklyUnallocated={baseWeeklyUnallocated}
        logNetLost={logTotals.netLost}
        logNetGained={logTotals.netGained}
        weeklyIncome={weeklyIncome}
        futureWeeks={futureWeeks}
        futureWeekNets={futureWeekNets}
        futureEventDeductions={futureEventDeductions}
        currentWeek={currentWeek}
        today={today}
      />}
      {topNav === "benefits" && <BenefitsPanel
        allWeeks={allWeeks} config={config}
        logK401kLost={logTotals.k401kLost}
        logK401kMatchLost={logTotals.k401kMatchLost}
        logK401kGained={logTotals.k401kGained}
        logK401kMatchGained={logTotals.k401kMatchGained}
        logPTOHoursLost={logTotals.ptoHoursLost}
        currentWeek={currentWeek}
        bucketModel={bucketModel}
      />}
      {topNav === "log" && <LogPanel
        logs={logs} setLogs={setLogs} config={config}
        projectedAnnualNet={projectedAnnualNet}
        baseWeeklyUnallocated={baseWeeklyUnallocated}
        futureWeeks={futureWeeks}
        allWeeks={allWeeks}
        currentWeek={currentWeek}
        goals={goals}
        bucketModel={bucketModel}
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
          .mobile-drawer-overlay { display: none !important; }
        }
        .drawer-slide {
          transform: translateX(-100%);
          transition: transform 0.25s ease;
        }
        .drawer-slide.open {
          transform: translateX(0);
        }
        .drawer-backdrop {
          opacity: 0;
          transition: opacity 0.25s ease;
          pointer-events: none;
        }
        .drawer-backdrop.open {
          opacity: 1;
          pointer-events: auto;
        }
      `}</style>

      {/* ── Desktop Sidebar ── */}
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
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #222" }}>
          <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "4px" }}>DHL / P&G — Jackson MO</div>
          <div style={{ fontSize: "14px", fontWeight: "bold", lineHeight: "1.3", marginBottom: "8px" }}>2026 Financial Dashboard</div>
          {currentWeekNumber && <div style={{ display: "inline-block", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "3px 8px", background: "#1a3a20", color: "#6dbf8a", border: "1px solid #6dbf8a55", borderRadius: "3px" }}>Week {currentWeekNumber.num} of {currentWeekNumber.total}</div>}
          {unconfirmedCount > 0 && (
            <button onClick={() => setConfirmDismissed(false)} style={{ marginTop: "8px", display: "block", width: "100%", background: "transparent", border: "1px solid #e8856a55", borderRadius: "3px", color: "#e8856a", padding: "5px 8px", fontSize: "9px", letterSpacing: "1.5px", fontFamily: "'Courier New',monospace", cursor: "pointer", textTransform: "uppercase", textAlign: "left" }}>
              ◷ {unconfirmedCount} {unconfirmedCount === 1 ? "week" : "weeks"} to confirm
            </button>
          )}
        </div>
        <nav style={{ marginTop: "8px", flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <SidebarNavItem key={item.key} item={item} active={topNav === item.key} onClick={() => navigate(item.key)} />
          ))}
        </nav>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Mobile header */}
        <div
          className="mobile-header"
          style={{
            display: "none",
            borderBottom: "2px solid #c8a84b",
            padding: "0 16px",
            height: "56px",
            background: "#0d0d0d",
            position: "sticky",
            top: 0,
            zIndex: 30,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase" }}>DHL / P&G — Jackson MO</div>
              {currentWeekNumber && <div style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "1px 6px", background: "#1a3a20", color: "#6dbf8a", border: "1px solid #6dbf8a55", borderRadius: "3px", flexShrink: 0 }}>Wk {currentWeekNumber.num}/{currentWeekNumber.total}</div>}
            </div>
            <div style={{ fontSize: "16px", fontWeight: "bold" }}>2026 Financial Dashboard</div>
          </div>
          {/* Unconfirmed weeks badge */}
          {unconfirmedCount > 0 && (
            <button onClick={() => setConfirmDismissed(false)} style={{ background: "transparent", border: "1px solid #e8856a55", borderRadius: "3px", color: "#e8856a", padding: "4px 9px", fontSize: "9px", letterSpacing: "1.5px", fontFamily: "'Courier New',monospace", cursor: "pointer", textTransform: "uppercase", flexShrink: 0, marginLeft: "8px" }}>
              ◷ {unconfirmedCount}
            </button>
          )}
          {/* Hamburger button */}
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              background: "transparent",
              border: "1px solid #333",
              borderRadius: "4px",
              color: "#c8a84b",
              cursor: "pointer",
              width: "44px",
              height: "38px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              flexShrink: 0,
              marginLeft: "12px",
            }}
            aria-label="Open navigation"
          >
            <span style={{ display: "block", width: "18px", height: "2px", background: "#c8a84b", borderRadius: "1px" }} />
            <span style={{ display: "block", width: "18px", height: "2px", background: "#c8a84b", borderRadius: "1px" }} />
            <span style={{ display: "block", width: "18px", height: "2px", background: "#c8a84b", borderRadius: "1px" }} />
          </button>
        </div>

        {/* Panel content */}
        <div className="main-content" style={{ padding: "18px 16px", flex: 1 }}>
          {activePanel}
        </div>
      </div>

      {/* ── Mobile drawer overlay (backdrop) ── */}
      <div
        className={`mobile-drawer-overlay drawer-backdrop${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 40,
        }}
      />

      {/* ── Mobile drawer (slide-in sidebar) ── */}
      <div
        className={`mobile-drawer-overlay drawer-slide${drawerOpen ? " open" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "260px",
          height: "100dvh",
          background: "#111",
          borderRight: "1px solid #2a2a2a",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drawer header */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #222", display: "flex", alignItems: "flex-start", justifyContent: "space-between", minHeight: "56px" }}>
          <div>
            <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase", marginBottom: "3px" }}>DHL / P&G — Jackson MO</div>
            <div style={{ fontSize: "15px", fontWeight: "bold" }}>2026 Financial Dashboard</div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 4px", marginTop: "2px" }}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        {/* Drawer nav items */}
        <nav style={{ marginTop: "12px", flex: 1 }}>
          {NAV_ITEMS.map(item => (
            <SidebarNavItem key={item.key} item={item} active={topNav === item.key} onClick={() => navigate(item.key)} />
          ))}
        </nav>

        {/* Active section indicator at bottom */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e1e1e", fontSize: "10px", color: "#555", letterSpacing: "1px", textTransform: "uppercase" }}>
          Viewing: <span style={{ color: "#c8a84b" }}>{topNav}</span>
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
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
            onClick={() => navigate(item.key)}
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

      {/* ── Weekly work confirmation modal ── */}
      {confirmTriggerWeek && !confirmDismissed && (
        <WeekConfirmModal
          week={confirmTriggerWeek}
          config={config}
          onConfirm={(confirmation, logEntry) => {
            setWeekConfirmations(c => ({ ...c, [confirmTriggerWeek.idx]: confirmation }));
            if (logEntry) setLogs(p => [...p, logEntry]);
          }}
          onDismiss={() => setConfirmDismissed(true)}
        />
      )}
    </div>
  );
}
