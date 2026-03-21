import { useState, useMemo, useEffect, useRef } from "react";
import { DEFAULT_CONFIG, INITIAL_EXPENSES, INITIAL_GOALS, INITIAL_LOGS } from "./constants/config.js";
import { buildYear, computeNet, fedTax, calcEventImpact, computeRemainingSpend, computeBucketModel, toLocalIso } from "./lib/finance.js";
import { loadUserData, saveUserData } from "./lib/db.js";
import { IncomePanel } from "./components/IncomePanel.jsx";
import { BudgetPanel } from "./components/BudgetPanel.jsx";
import { BenefitsPanel } from "./components/BenefitsPanel.jsx";
import { LogPanel } from "./components/LogPanel.jsx";
import { WeekConfirmModal } from "./components/WeekConfirmModal.jsx";
import { HomePanel } from "./components/HomePanel.jsx";

const NAV_ITEMS = [
  { key: "income",   label: "Income" },
  { key: "budget",   label: "Budget" },
  { key: "benefits", label: "Benefits" },
  { key: "log",      label: "Log" },
];

// Bottom nav items with SVG icons — Chime-style icon+label layout
const BOTTOM_NAV = [
  {
    key: "home",
    label: "Home",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
    ),
  },
  {
    key: "income",
    label: "Income",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 20h2v-8H5v8zm4 0h2V4H9v16zm4 0h2v-4h-2v4zm4 0h2v-12h-2v12z"/>
      </svg>
    ),
  },
  {
    key: "budget",
    label: "Budget",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
      </svg>
    ),
  },
  {
    key: "benefits",
    label: "Benefits",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    ),
  },
  {
    key: "log",
    label: "Log",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
      </svg>
    ),
  },
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
  // viewStack: push on navigate, pop on back. Last item = current view.
  // "home" is always the base — never popped below depth 1.
  const [viewStack, setViewStack] = useState(["home"]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Persisted to Supabase week_confirmations JSONB column.
  // Shape: { [weekIdx]: { confirmedAt, dayToggles, scheduledDays, missedScheduledDays,
  //                        pickupDays, netShiftDelta, eventId } }
  // Keyed by weekIdx (number) so lookup is O(1) in confirmTriggerWeek.
  const [weekConfirmations, setWeekConfirmations] = useState({});

  const currentView = viewStack[viewStack.length - 1];
  const canGoBack = viewStack.length > 1;

  // Push a panel onto the stack (used by tiles and within-panel navigation)
  const navigate = (key) => {
    setViewStack(prev => [...prev, key]);
    setDrawerOpen(false);
  };

  // Pop back one level (back arrow)
  const navigateBack = () => {
    setViewStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
    setDrawerOpen(false);
  };

  // Direct jump: always lands as ["home", key] — used by sidebar/drawer/bottom-nav
  // so switching panels never nests indefinitely.
  const navigateDirect = (key) => {
    setViewStack(key === "home" ? ["home"] : ["home", key]);
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

  // confirmDismissed: session-only flag; set when user clicks "Skip for now".
  // Cleared by badge click so the modal re-opens. Resets to false on page reload.
  const [confirmDismissed, setConfirmDismissed] = useState(false);

  // ── Week confirmation modal trigger ──
  // Surfaces the most-recent UNCONFIRMED past week.
  // The previous version grabbed the last past week and bailed if it was confirmed —
  // meaning older unconfirmed weeks were silently skipped (the bug behind badge=3, modal=hidden).
  // Fix: filter to unconfirmed weeks first, then take the most recent one.
  //
  // DOW gate removed from auto-trigger: with payPeriodEndDay=0 (default) the gate was
  // a no-op anyway (0=Sun, todayDOW is always >= 0). Removing it simplifies reasoning.
  // confirmForced (badge click) still kept to surface the modal on demand in case the
  // user dismisses and wants to return to it without waiting for state to change.
  const confirmTriggerWeek = useMemo(() => {
    const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today);
    // Find most recent week that has NOT been confirmed yet
    const unconfirmedWeeks = pastWeeks.filter(w => !weekConfirmations[w.idx]);
    if (!unconfirmedWeeks.length) return null;
    return unconfirmedWeeks[unconfirmedWeeks.length - 1]; // most recent unconfirmed
  }, [allWeeks, today, weekConfirmations]);

  // Total count of all past active weeks lacking a confirmation record.
  // Used for the persistent badge in sidebar and mobile header.
  // Intentionally looks at ALL past weeks (not just the most recent) so skipped
  // weeks accumulate and the badge number keeps climbing until addressed.
  const unconfirmedCount = useMemo(() => {
    const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today);
    return pastWeeks.filter(w => !weekConfirmations[w.idx]).length;
  }, [allWeeks, today, weekConfirmations]);

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
      {currentView === "home" && <HomePanel
        navigate={navigate}
        weeklyIncome={weeklyIncome}
        adjustedTakeHome={logTotals.adjustedTakeHome}
        adjustedWeeklyAvg={logTotals.adjustedWeeklyAvg}
        remainingSpend={remainingSpend}
        goals={goals}
        futureWeekNets={futureWeekNets}
        currentWeek={currentWeek}
      />}
      {currentView === "income" && <IncomePanel
        allWeeks={allWeeks} config={config} setConfig={setConfig}
        showExtra={showExtra} setShowExtra={setShowExtra}
        taxDerived={taxDerived}
        logNetLost={logTotals.netLost}
        logNetGained={logTotals.netGained}
        adjustedTakeHome={logTotals.adjustedTakeHome}
        projectedAnnualNet={projectedAnnualNet}
        currentWeek={currentWeek}
      />}
      {currentView === "budget" && <BudgetPanel
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
      {currentView === "benefits" && <BenefitsPanel
        allWeeks={allWeeks} config={config}
        logK401kLost={logTotals.k401kLost}
        logK401kMatchLost={logTotals.k401kMatchLost}
        logK401kGained={logTotals.k401kGained}
        logK401kMatchGained={logTotals.k401kMatchGained}
        logPTOHoursLost={logTotals.ptoHoursLost}
        currentWeek={currentWeek}
        bucketModel={bucketModel}
      />}
      {currentView === "log" && <LogPanel
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
        /* DEBUG: redundant overflow guard — index.css sets this on html/body/#root
           but injecting it here as well catches any future SSR or shadow-DOM edge
           cases where the external stylesheet might not apply in time. */
        html, body, #root { max-width: 100vw; overflow-x: hidden; }

        /* DEBUG: global box-sizing reset — ensures padding/border are included in
           element width calculations. Without this, an element with width:100% and
           padding:16px would be 100%+32px wide and cause horizontal scroll. */
        *, *::before, *::after { box-sizing: border-box; }

        /* DEBUG MOBILE BREAKPOINT: 767px is the cutover between mobile and desktop.
           Below 767px: sidebar hides, mobile-header + mobile-bottom-nav show.
           Above 768px: sidebar shows, mobile chrome hides.
           If you change this breakpoint, also update the drawer width (260px in JSX)
           and the desktop sidebar width (190px) so nothing overlaps. */
        @media (max-width: 767px) {
          .sidebar { display: none !important; }
          .mobile-header { display: flex !important; }
          .mobile-bottom-nav { display: flex !important; }
          /* Bottom nav is always visible on mobile (including home screen), so
             content needs padding to clear the nav bar on all views. */
          .main-content {
            padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }
        @media (min-width: 768px) {
          .mobile-header { display: none !important; }
          .mobile-bottom-nav { display: none !important; }
          /* DEBUG: overlay also hides on desktop so a half-open drawer doesn't
             ghost behind the sidebar if the user resizes the window. */
          .mobile-drawer-overlay { display: none !important; }
        }
        /* DEBUG DRAWER: translateX(-100%) hides the drawer fully off-screen left.
           The .open class moves it to x=0. If the drawer flickers on load,
           add will-change:transform to force GPU compositing. */
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
        /* DEBUG: .scroll-x is a utility class for any container that needs
           internal horizontal scrolling without leaking to the page.
           -webkit-overflow-scrolling:touch enables momentum (inertial) scroll
           on iOS — without it, scrolling feels sticky and non-native. */
        .scroll-x {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          max-width: 100%;
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
          {/* Persistent unconfirmed-weeks badge — always visible when any past week
              lacks a confirmation. Clicking clears confirmDismissed so the modal re-opens. */}
          {unconfirmedCount > 0 && (
            <button onClick={() => setConfirmDismissed(false)} style={{ marginTop: "8px", display: "block", width: "100%", background: "transparent", border: "1px solid #e8856a55", borderRadius: "3px", color: "#e8856a", padding: "5px 8px", fontSize: "9px", letterSpacing: "1.5px", fontFamily: "'Courier New',monospace", cursor: "pointer", textTransform: "uppercase", textAlign: "left" }}>
              ◷ {unconfirmedCount} {unconfirmedCount === 1 ? "week" : "weeks"} to confirm
            </button>
          )}
        </div>
        <nav style={{ marginTop: "8px", flex: 1 }}>
          <SidebarNavItem item={{ key: "home", label: "Home" }} active={currentView === "home"} onClick={() => navigateDirect("home")} />
          {NAV_ITEMS.map(item => (
            <SidebarNavItem key={item.key} item={item} active={currentView === item.key} onClick={() => navigateDirect(item.key)} />
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
            padding: "0 max(16px, env(safe-area-inset-left, 16px))",
            paddingRight: "max(16px, env(safe-area-inset-right, 16px))",
            height: "calc(56px + env(safe-area-inset-top, 0px))",
            paddingTop: "env(safe-area-inset-top, 0px)",
            background: "#0d0d0d",
            position: "sticky",
            top: 0,
            zIndex: 30,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
            {/* ── Hamburger — top LEFT (Chime-style) ── */}
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#c8a84b",
              cursor: "pointer",
              width: "44px",
              height: "44px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              flexShrink: 0,
            }}
            aria-label="Open navigation"
          >
            <span style={{ display: "block", width: "20px", height: "2px", background: "#c8a84b", borderRadius: "1px" }} />
            <span style={{ display: "block", width: "20px", height: "2px", background: "#c8a84b", borderRadius: "1px" }} />
            <span style={{ display: "block", width: "20px", height: "2px", background: "#c8a84b", borderRadius: "1px" }} />
          </button>

          {/* ── Title block — center ── */}
          <div style={{ flex: 1, minWidth: 0, paddingLeft: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#c8a84b", textTransform: "uppercase" }}>DHL / P&G</div>
              {currentWeekNumber && <div style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", padding: "1px 6px", background: "#1a3a20", color: "#6dbf8a", border: "1px solid #6dbf8a55", borderRadius: "3px", flexShrink: 0 }}>Wk {currentWeekNumber.num}/{currentWeekNumber.total}</div>}
            </div>
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Finance Dashboard</div>
          </div>

          {/* ── Notification bell — top RIGHT (Chime-style) ── */}
          <button
            onClick={() => setConfirmDismissed(false)}
            style={{
              background: "transparent",
              border: "none",
              color: unconfirmedCount > 0 ? "#e8856a" : "#555",
              cursor: "pointer",
              width: "44px",
              height: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
            }}
            aria-label={unconfirmedCount > 0 ? `${unconfirmedCount} weeks to confirm` : "Notifications"}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            {unconfirmedCount > 0 && (
              <span style={{
                position: "absolute",
                top: "6px",
                right: "6px",
                background: "#e8856a",
                color: "#0d0d0d",
                borderRadius: "50%",
                width: "16px",
                height: "16px",
                fontSize: "9px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Courier New',monospace",
              }}>
                {unconfirmedCount}
              </span>
            )}
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
          <SidebarNavItem item={{ key: "home", label: "Home" }} active={currentView === "home"} onClick={() => navigateDirect("home")} />
          {NAV_ITEMS.map(item => (
            <SidebarNavItem key={item.key} item={item} active={currentView === item.key} onClick={() => navigateDirect(item.key)} />
          ))}
        </nav>

        {/* Active section indicator at bottom */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #1e1e1e", fontSize: "10px", color: "#555", letterSpacing: "1px", textTransform: "uppercase" }}>
          Viewing: <span style={{ color: "#c8a84b" }}>{currentView}</span>
        </div>
      </div>

      {/* ── Mobile bottom nav — Chime-style, always visible, icon + label ── */}
      <div
        className="mobile-bottom-nav"
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: "calc(62px + env(safe-area-inset-bottom, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "#111",
          borderTop: "1px solid #222",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.9)",
          zIndex: 20,
        }}
      >
        {BOTTOM_NAV.map(item => {
          const active = currentView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => navigateDirect(item.key)}
              style={{
                flex: 1,
                height: "100%",
                background: "transparent",
                border: "none",
                color: active ? "#c8a84b" : "#555",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "3px",
                fontFamily: "'Courier New',monospace",
                fontSize: "9px",
                letterSpacing: "1px",
                textTransform: "uppercase",
                paddingTop: "2px",
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Weekly work confirmation modal ──
          Shows when: unconfirmed past week exists AND confirmDismissed is false.
          confirmDismissed resets to false on reload, so the modal auto-pops each session
          until all past weeks are confirmed. Badge click also clears it if user dismissed.
          onDismiss: session-only skip — badge persists and re-opens modal on next click.
      */}
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
