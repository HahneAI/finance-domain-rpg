import { useState, useMemo, useEffect, useRef } from "react";
import { PHASES, CATEGORY_COLORS, CATEGORY_BG, FISCAL_YEAR_START, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { getEffectiveAmount, getEffectiveAmountForMonth, phaseIdxForMonth, computeLoanPayoffDate, buildLoanHistory, loanPaymentsRemaining, loanWeeklyAmount, toLocalIso, getPhaseIndex, computeRemainingSpend, deriveWeeklyPayrollDeductions } from "../lib/finance.js";
import { buildCascadedWeekly, latestPastEntry as latestPastEntryPure, applyMonthEdit, applyMonthEditForward, clearMonth, clearMonthForward, clearQuarterMonths, EXPENSE_CYCLE_OPTIONS, CHECKS_PER_MONTH, normalizeCycle, roundToQuarter, toMonthlyCost, fromMonthlyCost, perPaycheckFromCycle, cycleAmountFromPerPaycheck, monthlyFromPerPaycheck } from "../lib/expense.js";
import { formatFiscalWeekLabel } from "../lib/fiscalWeek.js";
import { formatRotationDisplay } from "../lib/rotation.js";
import { Card, VT, SmBtn, SH, SectionHeader, PanelHero, iS, lS } from "./ui.jsx";
import { LiquidGlass } from "./LiquidGlass.jsx";
import { MonthQuarterSelector } from "./MonthQuarterSelector.jsx";
import { BulkEditPanel } from "./BulkEditPanel.jsx";

const EXPENSE_DRAG_PREVIEW_TINT = {
  Needs: "rgba(201, 96, 96, 0.18)",
  Lifestyle: "rgba(91, 140, 255, 0.18)",
};
const EXPENSE_TOUCH_OVERLAY_BG = {
  Needs: "#c96060",
  Lifestyle: "#5B8CFF",
};

const CAT_GRADIENT = {
  Needs: "rgba(201, 96, 96, 0.16)",
  Lifestyle: "rgba(91, 140, 255, 0.14)",
};
const EXPENSE_DRAG_EASE = "cubic-bezier(.22,.7,.2,1)";
const EXPENSE_INSERT_MARKER_BG = "rgba(255,255,255,0.72)";
const EXPENSE_INSERT_MARKER_BORDER = "rgba(255,255,255,0.14)";


export function BudgetPanel({ expenses, setExpenses, weeklyIncome, prevWeekNet, futureWeeks, futureWeekNets, currentWeek, today, fiscalWeekInfo, userPaySchedule, config, bufferPerWeek = 0, isAdmin = false }) {
  // TODAY_ISO from App — reactive, advances at midnight automatically
  const TODAY_ISO = today;
  const cpm = CHECKS_PER_MONTH[userPaySchedule ?? "weekly"] ?? 4;

  const currentPhaseIdx = useMemo(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0, [currentWeek]);
  const fiscalWeekLabel = formatFiscalWeekLabel(fiscalWeekInfo);
  const [ap, setAp] = useState(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0);
  const [view, setView] = useState("overview");
  // Expense CRUD state
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [addingExp, setAddingExp] = useState(false);
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
  const [pendingDelete, setPendingDelete] = useState(null); // { id } | null
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [showCheckInfo, setShowCheckInfo] = useState(false);
  const [undoDelete, setUndoDelete] = useState(null); // { expId, monthKey, prevValue } | null — clears after 8s
  const [restoreSheetCat, setRestoreSheetCat] = useState(null); // "Needs" | "Lifestyle" | null
  const [restorePendingExpId, setRestorePendingExpId] = useState(null); // expense id awaiting scope selection
  // Month-level period selector state
  const [activeMonth, setActiveMonth] = useState(null); // "2026-MM" | null — null = quarter mode
  // Keep the viewed phase in sync with the real current quarter so that
  // advanced-edit month amounts are always reflected as time advances.
  useEffect(() => {
    setAp(currentPhaseIdx);
    setActiveMonth(null); // reset to quarter view when the real quarter advances
  }, [currentPhaseIdx]);
  const handleSelectMonth = (monthKey) => {
    setActiveMonth(monthKey);
    setAp(phaseIdxForMonth(monthKey));
    setBulkEditOpen(false);
  };
  const handleSelectQuarter = (phaseIdx) => {
    setActiveMonth(null);
    setAp(phaseIdx);
    setBulkEditOpen(false);
  };
  // Loan CRUD state
  const [editLoanId, setEditLoanId] = useState(null);
  const [editLoanVals, setEditLoanVals] = useState({});
  const [addingLoan, setAddingLoan] = useState(false);
  const [newLoan, setNewLoan] = useState({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" });
  const [delLoanId, setDelLoanId] = useState(null);
  const [draggingExpenseId, setDraggingExpenseId] = useState(null);
  const [dragPreviewExpenseCategory, setDragPreviewExpenseCategory] = useState(null);
  const [expenseInsertLane, setExpenseInsertLane] = useState(null);
  const [expenseInsertIndex, setExpenseInsertIndex] = useState(null);
  const [touchDragOverlay, setTouchDragOverlay] = useState({ visible: false, x: 0, y: 0, label: "", sourceCategory: "Needs" });
  const expenseTouchDraggingRef = useRef(false);
  const expenseTouchHoverLaneRef = useRef(null);
  const expenseInsertRef = useRef({ lane: null, index: null });
  const expenseTouchHoldTimerRef = useRef(null);
  const expenseTouchHoldMetaRef = useRef(null);
  const expenseTouchAutoScrollRef = useRef({ rafId: null, direction: 0, speed: 0 });
  const expenseTouchOverlayExitTimerRef = useRef(null);
  const expenseDragFinalizedRef = useRef(false);
  const [pendingExpenseTouchId, setPendingExpenseTouchId] = useState(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const EXPENSE_TOUCH_HOLD_MS = 450;
  const TOUCH_SCROLL_CANCEL_PX = 12;
  const TOUCH_EDGE_AUTOSCROLL_ZONE_PX = 92;
  const TOUCH_MAX_AUTOSCROLL_SPEED_PX = 18;
  const TOUCH_OVERLAY_EXIT_MS = 130;
  // Full-year annual cost: sums across all 4 quarters using a representative date per quarter.
  // Using a date within each quarter means getEffectiveAmount picks the correct history entry —
  // loans that pay off mid-year will return $0 for quarters after the payoff date.
  const Q_REP_DATES = [new Date("2026-02-15"), new Date("2026-05-15"), new Date("2026-08-15"), new Date("2026-11-15")];
  const WEEKS_PER_Q = [13, 13, 13, 13]; // 52 weeks total
  const currentEffective = (exp, phaseIdx) => getEffectiveAmount(exp, new Date(), phaseIdx);
  // First calendar month of each quarter — used as the representative month in quarter mode.
  const QUARTER_FIRST_MONTHS = ["2026-01", "2026-04", "2026-07", "2026-10"];
  const MONTH_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  // Month key for today — used to highlight the current month pill.
  const currentMonthKey = TODAY_ISO.slice(0, 7);
  // Short label for the active month (e.g. "MAY"), null in quarter mode.
  const activeMonthLabel = activeMonth ? MONTH_SHORT[parseInt(activeMonth.slice(5, 7), 10) - 1] : null;
  // In month mode, resolve amounts for the selected month; in quarter mode, use the
  // first month of the active quarter so the quarter view stays month-consistent.
  const displayMonthKey = activeMonth ?? QUARTER_FIRST_MONTHS[ap];
  const displayEffective = (exp, phaseIdx) => getEffectiveAmountForMonth(exp, displayMonthKey, phaseIdx);

  // Returns the ISO "YYYY-MM" key of the next future month where the effective amount
  // is non-zero, respecting monthlyOverrides. Returns null if all remaining months are zero.
  const getNextNonZeroIso = (exp, phaseIdx, todayIso) => {
    const currentMon = parseInt(todayIso.slice(5, 7), 10);
    for (let m = currentMon + 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, "0")}`;
      if (getEffectiveAmountForMonth(exp, key, phaseIdx) > 0) return key;
    }
    return null;
  };
  const shortMonth = (iso) =>
    ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(iso.split("-")[1], 10) - 1];
  const quarterEffective = (exp, phaseIdx) => getEffectiveAmount(exp, Q_REP_DATES[phaseIdx], phaseIdx);
  // Sum across all 12 months so monthlyOverrides are reflected in the breakdown table.
  // 52/12 weeks per month keeps the annual total at exactly 52 weeks.
  const yearlyExpenseCost = (exp) =>
    [0,1,2,3,4,5,6,7,8,9,10,11].reduce((s, m) => {
      const key = `2026-${String(m + 1).padStart(2, "0")}`;
      return s + getEffectiveAmountForMonth(exp, key, Math.floor(m / 3)) * (52 / 12);
    }, 0);

  // Split loans from regular expenses for display purposes
  const loans = expenses.filter(e => e.type === "loan");
  const regularExpenses = expenses.filter(e => e.type !== "loan");

  const ph = PHASES[ap];
  const ts = expenses.reduce((s, e) => s + displayEffective(e, ap), 0);
  const incomingWeekNet = futureWeekNets?.[0] ?? prevWeekNet ?? weeklyIncome;
  const finalizedWeekNet = prevWeekNet ?? weeklyIncome;
  const wr = weeklyIncome - ts;
  const avgWeeklySpend = useMemo(
    () => computeRemainingSpend(expenses, futureWeeks ?? []).avgWeeklySpend ?? 0,
    [expenses, futureWeeks],
  );
  // Set of month keys that have at least one non-loan expense with a monthlyOverride entry.
  // Used by MonthQuarterSelector to render the monthly change indicator dots on pills.
  const monthsWithOverrides = useMemo(() => {
    const keys = new Set();
    for (const exp of expenses) {
      if (exp?.type === "loan" || exp?.category === "Loans") continue;
      if (!exp.monthlyOverrides) continue;
      for (const key of Object.keys(exp.monthlyOverrides)) {
        keys.add(key);
      }
    }
    return keys;
  }, [expenses]);
  const leftThisWeek = finalizedWeekNet - avgWeeklySpend;

  // When viewing a future quarter or month, surface the projected first-check surplus
  // for that period instead of the current-week baseline.
  const isViewingFuture = ap > currentPhaseIdx || (activeMonth !== null && activeMonth > currentMonthKey);
  const targetMonthForFirstCheck = activeMonth ?? QUARTER_FIRST_MONTHS[ap];
  const firstCheckWeek = useMemo(() => {
    if (!isViewingFuture || !futureWeeks?.length) return null;
    return futureWeeks.find(w => toLocalIso(w.weekEnd).slice(0, 7) === targetMonthForFirstCheck) ?? null;
  }, [isViewingFuture, futureWeeks, targetMonthForFirstCheck]);
  const firstCheckIdx = firstCheckWeek ? futureWeeks.indexOf(firstCheckWeek) : -1;
  const firstCheckNet = firstCheckIdx >= 0 ? (futureWeekNets?.[firstCheckIdx] ?? weeklyIncome) : weeklyIncome;
  const firstCheckMonthKey = firstCheckWeek ? toLocalIso(firstCheckWeek.weekEnd).slice(0, 7) : targetMonthForFirstCheck;
  const firstCheckPhase = firstCheckWeek ? getPhaseIndex(firstCheckWeek.weekEnd) : ap;
  const firstCheckExpenses = useMemo(() => {
    if (!firstCheckWeek) return avgWeeklySpend;
    return expenses.reduce((s, e) => s + getEffectiveAmountForMonth(e, firstCheckMonthKey, firstCheckPhase), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstCheckWeek, expenses, firstCheckMonthKey, firstCheckPhase]);
  const leftFirstCheck = firstCheckNet - firstCheckExpenses;
  const firstCheckMonthShort = MONTH_SHORT[parseInt(targetMonthForFirstCheck.slice(5, 7), 10) - 1];

  // Paycheck breakdown data for the info modal
  const infoRefWeek    = isViewingFuture && firstCheckWeek ? firstCheckWeek : currentWeek;
  const infoMonthKey   = isViewingFuture && firstCheckWeek ? firstCheckMonthKey : currentMonthKey;
  const infoPhase      = isViewingFuture && firstCheckWeek ? firstCheckPhase : currentPhaseIdx;
  const infoLabel      = isViewingFuture && firstCheckWeek ? `First Check · ${firstCheckMonthShort}` : "This Week";
  const checkBreakdown = useMemo(() => {
    if (!infoRefWeek || !config) return null;
    const gross = infoRefWeek.grossPay ?? 0;
    const fica  = gross * (config.ficaRate ?? 0);
    const payroll   = deriveWeeklyPayrollDeductions(infoRefWeek, config);
    const benefits  = payroll.benefits;
    const k401      = payroll.k401Employee;
    let fedTax = 0, stateTax = 0;
    if (infoRefWeek.taxedBySchedule) {
      const fedRate = infoRefWeek.isHighWeek
        ? (config.fedRateHigh ?? config.w2FedRate ?? 0)
        : (config.fedRateLow  ?? config.w1FedRate ?? 0);
      const stRate  = infoRefWeek.isHighWeek
        ? (config.stateRateHigh ?? config.w2StateRate ?? 0)
        : (config.stateRateLow  ?? config.w1StateRate ?? 0);
      fedTax   = (infoRefWeek.taxableGross ?? 0) * fedRate;
      stateTax = (infoRefWeek.taxableGross ?? 0) * stRate;
    }
    const checksPerYear  = PAYCHECKS_PER_YEAR[config.userPaySchedule ?? "weekly"] ?? 52;
    const otherPostTax   = (config.otherDeductions ?? []).reduce((sum, row) => {
      const amt = row?.weeklyAmount;
      return sum + (typeof amt === "number" ? amt : 0);
    }, 0) * (checksPerYear / 52);
    const netPay    = gross - fica - fedTax - stateTax - benefits - k401 - otherPostTax;
    const spendable = netPay - bufferPerWeek;
    const needsSpend     = regularExpenses.filter(e => e.category === "Needs")
      .reduce((s, e) => s + getEffectiveAmountForMonth(e, infoMonthKey, infoPhase), 0);
    const lifestyleSpend = regularExpenses.filter(e => e.category === "Lifestyle")
      .reduce((s, e) => s + getEffectiveAmountForMonth(e, infoMonthKey, infoPhase), 0);
    const loansSpend     = loans
      .reduce((s, e) => s + getEffectiveAmountForMonth(e, infoMonthKey, infoPhase), 0);
    const left = spendable - needsSpend - lifestyleSpend - loansSpend;
    return { gross, fica, fedTax, stateTax, benefits, k401, otherPostTax, netPay, spendable, needsSpend, lifestyleSpend, loansSpend, left, otherDeductions: config.otherDeductions ?? [] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoRefWeek, config, bufferPerWeek, expenses, infoMonthKey, infoPhase]);

  const sp = Math.min((ts / weeklyIncome) * 100, 100);
  const cats = [...new Set(regularExpenses.map(e => e.category))];
  const overviewCatOrder = ["Needs", "Lifestyle"];
  const overviewCats = cats
    .slice()
    .sort((a, b) => {
      const aIdx = overviewCatOrder.indexOf(a);
      const bIdx = overviewCatOrder.indexOf(b);
      const safeA = aIdx === -1 ? overviewCatOrder.length : aIdx;
      const safeB = bIdx === -1 ? overviewCatOrder.length : bIdx;
      if (safeA !== safeB) return safeA - safeB;
      return a.localeCompare(b);
    });
  const f = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const round2 = (value) => (typeof value === "number" ? Math.round(value * 100) / 100 : value);

  // Budget debug trace — logs once when Budget tab mounts so formula routing is visible
  // directly in browser devtools for discrepancy triage (income vs spend vs weekly-left).
  useEffect(() => {
    const expenseBreakdown = expenses.map(exp => ({
      id: exp.id,
      label: exp.label,
      type: exp.type ?? "regular",
      phaseIdx: ap,
      effectiveWeekly: currentEffective(exp, ap),
      splitWeekly: exp.weekly?.[ap] ?? 0,
      hasHistory: Boolean(exp.history?.length),
      latestEffectiveFrom: exp.history?.length
        ? exp.history.reduce((best, entry) => entry.effectiveFrom > best ? entry.effectiveFrom : best, exp.history[0].effectiveFrom)
        : null,
    }));
    const groupedTotals = expenseBreakdown.reduce((acc, row) => {
      const key = row.type === "loan" ? "loan" : "regular";
      acc[key] += row.effectiveWeekly;
      return acc;
    }, { regular: 0, loan: 0 });
    const weeklyLeftFormula = incomingWeekNet - ts;
    console.groupCollapsed(`[Budget Debug] Phase ${ap} (${ph?.label ?? "unknown"})`);
    console.log("Formula", {
      weeklySpend: ts,
      incomingWeekNet,
      weeklyLeft: wr,
      weeklyLeftFormula,
      spendVsIncomePct: sp,
      weeklyIncomeAverage: weeklyIncome,
      prevWeekNet,
      futureWeekNet0: futureWeekNets?.[0] ?? null,
    });
    console.log("Expense totals", groupedTotals);
    console.table(expenseBreakdown);
    console.groupEnd();
    const quarterSummaries = Q_REP_DATES.map((_, qIdx) => {
      const quarterBreakdown = expenses.map(exp => ({
        id: exp.id,
        label: exp.label,
        type: exp.type ?? "regular",
        phaseIdx: qIdx,
        effectiveWeekly: quarterEffective(exp, qIdx),
        splitWeekly: exp.weekly?.[qIdx] ?? 0,
      }));
      const quarterTotals = quarterBreakdown.reduce((acc, row) => {
        const key = row.type === "loan" ? "loan" : "regular";
        acc[key] += row.effectiveWeekly;
        return acc;
      }, { regular: 0, loan: 0 });
      return {
        quarter: `Q${qIdx + 1}`,
        phaseLabel: PHASES[qIdx]?.label ?? `Phase ${qIdx + 1}`,
        regular: round2(quarterTotals.regular),
        loan: round2(quarterTotals.loan),
        total: round2(quarterTotals.regular + quarterTotals.loan),
      };
    });
    const quarterComparison = quarterSummaries.map((summary, idx) => {
      const prev = quarterSummaries[idx - 1];
      return {
        quarter: summary.quarter,
        phaseLabel: summary.phaseLabel,
        total: summary.total,
        deltaFromPrev: prev ? round2(summary.total - prev.total) : null,
        regular: summary.regular,
        loan: summary.loan,
        loanDeltaFromPrev: prev ? round2(summary.loan - prev.loan) : null,
      };
    });
    const expenseQuarterTable = expenses.map(exp => {
      const rawValues = Q_REP_DATES.map((_, qIdx) => quarterEffective(exp, qIdx));
      const values = rawValues.map(round2);
      const deltas = rawValues.map((value, qIdx) => qIdx === 0 ? null : round2(value - rawValues[qIdx - 1]));
      return {
        id: exp.id,
        label: exp.label,
        type: exp.type ?? "regular",
        q1: values[0],
        q2: values[1],
        q3: values[2],
        q4: values[3],
        deltaQ2: deltas[1],
        deltaQ3: deltas[2],
        deltaQ4: deltas[3],
      };
    });
    console.groupCollapsed("[Budget Debug][Quarterly] Quarterly spend comparison");
    console.table(quarterComparison);
    if (expenseQuarterTable.length) {
      console.table(expenseQuarterTable);
    }
    console.groupEnd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Budget debug trace — logs once when Budget tab mounts so formula routing is visible
  // directly in browser devtools for discrepancy triage (income vs spend vs weekly-left).
  useEffect(() => {
    const expenseBreakdown = expenses.map(exp => ({
      id: exp.id,
      label: exp.label,
      type: exp.type ?? "regular",
      phaseIdx: ap,
      effectiveWeekly: currentEffective(exp, ap),
      splitWeekly: exp.weekly?.[ap] ?? 0,
      hasHistory: Boolean(exp.history?.length),
      latestEffectiveFrom: exp.history?.length
        ? exp.history.reduce((best, entry) => entry.effectiveFrom > best ? entry.effectiveFrom : best, exp.history[0].effectiveFrom)
        : null,
    }));
    const groupedTotals = expenseBreakdown.reduce((acc, row) => {
      const key = row.type === "loan" ? "loan" : "regular";
      acc[key] += row.effectiveWeekly;
      return acc;
    }, { regular: 0, loan: 0 });
    const weeklyLeftFormula = incomingWeekNet - ts;
    console.groupCollapsed(`[Budget Debug] Phase ${ap} (${ph?.label ?? "unknown"})`);
    console.log("Formula", {
      weeklySpend: ts,
      incomingWeekNet,
      weeklyLeft: wr,
      weeklyLeftFormula,
      spendVsIncomePct: sp,
      weeklyIncomeAverage: weeklyIncome,
      prevWeekNet,
      futureWeekNet0: futureWeekNets?.[0] ?? null,
    });
    console.log("Expense totals", groupedTotals);
    console.table(expenseBreakdown);
    console.groupEnd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fiscal year end for drop-off detection
  const fiscalYearEnd = futureWeeks?.length ? toLocalIso(futureWeeks[futureWeeks.length - 1].weekEnd) : "2027-01-04";

  // Expense helpers
  const resolveExpenseCycle = (exp, phaseIdx) => {
    const phaseBillingMeta = exp.billingMeta?.byPhase?.[phaseIdx];
    return normalizeCycle(phaseBillingMeta?.cycle ?? exp.billingMeta?.cycle ?? exp.cycle ?? "every30days");
  };

  // Thin closure that binds TODAY_ISO so call sites stay unchanged.
  const latestPastEntry = (existing) => latestPastEntryPure(existing, TODAY_ISO);

  const startEditExp = (exp) => {
    if (activeMonth !== null) {
      // Month mode: read from monthlyOverrides if present, else derive from month resolver
      const override = exp.monthlyOverrides?.[activeMonth];
      if (override?.amount != null) {
        setEditId(exp.id);
        setEditVals({ amount: String(override.amount), cycle: override.cycle ?? "every30days" });
        return;
      }
      const cycle = resolveExpenseCycle(exp, ap);
      const perPaycheck = getEffectiveAmountForMonth(exp, activeMonth, ap);
      setEditId(exp.id);
      setEditVals({ amount: cycleAmountFromPerPaycheck(perPaycheck, cycle, cpm).toFixed(2), cycle });
      return;
    }
    // Quarter mode: existing history-based pre-fill
    const existing = exp.history?.length
      ? exp.history
      : [{ effectiveFrom: FISCAL_YEAR_START, weekly: exp.weekly ?? [0, 0, 0, 0] }];
    const base = latestPastEntry(existing);
    const cycle = resolveExpenseCycle(exp, ap);
    const anchorWeekly = base.weekly?.[ap] ?? base.weekly?.[0] ?? 0;
    setEditId(exp.id);
    setEditVals({
      amount: cycleAmountFromPerPaycheck(anchorWeekly, cycle, cpm).toFixed(2),
      cycle,
    });
  };
  const saveEditExp = (id) => {
    const cycle = normalizeCycle(editVals.cycle ?? "every30days");
    const amount = parseFloat(editVals.amount) || 0;
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const latest = latestPastEntry(existing);
      const baseWeekly = latest.weekly ?? [0, 0, 0, 0];
      const byPhase = {
        ...(e.billingMeta?.byPhase ?? {}),
        [ap]: { amount, cycle, effectiveFrom: TODAY_ISO },
      };
      const newWeekly = buildCascadedWeekly(ap, perPaycheck, baseWeekly, e.billingMeta?.byPhase);
      const billingMeta = { ...(e.billingMeta ?? {}), amount, cycle, effectiveFrom: TODAY_ISO, byPhase };
      const daysDiff = (new Date(TODAY_ISO) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 3) {
        return {
          ...e,
          history: existing.map(entry =>
            entry.effectiveFrom === latest.effectiveFrom
              ? { effectiveFrom: TODAY_ISO, weekly: newWeekly }
              : entry
          ),
          billingMeta
        };
      }
      return { ...e, history: [...existing, { effectiveFrom: TODAY_ISO, weekly: newWeekly }], billingMeta };
    }));
    setEditId(null);
  };

  const saveAdvancedEdit = ({ patches = [], additions = [] }) => {
    setExpenses(prev => {
      // Group patches by expId so multiple patches per expense are all applied
      const patchMap = {};
      for (const p of patches) {
        if (!patchMap[p.expId]) patchMap[p.expId] = [];
        patchMap[p.expId].push(p);
      }

      const updated = prev.map(e => {
        const expPatches = patchMap[e.id];
        if (!expPatches) return e;
        let history = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
        let billingMeta = e.billingMeta ?? {};
        for (const { effectiveFrom, newWeekly, newByPhase } of expPatches) {
          const exactMatch = history.find(en => en.effectiveFrom === effectiveFrom);
          if (exactMatch) {
            history = history.map(en => en.effectiveFrom === effectiveFrom ? { effectiveFrom, weekly: newWeekly } : en);
          } else {
            history = [...history, { effectiveFrom, weekly: newWeekly }];
          }
          if (newByPhase) billingMeta = { ...billingMeta, byPhase: newByPhase };
        }
        return { ...e, history, billingMeta };
      });

      const newExps = additions.map(a => ({
        id: `exp_${crypto.randomUUID()}`,
        category: a.category,
        label: a.label,
        note: ["", "", "", ""],
        billingMeta: {
          amount: a.amount,
          cycle: a.cycle,
          effectiveFrom: a.effectiveFrom,
          byPhase: { [a.phaseIdx]: { amount: a.amount, cycle: a.cycle, effectiveFrom: a.effectiveFrom } },
        },
        history: [{ effectiveFrom: a.effectiveFrom, weekly: a.weekly }],
      }));

      return [...updated, ...newExps];
    });
    setBulkEditOpen(false);
  };

  const addExp = () => {
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    setExpenses(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom: TODAY_ISO },
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [perPaycheck, perPaycheck, perPaycheck, perPaycheck] }]
    }]);
    setAddingExp(false); setNewExp({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
  };

  const _closeAddForm = () => {
    setAddingExp(false);
    setNewExp({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
  };

  const addExpThisMonth = () => {
    if (!newExp.label || !activeMonth) return;
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    setExpenses(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom: TODAY_ISO },
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [0, 0, 0, 0] }],
      monthlyOverrides: { [activeMonth]: { perPaycheck, amount, cycle } },
    }]);
    _closeAddForm();
  };

  const addExpFromMonthForward = () => {
    if (!newExp.label || !activeMonth) return;
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const [year, startMon] = activeMonth.split("-").map(Number);
    const overrides = {};
    for (let m = startMon; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      overrides[key] = { perPaycheck, amount, cycle };
    }
    const effectiveFrom = `${activeMonth}-01`;
    const weekly = [0, 1, 2, 3].map(q => q < ap ? 0 : perPaycheck);
    setExpenses(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom },
      history: [{ effectiveFrom, weekly }],
      monthlyOverrides: overrides,
    }]);
    _closeAddForm();
  };

  const addExpAllQuarters = () => {
    if (!newExp.label) return;
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const weekly = [0, 1, 2, 3].map(q => q < ap ? 0 : perPaycheck);
    setExpenses(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom: TODAY_ISO },
      history: [{ effectiveFrom: TODAY_ISO, weekly }],
    }]);
    _closeAddForm();
  };

  const deleteExp = (id) => {
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const latest = latestPastEntry(existing);
      const baseWeekly = latest.weekly ?? [0, 0, 0, 0];
      // Zero out active phase and forward; preserve phases before the active one
      const newWeekly = [0, 1, 2, 3].map(q => q < ap ? (baseWeekly[q] ?? 0) : 0);
      const daysDiff = (new Date(TODAY_ISO) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 3) {
        return {
          ...e,
          history: existing.map(entry =>
            entry.effectiveFrom === latest.effectiveFrom
              ? { effectiveFrom: TODAY_ISO, weekly: newWeekly }
              : entry
          ),
        };
      }
      return { ...e, history: [...existing, { effectiveFrom: TODAY_ISO, weekly: newWeekly }] };
    }));
    setPendingDelete(null);
  };

  // ── Edit scope helpers ────────────────────────────────────────────────────────
  // Shared read for all three save scopes.
  const _editParsed = () => ({
    cycle: normalizeCycle(editVals.cycle ?? "every30days"),
    amount: parseFloat(editVals.amount) || 0,
  });

  // MO. ONLY — writes a single monthlyOverrides entry; no history change.
  const saveThisMonth = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    setExpenses(prev => prev.map(e =>
      e.id !== expId ? e : applyMonthEdit(e, activeMonth, perPaycheck, amount, cycle)
    ));
    setEditId(null);
  };

  // FROM [MON] + — force-overwrites monthlyOverrides for activeMonth through Dec
  // AND adds a history entry so quarterly totals also update.
  const saveFromMonthForward = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const [year, startMon] = activeMonth.split("-").map(Number);
    setExpenses(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const overrides = { ...(e.monthlyOverrides ?? {}) };
      for (let m = startMon; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, "0")}`;
        overrides[key] = { perPaycheck, amount, cycle };
      }
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const latest = latestPastEntry(existing);
      const baseWeekly = latest.weekly ?? [0, 0, 0, 0];
      const newWeekly = [0, 1, 2, 3].map(q => q < ap ? (baseWeekly[q] ?? 0) : perPaycheck);
      const billingMeta = { ...(e.billingMeta ?? {}), amount, cycle, effectiveFrom: TODAY_ISO };
      const daysDiff = (new Date(TODAY_ISO) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
      // Trim future-dated entries — they would otherwise take priority over this new entry
      // for weeks past their effectiveFrom date, causing unexpected cost spikes.
      const pastEntries = existing.filter(en => en.effectiveFrom <= TODAY_ISO);
      const newHistory = daysDiff <= 3
        ? pastEntries.map(en => en.effectiveFrom === latest.effectiveFrom ? { effectiveFrom: TODAY_ISO, weekly: newWeekly } : en)
        : [...pastEntries, { effectiveFrom: TODAY_ISO, weekly: newWeekly }];
      return { ...e, history: newHistory, billingMeta, monthlyOverrides: overrides };
    }));
    setEditId(null);
  };

  // ALL QTR — updates history from current quarter forward, ignoring drop-offs.
  const saveAllQuarters = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    setExpenses(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const latest = latestPastEntry(existing);
      const baseWeekly = latest.weekly ?? [0, 0, 0, 0];
      const newWeekly = [0, 1, 2, 3].map(q => q < ap ? (baseWeekly[q] ?? 0) : perPaycheck);
      const billingMeta = { ...(e.billingMeta ?? {}), amount, cycle, effectiveFrom: TODAY_ISO };
      const daysDiff = (new Date(TODAY_ISO) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
      // Trim future-dated entries so this override is authoritative for all future weeks.
      const pastEntries = existing.filter(en => en.effectiveFrom <= TODAY_ISO);
      const newHistory = daysDiff <= 3
        ? pastEntries.map(en => en.effectiveFrom === latest.effectiveFrom ? { effectiveFrom: TODAY_ISO, weekly: newWeekly } : en)
        : [...pastEntries, { effectiveFrom: TODAY_ISO, weekly: newWeekly }];
      return { ...e, history: newHistory, billingMeta };
    }));
    setEditId(null);
  };

  const deleteMonthOnly = (expId) => {
    const monthKey = activeMonth ?? currentMonthKey;
    const target = expenses.find(e => e.id === expId);
    // Store previous override value so user can UNDO within 8s
    const prevValue = target?.monthlyOverrides?.[monthKey] ?? null;
    setExpenses(prev => prev.map(e => e.id !== expId ? e : clearMonth(e, monthKey)));
    setUndoDelete({ expId, monthKey, prevValue });
    setPendingDelete(null);
  };

  const deleteMonthForward = (expId) => {
    // Always use clearMonthForward so monthlyOverrides are properly zeroed.
    // In quarter mode activeMonth is null, so fall back to the first month of the active quarter.
    const startKey = activeMonth ?? QUARTER_FIRST_MONTHS[ap];
    setExpenses(prev => prev.map(e => e.id !== expId ? e : clearMonthForward(e, startKey)));
    setUndoDelete(null);
    setPendingDelete(null);
  };

  const executeUndo = () => {
    if (!undoDelete) return;
    const { expId, monthKey, prevValue } = undoDelete;
    setExpenses(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const overrides = { ...(e.monthlyOverrides ?? {}) };
      if (prevValue === null) {
        delete overrides[monthKey];
      } else {
        overrides[monthKey] = prevValue;
      }
      return { ...e, monthlyOverrides: overrides };
    }));
    setUndoDelete(null);
  };

  const deleteQuarterOnly = (expId) => {
    setExpenses(prev => prev.map(e => e.id !== expId ? e : clearQuarterMonths(e, ap)));
    setPendingDelete(null);
  };

  // Quarter-to-month mapping used by restore scope helpers.
  const Q_MONTHS = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];

  // Returns month keys to clear overrides for based on restore scope:
  // "month"   → just the active month (or first month of active quarter)
  // "quarter" → all 3 months of the active quarter
  // "year"    → current month through December (active quarters only)
  const getRestoreMonthKeys = (scope) => {
    const fy = FISCAL_YEAR_START.slice(0, 4);
    const todayMon = parseInt(TODAY_ISO.slice(5, 7), 10);
    if (scope === "month") {
      const key = activeMonth ?? `${fy}-${String(Q_MONTHS[ap][0]).padStart(2, "0")}`;
      return [key];
    }
    if (scope === "quarter") {
      return Q_MONTHS[ap].map(m => `${fy}-${String(m).padStart(2, "0")}`);
    }
    // "year": from the later of (today's month, start of active quarter) through December
    const fromMon = Math.max(todayMon, Q_MONTHS[ap][0]);
    return Array.from({ length: 12 - fromMon + 1 }, (_, i) => `${fy}-${String(fromMon + i).padStart(2, "0")}`);
  };

  const restoreExpense = (expId, scope) => {
    const monthKeys = getRestoreMonthKeys(scope);
    setExpenses(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const overrides = { ...(e.monthlyOverrides ?? {}) };
      for (const key of monthKeys) delete overrides[key];
      return { ...e, monthlyOverrides: overrides };
    }));
    setRestorePendingExpId(null);
    setRestoreSheetCat(null);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setIsCoarsePointer(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  useEffect(() => {
    if (!undoDelete) return;
    const t = setTimeout(() => setUndoDelete(null), 8000);
    return () => clearTimeout(t);
  }, [undoDelete]);
  useEffect(() => () => {
    if (expenseTouchAutoScrollRef.current.rafId) cancelAnimationFrame(expenseTouchAutoScrollRef.current.rafId);
    if (expenseTouchOverlayExitTimerRef.current) clearTimeout(expenseTouchOverlayExitTimerRef.current);
  }, []);
  const showTouchDragOverlay = (point, exp) => {
    if (!point || !exp) return;
    if (expenseTouchOverlayExitTimerRef.current) {
      clearTimeout(expenseTouchOverlayExitTimerRef.current);
      expenseTouchOverlayExitTimerRef.current = null;
    }
    setTouchDragOverlay({
      visible: true,
      x: point.clientX,
      y: point.clientY,
      label: exp.label ?? "",
      sourceCategory: exp.category === "Lifestyle" ? "Lifestyle" : "Needs",
    });
  };
  const updateTouchDragOverlayPosition = (point) => {
    if (!point) return;
    setTouchDragOverlay(prev => prev.label ? { ...prev, x: point.clientX, y: point.clientY } : prev);
  };
  const hideTouchDragOverlay = () => {
    if (expenseTouchOverlayExitTimerRef.current) {
      clearTimeout(expenseTouchOverlayExitTimerRef.current);
      expenseTouchOverlayExitTimerRef.current = null;
    }
    setTouchDragOverlay(prev => (prev.label ? { ...prev, visible: false } : prev));
    expenseTouchOverlayExitTimerRef.current = setTimeout(() => {
      setTouchDragOverlay({ visible: false, x: 0, y: 0, label: "", sourceCategory: "Needs" });
      expenseTouchOverlayExitTimerRef.current = null;
    }, TOUCH_OVERLAY_EXIT_MS);
  };
  const stopTouchAutoScroll = () => {
    if (expenseTouchAutoScrollRef.current.rafId) cancelAnimationFrame(expenseTouchAutoScrollRef.current.rafId);
    expenseTouchAutoScrollRef.current = { rafId: null, direction: 0, speed: 0 };
  };
  const runTouchAutoScroll = () => {
    const { direction, speed } = expenseTouchAutoScrollRef.current;
    if (!direction || speed <= 0) {
      stopTouchAutoScroll();
      return;
    }
    window.scrollBy(0, direction * speed);
    expenseTouchAutoScrollRef.current.rafId = requestAnimationFrame(runTouchAutoScroll);
  };
  const startTouchAutoScroll = (direction, speed) => {
    expenseTouchAutoScrollRef.current.direction = direction;
    expenseTouchAutoScrollRef.current.speed = speed;
    if (!expenseTouchAutoScrollRef.current.rafId) {
      expenseTouchAutoScrollRef.current.rafId = requestAnimationFrame(runTouchAutoScroll);
    }
  };
  const reorderExpenseByInsert = (draggedId, lane, laneInsertIndex = null) => {
    setExpenses(prev => {
      const regular = prev.filter(e => e.type !== "loan");
      const dragged = regular.find(e => e.id === draggedId);
      if (!dragged) return prev;

      const targetLane = lane ?? dragged.category;
      const regularWithoutDragged = regular.filter(e => e.id !== draggedId);
      const draggedNext = { ...dragged, category: targetLane };
      const laneItems = regularWithoutDragged.filter(e => e.category === targetLane);
      const normalizedLaneIndex = laneInsertIndex == null
        ? laneItems.length
        : Math.max(0, Math.min(laneInsertIndex, laneItems.length));
      let seenInLane = 0;
      let insertIndex = regularWithoutDragged.length;
      for (let idx = 0; idx < regularWithoutDragged.length; idx += 1) {
        const item = regularWithoutDragged[idx];
        if (item.category !== targetLane) continue;
        if (seenInLane === normalizedLaneIndex) {
          insertIndex = idx;
          break;
        }
        seenInLane += 1;
      }
      if (normalizedLaneIndex === laneItems.length) {
        const laneLastIndex = regularWithoutDragged.reduce((lastIdx, exp, idx) =>
          exp.category === targetLane ? idx : lastIdx, -1);
        insertIndex = laneLastIndex + 1;
      }

      const reorderedRegular = [...regularWithoutDragged];
      reorderedRegular.splice(insertIndex, 0, draggedNext);

      let regularIdx = 0;
      return prev.map(exp => exp.type === "loan" ? exp : reorderedRegular[regularIdx++]);
    });
  };
  const finalizeExpenseDrag = () => {
    if (!draggingExpenseId || expenseDragFinalizedRef.current) return false;
    const { lane, index } = expenseInsertRef.current;
    if (!lane) return false;
    expenseDragFinalizedRef.current = true;
    reorderExpenseByInsert(draggingExpenseId, lane, index);
    return true;
  };
  const cleanupExpenseDragState = () => {
    if (expenseTouchHoldTimerRef.current) {
      clearTimeout(expenseTouchHoldTimerRef.current);
      expenseTouchHoldTimerRef.current = null;
    }
    expenseTouchHoldMetaRef.current = null;
    setPendingExpenseTouchId(null);
    expenseTouchDraggingRef.current = false;
    expenseTouchHoverLaneRef.current = null;
    expenseInsertRef.current = { lane: null, index: null };
    setExpenseInsertLane(null);
    setExpenseInsertIndex(null);
    stopTouchAutoScroll();
    hideTouchDragOverlay();
    setDraggingExpenseId(null);
    setDragPreviewExpenseCategory(null);
    expenseDragFinalizedRef.current = false;
  };
  const onExpenseDragEnd = () => {
    finalizeExpenseDrag();
    cleanupExpenseDragState();
  };
  const getLaneInsertIndexFromY = (lane, clientY) => {
    if (!lane || typeof document === "undefined") return null;
    const laneEl = document.querySelector(`[data-expense-lane="${lane}"]`);
    if (!laneEl) return null;
    const laneCards = Array.from(laneEl.querySelectorAll("[data-expense-id]"))
      .filter((card) => card.getAttribute("data-expense-id") !== draggingExpenseId);
    if (!laneCards.length) return 0;
    for (let idx = 0; idx < laneCards.length; idx += 1) {
      const rect = laneCards[idx].getBoundingClientRect();
      if (clientY < rect.top + (rect.height / 2)) return idx;
    }
    return laneCards.length;
  };
  const setExpenseInsertTarget = (lane, index) => {
    expenseInsertRef.current = { lane, index };
    setExpenseInsertLane(lane);
    setExpenseInsertIndex(index);
  };
  const onExpenseDragStart = (exp, evt) => {
    if (expenseTouchHoldTimerRef.current) {
      clearTimeout(expenseTouchHoldTimerRef.current);
      expenseTouchHoldTimerRef.current = null;
    }
    expenseTouchHoldMetaRef.current = null;
    setPendingExpenseTouchId(null);
    setDraggingExpenseId(exp.id);
    expenseDragFinalizedRef.current = false;
    setDragPreviewExpenseCategory(exp.category);
    const originLaneItems = regularExpenses.filter(e => e.category === exp.category);
    const originLaneIndex = originLaneItems.findIndex(e => e.id === exp.id);
    const normalizedOriginIndex = originLaneIndex === -1 ? originLaneItems.length : originLaneIndex;
    setExpenseInsertTarget(exp.category, normalizedOriginIndex);
    if (evt?.dataTransfer) {
      try {
        evt.dataTransfer.setData("text/plain", exp.id);
        evt.dataTransfer.effectAllowed = "move";
      } catch {
        // Ignore browser quirks (e.g., Safari touch) — touch path handles overlay/ghost mode already.
      }
    }
  };
  const resetExpensePreviewToOrigin = () => {
    if (!draggingExpenseId) {
      setDragPreviewExpenseCategory(null);
      setExpenseInsertTarget(null, null);
      return;
    }
    const origin = regularExpenses.find(e => e.id === draggingExpenseId)?.category ?? null;
    setDragPreviewExpenseCategory(origin);
  };
  const onExpenseTouchStart = (e, exp) => {
    if (!e.target?.closest?.("[data-expense-drag-handle]")) return;
    e.preventDefault();
    if (expenseTouchHoldTimerRef.current) clearTimeout(expenseTouchHoldTimerRef.current);
    const point = e.touches?.[0];
    if (!point) return;
    expenseTouchHoldMetaRef.current = { x: point.clientX, y: point.clientY, expenseId: exp.id, category: exp.category };
    setPendingExpenseTouchId(exp.id);
    expenseTouchHoldTimerRef.current = setTimeout(() => {
      expenseTouchHoldTimerRef.current = null;
      const meta = expenseTouchHoldMetaRef.current;
      if (!meta || meta.expenseId !== exp.id) return;
      expenseTouchDraggingRef.current = true;
      expenseTouchHoverLaneRef.current = meta.category;
      expenseInsertRef.current = { lane: meta.category, index: null };
      setPendingExpenseTouchId(null);
      onExpenseDragStart(exp);
      showTouchDragOverlay({ clientX: meta.x, clientY: meta.y }, exp);
    }, EXPENSE_TOUCH_HOLD_MS);
  };
  const onExpenseTouchMove = (e) => {
    if (!expenseTouchDraggingRef.current) {
      const point = e.touches?.[0];
      const meta = expenseTouchHoldMetaRef.current;
      if (point && meta) {
        const movedX = Math.abs(point.clientX - meta.x);
        const movedY = Math.abs(point.clientY - meta.y);
        if (movedX > TOUCH_SCROLL_CANCEL_PX || movedY > TOUCH_SCROLL_CANCEL_PX) {
          if (expenseTouchHoldTimerRef.current) {
            clearTimeout(expenseTouchHoldTimerRef.current);
            expenseTouchHoldTimerRef.current = null;
          }
          expenseTouchHoldMetaRef.current = null;
          setPendingExpenseTouchId(null);
        }
      }
      return;
    }
    if (!expenseTouchDraggingRef.current) return;
    const point = e.touches?.[0];
    if (!point) return;
    e.preventDefault();
    updateTouchDragOverlayPosition(point);
    const edgeTop = TOUCH_EDGE_AUTOSCROLL_ZONE_PX;
    const edgeBottom = window.innerHeight - TOUCH_EDGE_AUTOSCROLL_ZONE_PX;
    if (point.clientY < edgeTop) {
      const ratio = 1 - (point.clientY / edgeTop);
      startTouchAutoScroll(-1, Math.max(4, Math.round(TOUCH_MAX_AUTOSCROLL_SPEED_PX * ratio)));
    } else if (point.clientY > edgeBottom) {
      const ratio = (point.clientY - edgeBottom) / TOUCH_EDGE_AUTOSCROLL_ZONE_PX;
      startTouchAutoScroll(1, Math.max(4, Math.round(TOUCH_MAX_AUTOSCROLL_SPEED_PX * ratio)));
    } else {
      stopTouchAutoScroll();
    }
    const hovered = document.elementFromPoint(point.clientX, point.clientY);
    const laneEl = hovered?.closest?.("[data-expense-lane]");
    const lane = laneEl?.getAttribute("data-expense-lane");
    if (lane === "Needs" || lane === "Lifestyle") {
      expenseTouchHoverLaneRef.current = lane;
      setDragPreviewExpenseCategory(lane);
      const insertIndex = getLaneInsertIndexFromY(lane, point.clientY);
      setExpenseInsertTarget(lane, insertIndex);
    } else {
      expenseTouchHoverLaneRef.current = null;
      resetExpensePreviewToOrigin();
      setExpenseInsertTarget(null, null);
    }
  };
  const onExpenseTouchEnd = () => {
    if (expenseTouchHoldTimerRef.current) {
      clearTimeout(expenseTouchHoldTimerRef.current);
      expenseTouchHoldTimerRef.current = null;
    }
    if (!expenseTouchDraggingRef.current || !draggingExpenseId) {
      onExpenseDragEnd();
      return;
    }
    const lane = expenseTouchHoverLaneRef.current ?? dragPreviewExpenseCategory;
    if (lane) {
      const insertIndex = expenseInsertRef.current.lane === lane ? expenseInsertRef.current.index : null;
      setExpenseInsertTarget(lane, insertIndex);
    } else {
      setExpenseInsertTarget(null, null);
    }
    onExpenseDragEnd();
  };

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
      id: `loan_${crypto.randomUUID()}`, type: "loan", category: "Loans",
      label: newLoan.label, note: [newLoan.note, newLoan.note, newLoan.note],
      loanMeta: meta, history: buildLoanHistory(meta)
    }]);
    setAddingLoan(false);
    setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" });
  };
  const deleteLoan = (id) => { setExpenses(p => p.filter(e => e.id !== id)); setDelLoanId(null); };



  return (<div>
    <PanelHero eyebrow="Expenses & Liabilities">Budget</PanelHero>
    {/* ── Period selector — month row + quarter row + adv. edit in one glass box ── */}
    <MonthQuarterSelector
      activeMonth={activeMonth}
      activeQuarter={ap}
      currentMonthKey={currentMonthKey}
      currentPhaseIdx={currentPhaseIdx}
      monthsWithOverrides={monthsWithOverrides}
      onSelectMonth={handleSelectMonth}
      onSelectQuarter={handleSelectQuarter}
    />
    {/* Inline bulk-edit panel — opens when ADV. EDIT is tapped */}
    {bulkEditOpen && (
      <BulkEditPanel
        phaseIdx={ap}
        selectedMonthIso={`${displayMonthKey}-01`}
        expenses={regularExpenses}
        cpm={cpm}
        onSave={saveAdvancedEdit}
        onClose={() => setBulkEditOpen(false)}
      />
    )}
    {/* Summary cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "16px" }}>
      <Card label="This Week’s Check" val={f2(prevWeekNet ?? weeklyIncome)} sub="This Week’s Check" status="green" rawVal={prevWeekNet ?? weeklyIncome} />
      <Card label="Weekly Spend" val={f2(ts)} rawVal={ts} color="var(--color-deduction)"
        insight={weeklyIncome > 0 ? (() => {
          const pct = Math.round(sp);
          if (sp < 50) return { arrow: "up",   delta: `${pct}% of income`, label: "· well-managed",  variant: "blue" };
          if (sp < 75) return { arrow: "flat",  delta: `${pct}% of income`, label: "· within range",  variant: "blue" };
          return              { arrow: "down",  delta: `${pct}% of income`, label: "· tighten spend", variant: "purple" };
        })() : undefined}
      />
      <div style={{ position: "relative" }}>
        {isViewingFuture && firstCheckWeek ? (
          <Card
            label={`First Check · ${firstCheckMonthShort}`}
            val={f2(leftFirstCheck)}
            rawVal={leftFirstCheck}
            color={leftFirstCheck >= 0 ? "var(--color-green)" : "var(--color-deduction)"}
            insight={weeklyIncome > 0 ? (() => {
              const pct = Math.round((leftFirstCheck / firstCheckNet) * 100);
              if (pct >= 20) return { arrow: "up",   delta: `${pct}%`, label: `of ${firstCheckMonthShort} check clear`, variant: "blue" };
              if (pct < 5)   return { arrow: "down",  delta: `${pct}%`, label: `of ${firstCheckMonthShort} check left`,  variant: "purple" };
              return           { arrow: "flat",  delta: `${pct}%`, label: `of ${firstCheckMonthShort} check left`,  variant: "blue" };
            })() : undefined}
          />
        ) : (
          <Card label="Left This Week" val={f2(leftThisWeek)} rawVal={leftThisWeek} color={leftThisWeek >= 0 ? "var(--color-green)" : "var(--color-deduction)"}
            insight={weeklyIncome > 0 ? (() => {
              const nextCheck = futureWeekNets?.[0] ?? null;
              const lastCheck = prevWeekNet ?? weeklyIncome;
              if (nextCheck != null) {
                const diff = Math.round(nextCheck - lastCheck);
                if (Math.abs(diff) >= 20) return { arrow: diff > 0 ? "up" : "down", delta: `${diff > 0 ? "+" : ""}${f(diff)}`, label: "next check vs last", variant: diff > 0 ? "blue" : "purple" };
              }
              const pct = Math.round((leftThisWeek / weeklyIncome) * 100);
              if (pct >= 20) return { arrow: "up",   delta: `${pct}%`, label: "of paycheck clear",    variant: "blue" };
              if (pct < 5)   return { arrow: "down",  delta: `${pct}%`, label: "of paycheck remaining", variant: "purple" };
              return           { arrow: "flat",  delta: `${pct}%`, label: "of paycheck remaining", variant: "blue" };
            })() : undefined}
          />
        )}
        {checkBreakdown && (
          <button
            onClick={() => setShowCheckInfo(true)}
            aria-label="Show paycheck breakdown"
            style={{
              display: "block", width: "100%", textAlign: "right",
              background: "none", border: "none",
              color: "var(--color-text-disabled)", fontSize: "9px",
              letterSpacing: "1.5px", textTransform: "uppercase",
              cursor: "pointer", padding: "5px 4px 0",
              fontFamily: "var(--font-sans)",
              transition: "color 150ms ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--color-accent-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-disabled)"; }}
          >breakdown ↗</button>
        )}
      </div>
    </div>
    {/* Spend bar */}
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--color-text-primary)", marginBottom: "6px" }}><span>SPEND vs INCOME</span><span style={{ color: sp > 90 ? "var(--color-deduction)" : "var(--color-green)" }}>{sp.toFixed(1)}%</span></div>
      <div style={{ height: "8px", background: "#1e1e1e", borderRadius: "4px", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: "4px", width: `${sp}%`, background: sp > 90 ? "var(--color-deduction)" : sp > 70 ? "var(--color-gold)" : "var(--color-green)", transition: "width 0.3s" }} /></div>
    </div>
    {/* View tabs */}
    <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
      {["overview", "breakdown", "loans"].map(v => <VT key={v} label={v} active={view === v} onClick={() => setView(v)} />)}
    </div>

    {/* OVERVIEW — expense list; loans rendered inside Needs */}
    {view === "overview" && <div>
      {overviewCats.map(cat => {
        const cExp = regularExpenses.filter(e => e.category === cat);
        const laneCardsExcludingDragged = cExp.filter(item => item.id !== draggingExpenseId);
        const loanItems = cat === "Needs" ? loans : [];
        const cTot = cExp.reduce((s, e) => s + displayEffective(e, ap), 0)
                   + loanItems.reduce((s, e) => s + displayEffective(e, ap), 0);
        const isExpenseDropLane = cat === "Needs" || cat === "Lifestyle";
        return <div
          key={cat}
          draggable={false}
          data-expense-lane={isExpenseDropLane ? cat : undefined}
          onDragStart={(e) => e.preventDefault()}
          onDragOver={(e) => {
            if (!isExpenseDropLane) return;
            e.preventDefault();
            setDragPreviewExpenseCategory(cat);
            const insertIndex = getLaneInsertIndexFromY(cat, e.clientY);
            setExpenseInsertTarget(cat, insertIndex);
          }}
          onDrop={(e) => {
            if (!isExpenseDropLane) return;
            e.preventDefault();
            e.stopPropagation();
            if (!draggingExpenseId) return;
            const insertIndex = getLaneInsertIndexFromY(cat, e.clientY);
            setExpenseInsertTarget(cat, insertIndex);
          }}
          onDragLeave={(e) => {
            if (!isExpenseDropLane) return;
            if (e.currentTarget.contains(e.relatedTarget)) return;
            resetExpensePreviewToOrigin();
            setExpenseInsertTarget(null, null);
          }}
          style={{
            marginBottom: "24px",
            padding: isExpenseDropLane ? "8px" : 0,
            borderRadius: isExpenseDropLane ? "10px" : 0,
            border: isExpenseDropLane
              ? `1px solid ${dragPreviewExpenseCategory === cat ? `${CATEGORY_COLORS[cat]}33` : "#1f1f1f"}`
              : "none",
            background: isExpenseDropLane
              ? (dragPreviewExpenseCategory === cat ? "rgba(20,20,20,0.24)" : (CAT_GRADIENT[cat] ?? "transparent"))
              : "transparent",
            transition: `background 300ms ${EXPENSE_DRAG_EASE}, border-color 320ms ${EXPENSE_DRAG_EASE}`,
          }}
        >
          <SH color={CATEGORY_COLORS[cat]} textColor="var(--color-text-primary)" right={f2(cTot) + "/wk"}>{cat}</SH>
          {(() => {
            // Collect deleted expenses (zeroed in this view with non-zero history) for restore sheet
            const deletedInCat = cExp.filter(exp => {
              const amt = displayEffective(exp, ap);
              if (amt !== 0) return false;
              if (getNextNonZeroIso(exp, ap, TODAY_ISO) !== null) return false;
              if (!(exp.history?.length)) return false;
              // Only include if there's actually a non-zero historical amount somewhere
              return (exp.history ?? []).some(entry => (entry.weekly ?? []).some(v => v > 0));
            });
            return deletedInCat.length > 0 ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px" }}>
                <button
                  onClick={() => { setRestoreSheetCat(cat); setRestorePendingExpId(null); }}
                  style={{
                    fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase",
                    color: "var(--color-deduction)", background: "rgba(244,164,164,0.08)",
                    border: "1px solid rgba(244,164,164,0.28)", borderRadius: "8px",
                    padding: "5px 12px", cursor: "pointer", fontFamily: "var(--font-sans)",
                    fontWeight: "500",
                  }}
                >Restore Deleted</button>
              </div>
            ) : null;
          })()}
          {cExp.map(exp => {
            const effAmt = displayEffective(exp, ap);
            // Resolve timeline state for this expense in the active phase
            const nextNonZeroIso = effAmt === 0 ? getNextNonZeroIso(exp, ap, TODAY_ISO) : null;
            const isScheduledFuture = effAmt === 0 && nextNonZeroIso !== null;
            const isRemovedThisPhase = effAmt === 0 && nextNonZeroIso === null && (exp.history?.length ?? 0) > 0;
            // Hide expenses permanently zeroed for this phase (deleted-forward or all-zero history)
            if (isRemovedThisPhase) return null;
            const monthlyDisplay = `${f(monthlyFromPerPaycheck(effAmt, cpm))}/mo`;
            const isEditing = editId === exp.id;
            const isPinnedFoodCard = Boolean(exp.isFoodPrimary || exp.isFoodHighlighted);
            const isDragging = draggingExpenseId === exp.id;
            const previewCategory = dragPreviewExpenseCategory ?? exp.category;
            const lanePreviewingMove = isDragging && previewCategory !== exp.category;
            const previewTint = lanePreviewingMove ? EXPENSE_DRAG_PREVIEW_TINT[previewCategory] : null;
            const cardInsertIndex = laneCardsExcludingDragged.findIndex(item => item.id === exp.id);
            const showInsertLineBefore = isExpenseDropLane
              && !isPinnedFoodCard
              && draggingExpenseId
              && expenseInsertLane === cat
              && expenseInsertIndex === cardInsertIndex;
            return <div
              key={exp.id}
              data-expense-id={exp.id}
              draggable={!isPinnedFoodCard && !isEditing && isExpenseDropLane && !isCoarsePointer}
              onDragStart={(e) => {
                if (isPinnedFoodCard) {
                  e.preventDefault();
                  return;
                }
                onExpenseDragStart(exp, e);
              }}
              onDragEnd={onExpenseDragEnd}
              onTouchStart={(e) => {
                if (!isPinnedFoodCard && !isEditing && isExpenseDropLane) onExpenseTouchStart(e, exp);
              }}
              onTouchMove={onExpenseTouchMove}
              onTouchEnd={onExpenseTouchEnd}
              onTouchCancel={onExpenseDragEnd}
              onDragOver={(e) => {
                if (!draggingExpenseId || !isExpenseDropLane) return;
                e.preventDefault();
                e.stopPropagation();
                setDragPreviewExpenseCategory(cat);
                const insertIndex = getLaneInsertIndexFromY(cat, e.clientY);
                setExpenseInsertTarget(cat, insertIndex);
              }}
              onDrop={(e) => {
                if (!isExpenseDropLane) return;
                e.preventDefault();
                e.stopPropagation();
                if (!draggingExpenseId) return;
                const insertIndex = getLaneInsertIndexFromY(cat, e.clientY);
                setExpenseInsertTarget(cat, insertIndex);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return;
                resetExpensePreviewToOrigin();
              }}
              style={{
                background: isPinnedFoodCard
                  ? CATEGORY_BG[cat]
                  : lanePreviewingMove
                    ? `linear-gradient(120deg, ${CATEGORY_BG[cat]} 0%, ${CATEGORY_BG[cat]} 40%, ${previewTint} 72%, ${CATEGORY_BG[previewCategory]} 100%)`
                    : CAT_GRADIENT[cat] ?? CATEGORY_BG[cat],
                border: isPinnedFoodCard
                  ? "1px solid #1e1e1e"
                  : `1px solid ${lanePreviewingMove ? `${CATEGORY_COLORS[previewCategory]}66` : "#1e1e1e"}`,
                borderRadius: "6px",
                padding: "10px 12px",
                marginBottom: "6px",
                position: "relative",
                opacity: isDragging ? 0.72 : isScheduledFuture ? 0.65 : 1,
                cursor: isPinnedFoodCard
                  ? "default"
                  : isEditing ? "default" : (isExpenseDropLane ? (isDragging ? "grabbing" : "grab") : "default"),
                transform: isDragging ? "scale(0.94)" : "scale(1)",
                boxShadow: isPinnedFoodCard
                  ? "none"
                  : isDragging
                    ? `0 0 0 1px ${CATEGORY_COLORS[previewCategory]}2a inset`
                    : lanePreviewingMove ? `0 0 0 1px ${CATEGORY_COLORS[previewCategory]}33 inset` : "none",
                transition: `background 280ms ${EXPENSE_DRAG_EASE}, border-color 300ms ${EXPENSE_DRAG_EASE}, box-shadow 300ms ${EXPENSE_DRAG_EASE}, opacity 220ms ${EXPENSE_DRAG_EASE}, transform 220ms ${EXPENSE_DRAG_EASE}`,
                touchAction: isPinnedFoodCard ? "auto" : (isExpenseDropLane ? "pan-y" : "auto"),
                userSelect: isPinnedFoodCard ? "auto" : (isExpenseDropLane ? "none" : "auto"),
                WebkitUserSelect: isPinnedFoodCard ? "auto" : (isExpenseDropLane ? "none" : "auto"),
                willChange: draggingExpenseId ? "transform, opacity" : "auto",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: "12px",
                  right: "12px",
                  top: "-5px",
                  height: "4px",
                  borderRadius: "999px",
                  background: EXPENSE_INSERT_MARKER_BG,
                  boxShadow: `0 0 0 1px ${EXPENSE_INSERT_MARKER_BORDER}`,
                  opacity: showInsertLineBefore ? 0.74 : 0,
                  transform: showInsertLineBefore ? "scaleX(1)" : "scaleX(0.9)",
                  transformOrigin: "center",
                  transition: `opacity 180ms ${EXPENSE_DRAG_EASE}, transform 220ms ${EXPENSE_DRAG_EASE}`,
                  pointerEvents: "none",
                }}
              />
              {isEditing ? <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "12px" }}>{exp.label}</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  <div>
                    <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>Bill Amount ($)</div>
                    <input type="number" min="0" step="0.01" value={editVals.amount ?? ""} onChange={e => setEditVals(v => ({ ...v, amount: e.target.value }))} style={{ ...iS, width: "100%" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>Paid Every</div>
                    <select value={editVals.cycle ?? "every30days"} onChange={e => setEditVals(v => ({ ...v, cycle: e.target.value }))} style={{ ...iS, width: "100%" }}>
                      {EXPENSE_CYCLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
                  Per-paycheck reserve: {f2(perPaycheckFromCycle(parseFloat(editVals.amount) || 0, editVals.cycle ?? "every30days", cpm))}
                </div>
                {activeMonth !== null ? (
                  <>
                    <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "0.5px" }}>Save scope:</div>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                      <SmBtn onClick={() => saveThisMonth(exp.id)} c="var(--color-accent-primary)">MO. ONLY</SmBtn>
                      <SmBtn onClick={() => saveFromMonthForward(exp.id)} c="var(--color-green)">FROM {activeMonthLabel} +</SmBtn>
                      <SmBtn onClick={() => saveAllQuarters(exp.id)} c="var(--color-green)">ALL QTR</SmBtn>
                      <SmBtn onClick={() => setEditId(null)}>✕</SmBtn>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => saveAllQuarters(exp.id)} style={{ background: "var(--color-green)", color: "#0a0a0a", border: "none", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontSize: "10px", flex: 1 }}>SAVE</button>
                    <button onClick={() => setEditId(null)} style={{ background: "var(--color-border-subtle)", color: "var(--color-text-secondary)", border: "none", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontSize: "10px" }}>✕</button>
                  </div>
                )}
              </div> : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                {!isPinnedFoodCard && <button
                  type="button"
                  data-expense-drag-handle
                  aria-label={`Hold to drag ${exp.label}`}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    background: pendingExpenseTouchId === exp.id ? `${CATEGORY_COLORS[cat]}22` : "transparent",
                    color: pendingExpenseTouchId === exp.id ? CATEGORY_COLORS[cat] : "var(--color-text-primary)",
                    border: `1px solid ${pendingExpenseTouchId === exp.id ? `${CATEGORY_COLORS[cat]}66` : "var(--color-text-primary)"}`,
                    borderRadius: "8px",
                    width: "26px",
                    height: "26px",
                    minWidth: "26px",
                    padding: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    cursor: isEditing ? "default" : "grab",
                    touchAction: "none",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                  }}
                >
                  ⋮⋮
                </button>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "13px", color: isScheduledFuture ? "var(--color-text-secondary)" : undefined }}>{exp.label}</div>
                    {isPinnedFoodCard && <span style={{ fontSize: "9px", background: "rgba(0,200,150,0.10)", color: "var(--color-gold)", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>FOOD</span>}
                    {isScheduledFuture && (
                      <span style={{ fontSize: "9px", color: "var(--color-text-disabled)", letterSpacing: "1px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "3px", whiteSpace: "nowrap" }}>
                        STARTS {shortMonth(nextNonZeroIso).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {!isPinnedFoodCard && pendingExpenseTouchId === exp.id && <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap" }}>hold…</div>}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: isScheduledFuture ? "var(--color-text-disabled)" : CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{monthlyDisplay}</div>
                  </div>
                  <SmBtn onClick={() => startEditExp(exp)}>EDIT</SmBtn>
                  {isScheduledFuture ? (
                    /* Grayed card — direct actions, no extra confirm needed since state is already clear */
                    <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                      {undoDelete?.expId === exp.id && (
                        <SmBtn onClick={executeUndo} c="var(--color-accent-primary)" bg="rgba(0,200,150,0.08)">UNDO</SmBtn>
                      )}
                      <SmBtn
                        onClick={() => {
                          setExpenses(prev => prev.map(e => e.id !== exp.id ? e : clearMonthForward(e, nextNonZeroIso)));
                          setUndoDelete(null);
                        }}
                        c="var(--color-deduction)" bg="#2d1a1a"
                      >CLR {shortMonth(nextNonZeroIso).toUpperCase()}+</SmBtn>
                    </div>
                  ) : pendingDelete?.id === exp.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-end" }}>
                      <div style={{ fontSize: "8px", color: "var(--color-deduction)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                        {activeMonth ? `Delete ${activeMonthLabel}?` : `Delete Q${ap + 1}?`}
                      </div>
                      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <SmBtn onClick={() => deleteMonthOnly(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">{activeMonth ? `${activeMonthLabel} ONLY` : "THIS MONTH"}</SmBtn>
                        <SmBtn onClick={() => deleteQuarterOnly(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">Q{ap + 1} MONTHS</SmBtn>
                        <SmBtn onClick={() => deleteMonthForward(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">+ ONWARD</SmBtn>
                        <SmBtn onClick={() => setPendingDelete(null)}>✕</SmBtn>
                      </div>
                    </div>
                  ) : (
                    <SmBtn onClick={() => setPendingDelete({ id: exp.id })} c="var(--color-deduction)">✕</SmBtn>
                  )}
                </div>
              </div>}
            </div>;
          })}
          {isExpenseDropLane && draggingExpenseId && expenseInsertLane === cat && <div
            aria-hidden
            style={{
              height: "4px",
              borderRadius: "999px",
              margin: "2px 4px 8px",
              background: EXPENSE_INSERT_MARKER_BG,
              boxShadow: `0 0 0 1px ${EXPENSE_INSERT_MARKER_BORDER}`,
              opacity: expenseInsertIndex === laneCardsExcludingDragged.length ? 0.72 : 0,
              transform: expenseInsertIndex === laneCardsExcludingDragged.length ? "scaleX(1)" : "scaleX(0.9)",
              transformOrigin: "center",
              transition: `opacity 180ms ${EXPENSE_DRAG_EASE}, transform 220ms ${EXPENSE_DRAG_EASE}`,
              pointerEvents: "none",
            }}
          />}
          {loanItems.map(exp => {
            const effAmt = displayEffective(exp, ap);
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
                    <span style={{ fontSize: "9px", background: "rgba(0,200,150,0.10)", color: "var(--color-gold)", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span style={{ fontSize: "9px", color: "var(--color-green)" }}>✓ PAID OFF</span>}
                    {!isPaidOff && !inRunway && dropsOff && <span style={{ fontSize: "9px", color: "var(--color-green)" }}>drops off {payoffDate}</span>}
                  </div>
                  {meta && <div style={{ fontSize: "10px", color: "var(--color-text-primary)", marginTop: "2px" }}>
                    {inRunway
                      ? `saving toward ${meta.firstPaymentDate} · ${f(meta.paymentAmount ?? 0)}/${freqLabel} due`
                      : `${loanPaymentsRemaining(meta)} payments left · ${f(meta.paymentAmount ?? meta.paymentPerCheck ?? 0)}/${freqLabel} · ${f(meta.totalAmount)} total`
                    }
                  </div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: isPaidOff ? "var(--color-text-primary)" : CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{f(monthlyFromPerPaycheck(effAmt, cpm))}/mo</div>
                  </div>
                  <SmBtn onClick={() => startEditLoan(exp)} c="var(--color-gold)">EDIT</SmBtn>
                  {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteLoan(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="var(--color-deduction)">✕</SmBtn>}
                </div>
              </div>}
            </div>;
          })}
        </div>;
      })}

      {/* Add expense form */}
      {addingExp ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>New Expense Line</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div><label style={lS}>Label</label><input type="text" value={newExp.label} onChange={e => setNewExp(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Insurance" /></div>
          <div><label style={lS}>Category</label><select value={newExp.category} onChange={e => setNewExp(v => ({ ...v, category: e.target.value }))} style={iS}><option>Needs</option><option>Lifestyle</option></select></div>
          <div><label style={lS}>Bill Amount ($)</label><input type="number" min="0" step="0.01" value={newExp.amount} onChange={e => setNewExp(v => ({ ...v, amount: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Paid Every</label><select value={newExp.cycle} onChange={e => setNewExp(v => ({ ...v, cycle: e.target.value }))} style={iS}>{EXPENSE_CYCLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note (optional)</label><input type="text" value={newExp.note} onChange={e => setNewExp(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="Short description" /></div>
          <div style={{ gridColumn: "1/-1", fontSize: "10px", color: "var(--color-text-secondary)" }}>
            This sets aside {f2(perPaycheckFromCycle(parseFloat(newExp.amount) || 0, newExp.cycle, cpm))} from each paycheck.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {activeMonth !== null ? (
            <>
              <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "0.5px", width: "100%" }}>Save scope:</div>
              <SmBtn onClick={addExpThisMonth} c={newExp.label ? "var(--color-accent-primary)" : "var(--color-text-disabled)"}>MO. ONLY</SmBtn>
              <SmBtn onClick={addExpFromMonthForward} c={newExp.label ? "var(--color-green)" : "var(--color-text-disabled)"}>FROM {activeMonthLabel} +</SmBtn>
              <SmBtn onClick={addExpAllQuarters} c={newExp.label ? "var(--color-green)" : "var(--color-text-disabled)"}>ALL QTR</SmBtn>
              <SmBtn onClick={_closeAddForm}>✕</SmBtn>
            </>
          ) : (
            <>
              <button onClick={addExp} disabled={!newExp.label} style={{ background: newExp.label ? "var(--color-green)" : "var(--color-border-subtle)", color: newExp.label ? "var(--color-bg-base)" : "#666", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: newExp.label ? "pointer" : "default", fontWeight: "bold" }}>ADD</button>
              <button onClick={_closeAddForm} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>CANCEL</button>
            </>
          )}
        </div>
      </div> : <button onClick={() => setAddingExp(true)} style={{ background: "var(--color-bg-surface)", color: "var(--color-gold)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD EXPENSE LINE</button>}
    </div>}

    {/* BREAKDOWN — cashflow summary at top, then annual projection table */}
    {view === "breakdown" && (() => {
      // Full-year figures — independent of the selected quarter tab
      const tsAnnual = expenses.reduce((s, e) => s + yearlyExpenseCost(e), 0);
      const tsWeeklyAvg = tsAnnual / 52;
      const wrAnnual = weeklyIncome * 52 - tsAnnual;
      const wrWeeklyAvg = wrAnnual / 52;
      const checkingTot = regularExpenses.reduce((s, e) => s + displayEffective(e, ap), 0);
      const checkingDesc = regularExpenses.map(e => e.label).join(", ");
      const loansTot = loans.reduce((s, e) => s + displayEffective(e, ap), 0);
      const loansDesc = loans.map(e => e.label).join(", ");
      const payrollDeductionsTotal = currentWeek?.payrollDeductions?.total ?? 0;
      return <div>
        {/* Cashflow: incoming paycheck → payroll deductions → needs → loans → unallocated */}
        <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "10px", letterSpacing: "2px", color: "#7eb8c9", textTransform: "uppercase", marginBottom: "4px" }}>Incoming Paycheck</div><div style={{ fontSize: "22px", fontWeight: "bold", color: "#7eb8c9" }}>{f2(incomingWeekNet)}</div></div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)", textAlign: "right" }}>Running week<br />net pay</div></div>
        </div>
        <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--color-deduction)", marginBottom: "4px" }}>Payroll Deductions</div><div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>Benefits + 401k — already factored into net pay</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-deduction)" }}>{f2(payrollDeductionsTotal)}</div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{incomingWeekNet > 0 ? ((payrollDeductionsTotal / incomingWeekNet) * 100).toFixed(1) : "0.0"}%</div></div></div>
        </div>
        <div style={{ background: CATEGORY_BG["Needs"], border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"], marginBottom: "4px" }}>Checking Needs</div><div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{checkingDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"] }}>{f2(checkingTot)}</div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{incomingWeekNet > 0 ? ((checkingTot / incomingWeekNet) * 100).toFixed(1) : "0.0"}%</div></div></div>
        </div>
        {loans.length > 0 && <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--color-gold)", marginBottom: "4px" }}>Loans</div><div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{loansDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-gold)" }}>{f2(loansTot)}</div><div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{incomingWeekNet > 0 ? ((loansTot / incomingWeekNet) * 100).toFixed(1) : "0.0"}%</div></div></div>
        </div>}
        <div style={{ background: wr >= 0 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${wr >= 0 ? "var(--color-green)" : "var(--color-deduction)"}`, borderRadius: "6px", padding: "14px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: "12px", fontWeight: "bold", color: wr >= 0 ? "var(--color-green)" : "var(--color-deduction)", marginBottom: "4px" }}>Unallocated / Savings</div><div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>Weekly unallocated cashflow snapshot</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: wr >= 0 ? "var(--color-green)" : "var(--color-deduction)" }}>{f2(wr)}</div><div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{f(wr * 52 / 12)}/mo</div></div></div>
        </div>
        <div style={{ height: "1px", background: "var(--color-bg-raised)", marginBottom: "20px" }} />
        {cats.map(cat => {
          const cT = regularExpenses.filter(e => e.category === cat).reduce((s, e) => s + yearlyExpenseCost(e) / 52, 0);
          const pct = (cT / weeklyIncome) * 100;
          return <div key={cat} style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><span style={{ fontSize: "11px", letterSpacing: "2px", color: CATEGORY_COLORS[cat], textTransform: "uppercase" }}>{cat}</span><span>{f2(cT)}/wk avg · {pct.toFixed(1)}%</span></div>
            <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: CATEGORY_COLORS[cat], borderRadius: "3px" }} /></div>
          </div>;
        })}
        <div style={{ height: "1px", background: "var(--color-bg-raised)", margin: "20px 0" }} />
        <SectionHeader>Annual Projection</SectionHeader>
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
                {isLoan && <span style={{ fontSize: "9px", background: "rgba(0,200,150,0.10)", color: "var(--color-gold)", padding: "1px 4px", borderRadius: "2px", marginLeft: "5px" }}>LOAN</span>}
              </td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: isLoan ? "var(--color-gold)" : CATEGORY_COLORS[exp.category] }}>{f2(weeklyAvg)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "var(--color-text-secondary)" }}>{f(annual / 12)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "var(--color-text-primary)" }}>{f(annual)}</td>
            </tr>;
          })}</tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #333", fontWeight: "bold" }}><td style={{ padding: "10px 4px", color: "var(--color-gold)" }}>TRUE SPEND</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-deduction)" }}>{f2(tsWeeklyAvg)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-deduction)" }}>{f(tsAnnual / 12)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-deduction)" }}>{f(tsAnnual)}</td></tr>
            <tr style={{ fontWeight: "bold" }}><td style={{ padding: "6px 4px", color: "var(--color-green)" }}>REMAINING</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f2(wrWeeklyAvg)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(wrAnnual / 12)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(wrAnnual)}</td></tr>
          </tfoot>
        </table>
      </div>;
    })()}

    {/* LOANS TAB */}
    {view === "loans" && (() => {
      const totalOwed = loans.reduce((s, e) => s + (e.loanMeta?.totalAmount ?? 0), 0);
      const weeklyCommitted = loans.reduce((s, e) => s + displayEffective(e, ap), 0);
      const allPayoffDates = loans.map(e => e.loanMeta ? computeLoanPayoffDate(e.loanMeta) : null).filter(Boolean);
      const debtFreeDate = allPayoffDates.length ? allPayoffDates.reduce((a, b) => a > b ? a : b) : null;
      const weeksToDebtFree = debtFreeDate ? Math.max(Math.ceil((new Date(debtFreeDate) - new Date(TODAY_ISO)) / (7 * 24 * 60 * 60 * 1000)), 0) : 0;

      return <div>
        {currentWeek && <div style={{ background: "rgba(0,200,150,0.09)", border: "1px solid rgba(0,200,150,0.32)", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-green)" }}>{fiscalWeekLabel}</div>
          <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>{formatRotationDisplay(currentWeek, { isAdmin })} · ends {toLocalIso(currentWeek.weekEnd)}</div>
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <Card label="Total Loan Balance" val={f(totalOwed)} rawVal={totalOwed} color="var(--color-gold)" />
          <Card label="Weekly Committed" val={f2(weeklyCommitted)} rawVal={weeklyCommitted} color="var(--color-deduction)"
            insight={weeklyIncome > 0 && weeklyCommitted > 0 ? (() => {
              const ratio = weeklyCommitted / weeklyIncome;
              const pct   = Math.round(ratio * 100);
              if (ratio < 0.15) return { arrow: "up",   delta: `${pct}% of income`, label: "· manageable load", variant: "blue" };
              if (ratio < 0.25) return { arrow: "flat",  delta: `${pct}% of income`, label: "· watch cashflow",  variant: "blue" };
              return              { arrow: "down",  delta: `${pct}% of income`, label: "· high debt load",   variant: "purple" };
            })() : undefined}
          />
          <Card label="Debt-Free In" val={debtFreeDate ? `${weeksToDebtFree} wks` : "—"} color={debtFreeDate && debtFreeDate <= fiscalYearEnd ? "var(--color-green)" : "var(--color-gold)"}
            insight={debtFreeDate ? (debtFreeDate <= fiscalYearEnd
              ? { arrow: "up",   delta: null, label: "clears within 2026", variant: "blue" }
              : { arrow: "flat",  delta: null, label: "extends past 2026",  variant: "blue" }
            ) : undefined}
          />
        </div>

        {loans.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-primary)", fontSize: "12px", letterSpacing: "1px" }}>No active loans. Add one below.</div>}

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
          const weeklyAmt = displayEffective(exp, ap);
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
                    <span style={{ fontSize: "9px", background: "rgba(0,200,150,0.10)", color: "var(--color-gold)", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span style={{ fontSize: "9px", background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span style={{ fontSize: "9px", background: "rgba(76,175,125,0.13)", color: "var(--color-green)", padding: "2px 6px", borderRadius: "2px" }}>✓ PAID OFF</span>}
                  </div>
                  {exp.note[0] && <div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{exp.note[0]}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: isPaidOff ? "var(--color-text-primary)" : inRunway ? "#7a8bbf" : "var(--color-gold)" }}>{f2(weeklyAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
                  <div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{f(meta.totalAmount)} total</div>
                </div>
              </div>

              {/* Progress bar — during runway shows savings progress toward first payment */}
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-primary)", marginBottom: "4px" }}>
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
                  <div style={{ color: "var(--color-text-primary)", fontSize: "9px", marginBottom: "2px" }}>{inRunway ? "FIRST PAYMENT" : "PAYMENTS LEFT"}</div>
                  <div style={{ color: inRunway ? "#7a8bbf" : isPaidOff ? "var(--color-green)" : "var(--color-text-primary)", fontWeight: "bold", fontSize: "10px" }}>{inRunway ? meta.firstPaymentDate : paymentsLeft}</div>
                </div>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "var(--color-text-primary)", fontSize: "9px", marginBottom: "2px" }}>PAYOFF DATE</div>
                  <div style={{ color: dropsThisYear ? "var(--color-green)" : "var(--color-text-primary)", fontWeight: "bold", fontSize: "10px" }}>{payoffDate}</div>
                </div>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div style={{ color: "var(--color-text-primary)", fontSize: "9px", marginBottom: "2px" }}>TERM PAYMENT</div>
                  <div style={{ color: "var(--color-text-primary)", fontWeight: "bold", fontSize: "10px" }}>{f2(payAmt)} / {freqShort}</div>
                </div>
              </div>

              {/* Runway banner */}
              {inRunway && <div style={{ background: "#1a1a2d", border: "1px solid #7a8bbf44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", fontSize: "10px", color: "#7a8bbf" }}>
                Setting aside {f2(weeklyAmt)}/wk — {weeksUntilFirst} check{weeksUntilFirst !== 1 ? "s" : ""} until first {f2(payAmt)}/{freqShort} payment on {meta.firstPaymentDate}
              </div>}

              {/* Drop-off banner */}
              {!isPaidOff && !inRunway && dropsThisYear && <div style={{ background: "#1a2d1e", border: "1px solid #6dbf8a44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", fontSize: "10px", color: "var(--color-green)" }}>
                ✓ Drops off in {weeksUntilPayoff} weeks — weekly budget improves after payoff
              </div>}

              {/* Actions */}
              <div style={{ display: "flex", gap: "6px", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <SmBtn onClick={() => startEditLoan(exp)} c="var(--color-gold)">EDIT</SmBtn>
                {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                  <SmBtn onClick={() => deleteLoan(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">DEL</SmBtn>
                  <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="var(--color-deduction)">✕</SmBtn>}
              </div>
            </div>}
          </div>;
        })}

        {/* Add loan form */}
        {addingLoan ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", letterSpacing: "2px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "16px" }}>New Loan</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Loan Name</label><input type="text" value={newLoan.label} onChange={e => setNewLoan(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Note" /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Total Amount Owed ($)</label><input type="number" value={newLoan.totalAmount} onChange={e => setNewLoan(v => ({ ...v, totalAmount: e.target.value }))} style={iS} placeholder="2400" /></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lS}>Term Payment</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "var(--color-text-primary)", fontSize: "13px" }}>$</span>
                <input type="number" value={newLoan.paymentAmount} onChange={e => setNewLoan(v => ({ ...v, paymentAmount: e.target.value }))} style={{ ...iS, flex: 1 }} placeholder="150" />
                <span style={{ color: "var(--color-text-primary)", fontSize: "12px", whiteSpace: "nowrap" }}>every</span>
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
            return <div style={{ background: "var(--color-bg-surface)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", fontSize: "11px" }}>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                <span style={{ color: "var(--color-text-primary)" }}>Weekly cost: <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(weeklyAmt)}/wk</span></span>
                <span style={{ color: "var(--color-text-primary)" }}>{total} payments ({freqLabel})</span>
                <span style={{ color: "var(--color-text-primary)" }}>Payoff: <span style={{ color: payoff <= fiscalYearEnd ? "var(--color-green)" : "var(--color-text-primary)" }}>{payoff}</span></span>
              </div>
            </div>;
          })()}
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={addLoan} disabled={!newLoan.label || !newLoan.totalAmount || !newLoan.paymentAmount} style={{ background: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "var(--color-green)" : "var(--color-border-subtle)", color: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "var(--color-bg-base)" : "var(--color-text-primary)", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "pointer" : "default", fontWeight: "bold" }}>ADD LOAN</button>
            <button onClick={() => { setAddingLoan(false); setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" }); }} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
          </div>
        </div> : <button onClick={() => setAddingLoan(true)} style={{ background: "var(--color-bg-surface)", color: "var(--color-gold)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD LOAN</button>}
      </div>;
    })()}
    {touchDragOverlay.label && <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: touchDragOverlay.x,
        top: touchDragOverlay.y,
        transform: `translate(-50%, -130%) scale(${touchDragOverlay.visible ? 1 : 0.96}) ${touchDragOverlay.visible ? "rotate(-1deg)" : "rotate(0deg)"}`,
        transformOrigin: "center bottom",
        opacity: touchDragOverlay.visible ? 1 : 0,
        transition: "opacity 120ms ease, transform 140ms cubic-bezier(.2,.75,.2,1)",
        background: EXPENSE_TOUCH_OVERLAY_BG[touchDragOverlay.sourceCategory] ?? CATEGORY_COLORS[touchDragOverlay.sourceCategory] ?? "#7a8bbf",
        color: "#fff",
        borderRadius: "999px",
        padding: "8px 12px",
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.2px",
        boxShadow: "0 8px 18px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.12) inset",
        pointerEvents: "none",
        zIndex: 9999,
        whiteSpace: "nowrap",
        maxWidth: "72vw",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {touchDragOverlay.label}
    </div>}

    {/* Paycheck breakdown info modal */}
    {showCheckInfo && checkBreakdown && (
      <div
        onClick={() => setShowCheckInfo(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.82)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "16px",
            maxWidth: "400px", width: "100%",
            padding: "24px 20px",
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "2px" }}>{infoLabel}</div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--color-accent-primary)", fontFamily: "var(--font-sans)" }}>Breakdown</div>
              </div>
              {config?.taxExemptOptIn && infoRefWeek && (
                <span style={{
                  fontSize: "9px", padding: "2px 7px", borderRadius: "12px", letterSpacing: "0.5px",
                  background: infoRefWeek.taxedBySchedule ? "#1e1e3a" : "#1e4a30",
                  color: infoRefWeek.taxedBySchedule ? "#7a8bbf" : "var(--color-green)",
                  border: "1px solid " + (infoRefWeek.taxedBySchedule ? "#7a8bbf" : "var(--color-green)"),
                }}>
                  {infoRefWeek.taxedBySchedule ? "TAXED" : "EXEMPT"}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowCheckInfo(false)}
              style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: "20px", cursor: "pointer", padding: "4px 8px", lineHeight: 1, flexShrink: 0 }}
            >×</button>
          </div>

          {/* ── Subtraction math formula ── */}

          {/* Gross — the starting number, no operator */}
          <MathRow op=" " label="Gross Pay" val={f2(checkBreakdown.gross)} valColor="var(--color-text-primary)" large />
          <MathDivider />

          {/* Deductions block */}
          <MathRow op="−" label="Total Tax Withholding" val={f2(checkBreakdown.fica + checkBreakdown.fedTax + checkBreakdown.stateTax)} note="FICA · fed · state" />
          <MathRow op="−" label="Benefits / Insurance" val={f2(checkBreakdown.benefits)} />
          <MathRow op="−" label="401(k) Contribution" val={f2(checkBreakdown.k401)} />
          {checkBreakdown.otherDeductions.map((row, i) => {
            const checksPerYear = PAYCHECKS_PER_YEAR[config?.userPaySchedule ?? "weekly"] ?? 52;
            return <MathRow key={i} op="−" label={row.label ?? `Other Deduction ${i + 1}`} val={f2((row.weeklyAmount ?? 0) * (checksPerYear / 52))} />;
          })}
          <MathDivider thick />

          {/* Net Pay result */}
          <MathRow op="=" label="Net Pay" val={f2(checkBreakdown.netPay)} valColor="var(--color-green)" large />

          {/* Buffer block */}
          {bufferPerWeek > 0 && <>
            <MathDivider />
            <MathRow op="−" label="Paycheck Buffer" val={f2(bufferPerWeek)} valColor="var(--color-warning)" note="reserved savings" />
            <MathDivider thick />
            <MathRow op="=" label="Spendable" val={f2(checkBreakdown.spendable)} valColor="var(--color-text-primary)" large />
          </>}

          {/* Expenses block */}
          <MathDivider />
          {checkBreakdown.needsSpend > 0 && <MathRow op="−" label="Needs" val={f2(checkBreakdown.needsSpend)} />}
          {checkBreakdown.lifestyleSpend > 0 && <MathRow op="−" label="Lifestyle" val={f2(checkBreakdown.lifestyleSpend)} />}
          {checkBreakdown.loansSpend > 0 && <MathRow op="−" label="Loans" val={f2(checkBreakdown.loansSpend)} />}
          <MathDivider thick />
          <MathRow op="=" label="Left" val={f2(checkBreakdown.left)} valColor={checkBreakdown.left >= 0 ? "var(--color-green)" : "var(--color-deduction)"} large />

          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <button
              onClick={() => setShowCheckInfo(false)}
              style={{
                background: "var(--color-bg-raised)", color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
                padding: "8px 20px", fontSize: "10px", letterSpacing: "2px",
                textTransform: "uppercase", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
            >Close</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Restore Deleted Expenses bottom sheet ── */}
    {restoreSheetCat && (() => {
      const fy = FISCAL_YEAR_START.slice(0, 4);
      const sheetExps = regularExpenses.filter(exp => {
        if (exp.category !== restoreSheetCat) return false;
        const amt = displayEffective(exp, ap);
        if (amt !== 0) return false;
        if (getNextNonZeroIso(exp, ap, TODAY_ISO) !== null) return false;
        if (!(exp.history?.length)) return false;
        return (exp.history ?? []).some(entry => (entry.weekly ?? []).some(v => v > 0));
      });
      return (
        <div
          onClick={() => { setRestoreSheetCat(null); setRestorePendingExpId(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 70,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "var(--color-bg-surface)",
              borderTop: "1px solid var(--color-border-subtle)",
              borderRadius: "16px 16px 0 0",
              padding: "20px 16px calc(20px + var(--safe-area-bottom))",
              maxHeight: "70vh", overflowY: "auto",
              animation: "slideUpSheet 0.28s cubic-bezier(.2,.7,.2,1) both",
              willChange: "transform",
            }}
          >
            {/* Handle bar */}
            <div style={{ width: "36px", height: "4px", borderRadius: "99px", background: "var(--color-border-subtle)", margin: "0 auto 16px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "2px" }}>
                  {restoreSheetCat} · {activeMonth ? activeMonthLabel : `Q${ap + 1}`}
                </div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-text-primary)" }}>Restore Deleted</div>
              </div>
              <button onClick={() => { setRestoreSheetCat(null); setRestorePendingExpId(null); }}
                style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: "20px", cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>×</button>
            </div>

            {sheetExps.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", fontSize: "12px", color: "var(--color-text-disabled)" }}>
                No deleted expenses for this period
              </div>
            )}

            {sheetExps.map(exp => {
              // Get the historical per-check amount for the active quarter
              const histAmt = getEffectiveAmount(exp, Q_REP_DATES[ap], ap)
                || Math.max(...(exp.history ?? []).map(h => h.weekly?.[ap] ?? 0));
              const isPending = restorePendingExpId === exp.id;
              return (
                <div key={exp.id} style={{
                  borderBottom: "1px solid var(--color-border-subtle)",
                  padding: "12px 0",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{exp.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                        {histAmt > 0 ? `${f2(histAmt)}/wk · ${f(monthlyFromPerPaycheck(histAmt, cpm))}/mo` : "—"}
                      </div>
                    </div>
                    {!isPending && (
                      <button
                        onClick={() => setRestorePendingExpId(exp.id)}
                        style={{
                          fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                          color: "var(--color-accent-primary)", background: "rgba(0,200,150,0.08)",
                          border: "1px solid rgba(0,200,150,0.24)", borderRadius: "8px",
                          padding: "5px 12px", cursor: "pointer", fontFamily: "var(--font-sans)", flexShrink: 0,
                        }}
                      >Restore</button>
                    )}
                  </div>

                  {/* Scope picker — shown inline after RESTORE is tapped */}
                  {isPending && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
                        Restore from…
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {activeMonth && (
                          <button onClick={() => restoreExpense(exp.id, "month")}
                            style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                            {activeMonthLabel} only
                          </button>
                        )}
                        <button onClick={() => restoreExpense(exp.id, "quarter")}
                          style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                          Q{ap + 1} months
                        </button>
                        <button onClick={() => restoreExpense(exp.id, "year")}
                          style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-accent-primary)", background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.24)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                          Rest of year
                        </button>
                        <button onClick={() => setRestorePendingExpId(null)}
                          style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)", background: "transparent", border: "none", padding: "6px 4px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
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
          <span style={{ color: "var(--color-text-primary)", fontSize: "13px" }}>$</span>
          <input type="number" value={vals.paymentAmount ?? vals.paymentPerCheck ?? ""} onChange={e => setVals(v => ({ ...v, paymentAmount: e.target.value }))} style={{ ...iS, flex: 1 }} placeholder="150" />
          <span style={{ color: "var(--color-text-primary)", fontSize: "12px", whiteSpace: "nowrap" }}>every</span>
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

// op: " " (no operator, indent), "−" (subtraction), "=" (result)
// Deduction rows (op="−") use --color-deduction for the value; results use valColor.
function MathRow({ op, label, val, valColor, note, large }) {
  const isDeduction = op === "−";
  const isResult    = op === "=";
  const computedValColor = valColor ?? (isDeduction ? "var(--color-deduction)" : "var(--color-text-primary)");
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 0, padding: large ? "7px 0" : "4px 0" }}>
      <span style={{
        fontSize: large ? "15px" : "13px", fontWeight: "700",
        color: isDeduction ? "var(--color-deduction)" : isResult ? "var(--color-text-disabled)" : "transparent",
        fontFamily: "var(--font-mono)", width: "18px", flexShrink: 0, userSelect: "none",
      }}>{op}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: large ? "13px" : "11px", color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.2px" }}>{label}</span>
        {note && <span style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginLeft: "6px", letterSpacing: "0.3px" }}>{note}</span>}
      </div>
      <span style={{ fontSize: large ? "19px" : "14px", fontWeight: large ? "700" : "500", color: computedValColor, fontFamily: "var(--font-mono)", letterSpacing: "-0.5px", paddingLeft: "8px" }}>{val}</span>
    </div>
  );
}

function MathDivider({ thick }) {
  return (
    <div style={{ height: thick ? "1px" : "0.5px", background: thick ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)", margin: thick ? "8px 0" : "3px 0" }} />
  );
}
