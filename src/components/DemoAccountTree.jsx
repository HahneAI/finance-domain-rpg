/**
 * DemoAccountTree — renders a full panel suite for a demo account.
 *
 * Non-admin (investor): loads Supabase-saved data, falls back to fixture.
 *   All setters are no-ops → read-only. Displays "Demo · Read Only" badge.
 *
 * Admin (isAdmin=true): same Supabase load, but enables real setters across all
 *   panels, shows a SetupWizard entry for config reconfiguration, and provides
 *   Save / Revert controls. Changes only persist when the admin clicks Save.
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { DEMO_ACCOUNT_1 } from "../fixtures/demo-account-1.js";
import { DEMO_ACCOUNT_2 } from "../fixtures/demo-account-2.js";
import { SH } from "./ui.jsx";
import { SetupWizard } from "./SetupWizard.jsx";
import { HomePanel } from "./HomePanel.jsx";
import { IncomePanel } from "./IncomePanel.jsx";
import { BudgetPanel } from "./BudgetPanel.jsx";
import { LogPanel } from "./LogPanel.jsx";
import { loadDemoAccount, saveDemoAccount } from "../lib/db.js";
import {
  buildYear,
  computeNet,
  computeRemainingSpend,
  calcEventImpact,
  toLocalIso,
  isFutureWeek,
  fedTax,
  stateTax,
  getStateConfig,
} from "../lib/finance.js";
import { getFundedGoalSpend } from "../lib/goalFunding.js";
import {
  getCurrentFiscalWeek,
  getFiscalWeekInfo,
  formatFiscalWeekLabel,
} from "../lib/fiscalWeek.js";

const FIXTURES = { 1: DEMO_ACCOUNT_1, 2: DEMO_ACCOUNT_2 };

const NOOP = () => {};

const DEMO_TABS = [
  { key: "home",   label: "Home"   },
  { key: "income", label: "Income" },
  { key: "budget", label: "Budget" },
  { key: "log",    label: "Log"    },
];

export function DemoAccountTree({ accountNumber = 1, isAdmin = false, onExit }) {
  const fixture = FIXTURES[accountNumber] ?? DEMO_ACCOUNT_1;

  // ── Editable state — initialized from fixture, overwritten by Supabase load ─
  const [demoConfig,   setDemoConfig]   = useState(fixture.config);
  const [demoExpenses, setDemoExpenses] = useState(fixture.expenses);
  const [demoGoals,    setDemoGoals]    = useState(fixture.goals);
  const [demoLogs,     setDemoLogs]     = useState(fixture.logs);

  // ── Admin-only state ─────────────────────────────────────────────────────────
  const [wizardOpen,  setWizardOpen]  = useState(false);
  const [saveStatus,  setSaveStatus]  = useState("idle"); // "idle"|"saving"|"saved"|"error"
  const [isDirty,     setIsDirty]     = useState(false);

  const [activeTab, setActiveTab] = useState("home");
  const today = useMemo(() => toLocalIso(new Date()), []);

  // ── Load from Supabase on mount ──────────────────────────────────────────────
  // Both admins and investors see admin-edited data if a row exists.
  useEffect(() => {
    loadDemoAccount(accountNumber)
      .then(data => {
        if (!data) return;
        if (data.config && Object.keys(data.config).length)
          setDemoConfig(prev => ({ ...prev, ...data.config }));
        if (Array.isArray(data.expenses) && data.expenses.length)
          setDemoExpenses(data.expenses);
        if (Array.isArray(data.goals) && data.goals.length)
          setDemoGoals(data.goals);
        if (Array.isArray(data.logs) && data.logs.length)
          setDemoLogs(data.logs);
      })
      .catch(() => { /* silently fall back to fixture */ });
  }, [accountNumber]);

  // ── Dirty-marking setters (admin only; investors get NOOPs below) ────────────
  const handleSetConfig = useCallback(patch => {
    setDemoConfig(typeof patch === "function" ? patch : prev => ({ ...prev, ...patch }));
    setIsDirty(true);
    setSaveStatus("idle");
  }, []);
  const handleSetExpenses = useCallback(val => {
    setDemoExpenses(val);
    setIsDirty(true);
    setSaveStatus("idle");
  }, []);
  const handleSetGoals = useCallback(val => {
    setDemoGoals(val);
    setIsDirty(true);
    setSaveStatus("idle");
  }, []);
  const handleSetLogs = useCallback(val => {
    setDemoLogs(val);
    setIsDirty(true);
    setSaveStatus("idle");
  }, []);

  // Resolve which setters panels receive based on admin flag
  const setConfig   = isAdmin ? handleSetConfig   : NOOP;
  const setExpenses = isAdmin ? handleSetExpenses : NOOP;
  const setGoals    = isAdmin ? handleSetGoals    : NOOP;
  const setLogs     = isAdmin ? handleSetLogs     : NOOP;

  // Convenience aliases
  const config   = demoConfig;
  const expenses = demoExpenses;
  const goals    = demoGoals;
  const logs     = demoLogs;
  const { meta } = fixture; // display name / role / location always from fixture

  const isEmployerDHL = config.employerPreset === "DHL";

  // ── Save to Supabase ─────────────────────────────────────────────────────────
  async function handleSave() {
    setSaveStatus("saving");
    try {
      await saveDemoAccount(accountNumber, { config, expenses, goals, logs, meta });
      setIsDirty(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    }
  }

  function handleRevert() {
    setDemoConfig(fixture.config);
    setDemoExpenses(fixture.expenses);
    setDemoGoals(fixture.goals);
    setDemoLogs(fixture.logs);
    setIsDirty(false);
    setSaveStatus("idle");
  }

  // ── Finance engine ──────────────────────────────────────────────────────────
  const allWeeks = useMemo(() => buildYear(config), [config]);

  const futureWeeks = useMemo(
    () => allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) >= today),
    [allWeeks, today]
  );

  const currentWeek = useMemo(
    () => getCurrentFiscalWeek(allWeeks, today),
    [allWeeks, today]
  );

  const currentWeekNumber = useMemo(
    () => getFiscalWeekInfo(currentWeek),
    [currentWeek]
  );

  const currentWeekLabel = formatFiscalWeekLabel(currentWeekNumber);

  // ── Event impact (mirrors App.jsx eventImpact memo) ────────────────────────
  const eventImpact = useMemo(() => {
    const futureWeekCount = futureWeeks.length || 1;
    const weeklyNetAdjustments = {};
    const futureEventDeductionsByWeek = {};
    let nL = 0, nG = 0, k4L = 0, k4ML = 0, ptoL = 0, missedDayNetLost = 0;
    const grossDeltaByWeek = {};

    logs.forEach(e => {
      const eIdx = Number(e.weekIdx);
      const weekMeta = Number.isFinite(eIdx)
        ? (allWeeks.find(w => w.idx === eIdx) ?? null)
        : null;
      const i = calcEventImpact(e, config, weekMeta);
      nL += i.netLost; nG += i.netGained;
      if ((e.type === "missed_unpaid" || e.type === "missed_unapproved") && i.netLost)
        missedDayNetLost += i.netLost;
      k4L += i.k401kLost; k4ML += i.k401kMatchLost;
      ptoL += i.hoursLostForPTO;

      if (!Number.isFinite(eIdx)) return;
      const netDelta = (i.netGained || 0) - (i.netLost || 0);
      if (netDelta !== 0)
        weeklyNetAdjustments[eIdx] = (weeklyNetAdjustments[eIdx] || 0) + netDelta;
      const grossDelta = (i.grossGained || 0) - (i.grossLost || 0);
      if (grossDelta !== 0)
        grossDeltaByWeek[eIdx] = (grossDeltaByWeek[eIdx] || 0) + grossDelta;

      const weekEndIso = typeof e.weekEnd === "string"
        ? e.weekEnd
        : (e.weekEnd ? toLocalIso(e.weekEnd) : null);
      if (weekEndIso && isFutureWeek(weekEndIso, today) && i.netLost)
        futureEventDeductionsByWeek[eIdx] = (futureEventDeductionsByWeek[eIdx] || 0) + i.netLost;
    });

    const totalNetAdjustment = Object.values(weeklyNetAdjustments).reduce((s, v) => s + v, 0);
    return {
      netLost: nL, netGained: nG,
      missedEventDayNetLost: missedDayNetLost,
      k401kLost: k4L, k401kMatchLost: k4ML,
      k401kGained: 0, k401kMatchGained: 0,
      ptoHoursLost: ptoL, bucketHours: 0,
      totalNetAdjustment,
      adjustedWeeklyDelta: totalNetAdjustment / futureWeekCount,
      weeklyNetAdjustments,
      futureEventDeductionsByWeek,
      grossDeltaByWeek,
    };
  }, [logs, config, allWeeks, futureWeeks, today]);

  // ── Tax derived (mirrors App.jsx taxDerived memo) ──────────────────────────
  const taxDerived = useMemo(() => {
    const activeWeeks = allWeeks.filter(w => w.active);
    const adjustedTaxableGrossByWeek = new Map(
      activeWeeks.map(w => [
        w.idx,
        Math.max((w.taxableGross ?? 0) + (eventImpact.grossDeltaByWeek[w.idx] || 0), 0),
      ])
    );
    const tt = activeWeeks.reduce(
      (s, w) => s + (adjustedTaxableGrossByWeek.get(w.idx) ?? 0), 0
    );
    const fAGI = Math.max(tt - config.fedStdDeduction, 0);
    const fL = fedTax(fAGI);
    const stateConfig = getStateConfig(config.userState);
    const mL = stateConfig ? stateTax(tt, stateConfig) : tt * (config.moFlatRate ?? 0.047);
    const ficaT = activeWeeks.reduce(
      (s, w) => s + Math.max((w.grossPay ?? 0) + (eventImpact.grossDeltaByWeek[w.idx] || 0), 0) * config.ficaRate,
      0
    );
    const fedLow  = config.fedRateLow  ?? 0.0784;
    const fedHigh = config.fedRateHigh ?? 0.1283;
    const stLow   = config.stateRateLow  ?? 0;
    const stHigh  = config.stateRateHigh ?? 0;
    const taxedSet = new Set(config.taxedWeeks ?? []);
    const fWB = activeWeeks.filter(w => taxedSet.has(w.idx)).reduce(
      (s, w) => s + (adjustedTaxableGrossByWeek.get(w.idx) ?? 0) * (w.isHighWeek ? fedHigh : fedLow), 0
    );
    const mWB = activeWeeks.filter(w => taxedSet.has(w.idx)).reduce(
      (s, w) => s + (adjustedTaxableGrossByWeek.get(w.idx) ?? 0) * (w.isHighWeek ? stHigh : stLow), 0
    );
    const fG = fL - fWB, mG = mL - mWB, tG = fG + mG;
    // Admin sees targetOwedAtFiling reduction; investors see the raw gap.
    const tET = isAdmin
      ? Math.max(tG - (config.targetOwedAtFiling ?? 0), 0)
      : Math.max(tG, 0);
    const remainingTaxedChecks = activeWeeks.filter(
      w => toLocalIso(w.weekEnd) >= today && taxedSet.has(w.idx)
    ).length;
    return {
      fedAGI: fAGI, fedLiability: fL, moLiability: mL, ficaTotal: ficaT,
      fedWithheldBase: fWB, moWithheldBase: mWB, fedGap: fG, moGap: mG,
      totalGap: tG, targetExtraTotal: tET, taxedWeekCount: remainingTaxedChecks,
      extraPerCheck: remainingTaxedChecks > 0 ? tET / remainingTaxedChecks : 0,
    };
  }, [allWeeks, config, eventImpact.grossDeltaByWeek, today, isAdmin]);

  // ── Income projections ──────────────────────────────────────────────────────
  const projectedAnnualNet = useMemo(
    () => allWeeks.filter(w => w.active).reduce(
      (s, w) => s + computeNet(w, config, taxDerived.extraPerCheck, true), 0
    ),
    [allWeeks, config, taxDerived]
  );

  const bufferPerWeek = config.bufferEnabled ? (config.paycheckBuffer ?? 50) : 0;
  const weeklyIncome = projectedAnnualNet / 52 - bufferPerWeek;

  const prevWeekNet = useMemo(() => {
    const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < today);
    if (!pastWeeks.length) return weeklyIncome;
    const prevWeek = pastWeeks[pastWeeks.length - 1];
    const baseNet = computeNet(prevWeek, config, taxDerived.extraPerCheck, true) - bufferPerWeek;
    const weekAdj = logs
      .filter(e => e.weekIdx === prevWeek.idx)
      .reduce((sum, e) => {
        const i = calcEventImpact(e, config, prevWeek);
        return sum + i.netGained - i.netLost;
      }, 0);
    return baseNet + weekAdj;
  }, [allWeeks, today, config, taxDerived, bufferPerWeek, weeklyIncome, logs]);

  const weekNetLookup = useMemo(() => {
    const adjustments = eventImpact.weeklyNetAdjustments || {};
    const result = {};
    allWeeks.forEach(w => {
      const baseNet = computeNet(w, config, taxDerived.extraPerCheck, true);
      const spendable = baseNet - bufferPerWeek;
      const adjustment = adjustments[w.idx] || 0;
      result[w.idx] = {
        baseNet,
        adjustedNet: baseNet + adjustment,
        spendable,
        adjustedSpendable: spendable + adjustment,
        adjustment,
      };
    });
    return result;
  }, [allWeeks, config, taxDerived.extraPerCheck, bufferPerWeek, eventImpact.weeklyNetAdjustments]);

  const futureWeekNetsRaw = useMemo(
    () => futureWeeks.map(w =>
      weekNetLookup[w.idx]?.spendable ??
      (computeNet(w, config, taxDerived.extraPerCheck, true) - bufferPerWeek)
    ),
    [futureWeeks, weekNetLookup, config, taxDerived, bufferPerWeek]
  );

  const futureWeekNets = useMemo(
    () => futureWeeks.map((w, idx) =>
      weekNetLookup[w.idx]?.adjustedSpendable ?? futureWeekNetsRaw[idx] ?? 0
    ),
    [futureWeeks, weekNetLookup, futureWeekNetsRaw]
  );

  // ── Spend / goals ───────────────────────────────────────────────────────────
  const remainingSpend = useMemo(
    () => computeRemainingSpend(expenses, futureWeeks),
    [expenses, futureWeeks]
  );

  const fundedGoalSpend = useMemo(
    () => getFundedGoalSpend(goals, today),
    [goals, today]
  );

  const baseWeeklyUnallocated = weeklyIncome - remainingSpend.avgWeeklySpend;

  // ── Log totals ──────────────────────────────────────────────────────────────
  const logTotals = useMemo(() => ({
    netLost: eventImpact.netLost,
    netGained: eventImpact.netGained,
    missedEventDayNetLost: eventImpact.missedEventDayNetLost,
    k401kLost: eventImpact.k401kLost,
    k401kMatchLost: eventImpact.k401kMatchLost,
    k401kGained: eventImpact.k401kGained,
    k401kMatchGained: eventImpact.k401kMatchGained,
    ptoHoursLost: eventImpact.ptoHoursLost,
    bucketHours: eventImpact.bucketHours,
    adjustedTakeHome: projectedAnnualNet + eventImpact.totalNetAdjustment - fundedGoalSpend,
    adjustedWeeklyAvg: baseWeeklyUnallocated + eventImpact.adjustedWeeklyDelta,
  }), [eventImpact, projectedAnnualNet, baseWeeklyUnallocated, fundedGoalSpend]);

  const futureEventDeductions = eventImpact.futureEventDeductionsByWeek;

  // ── Panel renderer ──────────────────────────────────────────────────────────
  const panel = (() => {
    switch (activeTab) {
      case "home":
        return (
          <HomePanel
            navigate={setActiveTab}
            onLocalSignOut={NOOP}
            weeklyIncome={weeklyIncome}
            adjustedTakeHome={logTotals.adjustedTakeHome}
            remainingSpend={remainingSpend}
            goals={goals}
            setGoals={setGoals}
            futureWeeks={futureWeeks}
            futureWeekNets={futureWeekNets}
            timelineWeekNets={futureWeekNetsRaw}
            expenses={expenses}
            config={config}
            logNetLost={logTotals.netLost}
            logNetGained={logTotals.netGained}
            futureEventDeductions={futureEventDeductions}
            prevWeekNet={prevWeekNet}
            currentWeek={currentWeek}
            fiscalWeekInfo={currentWeekNumber}
            today={today}
            fundedGoalSpend={fundedGoalSpend}
            isAdmin={isAdmin}
          />
        );
      case "income":
        return (
          <IncomePanel
            allWeeks={allWeeks}
            config={config}
            setConfig={setConfig}
            showExtra={true}
            setShowExtra={NOOP}
            taxDerived={taxDerived}
            missedEventDayNetLost={logTotals.missedEventDayNetLost}
            adjustedTakeHome={logTotals.adjustedTakeHome}
            projectedAnnualNet={projectedAnnualNet}
            currentWeek={currentWeek}
            isAdmin={isAdmin}
            today={today}
            weekNetLookup={weekNetLookup}
          />
        );
      case "budget":
        return (
          <BudgetPanel
            expenses={expenses}
            setExpenses={setExpenses}
            weeklyIncome={weeklyIncome}
            prevWeekNet={prevWeekNet}
            futureWeeks={futureWeeks}
            futureWeekNets={futureWeekNets}
            currentWeek={currentWeek}
            fiscalWeekInfo={currentWeekNumber}
            today={today}
            userPaySchedule={config.userPaySchedule ?? "weekly"}
            fundedGoalSpend={fundedGoalSpend}
            config={config}
            bufferPerWeek={bufferPerWeek}
            isAdmin={isAdmin}
          />
        );
      case "log":
        return (
          <LogPanel
            logs={logs}
            setLogs={setLogs}
            config={config}
            isEmployerDHL={isEmployerDHL}
            isAdmin={isAdmin}
            setConfig={setConfig}
            weekConfirmations={{}}
            projectedAnnualNet={projectedAnnualNet}
            baseWeeklyUnallocated={baseWeeklyUnallocated}
            futureWeeks={futureWeeks}
            allWeeks={allWeeks}
            currentWeek={currentWeek}
            fiscalWeekInfo={currentWeekNumber}
            logK401kLost={logTotals.k401kLost}
            logK401kMatchLost={logTotals.k401kMatchLost}
            logK401kGained={logTotals.k401kGained}
            logK401kMatchGained={logTotals.k401kMatchGained}
            logPTOHoursLost={logTotals.ptoHoursLost}
            ptoGoal={null}
            setPtoGoal={NOOP}
            goals={goals}
            fundedGoalSpend={fundedGoalSpend}
            bucketModel={null}
          />
        );
      default:
        return null;
    }
  })();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* SetupWizard for admin config reconfiguration — position:fixed covers full viewport */}
      {isAdmin && wizardOpen && (
        <SetupWizard
          config={config}
          onComplete={merged => {
            handleSetConfig(merged);
            setWizardOpen(false);
          }}
          onCancel={() => setWizardOpen(false)}
          lifeEvent={null}
        />
      )}

      <div style={{ padding: "0" }}>
        {/* ── Demo identity header ── */}
        <div style={{
          padding: "14px 16px 0",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
        }}>
          <div>
            <SH color="var(--color-gold)">Demo Account {accountNumber}</SH>
            <div style={{
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-sans)",
              marginTop: "2px",
            }}>
              {meta.displayName} · {meta.role} · {meta.location}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginTop: "2px" }}>
            {isAdmin ? (
              <>
                {/* Edit mode badge */}
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "rgba(245,158,11,0.12)",
                  border: "1px solid rgba(245,158,11,0.35)",
                  borderRadius: "6px",
                  padding: "4px 9px",
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  <span style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-warning)", fontFamily: "var(--font-sans)" }}>
                    Admin · Edit
                  </span>
                </div>
                {/* Reconfigure button — opens SetupWizard */}
                <button
                  onClick={() => setWizardOpen(true)}
                  style={{
                    background: "rgba(0,200,150,0.10)",
                    border: "1px solid rgba(0,200,150,0.28)",
                    borderRadius: "6px",
                    padding: "4px 9px",
                    fontSize: "9px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "var(--color-accent-primary)",
                    cursor: "pointer",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Reconfigure
                </button>
              </>
            ) : (
              /* Investor: read-only badge */
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(0,200,150,0.10)",
                border: "1px solid rgba(0,200,150,0.28)",
                borderRadius: "6px",
                padding: "4px 9px",
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-accent-primary)", fontFamily: "var(--font-sans)" }}>
                  Demo · Read Only
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Admin action bar: Save / Revert / Exit ── */}
        {isAdmin && (
          <div style={{
            padding: "8px 16px 0",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}>
            <button
              onClick={handleSave}
              disabled={saveStatus === "saving" || !isDirty}
              style={{
                background: isDirty ? "var(--color-accent-primary)" : "var(--color-bg-raised)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "10px",
                letterSpacing: "1px",
                textTransform: "uppercase",
                fontWeight: "bold",
                color: isDirty ? "var(--color-bg-base)" : "var(--color-text-disabled)",
                cursor: isDirty && saveStatus !== "saving" ? "pointer" : "not-allowed",
                transition: "background 0.15s, color 0.15s",
                fontFamily: "var(--font-sans)",
              }}
            >
              {saveStatus === "saving" ? "Saving…"
                : saveStatus === "saved" ? "Saved ✓"
                : saveStatus === "error" ? "Error ✗"
                : "Save Demo"}
            </button>

            {isDirty && (
              <button
                onClick={handleRevert}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(239,68,68,0.35)",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "10px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--color-deduction)",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Revert
              </button>
            )}

            {onExit && (
              <button
                onClick={onExit}
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "10px",
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                  marginLeft: "auto",
                  fontFamily: "var(--font-sans)",
                }}
              >
                ← Exit Demo
              </button>
            )}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{
          display: "flex",
          gap: "0",
          padding: "10px 16px 0",
          borderBottom: "1px solid var(--color-border-subtle)",
          marginBottom: "0",
        }}>
          {DEMO_TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: active ? "2px solid var(--color-accent-primary)" : "2px solid transparent",
                  color: active ? "var(--color-accent-primary)" : "var(--color-text-secondary)",
                  fontSize: "11px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  fontWeight: active ? "700" : "500",
                  padding: "8px 14px 10px",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
          {currentWeekNumber && (
            <div style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              paddingBottom: "2px",
            }}>
              <span style={{
                fontSize: "9px",
                letterSpacing: "1px",
                textTransform: "uppercase",
                padding: "2px 7px",
                background: "rgba(0,200,150,0.12)",
                color: "var(--color-green)",
                border: "1px solid rgba(0,200,150,0.28)",
                borderRadius: "3px",
                fontFamily: "var(--font-sans)",
              }}>
                {currentWeekLabel}
              </span>
            </div>
          )}
        </div>

        {/* ── Panel content ── */}
        <div>
          {panel}
        </div>
      </div>
    </>
  );
}
