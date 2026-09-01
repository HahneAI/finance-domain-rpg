import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { PHASES, CATEGORY_COLORS, CATEGORY_BG, FISCAL_YEAR_START, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { getEffectiveAmountForMonth, getExactEffectiveAmountForMonth, phaseIdxForMonth, computeLoanPayoffDate, buildLoanHistory, loanPaymentsRemaining, loanWeeklyAmount, toLocalIso, getPhaseIndex, deriveWeeklyPayrollDeductions, fmtLoanDate, fmtFullDate } from "../lib/finance.js";
import { latestPastEntry as latestPastEntryPure, applyMonthEdit, clearMonth, clearMonthForward, clearQuarterMonths, onwardStartMonthKey, applyQuarterForward, applyAllQuarters, monthKeysThroughFiscalYearEnd, EXPENSE_CYCLE_OPTIONS, CHECKS_PER_MONTH, normalizeCycle, perPaycheckFromCycle, cycleAmountFromPerPaycheck, monthlyFromPerPaycheck } from "../lib/expense.js";
import { formatPayPeriodLabel, getNextPayWeek } from "../lib/fiscalWeek.js";
import { formatRotationDisplay } from "../lib/rotation.js";
import { canAccessTaxPlan } from "../lib/entitlements.js";
import { logBetaEvent } from "../lib/db.js";
import { Card, VT, SmBtn, Pressable, useFoldTransition, SH, SectionHeader, PanelHero, iS, lS, ExactMathMark } from "./ui.jsx";
import { LiquidGlass } from "./LiquidGlass.jsx";
import { MonthQuarterSelector } from "./MonthQuarterSelector.jsx";
import { BulkEditPage } from "./BulkEditPage.jsx";

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

// Shared timing so the category fold-out animation and the auto-scroll stay in lockstep.
const CAT_ANIM_MS = 360;

// Nearest scrollable ancestor (the mobile scroller is .main-content); null → use window.
function getScrollParent(el) {
  let node = el?.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

// Eased scroll (easeInOutQuad) over CAT_ANIM_MS so it matches the expand animation.
function animateScrollTo(scroller, to, duration = CAT_ANIM_MS) {
  const isWin = !scroller;
  const startTop = isWin ? window.scrollY : scroller.scrollTop;
  const change = to - startTop;
  if (Math.abs(change) < 2) return;
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    const top = startTop + change * ease(t);
    if (isWin) window.scrollTo(0, top); else scroller.scrollTop = top;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Scroll an expanded category's header to "almost the top" of its scroll container.
function scrollCategoryHeaderNearTop(cat) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-cat-header="${cat}"]`);
    if (!el) return;
    const scroller = getScrollParent(el);
    const offset = 72; // leave a little breathing room above the header — not pinned to the very top
    const rect = el.getBoundingClientRect();
    const target = scroller
      ? scroller.scrollTop + (rect.top - scroller.getBoundingClientRect().top) - offset
      : window.scrollY + rect.top - offset;
    animateScrollTo(scroller, Math.max(0, target));
  });
}


export function BudgetPanel({ expenses, setExpenses: setExpensesProp, onSaveExpensesNow: onSaveExpensesNowProp, weeklyIncome, prevWeekNet, futureWeeks, futureWeekNets, avgWeeklySpend = 0, currentWeek, today, fiscalWeekInfo, userPaySchedule, config, freedomAllowancePerWeek = 0, isAdmin = false, isAiAdmin = false, taxProjectionsEnabled = false, isTester = false, betaCodeUsed = null, readOnly = false }) {
  // Tax-exempt projection UI (e.g. the TAXED/EXEMPT badge) is gated behind the
  // manual feature unlock, not config.taxExemptOptIn alone — so clicking "Unlock
  // projections" in setup never surfaces it to a normal user. See canAccessTaxPlan.
  const taxFeatureUnlocked = canAccessTaxPlan({ isAdmin, taxProjectionsEnabled, isTester, isAiAdmin });
  // Paywall-expired read-only mode (docs/TODO.md §17.E): shadow setExpenses with
  // a no-op so every existing setExpenses() call in this file — expense AND loan
  // mutations both go through it — is automatically safe, without having to find
  // and gate each individual call site.
  const noop = useCallback(() => {}, []);
  const setExpenses = readOnly ? noop : setExpensesProp;
  const onSaveExpensesNow = readOnly ? noop : onSaveExpensesNowProp;
  // Wraps setExpenses to also eager-save the computed value, so every
  // mutation below (add/edit/delete/reorder an expense or loan) doesn't sit
  // in the ambient debounce window. `updater` has the exact same signature
  // as a setState functional updater (receives prev, returns next) — every
  // call site below is unchanged internally, only the outer function name
  // changes from setExpenses to this.
  const applyExpenseUpdate = (updater) => {
    let next;
    let prevLen;
    setExpenses(prev => { prevLen = prev.length; next = updater(prev); return next; });
    onSaveExpensesNow?.(next);
    // Beta usage tracking: a length increase is a create (expense or loan — both
    // live in this same array), anything else is treated as an update. `next` is
    // only undefined when readOnly's noop shadow swallowed the call — nothing
    // actually mutated, so there's nothing to log.
    if (next) {
      logBetaEvent({ isTester, betaCodeUsed, eventType: next.length > prevLen ? "expense_created" : "expense_updated" });
    }
  };
  // TODAY_ISO from App — reactive, advances at midnight automatically
  const TODAY_ISO = today;
  const cpm = CHECKS_PER_MONTH[userPaySchedule ?? "weekly"] ?? 4;
  const checksPerYear = PAYCHECKS_PER_YEAR[userPaySchedule ?? "weekly"] ?? 52;
  const perCheckFactor = 52 / checksPerYear; // 1 for weekly, 2 for biweekly/salary
  const MIN_FOOD_WEEKLY = 75; // $75/week floor on the mandatory food expense
  const minFoodPerCheck = MIN_FOOD_WEEKLY * perCheckFactor; // $75 weekly · $150 biweekly
  const isWeekly = checksPerYear === 52;
  const checkUnit = isWeekly ? "wk" : "check";   // "/wk" vs "/check" suffix
  const checkWord = isWeekly ? "Weekly" : "Per-Check"; // card label prefix
  const thisCheckLabel = isWeekly ? "This Week" : "This Check";

  const currentPhaseIdx = useMemo(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0, [currentWeek]);
  const fiscalWeekLabel = formatPayPeriodLabel(fiscalWeekInfo, checksPerYear);
  const nextPayWeek = useMemo(() => getNextPayWeek(futureWeeks, TODAY_ISO, checksPerYear), [futureWeeks, TODAY_ISO, checksPerYear]);
  const daysUntilPaycheck = nextPayWeek
    ? Math.round((nextPayWeek.payPeriodEndDate.getTime() - new Date(TODAY_ISO + "T00:00:00").getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const [ap, setAp] = useState(() => currentWeek ? getPhaseIndex(currentWeek.weekEnd) : 0);
  const [view, setView] = useState("overview");
  // Expense CRUD state
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [addingExp, setAddingExp] = useState(false);
  const [newExp, setNewExp] = useState({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [showCheckInfo, setShowCheckInfo] = useState(false);
  const checkInfoFold = useFoldTransition(showCheckInfo, { ms: 340 });
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
  // Double-tap-to-open-Bulk-Edit on the MonthQuarterSelector's month/quarter
  // segments — same tap-timing pattern used for the expense row shortcut below
  // (lastTapRef), kept as its own ref so the two double-tap surfaces never
  // share (or collide on) keys.
  const lastSegmentTapRef = useRef({});
  const isDoubleTap = (key) => {
    const now = Date.now();
    const last = lastSegmentTapRef.current[key] ?? 0;
    if (now - last < 350) {
      lastSegmentTapRef.current[key] = 0;
      return true;
    }
    lastSegmentTapRef.current[key] = now;
    return false;
  };
  const handleSelectMonth = (monthKey) => {
    const openBulkEdit = isDoubleTap(`m:${monthKey}`);
    setActiveMonth(monthKey);
    setAp(phaseIdxForMonth(monthKey));
    setBulkEditOpen(openBulkEdit);
  };
  const handleSelectQuarter = (phaseIdx) => {
    const openBulkEdit = isDoubleTap(`q:${phaseIdx}`);
    setActiveMonth(null);
    setAp(phaseIdx);
    setBulkEditOpen(openBulkEdit);
  };
  // Expand/collapse per expense category — remembered for the session (sessionStorage),
  // defaults to all categories collapsed. A category is expanded only if its name is in the set.
  const [expandedCats, setExpandedCats] = useState(() => {
    try {
      const raw = sessionStorage.getItem("budgetExpandedCats");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });
  const toggleCat = (cat) => {
    const willExpand = !expandedCats.has(cat);
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (willExpand) next.add(cat); else next.delete(cat);
      try { sessionStorage.setItem("budgetExpandedCats", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    // On expand, glide the category header up to near the top in time with the fold-out.
    if (willExpand) scrollCategoryHeaderNearTop(cat);
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
  // Drop target tracked as the id of the card to insert *before* (null = end of
  // lane), not a numeric index — robust to hidden/pinned cards and cross-lane
  // moves, and keeps the placement marker and the actual drop in lock-step.
  const [expenseInsertBeforeId, setExpenseInsertBeforeId] = useState(null);
  const [touchDragOverlay, setTouchDragOverlay] = useState({ visible: false, x: 0, y: 0, label: "", sourceCategory: "Needs" });
  const expenseTouchDraggingRef = useRef(false);
  const expenseTouchHoverLaneRef = useRef(null);
  const expenseInsertRef = useRef({ lane: null, beforeId: null });
  const expenseTouchLastPointRef = useRef(null);
  const expenseTouchHoldTimerRef = useRef(null);
  const expenseTouchHoldMetaRef = useRef(null);
  const expenseTouchAutoScrollRef = useRef({ rafId: null, direction: 0, speed: 0 });
  const expenseTouchOverlayExitTimerRef = useRef(null);
  const expenseDragFinalizedRef = useRef(false);
  const [pendingExpenseTouchId, setPendingExpenseTouchId] = useState(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  // Bottom sheet drag-to-dismiss refs
  const restoreSheetElRef = useRef(null);
  const restoreSheetDragStartYRef = useRef(null);
  const expSheetElRef = useRef(null);
  const expSheetDragStartYRef = useRef(null);
  const EXPENSE_TOUCH_HOLD_MS = 450;
  // Expense detail bottom sheet
  const [sheetExp, setSheetExp] = useState(null);
  const [sheetMode, setSheetMode] = useState("view"); // "view" | "edit"
  const [sheetDeleteConfirm, setSheetDeleteConfirm] = useState(false);
  const lastTapRef = useRef({});
  // When a sheet-edit save completes (editId→null), return sheet to view mode
  useEffect(() => {
    if (sheetMode === "edit" && editId === null) setSheetMode("view");
  }, [editId, sheetMode]);
  // Ensure modal-open class is cleaned up if component unmounts while sheet is open
  useEffect(() => () => { document.body.classList.remove("modal-open"); }, []);
  const TOUCH_SCROLL_CANCEL_PX = 12;
  const TOUCH_EDGE_AUTOSCROLL_ZONE_PX = 92;
  const TOUCH_MAX_AUTOSCROLL_SPEED_PX = 18;
  const TOUCH_OVERLAY_EXIT_MS = 130;
  // Full-year annual cost: sums across all 4 quarters using a representative date per quarter.
  // Using a date within each quarter means getEffectiveAmount picks the correct history entry —
  // loans that pay off mid-year will return $0 for quarters after the payoff date.
  const Q_REP_DATES = [new Date("2026-02-15"), new Date("2026-05-15"), new Date("2026-08-15"), new Date("2026-11-15")];
  // Representative month key per quarter (mid-quarter) — override-aware analog of Q_REP_DATES.
  const Q_REP_MONTH_KEYS = ["2026-02", "2026-05", "2026-08", "2026-11"];
  const WEEKS_PER_Q = [13, 13, 13, 13]; // 52 weeks total
  // First calendar month of each quarter — used as the representative month in quarter mode.
  const QUARTER_FIRST_MONTHS = ["2026-01", "2026-04", "2026-07", "2026-10"];
  const MONTH_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  // Month key for today — used to highlight the current month pill.
  const currentMonthKey = TODAY_ISO.slice(0, 7);
  // Short label for the active month (e.g. "MAY"), null in quarter mode.
  const activeMonthLabel = activeMonth ? MONTH_SHORT[parseInt(activeMonth.slice(5, 7), 10) - 1] : null;
  // Full label for the active month (e.g. "May"), null in quarter mode — used on the primary "month onward" save.
  const activeMonthFull = activeMonth ? MONTH_FULL[parseInt(activeMonth.slice(5, 7), 10) - 1] : null;
  // Anchor month for save-scope buttons: the selected month, or the current month when viewing a whole quarter.
  // Lets the month-scoped add/save layout work even before a specific month pill is tapped.
  const anchorMonthKey = activeMonth ?? currentMonthKey;
  const anchorMonthLabel = MONTH_SHORT[parseInt(anchorMonthKey.slice(5, 7), 10) - 1];
  const anchorMonthFull = MONTH_FULL[parseInt(anchorMonthKey.slice(5, 7), 10) - 1];
  // In month mode, resolve amounts for the selected month; in quarter mode, use the
  // first month of the active quarter — except the current quarter, which anchors to
  // the current month so already-elapsed months in the quarter don't read as $0 (Bug 2).
  const displayMonthKey = activeMonth ?? (ap === currentPhaseIdx ? currentMonthKey : QUARTER_FIRST_MONTHS[ap]);
  // Full label for displayMonthKey (e.g. "August") — used by the Bulk Edit button so its
  // label always names the same month BulkEditPage will actually open (selectedMonthIso
  // is built from this same displayMonthKey below).
  const displayMonthFull = MONTH_FULL[parseInt(displayMonthKey.slice(5, 7), 10) - 1];
  const displayEffective = (exp, phaseIdx) => getEffectiveAmountForMonth(exp, displayMonthKey, phaseIdx);
  // Exact counterpart to displayEffective, for TOTALS (category headers, cash-flow
  // waterfall, loans summary) — never for an individual bill/loan row's own displayed
  // amount, which stays on the simple 48-week mental-math figure (product decision,
  // 2026-08-31; see getExactEffectiveAmountForMonth's doc comment in finance.js).
  const exactEffective = (exp, phaseIdx) => getExactEffectiveAmountForMonth(exp, displayMonthKey, phaseIdx);
  // Override-aware analogs of the old history-only readers (used by the debug traces below):
  // currentEffective resolves at the current month; quarterEffective at each quarter's
  // representative month. Both honor monthlyOverrides via getEffectiveAmountForMonth.
  const currentEffective = (exp, phaseIdx) => getEffectiveAmountForMonth(exp, currentMonthKey, phaseIdx);
  const quarterEffective = (exp, phaseIdx) => getEffectiveAmountForMonth(exp, Q_REP_MONTH_KEYS[phaseIdx], phaseIdx);

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
  // Annual cost for the breakdown tab — a "total year summary" (product
  // decision, 2026-08-31), so this must reconcile exactly against what was
  // actually entered, not the front-facing bill cards' 48-week-year mental-
  // math approximation. Sums each of the 12 real months' exact per-week rate
  // (getExactEffectiveAmountForMonth — reads a monthlyOverrides entry's own
  // {amount, cycle} when one exists for that month, so genuinely-varying
  // per-month overrides still flow through correctly) × 52/12, the real
  // weeks-per-month conversion — NOT the display math's flat ×4. For a bill
  // that hasn't been edited per-month (the common case), this reduces to
  // exactly the entered amount: 12 identical monthly contributions summing
  // to exactAnnualCost. Loans get the same treatment now — no more special
  // case needed once every row uses real-year math uniformly.
  const yearlyExpenseCost = (exp) =>
    [0,1,2,3,4,5,6,7,8,9,10,11].reduce((s, m) => {
      const key = `2026-${String(m + 1).padStart(2, "0")}`;
      const phaseIdx = Math.floor(m / 3);
      const exactWeekly = getExactEffectiveAmountForMonth(exp, key, phaseIdx);
      return s + exactWeekly * (52 / 12);
    }, 0);

  // Exact weekly average for the breakdown — real 52-week year, uniformly for
  // bills and loans alike (see yearlyExpenseCost above).
  const expenseWeeklyAvg = (exp) => yearlyExpenseCost(exp) / 52;

  // Live expense snapshot for the detail sheet — stays in sync as edits land
  const sheetExpLive = sheetExp ? (expenses.find(e => e.id === sheetExp.id) ?? null) : null;
  const isFoodSheet = Boolean(sheetExpLive?.isFoodPrimary || sheetExpLive?.isFoodHighlighted);

  const openSheet = (exp) => {
    setSheetExp(exp);
    setSheetMode("view");
    setSheetDeleteConfirm(false);
    setEditId(null);
    document.body.classList.add("modal-open");
  };
  const closeSheet = () => {
    setSheetExp(null);
    setSheetMode("view");
    setSheetDeleteConfirm(false);
    setEditId(null);
    document.body.classList.remove("modal-open");
  };
  const closeRestoreSheet = () => {
    setRestoreSheetCat(null);
    setRestorePendingExpId(null);
    document.body.classList.remove("modal-open");
  };

  // Drag-to-dismiss: restore sheet handle
  const onRestoreHandleTouchStart = (e) => {
    restoreSheetDragStartYRef.current = e.touches[0].clientY;
  };
  const onRestoreHandleTouchMove = (e) => {
    if (restoreSheetDragStartYRef.current === null || !restoreSheetElRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - restoreSheetDragStartYRef.current);
    restoreSheetElRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onRestoreHandleTouchEnd = (e) => {
    if (restoreSheetDragStartYRef.current === null) return;
    const dy = e.changedTouches[0].clientY - restoreSheetDragStartYRef.current;
    if (dy > 80) {
      closeRestoreSheet();
    } else if (restoreSheetElRef.current) {
      const el = restoreSheetElRef.current;
      el.style.transition = "transform 0.25s cubic-bezier(.2,.7,.2,1)";
      el.style.transform = "translateY(0)";
      setTimeout(() => { if (el) el.style.transition = ""; }, 260);
    }
    restoreSheetDragStartYRef.current = null;
  };

  // Drag-to-dismiss: expense detail sheet handle
  const onExpHandleTouchStart = (e) => {
    expSheetDragStartYRef.current = e.touches[0].clientY;
  };
  const onExpHandleTouchMove = (e) => {
    if (expSheetDragStartYRef.current === null || !expSheetElRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - expSheetDragStartYRef.current);
    expSheetElRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onExpHandleTouchEnd = (e) => {
    if (expSheetDragStartYRef.current === null) return;
    const dy = e.changedTouches[0].clientY - expSheetDragStartYRef.current;
    if (dy > 80) {
      closeSheet();
    } else if (expSheetElRef.current) {
      const el = expSheetElRef.current;
      el.style.transition = "transform 0.25s cubic-bezier(.2,.7,.2,1)";
      el.style.transform = "translateY(0)";
      setTimeout(() => { if (el) el.style.transition = ""; }, 260);
    }
    expSheetDragStartYRef.current = null;
  };

  // Split loans from regular expenses for display purposes
  const loans = expenses.filter(e => e.type === "loan");
  const regularExpenses = expenses.filter(e => e.type !== "loan");

  const ph = PHASES[ap];
  const ts = expenses.reduce((s, e) => s + exactEffective(e, ap), 0);
  const incomingWeekNet = futureWeekNets?.[0] ?? prevWeekNet ?? weeklyIncome;
  const finalizedWeekNet = prevWeekNet ?? weeklyIncome;
  const wr = weeklyIncome - ts;
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
  // Exact math — this feeds the real "Left [period]" dollar figure the user
  // plans against for a specific future paycheck, not a bill-card mental-math
  // display (product decision, 2026-08-31).
  const firstCheckExpenses = useMemo(() => {
    if (!firstCheckWeek) return avgWeeklySpend;
    return expenses.reduce((s, e) => s + getExactEffectiveAmountForMonth(e, firstCheckMonthKey, firstCheckPhase), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstCheckWeek, expenses, firstCheckMonthKey, firstCheckPhase]);
  const leftFirstCheck = firstCheckNet - firstCheckExpenses;
  const firstCheckMonthShort = MONTH_SHORT[parseInt(targetMonthForFirstCheck.slice(5, 7), 10) - 1];

  // Paycheck breakdown data for the info modal
  const infoRefWeek    = isViewingFuture && firstCheckWeek ? firstCheckWeek : currentWeek;
  const infoMonthKey   = isViewingFuture && firstCheckWeek ? firstCheckMonthKey : currentMonthKey;
  const infoPhase      = isViewingFuture && firstCheckWeek ? firstCheckPhase : currentPhaseIdx;
  const infoLabel      = isViewingFuture && firstCheckWeek ? `First Check · ${firstCheckMonthShort}` : (isWeekly ? "This Week" : checksPerYear === 12 ? "This Month" : "This Paycheck");
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
    // All values below are per-week. Multiply by perCheckFactor at return so the
    // modal always shows per-paycheck amounts regardless of pay schedule.
    const otherPostTax   = (config.otherDeductions ?? []).reduce((sum, row) => {
      const amt = row?.weeklyAmount;
      return sum + (typeof amt === "number" ? amt : 0);
    }, 0);
    const netPay    = gross - fica - fedTax - stateTax - benefits - k401 - otherPostTax;
    const spendable = netPay - freedomAllowancePerWeek;
    // Exact math — this is a real paycheck accounting breakdown, not a bill-card
    // mental-math display (product decision, 2026-08-31).
    const needsSpend     = regularExpenses.filter(e => e.category === "Needs")
      .reduce((s, e) => s + getExactEffectiveAmountForMonth(e, infoMonthKey, infoPhase), 0);
    const lifestyleSpend = regularExpenses.filter(e => e.category === "Lifestyle")
      .reduce((s, e) => s + getExactEffectiveAmountForMonth(e, infoMonthKey, infoPhase), 0);
    const loansSpend     = loans
      .reduce((s, e) => s + getExactEffectiveAmountForMonth(e, infoMonthKey, infoPhase), 0);
    const left = spendable - needsSpend - lifestyleSpend - loansSpend;
    const pcf = perCheckFactor;
    return {
      gross: gross * pcf, fica: fica * pcf, fedTax: fedTax * pcf, stateTax: stateTax * pcf,
      benefits: benefits * pcf, k401: k401 * pcf, otherPostTax: otherPostTax * pcf,
      netPay: netPay * pcf, spendable: spendable * pcf,
      needsSpend: needsSpend * pcf, lifestyleSpend: lifestyleSpend * pcf, loansSpend: loansSpend * pcf,
      left: left * pcf,
      otherDeductions: config.otherDeductions ?? [],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoRefWeek, config, freedomAllowancePerWeek, expenses, infoMonthKey, infoPhase]);

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
  const saveAdvancedEdit = ({ patches = [], additions = [], overridesByExpId = {} }) => {
    applyExpenseUpdate(prev => {
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
        // monthlyOverrides is the authoritative read layer (getEffectiveAmountForMonth
        // checks it before ever falling back to history) — without also writing it
        // here, an expense with an existing override for the target month would
        // silently mask this whole edit (Bug 1's "editing does nothing" defect,
        // reopened for the Bulk Edit path specifically; see buildAdvancedEditPayload).
        const monthlyOverrides = overridesByExpId[e.id] ?? e.monthlyOverrides;
        return { ...e, history, billingMeta, monthlyOverrides };
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

  const _closeAddForm = () => {
    setAddingExp(false);
    setNewExp({ label: "", category: "Needs", amount: "", cycle: "every30days", note: "" });
  };

  const addExpThisMonth = () => {
    if (!newExp.label) return;
    const anchor = activeMonth ?? currentMonthKey; // fall back to current month in quarter view
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    applyExpenseUpdate(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom: TODAY_ISO },
      history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [0, 0, 0, 0] }],
      monthlyOverrides: { [anchor]: { perPaycheck, amount, cycle } },
    }]);
    _closeAddForm();
  };

  const addExpFromMonthForward = () => {
    if (!newExp.label) return;
    const anchor = activeMonth ?? currentMonthKey; // fall back to current month in quarter view
    const amount = parseFloat(newExp.amount) || 0;
    const cycle = newExp.cycle ?? "every30days";
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const overrides = {};
    for (const key of monthKeysThroughFiscalYearEnd(anchor)) {
      overrides[key] = { perPaycheck, amount, cycle };
    }
    const effectiveFrom = `${anchor}-01`;
    const weekly = [0, 1, 2, 3].map(q => q < ap ? 0 : perPaycheck);
    applyExpenseUpdate(prev => [...prev, {
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
    const qStartIso = QUARTER_FIRST_MONTHS[ap] + "-01";
    applyExpenseUpdate(prev => [...prev, {
      id: `exp_${crypto.randomUUID()}`,
      category: newExp.category,
      label: newExp.label,
      note: [newExp.note, newExp.note, newExp.note, newExp.note],
      billingMeta: { amount, cycle, effectiveFrom: qStartIso },
      history: [{ effectiveFrom: qStartIso, weekly }],
    }]);
    _closeAddForm();
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
    applyExpenseUpdate(prev => prev.map(e =>
      e.id !== expId ? e : applyMonthEdit(e, activeMonth, perPaycheck, amount, cycle)
    ));
    setEditId(null);
  };

  // FROM [MON] + — force-overwrites monthlyOverrides for activeMonth through the
  // real fiscal year end (monthKeysThroughFiscalYearEnd — NOT calendar December,
  // see that helper's comment) AND adds a history entry so quarterly totals also
  // update.
  const saveFromMonthForward = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    applyExpenseUpdate(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const overrides = { ...(e.monthlyOverrides ?? {}) };
      for (const key of monthKeysThroughFiscalYearEnd(activeMonth)) {
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

  // THIS QTR ONLY — writes monthlyOverrides for the 3 months of the current quarter only.
  const saveThisQuarterOnly = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const qStartMonth = ap * 3 + 1; // Q1→1, Q2→4, Q3→7, Q4→10
    applyExpenseUpdate(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const overrides = { ...(e.monthlyOverrides ?? {}) };
      for (let m = qStartMonth; m < qStartMonth + 3; m++) {
        const key = `2026-${String(m).padStart(2, "0")}`;
        overrides[key] = { perPaycheck, amount, cycle };
      }
      const billingMeta = { ...(e.billingMeta ?? {}), amount, cycle, effectiveFrom: TODAY_ISO };
      return { ...e, monthlyOverrides: overrides, billingMeta };
    }));
    setEditId(null);
  };

  // Q[n]+ ONWARD — authoritative per Option A.
  // Writes monthlyOverrides for the window start through the real fiscal year end
  // (applyQuarterForward → monthKeysThroughFiscalYearEnd, not calendar December),
  // overwriting any finer overrides already in range (Decision 1). The window starts at the viewed
  // quarter's first month, but never rewrites elapsed months: for the current (or
  // a past) quarter it clamps to the current month (Decision 2 — "onward" = today
  // forward). A single cascaded history entry at the window start is kept as the
  // baseline for earlier months; no back-dating into elapsed months, no duplicate
  // effectiveFrom.
  const saveAllQuarters = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const startKey = onwardStartMonthKey(QUARTER_FIRST_MONTHS[ap], currentMonthKey);
    const effectiveFrom = `${startKey}-01`;
    applyExpenseUpdate(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const { monthlyOverrides } = applyQuarterForward(e, startKey, perPaycheck, amount, cycle);
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const baseWeekly = latestPastEntry(existing).weekly ?? [0, 0, 0, 0];
      const newWeekly = [0, 1, 2, 3].map(q => q < ap ? (baseWeekly[q] ?? 0) : perPaycheck);
      const billingMeta = { ...(e.billingMeta ?? {}), amount, cycle, effectiveFrom: TODAY_ISO };
      // Keep strictly-earlier entries as the baseline; replace anything dated on/after
      // the window start so the new entry is the single authority going forward.
      const baseline = existing.filter(en => en.effectiveFrom < effectiveFrom);
      const newHistory = [...baseline, { effectiveFrom, weekly: newWeekly }];
      return { ...e, history: newHistory, billingMeta, monthlyOverrides };
    }));
    setEditId(null);
  };

  // ALL QTRS — authoritative full-year set. Intentionally covers every month
  // (including elapsed ones): this button's explicit purpose is "apply to the
  // whole year." Writes monthlyOverrides Jan through the real fiscal year end
  // (applyAllQuarters → monthKeysThroughFiscalYearEnd, not calendar December —
  // this also covers the fiscal-week grid's trailing week) and collapses history
  // to one full-year baseline entry.
  const saveAllQuartersFull = (expId) => {
    const { cycle, amount } = _editParsed();
    const perPaycheck = perPaycheckFromCycle(amount, cycle, cpm);
    const fy = Number(FISCAL_YEAR_START.slice(0, 4));
    applyExpenseUpdate(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const { monthlyOverrides } = applyAllQuarters(e, perPaycheck, amount, cycle, fy);
      const existing = e.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: e.weekly ?? [0, 0, 0, 0] }];
      const newWeekly = [perPaycheck, perPaycheck, perPaycheck, perPaycheck];
      const baseline = existing.filter(en => en.effectiveFrom < FISCAL_YEAR_START);
      const newHistory = [...baseline, { effectiveFrom: FISCAL_YEAR_START, weekly: newWeekly }];
      const billingMeta = { ...(e.billingMeta ?? {}), amount, cycle, effectiveFrom: TODAY_ISO };
      return { ...e, history: newHistory, billingMeta, monthlyOverrides };
    }));
    setEditId(null);
  };

  const deleteMonthOnly = (expId) => {
    const monthKey = activeMonth ?? currentMonthKey;
    const target = expenses.find(e => e.id === expId);
    // Store previous override value so user can UNDO within 8s
    const prevValue = target?.monthlyOverrides?.[monthKey] ?? null;
    applyExpenseUpdate(prev => prev.map(e => e.id !== expId ? e : clearMonth(e, monthKey)));
    setUndoDelete({ expId, monthKey, prevValue });
  };

  const deleteMonthForward = (expId) => {
    // Always use clearMonthForward so monthlyOverrides are properly zeroed.
    // In quarter mode activeMonth is null, so fall back to the first month of the active quarter.
    const startKey = activeMonth ?? QUARTER_FIRST_MONTHS[ap];
    applyExpenseUpdate(prev => prev.map(e => e.id !== expId ? e : clearMonthForward(e, startKey)));
    setUndoDelete(null);
  };

  const deleteQuarterOnly = (expId) => {
    applyExpenseUpdate(prev => prev.map(e => e.id !== expId ? e : clearQuarterMonths(e, ap)));
  };

  // Quarter-to-month mapping used by restore scope helpers.
  const Q_MONTHS = [[1,2,3],[4,5,6],[7,8,9],[10,11,12]];

  // Returns month keys to clear overrides for based on restore scope:
  // "month"   → just the active month (or first month of active quarter)
  // "quarter" → all 3 months of the active quarter
  // "year"    → current month through the real fiscal year end (active quarters only)
  const getRestoreMonthKeys = (scope) => {
    const fy = FISCAL_YEAR_START.slice(0, 4);
    if (scope === "month") {
      const key = activeMonth ?? `${fy}-${String(Q_MONTHS[ap][0]).padStart(2, "0")}`;
      return [key];
    }
    if (scope === "quarter") {
      return Q_MONTHS[ap].map(m => `${fy}-${String(m).padStart(2, "0")}`);
    }
    // "year": mirror deleteMonthForward's start point (activeMonth or quarter start),
    // then cover through the real fiscal year end (monthKeysThroughFiscalYearEnd — NOT
    // calendar December, or the grid's trailing week would keep a stale zero override
    // even after "restore for the rest of the year"). Old code used Math.max(today,
    // quarterStart) which left the quarter's opening month(s) still zeroed after restore.
    const fromKey = activeMonth ?? `${fy}-${String(Q_MONTHS[ap][0]).padStart(2, "0")}`;
    return monthKeysThroughFiscalYearEnd(fromKey);
  };

  const restoreExpense = (expId, scope) => {
    const monthKeys = getRestoreMonthKeys(scope);
    applyExpenseUpdate(prev => prev.map(e => {
      if (e.id !== expId) return e;
      const overrides = { ...(e.monthlyOverrides ?? {}) };
      for (const key of monthKeys) delete overrides[key];
      return { ...e, monthlyOverrides: overrides };
    }));
    setRestorePendingExpId(null);
    setRestoreSheetCat(null);
    document.body.classList.remove("modal-open");
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
  // On mobile the scroll container is .main-content (overflow-y:auto), not the
  // window — window.scrollBy is a no-op there, which is why dragging to the screen
  // edge never scrolled. Scroll the actual container and fall back to the window.
  const getExpenseScrollContainer = () =>
    (typeof document !== "undefined" ? document.querySelector(".main-content") : null);
  const runTouchAutoScroll = () => {
    const { direction, speed } = expenseTouchAutoScrollRef.current;
    if (!direction || speed <= 0) {
      stopTouchAutoScroll();
      return;
    }
    const sc = getExpenseScrollContainer();
    if (sc) sc.scrollTop += direction * speed;
    else window.scrollBy(0, direction * speed);
    // Content slid under a stationary finger — recompute the drop target so the
    // marker keeps tracking while auto-scrolling without further touchmove events.
    const last = expenseTouchLastPointRef.current;
    if (last) updateDropTargetFromPoint(last.x, last.y);
    expenseTouchAutoScrollRef.current.rafId = requestAnimationFrame(runTouchAutoScroll);
  };
  const startTouchAutoScroll = (direction, speed) => {
    expenseTouchAutoScrollRef.current.direction = direction;
    expenseTouchAutoScrollRef.current.speed = speed;
    if (!expenseTouchAutoScrollRef.current.rafId) {
      expenseTouchAutoScrollRef.current.rafId = requestAnimationFrame(runTouchAutoScroll);
    }
  };
  // Insert the dragged expense immediately before `beforeId` (an existing card in
  // the target lane), or at the end of the target lane when beforeId is null.
  // Operating on expense ids — not positional indices — keeps the drop aligned
  // with the marker regardless of pinned (food) cards, hidden cards, or loans
  // interleaved in the array.
  const reorderExpenseByInsert = (draggedId, lane, beforeId = null) => {
    applyExpenseUpdate(prev => {
      const dragged = prev.find(e => e.id === draggedId);
      if (!dragged) return prev;
      const targetLane = lane ?? dragged.category;
      const without = prev.filter(e => e.id !== draggedId);
      const draggedNext = { ...dragged, category: targetLane };

      let insertAt;
      if (beforeId != null && beforeId !== draggedId) {
        insertAt = without.findIndex(e => e.id === beforeId);
      } else {
        insertAt = -1;
      }
      if (insertAt === -1) {
        // Append after the last non-loan item of the target lane.
        let laneLast = -1;
        without.forEach((e, idx) => {
          if (e.type !== "loan" && e.category === targetLane) laneLast = idx;
        });
        insertAt = laneLast + 1;
      }

      const result = [...without];
      result.splice(insertAt, 0, draggedNext);
      return result;
    });
  };
  const finalizeExpenseDrag = () => {
    if (!draggingExpenseId || expenseDragFinalizedRef.current) return false;
    const { lane, beforeId } = expenseInsertRef.current;
    if (!lane) return false;
    expenseDragFinalizedRef.current = true;
    reorderExpenseByInsert(draggingExpenseId, lane, beforeId);
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
    expenseTouchLastPointRef.current = null;
    expenseInsertRef.current = { lane: null, beforeId: null };
    setExpenseInsertLane(null);
    setExpenseInsertBeforeId(null);
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
  // Returns the id of the draggable card whose top half the pointer is over —
  // i.e. the card the dragged item should land *before*. Returns null when the
  // pointer is past the last draggable card (drop at end of lane). Pinned (food)
  // cards and the dragged card itself are excluded so they never become targets.
  const getLaneInsertBeforeIdFromY = (lane, clientY) => {
    if (!lane || typeof document === "undefined") return null;
    const laneEl = document.querySelector(`[data-expense-lane="${lane}"]`);
    if (!laneEl) return null;
    const laneCards = Array.from(laneEl.querySelectorAll("[data-expense-id]"))
      .filter((card) =>
        card.getAttribute("data-expense-id") !== draggingExpenseId
        && card.getAttribute("data-expense-pinned") !== "true");
    for (let idx = 0; idx < laneCards.length; idx += 1) {
      const rect = laneCards[idx].getBoundingClientRect();
      if (clientY < rect.top + (rect.height / 2)) {
        return laneCards[idx].getAttribute("data-expense-id");
      }
    }
    return null;
  };
  const setExpenseInsertTarget = (lane, beforeId) => {
    expenseInsertRef.current = { lane, beforeId };
    setExpenseInsertLane(lane);
    setExpenseInsertBeforeId(beforeId);
  };
  // Resolve the hovered lane + drop target from a viewport point and update
  // preview state. Shared by touchmove and the auto-scroll loop.
  const updateDropTargetFromPoint = (clientX, clientY) => {
    if (typeof document === "undefined") return;
    const hovered = document.elementFromPoint(clientX, clientY);
    const laneEl = hovered?.closest?.("[data-expense-lane]");
    const lane = laneEl?.getAttribute("data-expense-lane");
    if (lane === "Needs" || lane === "Lifestyle") {
      expenseTouchHoverLaneRef.current = lane;
      setDragPreviewExpenseCategory(lane);
      setExpenseInsertTarget(lane, getLaneInsertBeforeIdFromY(lane, clientY));
    } else {
      expenseTouchHoverLaneRef.current = null;
      resetExpensePreviewToOrigin();
      setExpenseInsertTarget(null, null);
    }
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
    // Seed the marker at the dragged item's current spot: before the next
    // draggable sibling in its lane, or at the end when it's already last.
    const laneDraggables = regularExpenses.filter(e =>
      e.category === exp.category && !e.isFoodPrimary && !e.isFoodHighlighted);
    const originPos = laneDraggables.findIndex(e => e.id === exp.id);
    const originBeforeId = originPos >= 0 && originPos + 1 < laneDraggables.length
      ? laneDraggables[originPos + 1].id
      : null;
    setExpenseInsertTarget(exp.category, originBeforeId);
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
    expenseTouchLastPointRef.current = { x: point.clientX, y: point.clientY };
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
    updateDropTargetFromPoint(point.clientX, point.clientY);
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
      const beforeId = expenseInsertRef.current.lane === lane ? expenseInsertRef.current.beforeId : null;
      setExpenseInsertTarget(lane, beforeId);
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
    applyExpenseUpdate(prev => prev.map(e => {
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
    applyExpenseUpdate(prev => [...prev, {
      id: `loan_${crypto.randomUUID()}`, type: "loan", category: "Loans",
      label: newLoan.label, note: [newLoan.note, newLoan.note, newLoan.note],
      loanMeta: meta, history: buildLoanHistory(meta)
    }]);
    setAddingLoan(false);
    setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" });
  };
  const deleteLoan = (id) => { applyExpenseUpdate(p => p.filter(e => e.id !== id)); setDelLoanId(null); };



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
    {/* Bulk Edit — full standalone page (position:fixed, covers the viewport
        regardless of where it's rendered in the tree). Opens via double-tap
        on a MonthQuarterSelector month/quarter segment (handleSelectMonth/
        handleSelectQuarter above) or the "Bulk Edit" button under the
        expense category list below. */}
    {bulkEditOpen && (
      <BulkEditPage
        phaseIdx={ap}
        selectedMonthIso={`${displayMonthKey}-01`}
        expenses={regularExpenses}
        cpm={cpm}
        onSave={saveAdvancedEdit}
        onClose={() => setBulkEditOpen(false)}
      />
    )}
    {/* Summary cards */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px", marginBottom: "16px" }}>
      <Card
        label={checksPerYear === 52 ? "This Week’s Check" : checksPerYear === 26 ? "This Paycheck" : "This Check"}
        val={f2((prevWeekNet ?? weeklyIncome) * perCheckFactor)}
        sub={checksPerYear === 52 ? "This Week’s Check" : checksPerYear === 26 ? "This Paycheck" : "This Check"}
        status="green"
        rawVal={(prevWeekNet ?? weeklyIncome) * perCheckFactor}
      />
      <Card label={`${checkWord} Spend`} exactMark val={f2(ts * perCheckFactor)} rawVal={ts * perCheckFactor} color="var(--color-deduction)"
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
            exactMark
            val={f2(leftFirstCheck * perCheckFactor)}
            rawVal={leftFirstCheck * perCheckFactor}
            color={leftFirstCheck >= 0 ? "var(--color-green)" : "var(--color-deduction)"}
            insight={weeklyIncome > 0 ? (() => {
              const pct = Math.round((leftFirstCheck / firstCheckNet) * 100);
              if (pct >= 20) return { arrow: "up",   delta: `${pct}%`, label: `of ${firstCheckMonthShort} check clear`, variant: "blue" };
              if (pct < 5)   return { arrow: "down",  delta: `${pct}%`, label: `of ${firstCheckMonthShort} check left`,  variant: "purple" };
              return           { arrow: "flat",  delta: `${pct}%`, label: `of ${firstCheckMonthShort} check left`,  variant: "blue" };
            })() : undefined}
          />
        ) : (
          <Card label={`Left ${thisCheckLabel}`} labelTooltip="A strategic average" exactMark val={f2(leftThisWeek * perCheckFactor)} rawVal={leftThisWeek * perCheckFactor} color={leftThisWeek >= 0 ? "var(--color-green)" : "var(--color-deduction)"}
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
          <Pressable
            onClick={() => setShowCheckInfo(true)}
            aria-label="Show paycheck breakdown"
            className="text-xs" style={{
              display: "block", width: "100%", textAlign: "right",
              background: "none", border: "none",
              color: "var(--color-text-secondary)", letterSpacing: "1.5px", textTransform: "uppercase",
              cursor: "pointer", padding: "5px 4px 0",
              fontFamily: "var(--font-sans)",
              transition: "color 150ms ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--color-accent-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
          >breakdown ↗</Pressable>
        )}
      </div>
    </div>
    {/* Spend bar */}
    <div style={{ marginBottom: "20px" }}>
      <div className="text-xs" style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-primary)", marginBottom: "6px" }}><span>SPEND vs INCOME</span><span style={{ color: sp > 90 ? "var(--color-deduction)" : "var(--color-green)" }}>{sp.toFixed(1)}%</span></div>
      <div style={{ height: "8px", background: "#1e1e1e", borderRadius: "4px", overflow: "hidden" }}><div style={{ height: "100%", borderRadius: "4px", width: `${sp}%`, background: sp > 90 ? "var(--color-deduction)" : sp > 70 ? "var(--color-teal)" : "var(--color-green)", transition: "width 0.3s" }} /></div>
    </div>
    {/* View tabs */}
    <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
      {["overview", "breakdown", "loans"].map(v => <VT key={v} label={v} active={view === v} onClick={() => setView(v)} />)}
    </div>

    {/* OVERVIEW — expense list; loans rendered inside Needs */}
    {view === "overview" && <div>
      {overviewCats.map(cat => {
        const cExp = regularExpenses.filter(e => e.category === cat);
        // Pin food to bottom of Needs (above loans); all other Needs expenses stay draggable
        const draggableInCat = cat === "Needs"
          ? cExp.filter(e => !e.isFoodPrimary && !e.isFoodHighlighted)
          : cExp;
        const pinnedFoodInCat = cat === "Needs"
          ? cExp.filter(e => e.isFoodPrimary || e.isFoodHighlighted)
          : [];
        const displayCExp = [...draggableInCat, ...pinnedFoodInCat];
        const loanItems = cat === "Needs" ? loans : [];
        const cTot = cExp.reduce((s, e) => s + exactEffective(e, ap), 0)
                   + loanItems.reduce((s, e) => s + exactEffective(e, ap), 0);
        // Category dropdown title only earns the exact-math asterisk once the
        // rounding drift it's flagging is actually big enough to matter — a
        // 1-2-bill category can't accumulate meaningful 48-week-vs-52-week
        // drift, so the marker stays hidden below this bar to avoid noise on
        // every dropdown. Threshold checked against the same displayed total
        // shown on the title (cTot * perCheckFactor), not the raw weekly cTot.
        const catBillCount = cExp.length + loanItems.length;
        const catShowsExactMark = catBillCount >= 3 || (cTot * perCheckFactor) > 200;
        const isExpenseDropLane = cat === "Needs" || cat === "Lifestyle";
        // Paywall-expired read-only mode (§17.E "Locked expense categories"):
        // force every category collapsed and non-expandable, regardless of the
        // user's remembered expandedCats — no chevron toggle, no row detail.
        const isCatExpanded = !readOnly && expandedCats.has(cat);
        return <div
          key={cat}
          draggable={false}
          data-expense-lane={isExpenseDropLane ? cat : undefined}
          onDragStart={(e) => e.preventDefault()}
          onDragOver={(e) => {
            if (!isExpenseDropLane) return;
            e.preventDefault();
            setDragPreviewExpenseCategory(cat);
            setExpenseInsertTarget(cat, getLaneInsertBeforeIdFromY(cat, e.clientY));
          }}
          onDrop={(e) => {
            if (!isExpenseDropLane) return;
            e.preventDefault();
            e.stopPropagation();
            if (!draggingExpenseId) return;
            setExpenseInsertTarget(cat, getLaneInsertBeforeIdFromY(cat, e.clientY));
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
          <div
            data-cat-header={cat}
            onClick={readOnly ? undefined : () => toggleCat(cat)}
            role="button"
            aria-expanded={isCatExpanded}
            aria-disabled={readOnly}
            style={{
              cursor: readOnly ? "default" : "pointer",
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              // Collapsed: a larger card-like block. Expanded: shrinks to the bare section header.
              padding: isCatExpanded ? "0px 0px" : "18px 18px 4px",
              minHeight: isCatExpanded ? "0px" : "64px",
              background: isCatExpanded ? "transparent" : (CAT_GRADIENT[cat] ?? CATEGORY_BG[cat]),
              border: `1px solid ${isCatExpanded ? "transparent" : `${CATEGORY_COLORS[cat]}40`}`,
              borderRadius: isCatExpanded ? "0px" : "12px",
              marginBottom: isCatExpanded ? "0px" : "4px",
              transition: `padding ${CAT_ANIM_MS}ms ${EXPENSE_DRAG_EASE}, min-height ${CAT_ANIM_MS}ms ${EXPENSE_DRAG_EASE}, background ${CAT_ANIM_MS}ms ease, border-color ${CAT_ANIM_MS}ms ease, border-radius ${CAT_ANIM_MS}ms ease`,
            }}
          >
            <div style={{ width: "100%" }}>
              <SH color={CATEGORY_COLORS[cat]} textColor="var(--color-text-primary)" right={
                <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                  <span>{f2(cTot * perCheckFactor) + `/${checkUnit}`}{catShowsExactMark && <ExactMathMark />}</span>
                  {!readOnly && (
                  <svg width={isCatExpanded ? "12" : "15"} height={isCatExpanded ? "12" : "15"} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCatExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: `transform ${CAT_ANIM_MS}ms ${EXPENSE_DRAG_EASE}`, opacity: 0.8 }}><path d="M4 6 L8 10 L12 6" /></svg>
                  )}
                </span>
              }>{cat}</SH>
            </div>
          </div>
          {/* Fold-out: grid-rows 0fr→1fr animates the real content height in time with the auto-scroll */}
          <div style={{ display: "grid", gridTemplateRows: isCatExpanded ? "1fr" : "0fr", opacity: isCatExpanded ? 1 : 0, transition: `grid-template-rows ${CAT_ANIM_MS}ms ${EXPENSE_DRAG_EASE}, opacity ${CAT_ANIM_MS}ms ease` }}>
          <div style={{ minHeight: 0, overflow: "hidden" }}>
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
                <Pressable
                  onClick={() => { setRestoreSheetCat(cat); setRestorePendingExpId(null); document.body.classList.add("modal-open"); }}
                  className="text-xs" style={{
                    letterSpacing: "1px", textTransform: "uppercase",
                    color: "var(--color-deduction)", background: "rgba(244,164,164,0.08)",
                    border: "1px solid rgba(244,164,164,0.28)", borderRadius: "8px",
                    padding: "5px 12px", cursor: "pointer", fontFamily: "var(--font-sans)",
                    fontWeight: "500",
                  }}
                >Restore Deleted</Pressable>
              </div>
            ) : null;
          })()}
          {displayCExp.map(exp => {
            const effAmt = displayEffective(exp, ap);
            // Resolve timeline state for this expense in the active phase
            const nextNonZeroIso = effAmt === 0 ? getNextNonZeroIso(exp, ap, TODAY_ISO) : null;
            const isScheduledFuture = effAmt === 0 && nextNonZeroIso !== null;
            const isRemovedThisPhase = effAmt === 0 && nextNonZeroIso === null && (exp.history?.length ?? 0) > 0;
            // Hide expenses permanently zeroed for this phase (deleted-forward or all-zero history)
            if (isRemovedThisPhase) return null;
            const isEditing = editId === exp.id;
            const isPinnedFoodCard = Boolean(exp.isFoodPrimary || exp.isFoodHighlighted);
            const isDragging = draggingExpenseId === exp.id;
            const previewCategory = dragPreviewExpenseCategory ?? exp.category;
            const lanePreviewingMove = isDragging && previewCategory !== exp.category;
            const previewTint = lanePreviewingMove ? EXPENSE_DRAG_PREVIEW_TINT[previewCategory] : null;
            const showInsertLineBefore = isExpenseDropLane
              && !isPinnedFoodCard
              && draggingExpenseId
              && expenseInsertLane === cat
              && expenseInsertBeforeId === exp.id;
            return <div
              key={exp.id}
              data-expense-id={exp.id}
              data-expense-pinned={isPinnedFoodCard ? "true" : undefined}
              draggable={!isPinnedFoodCard && !isEditing && isExpenseDropLane && !isCoarsePointer}
              onClick={() => {
                if (expenseDragFinalizedRef.current) return;
                const now = Date.now();
                const last = lastTapRef.current[exp.id] ?? 0;
                if (now - last < 350) {
                  openSheet(exp);
                  lastTapRef.current[exp.id] = 0;
                } else {
                  lastTapRef.current[exp.id] = now;
                }
              }}
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
                setExpenseInsertTarget(cat, getLaneInsertBeforeIdFromY(cat, e.clientY));
              }}
              onDrop={(e) => {
                if (!isExpenseDropLane) return;
                e.preventDefault();
                e.stopPropagation();
                if (!draggingExpenseId) return;
                setExpenseInsertTarget(cat, getLaneInsertBeforeIdFromY(cat, e.clientY));
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
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Drag handle */}
                {!isPinnedFoodCard && <button
                  type="button"
                  data-expense-drag-handle
                  aria-label={`Hold to drag ${exp.label}`}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs"
                  style={{
                    background: pendingExpenseTouchId === exp.id ? `${CATEGORY_COLORS[cat]}22` : "transparent",
                    color: pendingExpenseTouchId === exp.id ? CATEGORY_COLORS[cat] : "var(--color-text-primary)",
                    border: `1px solid ${pendingExpenseTouchId === exp.id ? `${CATEGORY_COLORS[cat]}66` : "var(--color-text-primary)"}`,
                    borderRadius: "8px",
                    width: "26px", height: "26px", minWidth: "26px",
                    padding: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
                  }}
                >⋮⋮</button>}
                {/* Label */}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div className="text-md" style={{
                    color: isScheduledFuture ? "var(--color-text-secondary)" : "var(--color-text-primary)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{exp.label}</div>
                </div>
                {/* Per-check amount + edit icon */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <div style={{
                    fontSize: "15px", fontWeight: "bold",
                    color: isScheduledFuture ? "var(--color-text-disabled)" : CATEGORY_COLORS[cat],
                    whiteSpace: "nowrap",
                  }}>
                    {f2(effAmt * perCheckFactor)}<span className="text-xs" style={{ color: "var(--color-text-secondary)", fontWeight: "normal" }}>/{checkUnit}</span>
                  </div>
                  {<Pressable
                    onClick={(e) => { e.stopPropagation(); openSheet(exp); }}
                    aria-label={`Edit ${exp.label}`}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: "8px",
                      width: "28px", height: "28px", minWidth: "28px",
                      padding: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 2.5 L13.5 4.5 L5 13 L2 14 L3 11 Z"/>
                      <path d="M10.5 3.5 L12.5 5.5"/>
                    </svg>
                  </Pressable>}
                </div>
              </div>
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
              opacity: expenseInsertBeforeId === null ? 0.72 : 0,
              transform: expenseInsertBeforeId === null ? "scaleX(1)" : "scaleX(0.9)",
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
            return <div key={exp.id} style={{ background: CATEGORY_BG[cat], border: "1px solid #1e1e1e", borderRadius: "6px", padding: "10px 12px", marginBottom: "6px" }}>
              {editLoanId === exp.id ? <LoanEditForm vals={editLoanVals} setVals={setEditLoanVals} onSave={() => saveEditLoan(exp.id)} onCancel={() => setEditLoanId(null)} iS={iS} lS={lS} /> :
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="text-base">{exp.label}</span>
                    <span className="text-2xs" style={{ background: "rgba(0,200,150,0.10)", color: "var(--color-teal)", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span className="text-2xs" style={{ background: "#7a8bbf22", color: "#7a8bbf", padding: "1px 5px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span className="text-2xs" style={{ color: "var(--color-green)" }}>✓ PAID OFF</span>}
                    {!isPaidOff && !inRunway && dropsOff && <span className="text-2xs" style={{ color: "var(--color-green)" }}>drops off {fmtLoanDate(payoffDate, fiscalYearEnd)}</span>}
                  </div>
                  {/* Payments-left / monthly / total detail lives on the Loans tab — overview stays slim */}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ textAlign: "right" }}>
                    <div className="text-md" style={{ fontWeight: "bold", color: isPaidOff ? "var(--color-text-primary)" : CATEGORY_COLORS[cat] }}>{f2(effAmt * perCheckFactor)}<span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>/{checkUnit}</span></div>
                  </div>
                  <SmBtn onClick={() => startEditLoan(exp)} c="var(--color-teal)">EDIT</SmBtn>
                  {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                    <SmBtn onClick={() => deleteLoan(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">DEL</SmBtn>
                    <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                  </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="var(--color-deduction)">✕</SmBtn>}
                </div>
              </div>}
            </div>;
          })}
          </div>
          </div>
        </div>;
      })}

      {/* Add expense form */}
      {!readOnly && (addingExp ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
        <div className="text-xs" style={{ letterSpacing: "2px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "16px" }}>New Expense Line</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div><label style={lS}>Label</label><input type="text" value={newExp.label} onChange={e => setNewExp(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Insurance" /></div>
          <div><label style={lS}>Category</label><select value={newExp.category} onChange={e => setNewExp(v => ({ ...v, category: e.target.value }))} style={iS}><option>Needs</option><option>Lifestyle</option></select></div>
          <div><label style={lS}>Bill Amount ($)</label><input type="number" min="0" step="0.01" value={newExp.amount} onChange={e => setNewExp(v => ({ ...v, amount: e.target.value }))} style={iS} /></div>
          <div><label style={lS}>Paid Every</label><select value={newExp.cycle} onChange={e => setNewExp(v => ({ ...v, cycle: e.target.value }))} style={iS}>{EXPENSE_CYCLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note (optional)</label><input type="text" value={newExp.note} onChange={e => setNewExp(v => ({ ...v, note: e.target.value }))} style={iS} placeholder="Short description" /></div>
          <div className="text-xs" style={{ gridColumn: "1/-1", color: "var(--color-text-secondary)" }}>
            This sets aside {f2(perPaycheckFromCycle(parseFloat(newExp.amount) || 0, newExp.cycle, cpm) * perCheckFactor)} from each paycheck.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <div className="text-2xs" style={{ color: "var(--color-text-secondary)", letterSpacing: "0.5px", width: "100%" }}>Save scope:</div>
          {/* Primary: this-month-onward gets its own full-width row, label spells out the viewed month
              (falls back to the current month when viewing a whole quarter) */}
          <Pressable onClick={addExpFromMonthForward} disabled={!newExp.label} className="text-sm" style={{ width: "100%", background: newExp.label ? "var(--color-green)" : "var(--color-border-subtle)", color: newExp.label ? "var(--color-bg-base)" : "#666", border: "none", borderRadius: "12px", padding: "14px", minHeight: "48px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: newExp.label ? "pointer" : "default", fontWeight: "bold" }}>{anchorMonthFull}+ Onward</Pressable>
          {/* Secondary row: month-only, all-quarters, and exit */}
          <div style={{ display: "flex", gap: "8px", width: "100%" }}>
            <SmBtn onClick={addExpThisMonth} c={newExp.label ? "var(--color-accent-primary)" : "var(--color-text-disabled)"} style={{ flex: 1 }}>{anchorMonthLabel} ONLY</SmBtn>
            <SmBtn onClick={addExpAllQuarters} c={newExp.label ? "var(--color-green)" : "var(--color-text-disabled)"} style={{ flex: 1 }}>ALL QTR</SmBtn>
            <SmBtn onClick={_closeAddForm} style={{ flex: 1 }}>✕</SmBtn>
          </div>
        </div>
      </div> : <Pressable onClick={() => setAddingExp(true)} className="text-xs" style={{ background: "var(--color-bg-surface)", color: "var(--color-teal)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px", width: "100%", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD EXPENSE LINE</Pressable>)}

      {/* Bulk Edit — standalone trigger for the full-page bulk editor (the
          other trigger is double-tapping a MonthQuarterSelector segment
          above). Reviews every expense for the currently-viewed month at
          once instead of one expense at a time. */}
      {!readOnly && (
        <Pressable
          onClick={() => setBulkEditOpen(true)}
          className="text-xs" style={{
            background: "transparent",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "6px",
            padding: "10px",
            width: "100%",
            letterSpacing: "2px",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Bulk Edit — {displayMonthFull}
        </Pressable>
      )}
    </div>}

    {/* BREAKDOWN — cashflow summary at top, then annual projection table */}
    {view === "breakdown" && (() => {
      // Full-year figures — independent of the selected quarter tab
      const tsAnnual = expenses.reduce((s, e) => s + yearlyExpenseCost(e), 0);
      const tsWeeklyAvg = expenses.reduce((s, e) => s + expenseWeeklyAvg(e), 0);
      const wrAnnual = weeklyIncome * 52 - tsAnnual;
      // Income is a true 52-week figure; expenses are monthly-rooted. Tie the
      // weekly remainder to income (spend + remaining = weekly income) rather
      // than to wrAnnual/52, so the weekly column stays internally consistent.
      const wrWeeklyAvg = weeklyIncome - tsWeeklyAvg;
      const checkingTot = regularExpenses.reduce((s, e) => s + exactEffective(e, ap), 0);
      const checkingDesc = regularExpenses.map(e => e.label).join(", ");
      const loansTot = loans.reduce((s, e) => s + exactEffective(e, ap), 0);
      const loansDesc = loans.map(e => e.label).join(", ");
      const payrollDeductionsTotal = currentWeek?.payrollDeductions?.total ?? 0;
      return <div>
        {/* Cashflow: incoming paycheck → payroll deductions → needs → loans → unallocated */}
        <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div className="text-xs" style={{ letterSpacing: "2px", color: "#7eb8c9", textTransform: "uppercase", marginBottom: "4px" }}>Incoming Paycheck</div><div style={{ fontSize: "22px", fontWeight: "bold", color: "#7eb8c9" }}>{f2(incomingWeekNet * perCheckFactor)}</div></div><div className="text-xs" style={{ color: "var(--color-text-disabled)", textAlign: "right" }}>{isWeekly ? <>Running week<br />net pay</> : <>Net pay<br />per check</>}</div></div>
        </div>
        {(() => {
          // Per-paycheck breakdown — all values in paycheck terms
          const incomePerCheck = incomingWeekNet * perCheckFactor;
          const payrollPerCheck = payrollDeductionsTotal * perCheckFactor; // weekly → per-check
          const loansPerCheck = loansTot * perCheckFactor;                 // weekly → per-check
          // checkingTot is already per-paycheck (stored per-paycheck in expense history)
          const wrPerCheck = incomePerCheck - payrollPerCheck - checkingTot - loansPerCheck;
          const pct = (v) => incomePerCheck > 0 ? ((v / incomePerCheck) * 100).toFixed(1) : "0.0";
          return <>
            <div style={{ background: "rgba(239,68,68,0.10)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><div><div className="text-sm" style={{ fontWeight: "bold", color: "var(--color-deduction)", marginBottom: "4px" }}>Payroll Deductions</div><div className="text-xs" style={{ color: "var(--color-text-primary)" }}>Benefits + 401k — already factored into net pay</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-deduction)" }}>{f2(payrollPerCheck)}</div><div className="text-xs" style={{ color: "var(--color-text-disabled)" }}>{pct(payrollPerCheck)}%</div></div></div>
            </div>
            <div style={{ background: CATEGORY_BG["Needs"], border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><div><div className="text-sm" style={{ fontWeight: "bold", color: CATEGORY_COLORS["Needs"], marginBottom: "4px" }}>Checking Needs<ExactMathMark /></div><div className="text-xs" style={{ color: "var(--color-text-primary)" }}>{checkingDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: CATEGORY_COLORS["Needs"] }}>{f2(checkingTot)}</div><div className="text-xs" style={{ color: "var(--color-text-disabled)" }}>{pct(checkingTot)}%</div></div></div>
            </div>
            {loans.length > 0 && <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "14px", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><div><div className="text-sm" style={{ fontWeight: "bold", color: "var(--color-teal)", marginBottom: "4px" }}>Loans<ExactMathMark /></div><div className="text-xs" style={{ color: "var(--color-text-primary)" }}>{loansDesc}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-teal)" }}>{f2(loansPerCheck)}</div><div className="text-xs" style={{ color: "var(--color-text-disabled)" }}>{pct(loansPerCheck)}%</div></div></div>
            </div>}
            <div style={{ background: wrPerCheck >= 0 ? "#1a2d1e" : "#2d1a1a", border: `1px solid ${wrPerCheck >= 0 ? "var(--color-green)" : "var(--color-deduction)"}`, borderRadius: "6px", padding: "14px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div className="text-sm" style={{ fontWeight: "bold", color: wrPerCheck >= 0 ? "var(--color-green)" : "var(--color-deduction)", marginBottom: "4px" }}>Unallocated / Savings</div><div className="text-xs" style={{ color: "var(--color-text-primary)" }}>{isWeekly ? "Weekly unallocated cashflow snapshot" : "Per-check unallocated snapshot"}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: "16px", fontWeight: "bold", color: wrPerCheck >= 0 ? "var(--color-green)" : "var(--color-deduction)" }}>{f2(wrPerCheck)}</div><div className="text-xs" style={{ color: "var(--color-text-primary)" }}>{f(wrPerCheck * checksPerYear / 12)}/mo</div></div></div>
            </div>
          </>;
        })()}
        <div style={{ height: "1px", background: "var(--color-bg-raised)", marginBottom: "20px" }} />
        {cats.map(cat => {
          const cT = regularExpenses.filter(e => e.category === cat).reduce((s, e) => s + expenseWeeklyAvg(e), 0);
          const pct = (cT / weeklyIncome) * 100;
          return <div key={cat} style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}><span className="text-xs" style={{ letterSpacing: "2px", color: CATEGORY_COLORS[cat], textTransform: "uppercase" }}>{cat}</span><span>{f2(cT * perCheckFactor)}/{checkUnit} avg · {pct.toFixed(1)}%</span></div>
            <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: CATEGORY_COLORS[cat], borderRadius: "3px" }} /></div>
          </div>;
        })}
        <div style={{ height: "1px", background: "var(--color-bg-raised)", margin: "20px 0" }} />
        <SectionHeader>Annual Projection</SectionHeader>
        <table className="data-table text-base" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr className="text-xs" style={{ borderBottom: "1px solid #333", color: "var(--color-text-secondary)", letterSpacing: "1px", textTransform: "uppercase" }}><th style={{ textAlign: "left", padding: "8px 4px" }}>Expense</th><th style={{ textAlign: "right", padding: "8px 4px" }}>{isWeekly ? "Wk Avg" : "Per Check"}</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Monthly</th><th style={{ textAlign: "right", padding: "8px 4px" }}>Annual</th></tr></thead>
          <tbody>{expenses.map(exp => {
            const annual = yearlyExpenseCost(exp);
            const checkAvg = expenseWeeklyAvg(exp) * perCheckFactor;
            const isLoan = exp.type === "loan";
            return <tr key={exp.id} style={{ borderBottom: "1px solid #181818" }} onMouseEnter={e => e.currentTarget.style.background = "var(--color-bg-surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "8px 4px" }}>
                <span className="text-xs" style={{ color: isLoan ? "var(--color-teal)" : CATEGORY_COLORS[exp.category], marginRight: "6px" }}>▸</span>
                {exp.label}
                {isLoan && <span className="text-2xs" style={{ background: "rgba(0,200,150,0.10)", color: "var(--color-teal)", padding: "1px 4px", borderRadius: "2px", marginLeft: "5px" }}>LOAN</span>}
              </td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: isLoan ? "var(--color-teal)" : CATEGORY_COLORS[exp.category] }}>{f2(checkAvg)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "var(--color-text-secondary)" }}>{f(annual / 12)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "var(--color-text-primary)" }}>{f(annual)}</td>
            </tr>;
          })}</tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #333", fontWeight: "bold" }}><td style={{ padding: "10px 4px", color: "var(--color-teal)" }}>TRUE SPEND<ExactMathMark /></td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-deduction)" }}>{f2(tsWeeklyAvg * perCheckFactor)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-deduction)" }}>{f(tsAnnual / 12)}</td><td style={{ padding: "10px 4px", textAlign: "right", color: "var(--color-deduction)" }}>{f(tsAnnual)}</td></tr>
            <tr style={{ fontWeight: "bold" }}><td style={{ padding: "6px 4px", color: "var(--color-green)" }}>REMAINING<ExactMathMark /></td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f2(wrWeeklyAvg * perCheckFactor)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(wrAnnual / 12)}</td><td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-green)" }}>{f(wrAnnual)}</td></tr>
          </tfoot>
        </table>
      </div>;
    })()}

    {/* LOANS TAB */}
    {view === "loans" && (() => {
      const totalOwed = loans.reduce((s, e) => s + (e.loanMeta?.totalAmount ?? 0), 0);
      const weeklyCommitted = loans.reduce((s, e) => s + exactEffective(e, ap), 0);
      const allPayoffDates = loans.map(e => e.loanMeta ? computeLoanPayoffDate(e.loanMeta) : null).filter(Boolean);
      const debtFreeDate = allPayoffDates.length ? allPayoffDates.reduce((a, b) => a > b ? a : b) : null;
      const weeksToDebtFree = debtFreeDate ? Math.max(Math.ceil((new Date(debtFreeDate) - new Date(TODAY_ISO)) / (7 * 24 * 60 * 60 * 1000)), 0) : 0;
      // Shared duration formatter: ≤3 wks → "X wks", 4+ wks → nearest-0.5 mo, 12+ mo → nearest-0.5 yr
      const fmtWeeksDuration = w => {
        if (w <= 3) return `${w} wk${w !== 1 ? "s" : ""}`;
        const halfMonths = w / 4 * 2;
        const roundedHalf = w % 4 === 1 ? Math.floor(halfMonths)   // 5,9,13... round down at tie
                          : w % 4 === 3 ? Math.ceil(halfMonths)    // 7,11,19... round up at tie
                          : halfMonths;
        const months = roundedHalf / 2;
        if (months >= 12) return `${Math.floor(months / 6) / 2} yr`;
        return `${months} mo`;
      };
      const debtFreeVal = debtFreeDate ? fmtWeeksDuration(weeksToDebtFree) : "—";

      return <div>
        {currentWeek && <div style={{ background: "rgba(0,200,150,0.09)", border: "1px solid rgba(0,200,150,0.32)", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <div className="text-xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-green)" }}>{fiscalWeekLabel}</div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {formatRotationDisplay(currentWeek, { isAdmin })}
            {nextPayWeek
              ? ` · pay period ends${daysUntilPaycheck === 0 ? " today" : ` in ${daysUntilPaycheck}d`} · ${fmtLoanDate(toLocalIso(nextPayWeek.payPeriodEndDate), fiscalYearEnd)}`
              : ` · ends ${fmtFullDate(currentWeek.payPeriodEndDate)}`
            }
          </div>
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <Card label="Total Loan Balance" val={f(totalOwed)} rawVal={totalOwed} color="var(--color-teal)" />
          <Card label={`${checkWord} Committed`} exactMark val={f2(weeklyCommitted * perCheckFactor)} rawVal={weeklyCommitted * perCheckFactor} color="var(--color-deduction)"
            insight={weeklyIncome > 0 && weeklyCommitted > 0 ? (() => {
              const ratio = weeklyCommitted / weeklyIncome;
              const pct   = Math.round(ratio * 100);
              if (ratio < 0.15) return { arrow: "up",   delta: `${pct}% of income`, label: "· manageable load", variant: "blue" };
              if (ratio < 0.25) return { arrow: "flat",  delta: `${pct}% of income`, label: "· watch cashflow",  variant: "blue" };
              return              { arrow: "down",  delta: `${pct}% of income`, label: "· high debt load",   variant: "purple" };
            })() : undefined}
          />
          <Card label="Debt-Free In" val={debtFreeVal} color={debtFreeDate && debtFreeDate <= fiscalYearEnd ? "var(--color-green)" : "var(--color-teal)"}
            insight={debtFreeDate ? (debtFreeDate <= fiscalYearEnd
              ? { arrow: "up",   delta: null, label: "clears within 2026", variant: "blue" }
              : { arrow: "flat",  delta: null, label: "extends past 2026",  variant: "blue" }
            ) : undefined}
          />
        </div>

        {loans.length === 0 && <div className="text-sm" style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-primary)", letterSpacing: "1px" }}>No active loans. Add one below.</div>}

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
                    <span className="text-md" style={{ fontWeight: "bold" }}>{exp.label}</span>
                    <span className="text-2xs" style={{ background: "rgba(0,200,150,0.10)", color: "var(--color-teal)", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>LOAN</span>
                    {inRunway && <span className="text-2xs" style={{ background: "#7a8bbf22", color: "#7a8bbf", padding: "2px 6px", borderRadius: "2px", letterSpacing: "1px" }}>SAVING</span>}
                    {isPaidOff && <span className="text-2xs" style={{ background: "rgba(76,175,125,0.13)", color: "var(--color-green)", padding: "2px 6px", borderRadius: "2px" }}>✓ PAID OFF</span>}
                  </div>
                  {exp.note[0] && <div className="text-xs" style={{ color: "var(--color-text-primary)" }}>{exp.note[0]}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: isPaidOff ? "var(--color-text-primary)" : inRunway ? "#7a8bbf" : "var(--color-teal)" }}>{f2(weeklyAmt * perCheckFactor)}<span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>/{checkUnit}</span></div>
                  <div className="text-xs" style={{ color: "var(--color-text-primary)" }}>{f(meta.totalAmount)} total</div>
                </div>
              </div>

              {/* Progress bar — during runway shows savings progress toward first payment */}
              <div style={{ marginBottom: "8px" }}>
                <div className="text-2xs" style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-primary)", marginBottom: "4px" }}>
                  {inRunway
                    ? <span>saving toward first payment · {fmtWeeksDuration(weeksUntilFirst)} away</span>
                    : <span>{paymentsMade} of {paymentsTotal} payments made</span>
                  }
                  <span>{inRunway ? "pre-save" : `${progressPct.toFixed(0)}%`}</span>
                </div>
                <div style={{ height: "6px", background: "#1e1e1e", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: inRunway ? "100%" : `${progressPct}%`, background: isPaidOff ? "var(--color-green)" : inRunway ? "#7a8bbf" : "var(--color-teal)", borderRadius: "3px", transition: "width 0.3s", opacity: inRunway ? 0.5 : 1 }} />
                </div>
              </div>

              {/* Stats row */}
              <div className="text-xs" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: "8px", marginBottom: "10px" }}>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div className="text-2xs" style={{ color: "var(--color-text-primary)", marginBottom: "2px" }}>{inRunway ? "FIRST PAYMENT" : "PAYMENTS LEFT"}</div>
                  <div className="text-xs" style={{ color: inRunway ? "#7a8bbf" : isPaidOff ? "var(--color-green)" : "var(--color-text-primary)", fontWeight: "bold", }}>{inRunway ? fmtLoanDate(meta.firstPaymentDate, fiscalYearEnd) : paymentsLeft}</div>
                </div>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div className="text-2xs" style={{ color: "var(--color-text-primary)", marginBottom: "2px" }}>PAYOFF DATE</div>
                  <div className="text-xs" style={{ color: dropsThisYear ? "var(--color-green)" : "var(--color-text-primary)", fontWeight: "bold", }}>{fmtLoanDate(payoffDate, fiscalYearEnd)}</div>
                </div>
                <div style={{ background: "var(--color-bg-surface)", borderRadius: "4px", padding: "8px", textAlign: "center" }}>
                  <div className="text-2xs" style={{ color: "var(--color-text-primary)", marginBottom: "2px" }}>TERM PAYMENT</div>
                  <div className="text-xs" style={{ color: "var(--color-text-primary)", fontWeight: "bold", }}>{f2(payAmt)} / {freqShort}</div>
                </div>
              </div>

              {/* Runway banner */}
              {inRunway && <div className="text-xs" style={{ background: "#1a1a2d", border: "1px solid #7a8bbf44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", color: "#7a8bbf" }}>
                Setting aside {f2(weeklyAmt * perCheckFactor)}/{checkUnit} — {weeksUntilFirst} check{weeksUntilFirst !== 1 ? "s" : ""} until first {f2(payAmt)}/{freqShort} payment on {fmtLoanDate(meta.firstPaymentDate, fiscalYearEnd)}
              </div>}

              {/* Drop-off banner */}
              {!isPaidOff && !inRunway && dropsThisYear && <div className="text-xs" style={{ background: "#1a2d1e", border: "1px solid #6dbf8a44", borderRadius: "4px", padding: "7px 10px", marginBottom: "10px", color: "var(--color-green)" }}>
                ✓ Drops off in {fmtWeeksDuration(weeksUntilPayoff)} — budget improves after payoff
              </div>}

              {/* Actions */}
              {!readOnly && (
              <div style={{ display: "flex", gap: "6px", borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                <SmBtn onClick={() => startEditLoan(exp)} c="var(--color-teal)">EDIT</SmBtn>
                {delLoanId === exp.id ? <div style={{ display: "flex", gap: "4px" }}>
                  <SmBtn onClick={() => deleteLoan(exp.id)} c="var(--color-deduction)" bg="#2d1a1a">DEL</SmBtn>
                  <SmBtn onClick={() => setDelLoanId(null)}>NO</SmBtn>
                </div> : <SmBtn onClick={() => setDelLoanId(exp.id)} c="var(--color-deduction)">✕</SmBtn>}
              </div>
              )}
            </div>}
          </div>;
        })}

        {/* Add loan form */}
        {!readOnly && (addingLoan ? <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
          <div className="text-xs" style={{ letterSpacing: "2px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "16px" }}>New Loan</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Loan Name</label><input type="text" value={newLoan.label} onChange={e => setNewLoan(v => ({ ...v, label: e.target.value }))} style={iS} placeholder="e.g. Car Note" /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lS}>Total Amount Owed ($)</label><input type="number" value={newLoan.totalAmount} onChange={e => setNewLoan(v => ({ ...v, totalAmount: e.target.value }))} style={iS} placeholder="2400" /></div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lS}>Term Payment</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className="text-base" style={{ color: "var(--color-text-primary)", }}>$</span>
                <input type="number" value={newLoan.paymentAmount} onChange={e => setNewLoan(v => ({ ...v, paymentAmount: e.target.value }))} style={{ ...iS, flex: 1 }} placeholder="150" />
                <span className="text-sm" style={{ color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>every</span>
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
            return <div className="text-xs" style={{ background: "var(--color-bg-surface)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", }}>
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                <span style={{ color: "var(--color-text-primary)" }}>{isWeekly ? "Weekly cost" : "Cost per check"}: <span style={{ color: "var(--color-teal)", fontWeight: "bold" }}>{f2(weeklyAmt * perCheckFactor)}/{checkUnit}</span></span>
                <span style={{ color: "var(--color-text-primary)" }}>{total} payments ({freqLabel})</span>
                <span style={{ color: "var(--color-text-primary)" }}>Payoff: <span style={{ color: payoff <= fiscalYearEnd ? "var(--color-green)" : "var(--color-text-primary)" }}>{payoff}</span></span>
              </div>
            </div>;
          })()}
          <div style={{ display: "flex", gap: "8px" }}>
            <Pressable onClick={addLoan} disabled={!newLoan.label || !newLoan.totalAmount || !newLoan.paymentAmount} className="text-xs" style={{ background: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "var(--color-green)" : "var(--color-border-subtle)", color: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "var(--color-bg-base)" : "var(--color-text-primary)", border: "none", borderRadius: "12px", padding: "8px 16px", letterSpacing: "2px", textTransform: "uppercase", cursor: (newLoan.label && newLoan.totalAmount && newLoan.paymentAmount) ? "pointer" : "default", fontWeight: "bold" }}>ADD LOAN</Pressable>
            <Pressable onClick={() => { setAddingLoan(false); setNewLoan({ label: "", totalAmount: "", paymentAmount: "", paymentFrequency: "monthly", firstPaymentDate: TODAY_ISO, note: "" }); }} className="text-xs" style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 16px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</Pressable>
          </div>
        </div> : <Pressable onClick={() => setAddingLoan(true)} className="text-xs" style={{ background: "var(--color-bg-surface)", color: "var(--color-teal)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px", width: "100%", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD LOAN</Pressable>)}
      </div>;
    })()}
    {touchDragOverlay.label && createPortal(<div
      aria-hidden="true"
      className="text-sm"
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
    </div>, document.body)}

    {/* Paycheck breakdown info modal */}
    {/* Portaled to document.body so position:fixed resolves against the viewport
        rather than the scrolling .main-content ancestor — iOS Safari hit-tests a
        fixed element nested in an overflow:auto container at a scrollTop offset,
        which left the ✕/Close buttons needing repeated taps. */}
    {checkInfoFold.mounted && checkBreakdown && createPortal(
      <div
        className="fold-backdrop" data-fold={checkInfoFold.fold}
        onClick={() => setShowCheckInfo(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.82)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
      >
        <div
          className="fold-modal" data-fold={checkInfoFold.fold}
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
                <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "2px" }}>{infoLabel}</div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--color-accent-primary)", fontFamily: "var(--font-sans)" }}>Breakdown</div>
              </div>
              {taxFeatureUnlocked && config?.taxExemptOptIn && infoRefWeek && (
                <span className="text-2xs" style={{
                  padding: "2px 7px", borderRadius: "12px", letterSpacing: "0.5px",
                  background: infoRefWeek.taxedBySchedule ? "#1e1e3a" : "#1e4a30",
                  color: infoRefWeek.taxedBySchedule ? "#7a8bbf" : "var(--color-green)",
                  border: "1px solid " + (infoRefWeek.taxedBySchedule ? "#7a8bbf" : "var(--color-green)"),
                }}>
                  {infoRefWeek.taxedBySchedule ? "TAXED" : "EXEMPT"}
                </span>
              )}
            </div>
            <Pressable
              onClick={() => setShowCheckInfo(false)}
              style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: "20px", cursor: "pointer", padding: "4px 8px", lineHeight: 1, flexShrink: 0 }}
            >×</Pressable>
          </div>

          {/* ── Subtraction math formula ── */}

          {/* Gross — the starting number, no operator */}
          <MathRow op=" " label="Gross Pay" val={f2(checkBreakdown.gross)} valColor="var(--color-text-primary)" large />
          <MathDivider />

          {/* Deductions block */}
          <MathRow op="−" label="Total Tax Withholding" val={f2(checkBreakdown.fica + checkBreakdown.fedTax + checkBreakdown.stateTax)} note="FICA · fed · state" />
          <MathRow op="−" label="Benefits / Insurance" val={f2(checkBreakdown.benefits)} />
          <MathRow op="−" label="401(k) Contribution" val={f2(checkBreakdown.k401)} />
          {checkBreakdown.otherDeductions.map((row, i) => (
            <MathRow key={i} op="−" label={row.label ?? `Other Deduction ${i + 1}`} val={f2((row.weeklyAmount ?? 0) * perCheckFactor)} />
          ))}
          <MathDivider thick />

          {/* Net Pay result */}
          <MathRow op="=" label="Net Pay" val={f2(checkBreakdown.netPay)} valColor="var(--color-green)" large />

          {/* Freedom Allowance block */}
          {freedomAllowancePerWeek > 0 && <>
            <MathDivider />
            <MathRow op="−" label="Freedom Allowance" val={f2(freedomAllowancePerWeek * perCheckFactor)} valColor="var(--color-warning)" note="reserved savings" />
            <MathDivider thick />
            <MathRow op="=" label="Spendable" val={f2(checkBreakdown.spendable)} valColor="var(--color-text-primary)" large />
          </>}

          {/* Expenses block */}
          <MathDivider />
          {checkBreakdown.needsSpend > 0 && <MathRow op="−" label="Needs" val={f2(checkBreakdown.needsSpend)} exactMark />}
          {checkBreakdown.lifestyleSpend > 0 && <MathRow op="−" label="Lifestyle" val={f2(checkBreakdown.lifestyleSpend)} exactMark />}
          {checkBreakdown.loansSpend > 0 && <MathRow op="−" label="Loans" val={f2(checkBreakdown.loansSpend)} exactMark />}
          <MathDivider thick />
          <MathRow op="=" label="Left" val={f2(checkBreakdown.left)} valColor={checkBreakdown.left >= 0 ? "var(--color-green)" : "var(--color-deduction)"} large exactMark />

          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <Pressable
              onClick={() => setShowCheckInfo(false)}
              className="text-xs" style={{
                background: "var(--color-bg-raised)", color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
                padding: "8px 20px", letterSpacing: "2px",
                textTransform: "uppercase", cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
            >Close</Pressable>
          </div>
        </div>
      </div>,
      document.body,
    )}

    {/* ── Restore Deleted Expenses bottom sheet ── */}
    {restoreSheetCat && (() => {
      const sheetExps = regularExpenses.filter(exp => {
        if (exp.category !== restoreSheetCat) return false;
        const amt = displayEffective(exp, ap);
        if (amt !== 0) return false;
        if (getNextNonZeroIso(exp, ap, TODAY_ISO) !== null) return false;
        if (!(exp.history?.length)) return false;
        return (exp.history ?? []).some(entry => (entry.weekly ?? []).some(v => v > 0));
      });
      // Portaled to document.body so position:fixed resolves against the viewport
      // and not the scrolling .main-content ancestor — iOS Safari hit-tests a
      // fixed element nested in an overflow:auto container at an offset equal to
      // that container's scrollTop, which made the sheet's buttons unresponsive.
      return createPortal(
        <div
          onClick={closeRestoreSheet}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            ref={restoreSheetElRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "var(--color-bg-surface)",
              borderTop: "1px solid var(--color-border-subtle)",
              borderRadius: "20px 20px 0 0",
              minHeight: "67vh",
              maxHeight: "88vh",
              display: "flex", flexDirection: "column",
              animation: "slideUpSheet 0.28s cubic-bezier(.2,.7,.2,1) both",
              willChange: "transform",
            }}
          >
            {/* Grabbable handle bar */}
            <div
              onTouchStart={onRestoreHandleTouchStart}
              onTouchMove={onRestoreHandleTouchMove}
              onTouchEnd={onRestoreHandleTouchEnd}
              style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px", flexShrink: 0, cursor: "grab", touchAction: "none" }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-subtle)" }} />
            </div>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 20px 14px", flexShrink: 0 }}>
              <div>
                <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "2px" }}>
                  {restoreSheetCat} · {activeMonth ? activeMonthLabel : `Q${ap + 1}`}
                </div>
                <div className="text-md" style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>Restore Deleted</div>
              </div>
              <Pressable onClick={closeRestoreSheet}
                style={{ background: "none", border: "none", color: "var(--color-text-secondary)", fontSize: "20px", cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>×</Pressable>
            </div>
            {/* Scrollable content */}
            <div style={{ overflowY: "auto", flex: 1, padding: "0 20px calc(20px + var(--safe-area-bottom))" }}>

            {sheetExps.length === 0 && (
              <div className="text-sm" style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-disabled)" }}>
                No deleted expenses for this period
              </div>
            )}

            {sheetExps.map(exp => {
              // Get the per-check amount for the viewed period — override-aware, anchored to
              // the same month the rest of the panel displays (current month for this quarter).
              const histAmt = getEffectiveAmountForMonth(exp, displayMonthKey, ap)
                || Math.max(...(exp.history ?? []).map(h => h.weekly?.[ap] ?? 0));
              const isPending = restorePendingExpId === exp.id;
              return (
                <div key={exp.id} style={{
                  borderBottom: "1px solid var(--color-border-subtle)",
                  padding: "12px 0",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div className="text-base" style={{ color: "var(--color-text-primary)" }}>{exp.label}</div>
                      <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                        {histAmt > 0 ? `${f2(histAmt)}/${checkUnit} · ${f(monthlyFromPerPaycheck(histAmt, cpm))}/mo` : "—"}
                      </div>
                    </div>
                    {!isPending && (
                      <Pressable
                        onClick={() => setRestorePendingExpId(exp.id)}
                        className="text-xs" style={{
                          letterSpacing: "1.5px", textTransform: "uppercase",
                          color: "var(--color-accent-primary)", background: "rgba(0,200,150,0.08)",
                          border: "1px solid rgba(0,200,150,0.24)", borderRadius: "8px",
                          padding: "5px 12px", cursor: "pointer", fontFamily: "var(--font-sans)", flexShrink: 0,
                        }}
                      >Restore</Pressable>
                    )}
                  </div>

                  {/* Scope picker — shown inline after RESTORE is tapped */}
                  {isPending && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div className="text-2xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
                        Restore from…
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {activeMonth && (
                          <Pressable onClick={() => restoreExpense(exp.id, "month")}
                            className="text-xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                            {activeMonthLabel} only
                          </Pressable>
                        )}
                        <Pressable onClick={() => restoreExpense(exp.id, "quarter")}
                          className="text-xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                          Q{ap + 1} months
                        </Pressable>
                        <Pressable onClick={() => restoreExpense(exp.id, "year")}
                          className="text-xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-accent-primary)", background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.24)", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                          Rest of year
                        </Pressable>
                        <Pressable onClick={() => setRestorePendingExpId(null)}
                          className="text-xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)", background: "transparent", border: "none", padding: "6px 4px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                          Cancel
                        </Pressable>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>{/* end scrollable content */}
          </div>{/* end sheet panel */}
        </div>,
        document.body
      );
    })()}
    {/* ── Expense Detail Bottom Sheet ── */}
    <style>{`
      @keyframes expSheetSlideUp {
        from { transform: translateY(100%); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
    `}</style>
    {/* Portaled to document.body so position:fixed resolves against the viewport
        rather than the scrolling .main-content ancestor. On iOS Safari a fixed
        element nested in an overflow:auto container is hit-tested at an offset
        equal to that container's scrollTop, which left the sheet's buttons
        (including ✕) unresponsive depending on how far the list was scrolled. */}
    {sheetExpLive && createPortal(
      <>
        {/* Backdrop */}
        <div onClick={closeSheet} style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.62)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          zIndex: 200,
        }} />
        {/* Sheet */}
        <div ref={expSheetElRef} style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          zIndex: 201,
          background: "var(--color-bg-surface)",
          borderRadius: "20px 20px 0 0",
          border: "1px solid var(--color-border-subtle)",
          borderBottom: "none",
          minHeight: "67vh",
          maxHeight: "88vh",
          display: "flex", flexDirection: "column",
          animation: "expSheetSlideUp 320ms cubic-bezier(.22,.7,.2,1) both",
        }}>
          {/* Pull handle — grabbable touch target */}
          <div
            onTouchStart={onExpHandleTouchStart}
            onTouchMove={onExpHandleTouchMove}
            onTouchEnd={onExpHandleTouchEnd}
            style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px", flexShrink: 0, cursor: "grab", touchAction: "none" }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-subtle)" }} />
          </div>
          {/* Header: title + close */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "2px 20px 0", flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "var(--font-display)", lineHeight: "1.2" }}>
                {sheetExpLive.label}
              </div>
              {(() => {
                const note = Array.isArray(sheetExpLive.note) ? sheetExpLive.note[ap] : sheetExpLive.note;
                return note ? (
                  <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "3px", lineHeight: "1.5", fontStyle: "italic" }}>{note}</div>
                ) : null;
              })()}
            </div>
            <Pressable onClick={closeSheet} style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "20px", cursor: "pointer", padding: "2px", lineHeight: 1, flexShrink: 0 }}>✕</Pressable>
          </div>
          {/* Scrollable content */}
          <div style={{ overflowY: "auto", flex: 1, padding: "18px 20px 40px" }}>
            {sheetMode === "view" ? (<>
              {/* Cost tiles */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <div style={{ flex: 1, background: "var(--color-bg-raised)", borderRadius: "14px", padding: "14px 16px" }}>
                  <div className="text-2xs" style={{ color: "var(--color-text-secondary)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>Per Check</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: CATEGORY_COLORS[sheetExpLive.category] ?? "var(--color-green)", fontFamily: "var(--font-mono)" }}>
                    {f2(displayEffective(sheetExpLive, ap) * perCheckFactor)}
                  </div>
                </div>
                <div style={{ flex: 1, background: "var(--color-bg-raised)", borderRadius: "14px", padding: "14px 16px" }}>
                  <div className="text-2xs" style={{ color: "var(--color-text-secondary)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>Monthly</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
                    {f(monthlyFromPerPaycheck(displayEffective(sheetExpLive, ap), cpm))}
                  </div>
                </div>
              </div>
              <div style={{ height: "1px", background: "var(--color-border-subtle)", marginBottom: "20px" }} />
              {/* Month activity bar */}
              <div style={{ marginBottom: "24px" }}>
                <div className="text-2xs" style={{ color: "var(--color-text-secondary)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "12px" }}>Active This Year</div>
                <div style={{ display: "flex", gap: "3px" }}>
                  {(() => {
                    // Determine the earliest month this expense was actually tracking.
                    // Expenses created via the default add path were historically backdated
                    // to FISCAL_YEAR_START ("2026-01-05") regardless of when the user added
                    // them. We detect that case and fall back to billingMeta.effectiveFrom
                    // (set to TODAY_ISO at creation) as the real visual start.
                    const historyStart = sheetExpLive.history?.[0]?.effectiveFrom ?? null;
                    const isBackdated = historyStart !== null && historyStart <= "2026-01-06";
                    const visualStartMonth = isBackdated
                      ? (sheetExpLive.billingMeta?.effectiveFrom?.slice(0, 7) ?? null)
                      : (historyStart ? historyStart.slice(0, 7) : null);
                    return MONTH_SHORT.map((label, i) => {
                    const monthNum = i + 1;
                    const key = `2026-${String(monthNum).padStart(2, "0")}`;
                    const phaseIdx = Math.floor(i / 3);
                    const amt = getEffectiveAmountForMonth(sheetExpLive, key, phaseIdx);
                    const isInRange = !visualStartMonth || key >= visualStartMonth;
                    const isActive = isInRange && amt > 0;
                    const isCurrent = monthNum === parseInt(TODAY_ISO.slice(5, 7), 10);
                    return (
                      <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                        <div style={{
                          width: "100%", height: "6px", borderRadius: "3px",
                          background: isActive
                            ? (isCurrent ? "var(--color-green)" : "rgba(34,197,94,0.48)")
                            : "var(--color-bg-raised)",
                          boxShadow: isCurrent
                            ? (isActive
                               ? "0 0 7px 2px rgba(34,197,94,0.55)"
                               : "0 0 7px 2px rgba(0,200,150,0.4)")
                            : "none",
                          border: isCurrent && !isActive
                            ? "1px solid rgba(0,200,150,0.45)"
                            : "1px solid transparent",
                        }} />
                        <div style={{
                          fontSize: "7px",
                          color: isCurrent ? "var(--color-green)" : (isActive ? "var(--color-text-secondary)" : "var(--color-text-disabled)"),
                          fontWeight: isCurrent ? "700" : "400",
                        }}>{label}</div>
                      </div>
                    );
                  });
                  })()}
                </div>
              </div>
              <div style={{ height: "1px", background: "var(--color-border-subtle)", marginBottom: "20px" }} />
              {/* Actions */}
              {sheetDeleteConfirm ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="text-xs" style={{ color: "var(--color-deduction)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                    {activeMonth ? `Delete ${activeMonthLabel}?` : `Delete Q${ap + 1}?`}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {[
                      ...(activeMonth !== null ? [
                        { label: `${activeMonthLabel} Only`, action: () => { deleteMonthOnly(sheetExpLive.id); closeSheet(); } },
                        { label: `${activeMonthLabel} +`,   action: () => { deleteMonthForward(sheetExpLive.id); closeSheet(); } },
                        { label: `Q${ap + 1} Months`,       action: () => { deleteQuarterOnly(sheetExpLive.id); closeSheet(); } },
                      ] : [
                        { label: `Q${ap + 1} Only`, action: () => { deleteQuarterOnly(sheetExpLive.id); closeSheet(); } },
                        { label: `Q${ap + 1} +`,    action: () => { deleteMonthForward(sheetExpLive.id); closeSheet(); } },
                      ]),
                    ].map(({ label, action }) => (
                      <Pressable key={label} onClick={action} className="text-2xs" style={{ flex: 1, padding: "11px 8px", background: "#1e0f0f", border: "1px solid #3d1515", borderRadius: "12px", color: "var(--color-deduction)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600, minWidth: "80px" }}>
                        {label}
                      </Pressable>
                    ))}
                  </div>
                  <Pressable onClick={() => setSheetDeleteConfirm(false)} className="text-xs" style={{ padding: "10px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", color: "var(--color-text-secondary)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px" }}>
                  <Pressable onClick={() => { setSheetMode("edit"); startEditExp(sheetExpLive); }} className="text-xs" style={{ flex: 1, padding: "13px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "14px", color: "var(--color-text-primary)", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600 }}>Edit</Pressable>
                  {!isFoodSheet && <Pressable onClick={() => setSheetDeleteConfirm(true)} className="text-xs" style={{ flex: 1, padding: "13px", background: "#1e0f0f", border: "1px solid #3d1515", borderRadius: "14px", color: "var(--color-deduction)", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600 }}>Delete</Pressable>}
                </div>
              )}
            </>) : (
              /* ── Edit mode ── */
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(() => {
                  const editReserve = perPaycheckFromCycle(parseFloat(editVals.amount) || 0, editVals.cycle ?? "every30days", cpm) * perCheckFactor;
                  const belowFloor = isFoodSheet && editReserve < minFoodPerCheck;
                  const saveBtnDisabledStyle = belowFloor ? { opacity: 0.35, cursor: "not-allowed", pointerEvents: "none" } : {};
                  return (<>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ ...lS, marginBottom: "4px", color: belowFloor ? "var(--color-red)" : undefined }}>Bill Amount ($)</div>
                    <input type="number" min="0" step="0.01" value={editVals.amount ?? ""} onChange={e => setEditVals(v => ({ ...v, amount: e.target.value }))} style={{ ...iS, width: "100%", boxSizing: "border-box", borderColor: belowFloor ? "var(--color-red)" : undefined }} />
                  </div>
                  <div>
                    <div style={{ ...lS, marginBottom: "4px" }}>Paid Every</div>
                    <select value={editVals.cycle ?? "every30days"} onChange={e => setEditVals(v => ({ ...v, cycle: e.target.value }))} style={{ ...iS, width: "100%", boxSizing: "border-box" }}>
                      {EXPENSE_CYCLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-secondary)", background: belowFloor ? "rgba(239,68,68,0.07)" : "var(--color-bg-raised)", border: `1px solid ${belowFloor ? "rgba(239,68,68,0.3)" : "transparent"}`, padding: "10px 14px", borderRadius: "10px" }}>
                  Per-check reserve: <strong style={{ color: belowFloor ? "var(--color-red)" : "var(--color-accent-primary)" }}>{f2(editReserve)}</strong>
                  {isFoodSheet && <span className="text-xs" style={{ marginLeft: "10px", color: belowFloor ? "var(--color-red)" : "var(--color-text-disabled)" }}>{belowFloor ? `↑ min ${f2(minFoodPerCheck)}/${checkUnit}` : `· min ${f2(minFoodPerCheck)}/${checkUnit}`}</span>}
                </div>
                <div style={{ height: "1px", background: "var(--color-border-subtle)" }} />
                <div className="text-2xs" style={{ color: "var(--color-text-secondary)", letterSpacing: "1px", textTransform: "uppercase" }}>Save scope</div>
                {/* Primary: the onward save gets its own full-width row; the rest sit in a secondary row */}
                {activeMonth !== null ? (
                  <>
                    <Pressable disabled={belowFloor} onClick={() => saveFromMonthForward(sheetExpLive.id)} className="text-sm" style={{ width: "100%", padding: "14px", minHeight: "48px", background: "var(--color-green)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold", ...saveBtnDisabledStyle }}>{activeMonthFull}+ Onward</Pressable>
                    <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                      <Pressable disabled={belowFloor} onClick={() => saveThisMonth(sheetExpLive.id)} className="text-2xs" style={{ flex: 1, padding: "10px 6px", background: "rgba(0,200,150,0.10)", border: "1px solid rgba(0,200,150,0.3)", borderRadius: "10px", color: "var(--color-accent-primary)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600, minWidth: "60px", ...saveBtnDisabledStyle }}>{activeMonthLabel} Only</Pressable>
                      <Pressable disabled={belowFloor} onClick={() => saveThisQuarterOnly(sheetExpLive.id)} className="text-2xs" style={{ flex: 1, padding: "10px 6px", background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", color: "var(--color-warning)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600, minWidth: "60px", ...saveBtnDisabledStyle }}>This Qtr</Pressable>
                      <Pressable disabled={belowFloor} onClick={() => saveAllQuartersFull(sheetExpLive.id)} className="text-2xs" style={{ flex: 1, padding: "10px 6px", background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", color: "var(--color-green)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600, minWidth: "60px", ...saveBtnDisabledStyle }}>All Qtrs</Pressable>
                    </div>
                  </>
                ) : (
                  <>
                    <Pressable disabled={belowFloor} onClick={() => saveAllQuarters(sheetExpLive.id)} className="text-sm" style={{ width: "100%", padding: "14px", minHeight: "48px", background: "var(--color-green)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold", ...saveBtnDisabledStyle }}>Q{ap + 1}+ Onward</Pressable>
                    <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                      <Pressable disabled={belowFloor} onClick={() => saveThisQuarterOnly(sheetExpLive.id)} className="text-2xs" style={{ flex: 1, padding: "10px 6px", background: "rgba(0,200,150,0.10)", border: "1px solid rgba(0,200,150,0.3)", borderRadius: "10px", color: "var(--color-accent-primary)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600, minWidth: "60px", ...saveBtnDisabledStyle }}>Q{ap + 1} Only</Pressable>
                      <Pressable disabled={belowFloor} onClick={() => saveAllQuartersFull(sheetExpLive.id)} className="text-2xs" style={{ flex: 1, padding: "10px 6px", background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", color: "var(--color-green)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: 600, minWidth: "60px", ...saveBtnDisabledStyle }}>All Qtrs</Pressable>
                    </div>
                  </>
                )}
                <Pressable onClick={() => { setSheetMode("view"); setEditId(null); }} className="text-xs" style={{ padding: "11px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "14px", color: "var(--color-text-secondary)", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
                  </>);
                })()}
              </div>
            )}
          </div>
        </div>
      </>,
      document.body
    )}
  </div>);
}

// Shared loan edit form (used in both overview and loans tab)
function LoanEditForm({ vals, setVals, onSave, onCancel, iS, lS }) {
  return <div>
    <div className="text-xs" style={{ letterSpacing: "2px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "12px" }}>Edit Loan</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
      <div style={{ gridColumn: "1/-1" }}><label style={lS}>Loan Name</label><input type="text" value={vals.label ?? ""} onChange={e => setVals(v => ({ ...v, label: e.target.value }))} style={iS} /></div>
      <div style={{ gridColumn: "1/-1" }}><label style={lS}>Total Amount ($)</label><input type="number" value={vals.totalAmount ?? ""} onChange={e => setVals(v => ({ ...v, totalAmount: e.target.value }))} style={iS} /></div>
      <div style={{ gridColumn: "1/-1" }}>
        <label style={lS}>Term Payment</label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span className="text-base" style={{ color: "var(--color-text-primary)", }}>$</span>
          <input type="number" value={vals.paymentAmount ?? vals.paymentPerCheck ?? ""} onChange={e => setVals(v => ({ ...v, paymentAmount: e.target.value }))} style={{ ...iS, flex: 1 }} placeholder="150" />
          <span className="text-sm" style={{ color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>every</span>
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
      <Pressable onClick={onSave} className="text-xs" style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "7px 14px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>SAVE</Pressable>
      <Pressable onClick={onCancel} className="text-xs" style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "7px 14px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", }}>CANCEL</Pressable>
    </div>
  </div>;
}

// op: " " (no operator, indent), "−" (subtraction), "=" (result)
// Deduction rows (op="−") use --color-deduction for the value; results use valColor.
function MathRow({ op, label, val, valColor, note, large, exactMark }) {
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
        <span style={{ fontSize: large ? "13px" : "11px", color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.2px" }}>{label}{exactMark && <ExactMathMark />}</span>
        {note && <span className="text-2xs" style={{ color: "var(--color-text-disabled)", marginLeft: "6px", letterSpacing: "0.3px" }}>{note}</span>}
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
