import { useState, useMemo, useEffect, useRef } from "react";
import { PHASES, CATEGORY_COLORS, CATEGORY_BG, FISCAL_YEAR_START } from "../constants/config.js";
import { getEffectiveAmount, computeGoalTimeline, computeLoanPayoffDate, buildLoanHistory, loanPaymentsRemaining, loanWeeklyAmount, loanRunwayStartDate, toLocalIso, getPhaseIndex } from "../lib/finance.js";
import { deriveRollingTimelineMonths, progressiveScale } from "../lib/rollingTimeline.js";
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

const EXPENSE_DRAG_PREVIEW_TINT = {
  Needs: "rgba(217, 112, 112, 0.26)",
  Lifestyle: "rgba(122, 139, 191, 0.3)",
};
const EXPENSE_TOUCH_OVERLAY_BG = {
  Needs: "#d97070",
  Lifestyle: "#7a8bbf",
};

const EXPENSE_CYCLE_OPTIONS = [
  { value: "weekly", label: "Weekly", days: 7 },
  { value: "biweekly", label: "Biweekly", days: 14 },
  { value: "every30days", label: "Every 30 days", days: 30 },
  { value: "yearly", label: "Yearly", days: 365 },
];

const cycleByValue = EXPENSE_CYCLE_OPTIONS.reduce((acc, opt) => {
  acc[opt.value] = opt;
  return acc;
}, {});

const PAYCHECK_CADENCE_DAYS = 7; // existing app cadence: one paycheck per fiscal week

const perPaycheckFromCycle = (amount, cycle) => {
  const days = cycleByValue[cycle]?.days ?? PAYCHECK_CADENCE_DAYS;
  return days > 0 ? (amount * PAYCHECK_CADENCE_DAYS) / days : 0;
};

const cycleAmountFromPerPaycheck = (perPaycheck, cycle) => {
  const days = cycleByValue[cycle]?.days ?? PAYCHECK_CADENCE_DAYS;
  return days > 0 ? (perPaycheck * days) / PAYCHECK_CADENCE_DAYS : perPaycheck;
};

const MONTH_SUBDIVISIONS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const safeDate = (raw) => {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
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
  const [draggingExpenseId, setDraggingExpenseId] = useState(null);
  const [dragPreviewExpenseCategory, setDragPreviewExpenseCategory] = useState(null);
  const [touchInsertLane, setTouchInsertLane] = useState(null);
  const [touchInsertIndex, setTouchInsertIndex] = useState(null);
  const [touchDragOverlay, setTouchDragOverlay] = useState({ visible: false, x: 0, y: 0, label: "", sourceCategory: "Needs" });
  const expenseTouchDraggingRef = useRef(false);
  const expenseTouchHoverLaneRef = useRef(null);
  const expenseTouchInsertRef = useRef({ lane: null, index: null });
  const expenseTouchHoldTimerRef = useRef(null);
  const expenseTouchHoldMetaRef = useRef(null);
  const expenseTouchAutoScrollRef = useRef({ rafId: null, direction: 0, speed: 0 });
  const expenseTouchOverlayExitTimerRef = useRef(null);
  const [pendingExpenseTouchId, setPendingExpenseTouchId] = useState(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const EXPENSE_TOUCH_HOLD_MS = 450;
  const TOUCH_SCROLL_CANCEL_PX = 12;
  const TOUCH_EDGE_AUTOSCROLL_ZONE_PX = 92;
  const TOUCH_MAX_AUTOSCROLL_SPEED_PX = 18;
  const TOUCH_OVERLAY_EXIT_MS = 130;
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
  const overviewCatOrder = ["Needs", "Lifestyle", "Transfers"];
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

  // Fiscal year end for drop-off detection
  const fiscalYearEnd = futureWeeks?.length ? toLocalIso(futureWeeks[futureWeeks.length - 1].weekEnd) : "2027-01-04";

  // Expense helpers
  const startEditExp = (exp) => {
    const latest = exp.history?.length
      ? exp.history.reduce((b, e) => e.effectiveFrom > b.effectiveFrom ? e : b)
      : { weekly: exp.weekly ?? [0, 0, 0, 0] };
    const phaseBillingMeta = exp.billingMeta?.byPhase?.[ap];
    const cycle = phaseBillingMeta?.cycle ?? exp.billingMeta?.cycle ?? "every30days";
    const anchorWeekly = latest.weekly[ap] ?? latest.weekly[0] ?? 0;
    setEditId(exp.id);
    setEditVals({
      amount: cycleAmountFromPerPaycheck(anchorWeekly, cycle).toFixed(2),
      cycle,
    });
  };
  const saveEditExp = (id) => {
    const cycle = editVals.cycle ?? "every30days";
    const amount = parseFloat(editVals.amount) || 0;
    const perPaycheck = perPaycheckFromCycle(amount, cycle);
    setExpenses(prev => prev.map(e => {
      if (e.id !== id) return e;
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const latest = existing.reduce((b, entry) => entry.effectiveFrom > b.effectiveFrom ? entry : b, existing[0]);
      const baseWeekly = latest.weekly ?? [0, 0, 0, 0];
      const newWeekly = [baseWeekly[0] ?? 0, baseWeekly[1] ?? 0, baseWeekly[2] ?? 0, baseWeekly[3] ?? 0];
      newWeekly[ap] = perPaycheck;
      const byPhase = {
        ...(e.billingMeta?.byPhase ?? {}),
        [ap]: { amount, cycle, effectiveFrom: TODAY_ISO },
      };
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
  const addExp = () => {
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle);
    setExpenses(prev => [...prev, {
      id: `exp_${Date.now()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom: TODAY_ISO },
      history: [{ effectiveFrom: TODAY_ISO, weekly: [perPaycheck, perPaycheck, perPaycheck, perPaycheck] }]
    }]);
    setAddingExp(false); setNewExp({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
  };
  const deleteExp = (id) => { setExpenses(p => p.filter(e => e.id !== id)); setDelExpId(null); };
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setIsCoarsePointer(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
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
  const setTouchInsertTarget = (lane, index) => {
    expenseTouchInsertRef.current = { lane, index };
    setTouchInsertLane(lane);
    setTouchInsertIndex(index);
  };
  const onExpenseDragStart = (exp) => {
    if (expenseTouchHoldTimerRef.current) {
      clearTimeout(expenseTouchHoldTimerRef.current);
      expenseTouchHoldTimerRef.current = null;
    }
    expenseTouchHoldMetaRef.current = null;
    setPendingExpenseTouchId(null);
    setDraggingExpenseId(exp.id);
    setDragPreviewExpenseCategory(exp.category);
    const originLaneItems = regularExpenses.filter(e => e.id !== exp.id && e.category === exp.category);
    setTouchInsertTarget(exp.category, originLaneItems.length);
  };
  const resetExpensePreviewToOrigin = () => {
    if (!draggingExpenseId) {
      setDragPreviewExpenseCategory(null);
      return;
    }
    const origin = regularExpenses.find(e => e.id === draggingExpenseId)?.category ?? null;
    setDragPreviewExpenseCategory(origin);
  };
  const onExpenseDragEnd = () => {
    if (expenseTouchHoldTimerRef.current) {
      clearTimeout(expenseTouchHoldTimerRef.current);
      expenseTouchHoldTimerRef.current = null;
    }
    expenseTouchHoldMetaRef.current = null;
    setPendingExpenseTouchId(null);
    expenseTouchDraggingRef.current = false;
    expenseTouchHoverLaneRef.current = null;
    expenseTouchInsertRef.current = { lane: null, index: null };
    stopTouchAutoScroll();
    hideTouchDragOverlay();
    setDraggingExpenseId(null);
    setDragPreviewExpenseCategory(null);
    setTouchInsertLane(null);
    setTouchInsertIndex(null);
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
      expenseTouchInsertRef.current = { lane: meta.category, index: null };
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
      setTouchInsertTarget(lane, insertIndex);
    } else {
      expenseTouchHoverLaneRef.current = null;
      resetExpensePreviewToOrigin();
      setTouchInsertTarget(null, null);
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
    const insertIndex = expenseTouchInsertRef.current.lane === lane ? expenseTouchInsertRef.current.index : null;
    reorderExpenseByInsert(draggingExpenseId, lane, insertIndex);
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
  const timelineBounds = useMemo(() => {
    if (!futureWeeks?.length) return null;
    const validWeeks = futureWeeks
      .map((week) => ({
        start: safeDate(week?.weekStart),
        end: safeDate(week?.weekEnd),
      }))
      .filter((week) => week.start && week.end && week.end > week.start);
    if (!validWeeks.length) return null;
    const timelineEnd = new Date(Math.max(...validWeeks.map(week => week.end.getTime())) + DAY_MS);
    const startOfYear = new Date(timelineEnd.getFullYear(), 0, 1);
    const startMs = startOfYear.getTime();
    const endMs = Math.max(...validWeeks.map(week => week.end.getTime())) + DAY_MS;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    return { startMs, endMs, spanMs: endMs - startMs };
  }, [futureWeeks]);

  const timelineMonthSegments = useMemo(() => {
    if (!timelineBounds) return [];
    const segments = [];
    const timelineStart = new Date(timelineBounds.startMs);
    const timelineEnd = new Date(timelineBounds.endMs);
    const cursor = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);

    while (cursor < timelineEnd) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segStart = Math.max(monthStart.getTime(), timelineBounds.startMs);
      const segEnd = Math.min(monthEnd.getTime(), timelineBounds.endMs);
      if (segEnd > segStart) {
        const leftPct = ((segStart - timelineBounds.startMs) / timelineBounds.spanMs) * 100;
        const widthPct = ((segEnd - segStart) / timelineBounds.spanMs) * 100;
        const blockWidthPct = widthPct / MONTH_SUBDIVISIONS;
        segments.push({
          key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
          label: monthStart.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
          leftPct,
          widthPct,
          subdivisions: Array.from({ length: MONTH_SUBDIVISIONS }, (_, idx) => ({
            key: idx,
            leftPct: leftPct + (blockWidthPct * idx),
            widthPct: blockWidthPct,
          })),
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return segments;
  }, [timelineBounds]);
  const rollingGoalTimeline = useMemo(
    () => deriveRollingTimelineMonths(timelineMonthSegments, TODAY_ISO, 1),
    [timelineMonthSegments, TODAY_ISO]
  );
  const visibleTimelineSegments = rollingGoalTimeline.visibleMonths;
  const archivedTimelineSegments = rollingGoalTimeline.hiddenMonths;
  const goalTimelineScale = progressiveScale(rollingGoalTimeline.scaleProgress, 0.15);

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
      {overviewCats.map(cat => {
        const cExp = regularExpenses.filter(e => e.category === cat);
        const laneCardsExcludingDragged = cExp.filter(item => item.id !== draggingExpenseId);
        const loanItems = cat === "Needs" ? loans : [];
        const cTot = cExp.reduce((s, e) => s + currentEffective(e, ap), 0)
                   + loanItems.reduce((s, e) => s + currentEffective(e, ap), 0);
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
            setTouchInsertTarget(cat, insertIndex);
          }}
          onDrop={(e) => {
            if (!isExpenseDropLane) return;
            e.preventDefault();
            if (!draggingExpenseId) return;
            const insertIndex = getLaneInsertIndexFromY(cat, e.clientY);
            reorderExpenseByInsert(draggingExpenseId, cat, insertIndex);
            onExpenseDragEnd();
          }}
          onDragLeave={(e) => {
            if (!isExpenseDropLane) return;
            if (e.currentTarget.contains(e.relatedTarget)) return;
            resetExpensePreviewToOrigin();
            setTouchInsertTarget(null, null);
          }}
          style={{
            marginBottom: "24px",
            padding: isExpenseDropLane ? "8px" : 0,
            borderRadius: isExpenseDropLane ? "10px" : 0,
            border: isExpenseDropLane
              ? `1px solid ${dragPreviewExpenseCategory === cat ? `${CATEGORY_COLORS[cat]}44` : "#1f1f1f"}`
              : "none",
            background: isExpenseDropLane
              ? (dragPreviewExpenseCategory === cat ? "rgba(20,20,20,0.35)" : "transparent")
              : "transparent",
            transition: "background 220ms ease, border-color 220ms ease",
          }}
        >
          <SH color={CATEGORY_COLORS[cat]} right={f2(cTot) + "/wk"}>{cat}</SH>
          {cExp.map(exp => {
            const effAmt = currentEffective(exp, ap);
            const latestEntry = exp.history?.length ? exp.history.reduce((b, e) => e.effectiveFrom > b.effectiveFrom ? e : b) : null;
            const phaseBillingMeta = exp.billingMeta?.byPhase?.[ap];
            const activeBillingMeta = phaseBillingMeta ?? exp.billingMeta;
            const isEditing = editId === exp.id;
            const isDragging = draggingExpenseId === exp.id;
            const previewCategory = dragPreviewExpenseCategory ?? exp.category;
            const lanePreviewingMove = isDragging && previewCategory !== exp.category;
            const previewTint = lanePreviewingMove ? EXPENSE_DRAG_PREVIEW_TINT[previewCategory] : null;
            const cardInsertIndex = laneCardsExcludingDragged.findIndex(item => item.id === exp.id);
            const showInsertLineBefore = isExpenseDropLane
              && draggingExpenseId
              && touchInsertLane === cat
              && touchInsertIndex === cardInsertIndex;
            return <div
              key={exp.id}
              data-expense-id={exp.id}
              draggable={!isEditing && isExpenseDropLane && !isCoarsePointer}
              onDragStart={() => onExpenseDragStart(exp)}
              onDragEnd={onExpenseDragEnd}
              onTouchStart={(e) => {
                if (!isEditing && isExpenseDropLane) onExpenseTouchStart(e, exp);
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
                setTouchInsertTarget(cat, insertIndex);
              }}
              onDrop={(e) => {
                if (!isExpenseDropLane) return;
                e.preventDefault();
                e.stopPropagation();
                if (!draggingExpenseId) return;
                const insertIndex = getLaneInsertIndexFromY(cat, e.clientY);
                reorderExpenseByInsert(draggingExpenseId, cat, insertIndex);
                onExpenseDragEnd();
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return;
                resetExpensePreviewToOrigin();
              }}
              style={{
                background: lanePreviewingMove
                  ? `linear-gradient(120deg, ${CATEGORY_BG[cat]} 0%, ${CATEGORY_BG[cat]} 40%, ${previewTint} 72%, ${CATEGORY_BG[previewCategory]} 100%)`
                  : CATEGORY_BG[cat],
                border: `1px solid ${lanePreviewingMove ? `${CATEGORY_COLORS[previewCategory]}66` : "#1e1e1e"}`,
                borderRadius: "6px",
                padding: "10px 12px",
                marginBottom: "6px",
                position: "relative",
                opacity: isDragging ? 0.72 : 1,
                cursor: isEditing ? "default" : (isExpenseDropLane ? (isDragging ? "grabbing" : "grab") : "default"),
                transform: isDragging ? "scale(0.94)" : "scale(1)",
                boxShadow: isDragging
                  ? `0 0 0 1px ${CATEGORY_COLORS[previewCategory]}33 inset`
                  : lanePreviewingMove ? `0 0 0 1px ${CATEGORY_COLORS[previewCategory]}44 inset` : "none",
                transition: "background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, opacity 150ms ease, transform 150ms ease",
                touchAction: isExpenseDropLane ? "pan-y" : "auto",
                userSelect: isExpenseDropLane ? "none" : "auto",
                WebkitUserSelect: isExpenseDropLane ? "none" : "auto",
              }}
            >
              {showInsertLineBefore && <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: "12px",
                  right: "12px",
                  top: "-5px",
                  height: "4px",
                  borderRadius: "999px",
                  background: "#fff",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.2)",
                  opacity: 0.96,
                }}
              />}
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
                  Per-paycheck reserve: {f2(perPaycheckFromCycle(parseFloat(editVals.amount) || 0, editVals.cycle ?? "every30days"))}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => saveEditExp(exp.id)} style={{ background: "var(--color-green)", color: "#0a0a0a", border: "none", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontSize: "10px", flex: 1 }}>SAVE</button>
                  <button onClick={() => setEditId(null)} style={{ background: "var(--color-border-subtle)", color: "var(--color-text-secondary)", border: "none", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontSize: "10px", }}>✕</button>
                </div>
              </div> : <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  data-expense-drag-handle
                  aria-label={`Hold to drag ${exp.label}`}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{
                    background: pendingExpenseTouchId === exp.id ? `${CATEGORY_COLORS[cat]}22` : "transparent",
                    color: pendingExpenseTouchId === exp.id ? CATEGORY_COLORS[cat] : "#666",
                    border: `1px solid ${pendingExpenseTouchId === exp.id ? `${CATEGORY_COLORS[cat]}66` : "#444"}`,
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
                </button>
                <div><div style={{ fontSize: "13px" }}>{exp.label}</div>{exp.note[ap] && <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{exp.note[ap]}</div>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {pendingExpenseTouchId === exp.id && <div style={{ fontSize: "9px", color: "var(--color-text-secondary)", letterSpacing: "0.8px", textTransform: "uppercase", whiteSpace: "nowrap" }}>hold…</div>}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: CATEGORY_COLORS[cat] }}>{f2(effAmt)}<span style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>/wk</span></div>
                    <div style={{ fontSize: "10px", color: "#777" }}>{f(effAmt * 52 / 12)}/mo</div>
                    {activeBillingMeta && <div style={{ fontSize: "9px", color: "var(--color-text-disabled)" }}>{f2(activeBillingMeta.amount ?? 0)} · {cycleByValue[activeBillingMeta.cycle]?.label ?? "Custom cycle"}</div>}
                    {latestEntry && <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginTop: "1px" }}>reserve started {activeBillingMeta?.effectiveFrom ?? latestEntry.effectiveFrom}</div>}
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
          {isExpenseDropLane && draggingExpenseId && touchInsertLane === cat && touchInsertIndex === laneCardsExcludingDragged.length && <div
            aria-hidden
            style={{
              height: "4px",
              borderRadius: "999px",
              margin: "2px 4px 8px",
              background: "#ffffff",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.25)",
              opacity: 0.94,
              transition: "opacity 140ms ease",
            }}
          />}
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
          <div><label style={lS}>Bill Amount ($)</label><input type="number" min="0" step="0.01" value={newExp.amount} onChange={e => setNewExp(v => ({ ...v, amount: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Paid Every</label><select value={newExp.cycle} onChange={e => setNewExp(v => ({ ...v, cycle: e.target.value }))} style={iS}>{EXPENSE_CYCLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note (optional)</label><input type="text" value={newExp.note} onChange={e => setNewExp(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="Short description" /></div>
          <div style={{ gridColumn: "1/-1", fontSize: "10px", color: "var(--color-text-secondary)" }}>
            This sets aside {f2(perPaycheckFromCycle(parseFloat(newExp.amount) || 0, newExp.cycle))} from each paycheck.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={addExp} disabled={!newExp.label} style={{ background: newExp.label ? "var(--color-green)" : "var(--color-border-subtle)", color: newExp.label ? "var(--color-bg-base)" : "#666", border: "none", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: newExp.label ? "pointer" : "default", fontWeight: "bold" }}>ADD</button>
          <button onClick={() => { setAddingExp(false); setNewExp({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" }); }} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</button>
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
      return <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <Card label="Adj. Weekly Available" val={f2(adjustedWeeklyAvg)} color="var(--color-green)" />
          <Card label="Active Goals Total" val={f(totG)} color="var(--color-gold)" />
          <Card label="Weeks to Complete All" val={`~${Math.ceil(lastGoalEW)} wks`} color={projS >= totG ? "var(--color-green)" : "var(--color-red)"} />
        </div>
        {adjustedWeeklyAvg < baseWeeklyUnallocated && <div style={{ background: "#2d1a1a", border: "1px solid #e8856a44", borderRadius: "6px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "var(--color-text-secondary)" }}>Event log reduced avg by <span style={{ color: "var(--color-red)", fontWeight: "bold" }}>{f2(baseWeeklyUnallocated - adjustedWeeklyAvg)}/wk</span></div>}

        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid #222",
            background: "rgba(16,16,16,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tl.length ? "10px" : "0" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-gold)" }}>Active Goals</div>
            <div style={{ fontSize: "10px", color: "#666" }}>{tl.length}</div>
          </div>
          {!tl.length && <div style={{ border: "1px dashed #333", borderRadius: "8px", padding: "10px 12px", fontSize: "10px", color: "#666", letterSpacing: "1px", textTransform: "uppercase" }}>No active goals yet</div>}
          {tl.map((g, i) => {
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
              setDragPreviewCategory(g.category);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!draggingGoalId) return;
              reorderGoalByDrag(draggingGoalId, g.id);
              onGoalDragEnd();
            }}
            style={{
              background: lanePreviewingMove ? GOAL_LANES[previewLane].tint : "var(--color-bg-surface)",
              border: `1px solid ${isDropTarget ? "var(--color-gold)" : (celebrating ? "var(--color-green)" : g.color + "33")}`,
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
              {/* TODO: tune — monthly timeline subdivision opacity/width (currently subtle for low visual noise) */}
              {(() => {
                const nWeeks = Math.max(weeksLeft, 1);
                const rawStart = Number.isFinite(g.sW) ? g.sW : 0;
                const projectedEnd = Number.isFinite(g.eW) ? g.eW : rawStart + (Number.isFinite(g.wN) ? g.wN : 0);
                const startWeek = Math.min(nWeeks, Math.max(0, rawStart));
                const endWeek = Math.min(nWeeks, Math.max(startWeek, projectedEnd));
                const fallbackLeftPct = (startWeek / nWeeks) * 100;
                const fallbackWidthPct = Math.max(((endWeek - startWeek) / nWeeks) * 100, 0);
                let goalLeftPct = fallbackLeftPct;
                let goalWidthPct = fallbackWidthPct;
                if (timelineBounds?.spanMs && futureWeeks?.length) {
                  const anchorStart = safeDate(futureWeeks[0]?.weekStart)?.getTime() ?? timelineBounds.startMs;
                  const weekMs = 7 * DAY_MS;
                  const startMs = anchorStart + (startWeek * weekMs);
                  const endMs = anchorStart + (endWeek * weekMs);
                  goalLeftPct = clamp01((startMs - timelineBounds.startMs) / timelineBounds.spanMs) * 100;
                  goalWidthPct = Math.max(clamp01((endMs - startMs) / timelineBounds.spanMs) * 100, 0);
                }
                const visibleWidthPct = goalWidthPct > 0 && goalWidthPct < 0.45 ? 0.45 : goalWidthPct;
                return <div style={{ marginBottom: "8px" }}>
                  <div style={{
                    height: `${Math.round(16 * goalTimelineScale)}px`,
                    borderRadius: "6px",
                    border: "1px solid #232323",
                    background: "#111",
                    position: "relative",
                    overflow: "hidden",
                    marginBottom: "6px"
                  }}>
                    {/* Month overlays + subtle 4-block week chunks */}
                    {visibleTimelineSegments.map(seg => {
                      return <div key={seg.key} style={{
                        position: "absolute",
                        top: 0,
                        left: `${seg.leftPct}%`,
                        width: `${seg.widthPct}%`,
                        height: "100%",
                        borderLeft: "1px solid #232323",
                        borderRight: "1px solid #1a1a1a",
                        opacity: 0.7,
                        pointerEvents: "none"
                      }}>
                        {seg.subdivisions.map((sub) => (
                          <div key={`${seg.key}-sub-${sub.key}`} style={{
                            position: "absolute",
                            top: "1px",
                            bottom: "1px",
                            left: `${sub.leftPct - seg.leftPct}%`,
                            width: `${sub.widthPct}%`,
                            borderRight: sub.key < MONTH_SUBDIVISIONS - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
                            background: sub.key % 2 === 0 ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.03)",
                          }} />
                        ))}
                      </div>;
                    })}
                    {/* Continuous goal bar with partial month positioning */}
                    {visibleWidthPct > 0 && <div style={{
                      position: "absolute",
                      top: "2px",
                      left: `${goalLeftPct}%`,
                      width: `${visibleWidthPct}%`,
                      height: "calc(100% - 4px)",
                      borderRadius: "3px",
                      background: celebrating ? "var(--color-green)" : g.color,
                      opacity: celebrating ? 1 : (ok ? 0.96 : 0.58),
                      boxShadow: celebrating ? "0 0 10px rgba(76,175,125,0.55)" : "none",
                      transition: "background 0.35s ease-out, opacity 0.35s ease-out"
                    }} />}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 8px", flex: 1 }}>
                      {visibleTimelineSegments.map(seg => (
                        <span key={`${seg.key}-label`} style={{
                          fontSize: `${(8 * goalTimelineScale).toFixed(1)}px`,
                          letterSpacing: "1.5px",
                          color: "#5f5f5f",
                          textTransform: "uppercase"
                        }}>
                          {seg.label}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontSize: `${(8 * goalTimelineScale).toFixed(1)}px`, letterSpacing: "1.5px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>
                      4 week blocks / month
                    </span>
                  </div>
                  {archivedTimelineSegments.length > 0 && (
                    <div style={{ fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "8px" }}>
                      {archivedTimelineSegments.length} older month segment(s) hidden (view keeps previous month + rest of year; archived for future full-year review).
                    </div>
                  )}
                </div>;
              })()}
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
        </div>

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
