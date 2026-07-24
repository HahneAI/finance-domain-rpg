import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { computeGoalTimeline, fiscalMonthLabel, estimateGoalNextYear, fmtFullDate, fmtLoanDate, toLocalIso, netWorthHealthStatus } from "../lib/finance.js";
import { NetWorthHealthTips } from "./NetWorthHealthTips.jsx";
import { CoachNetWorthCard } from "./CoachNetWorthCard.jsx";
import { canAccessAskCoachGeneral } from "../lib/entitlements.js";
import { FISCAL_YEAR_START, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { FISCAL_WEEKS_PER_YEAR, formatFiscalWeekLabel, getFiscalWeekNumber, formatPayPeriodLabel, weekNumToPaycheckNum, weeksToChecksRemaining, payPeriodUnit, getNextPayWeek, resolveActiveWeeksThisYear } from "../lib/fiscalWeek.js";
import { deriveRollingTimelineMonths, progressiveScale } from "../lib/rollingTimeline.js";
import { formatRotationDisplay } from "../lib/rotation.js";
import { MetricCard, SmBtn, Pressable, useFoldTransition, iS, lS, ScrollSnapRow } from "./ui.jsx";

const DAY_MS = 24 * 60 * 60 * 1000;
const GOAL_SYSTEM_COLOR = "var(--color-accent-primary)";
const FY_YEAR = parseInt(FISCAL_YEAR_START.split('-')[0]);

const fmt$ = (n) => {
  if (n == null || Number.isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}$${s}`;
};

const fmtPct = (n) => `${Math.round(n * 100)}%`;
const f2 = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const safeDate = (raw) => {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function HomePanel({
  navigate,
  weeklyIncome,
  // Every real caller (App.jsx, DemoAccountTree.jsx) computes and passes this —
  // it's the correct full-year net (projectedAnnualNet + event adjustments -
  // fundedGoalSpend). Do NOT default this to weeklyIncome*FISCAL_WEEKS_PER_YEAR
  // if a new caller omits it — that reintroduces the §15.H11 dilution bug
  // (weeklyIncome is a per-ACTIVE-week average; multiplying it back out by a
  // flat 52 overstates the year for any account that wasn't active all 52).
  adjustedTakeHome,
  remainingSpend,
  goals = [],
  setGoals: setGoalsProp,
  onSaveGoalsNow: onSaveGoalsNowProp,
  setConfig: setConfigProp,
  saveConfigNow: saveConfigNowProp,
  futureWeeks = [],
  timelineWeekNets = [],
  expenses = [],
  config = null,
  logNetLost = 0,
  logNetGained = 0,
  futureEventDeductions = {},
  futureWeekNets = [],
  prevWeekNet,
  currentWeek,
  fiscalWeekInfo,
  today,
  fundedGoalSpend = 0,
  isAdmin = false,
  isTester = false,
  entitlement,
  readOnly = false,
}) {
  // Paywall-expired read-only mode (docs/TODO.md §17.E): shadow the mutation
  // setters with no-ops so every existing setGoals()/setConfig() call in this
  // file — however deeply nested — is automatically safe, without having to
  // find and gate each individual call site.
  const noop = useCallback(() => {}, []);
  const setGoals = readOnly ? noop : setGoalsProp;
  const setConfig = readOnly ? noop : setConfigProp;
  const onSaveGoalsNow = readOnly ? noop : onSaveGoalsNowProp;
  const saveConfigNow = readOnly ? noop : saveConfigNowProp;
  // Scale factor: weekly → per-paycheck (1 for weekly, 2 for biweekly/salary, ~4.33 for monthly).
  // All card values shown to the user are scaled by this factor so the amount matches
  // what lands in their bank account each paycheck cycle.
  const checksPerYear = PAYCHECKS_PER_YEAR[config?.userPaySchedule ?? "weekly"] ?? 52;
  const perCheckFactor = 52 / checksPerYear;
  const fiscalYearEnd = futureWeeks?.length ? toLocalIso(futureWeeks[futureWeeks.length - 1].weekEnd) : null;
  const todayIso = today ?? toLocalIso(new Date());
  const nextPayWeek = getNextPayWeek(futureWeeks, todayIso, checksPerYear);
  const daysUntilPaycheck = nextPayWeek
    ? Math.round((nextPayWeek.payPeriodEndDate.getTime() - new Date(todayIso + "T00:00:00").getTime()) / DAY_MS)
    : null;

  const avgWeeklySpend = remainingSpend?.avgWeeklySpend ?? 0;
  const monthlyExpenses = avgWeeklySpend * (FISCAL_WEEKS_PER_YEAR / 12);
  const monthlyTakehome = (adjustedTakeHome ?? 0) / 12;
  const projectedWeeklyLeft = (futureWeekNets?.[0] ?? weeklyIncome) - avgWeeklySpend;
  const finalizedWeekNet = prevWeekNet ?? weeklyIncome;
  const leftThisWeek = finalizedWeekNet - avgWeeklySpend;
  const avgWeeklySurplus = weeklyIncome - avgWeeklySpend;
  // Outlook window: Jan 1 → Dec 31 of the fiscal year, clamped forward to the
  // job's start date when it falls inside the year (never extended backward
  // past Jan 1 for jobs that predate the fiscal year) — assumes the job
  // continues through Dec 31. activeWeeksThisYear is the same shared helper
  // App.jsx's weeklyIncome and aiContext.js's annualSavings key off, so the
  // Home tile, weeklyIncome, and the Coach's stated figures can't drift
  // apart on how many weeks of the year are actually active (TODO §15,
  // 2026-07-19).
  const activeWeeksThisYear = resolveActiveWeeksThisYear(config?.firstActiveIdx);
  const annualSavings = avgWeeklySurplus * activeWeeksThisYear - fundedGoalSpend;
  const startDateDisplay = config?.startDate
    ? (() => {
        const jobStart = new Date(config.startDate + "T12:00:00");
        const yearStart = new Date(FY_YEAR, 0, 1);
        const scoped = jobStart > yearStart ? jobStart : yearStart;
        return scoped.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      })()
    : null;
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  // Net worth health: thin-cushion nudge when projected savings rate < 10%.
  // Suppressed in Job Loss Mode, which has its own dedicated runway UI.
  const netWorthHealth = netWorthHealthStatus(annualSavings, weeklyIncome * activeWeeksThisYear);
  const showBreakthroughTips = netWorthHealth.belowThreshold && !config?.jobLossMode;
  const nextWeekNet = futureWeekNets?.[0] ?? null;
  const fallbackSource = nextWeekNet != null ? null : (prevWeekNet != null ? "prev" : "avg");
  const fallbackNet = fallbackSource === "prev" ? prevWeekNet : weeklyIncome;
  const nextWeekDisplay = nextWeekNet ?? fallbackNet;

  const completedGoals = goals.filter((g) => g.completed);
  const totalGoalTarget = goals.reduce((s, g) => s + g.target, 0);
  const completedGoalValue = completedGoals.reduce((s, g) => s + g.target, 0);
  const topGoal = goals.find((g) => !g.completed)?.label?.toLowerCase() ?? "financial";

  const todayDate = today ? new Date(`${today}T12:00:00`) : null;
  const weekdayName = todayDate ? todayDate.toLocaleDateString("en-US", { weekday: "long" }) : null;
  const dayNum = todayDate?.getDate();
  const dayOrdinal = dayNum != null
    ? dayNum + (dayNum === 1 || dayNum === 21 || dayNum === 31 ? "st"
      : dayNum === 2 || dayNum === 22 ? "nd"
        : dayNum === 3 || dayNum === 23 ? "rd" : "th")
    : null;
  const weekNumber = currentWeek ? getFiscalWeekNumber(currentWeek.idx) : null;
  const weeksLeftCount = weekNumber != null ? Math.max(FISCAL_WEEKS_PER_YEAR - weekNumber, 0) : null;
  const periodLabel = weekNumber != null
    ? formatPayPeriodLabel({ num: weekNumber, total: FISCAL_WEEKS_PER_YEAR }, checksPerYear)
    : null;
  const subtitle = weekdayName && dayOrdinal
    ? `Another beautiful day, ${weekdayName} the ${dayOrdinal}. You are working on your ${topGoal} goal`
    : periodLabel != null && currentWeek
      ? `${periodLabel} · ${formatRotationDisplay(currentWeek, { isAdmin })}`
      : "2026 Dashboard";

  // ── Pulse insight signals ───────────────────────────────────────────────
  // Each signal is derived from real computed data. Returns undefined when
  // no meaningful signal exists so InsightRow simply doesn't render.
  // Rule: signal-blue = directional trend; signal-purple = warning / AI moment.

  const leftThisCheckLabel = checksPerYear === 52 ? "Left This Week" : "Left This Check";
  const pulseLeftThisWeek = (() => {
    if (!weeklyIncome) return undefined;
    // Prefer forward-looking delta when next week projection is available
    if (nextWeekNet != null) {
      const nextLeft = nextWeekNet - avgWeeklySpend;
      const diff = Math.round(nextLeft - leftThisWeek);
      if (Math.abs(diff) >= 20) {
        return {
          arrow: diff > 0 ? "up" : "down",
          delta: `${diff > 0 ? "+" : ""}${fmt$(Math.round(diff * perCheckFactor))}`,
          label: checksPerYear === 52 ? "next week vs this" : "next check vs last",
          variant: diff > 0 ? "blue" : "purple",
        };
      }
    }
    // Fallback: % of paycheck remaining
    const pct = Math.round((leftThisWeek / weeklyIncome) * 100);
    if (pct >= 25) return { arrow: "up",   delta: `${pct}%`, label: "of paycheck clear",     variant: "blue" };
    if (pct < 5)   return { arrow: "down", delta: `${pct}%`, label: "of paycheck remaining",  variant: "purple" };
    return            { arrow: "flat", delta: `${pct}%`, label: "of paycheck remaining",  variant: "blue" };
  })();

  const pulseNetWorth = (() => {
    if (!weeklyIncome) return undefined;
    const rate = annualSavings / (weeklyIncome * activeWeeksThisYear);
    const pct  = Math.round(rate * 100);
    if (rate >= 0.2) return { arrow: "up",   delta: `${pct}%`, label: "savings rate",         variant: "blue" };
    if (rate < 0.05) return { arrow: "down", delta: `${pct}%`, label: "savings velocity low",  variant: "purple" };
    return             { arrow: "flat", delta: `${pct}%`, label: "savings rate",         variant: "blue" };
  })();

  const pulseGoals = goals.length > 0 ? (() => {
    if (completedGoals.length === goals.length)
      return { arrow: "up", delta: null, label: "all targets met", variant: "blue" };
    if (!totalGoalTarget) return undefined;
    const pct = Math.round((completedGoalValue / totalGoalTarget) * 100);
    if (pct > 50) return { arrow: "up",   delta: `${pct}%`, label: "of total funded", variant: "blue" };
    if (pct > 0)  return { arrow: "flat", delta: `${pct}%`, label: "of total funded", variant: "blue" };
    return          { arrow: "flat", delta: null,   label: "building toward targets", variant: "blue" };
  })() : undefined;

  const pulseBudgetHealth = (() => {
    const pct = Math.round(spendRatio * 100);
    if (spendRatio < 0.5)  return { arrow: "up",   delta: `${pct}% spend ratio`, label: "· well-managed",  variant: "blue" };
    if (spendRatio < 0.75) return { arrow: "flat",  delta: `${pct}% spend ratio`, label: "· healthy range", variant: "blue" };
    return                          { arrow: "down", delta: `${pct}% spend ratio`, label: "· watch spend",   variant: "purple" };
  })();

  const pulseNextWeek = nextWeekNet != null && weeklyIncome > 0 ? (() => {
    const diff = nextWeekNet - weeklyIncome;
    const pct  = Math.round(Math.abs(diff / weeklyIncome) * 100);
    if (Math.abs(diff) < weeklyIncome * 0.03)
      return { arrow: "flat", delta: null, label: "on avg pace", variant: "blue" };
    return {
      arrow:   diff > 0 ? "up" : "down",
      delta:   `${pct}%`,
      label:   `vs avg (${diff > 0 ? "+" : ""}${fmt$(Math.round(diff * perCheckFactor))})`,
      variant: diff > 0 ? "blue" : "purple",
    };
  })() : undefined;

  const nextCheckTitle = checksPerYear === 52 ? "Next Week Takehome"
    : checksPerYear === 26 ? "Next Paycheck"
    : "Next Check";
  const tiles = [
    {
      title: nextCheckTitle,
      value: nextWeekDisplay != null ? fmt$(nextWeekDisplay * perCheckFactor) : fmt$(weeklyIncome * perCheckFactor),
      rawVal: (nextWeekDisplay ?? weeklyIncome) * perCheckFactor,
      sub: nextWeekNet != null
        ? (nextWeekNet < weeklyIncome * 0.8 ? "est. · below avg · check log"
          : nextWeekNet < weeklyIncome * 0.95 ? "est. · slightly below avg"
            : "est. · on track")
        : `${fallbackSource === "prev" ? "last confirmed pay" : "projected average"} (projected)`,
      status: nextWeekDisplay != null
        ? (nextWeekDisplay >= weeklyIncome * 0.95 ? "green"
          : nextWeekDisplay >= weeklyIncome * 0.8 ? "teal" : "red")
        : "green",
      span: 2,
      onClick: () => navigate("log"),
      key: "budget",
      insight: pulseNextWeek,
    },
    {
      title: "Net Worth Trend",
      value: fmt$(annualSavings),
      rawVal: annualSavings,
      sub: weekNumber != null ? `${startDateDisplay ? `from ${startDateDisplay} · ` : ""}projected annual savings · ${payPeriodUnit(checksPerYear, 'abbrev')} ${weekNumToPaycheckNum(weekNumber, checksPerYear)}` : startDateDisplay ? `from ${startDateDisplay} · projected annual savings` : "projected annual savings",
      status: annualSavings > 5000 ? "green" : annualSavings >= 0 ? "teal" : "red",
      span: 2,
      onClick: () => navigate("income"),
      key: "income",
      insight: pulseNetWorth,
    },
    {
      title: "Budget Health",
      value: fmtPct(spendRatio),
      sub: `${fmt$(monthlyExpenses)}/mo expenses · ${fmt$(monthlyTakehome)}/mo take-home`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "teal" : "red",
      span: 2,
      onClick: () => navigate("budget"),
      key: "budget",
      insight: pulseBudgetHealth,
    },
  ];

  const [editGoalId, setEditGoalId] = useState(null);
  const [editGoalVals, setEditGoalVals] = useState({});
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ label: "", target: "", note: "" });
  const [delGoalId, setDelGoalId] = useState(null);
  const [celebrating, setCelebrating] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // Fold-up transition prototype (dropdown, always reachable on Home): the funded-history
  // list folds down from the top on open and up on close.
  const fundedFold = useFoldTransition(showCompleted, { ms: 280 });
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [showResetTimeline, setShowResetTimeline] = useState(false);
  const reorderFold = useFoldTransition(showReorderModal, { ms: 340 });
  const resetTimelineFold = useFoldTransition(showResetTimeline, { ms: 340 });
  const [draggingReorderId, setDraggingReorderId] = useState(null);
  const [dragOverReorderId, setDragOverReorderId] = useState(null);
  const [enterAnims, setEnterAnims] = useState({});
  const [animPhase, setAnimPhase] = useState(null);
  const [isMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const [isCoarsePointer] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false
  ));

  const activeGoals = goals.filter((g) => !g.completed);

  const tl = computeGoalTimeline(
    activeGoals,
    futureWeeks ?? [],
    timelineWeekNets ?? [],
    expenses,
    logNetLost,
    logNetGained ?? 0,
    futureEventDeductions ?? {},
    config?.goalTimelineEpochIdx ?? null,
  );

  // Stable timeline anchor: start of previous calendar month.
  // Using the current fiscal week start caused month bars to shrink as weeks passed.
  const prevMonthStart = (() => {
    const iso = today ?? new Date().toISOString().slice(0, 10);
    const [y, m] = iso.slice(0, 7).split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return new Date(py, pm - 1, 1);
  })();

  const currentWeekStartMs = futureWeeks?.length
    ? (safeDate(futureWeeks[0]?.weekStart)?.getTime() ?? prevMonthStart.getTime())
    : prevMonthStart.getTime();

  const timelineBounds = (() => {
    if (!futureWeeks?.length) return null;
    const validWeeks = futureWeeks
      .map((week) => ({ end: safeDate(week?.weekEnd) }))
      .filter((week) => week.end);
    if (!validWeeks.length) return null;
    const startMs = prevMonthStart.getTime();
    const rawEndMs = Math.max(...validWeeks.map((week) => week.end.getTime())) + DAY_MS;
    if (!Number.isFinite(rawEndMs) || rawEndMs <= startMs) return null;
    return { startMs, endMs: rawEndMs, spanMs: rawEndMs - startMs };
  })();

  const timelineMonthSegments = (() => {
    if (!timelineBounds) return [];
    const segments = [];
    const timelineEnd = new Date(timelineBounds.endMs);
    const cursor = new Date(new Date(timelineBounds.startMs).getFullYear(), new Date(timelineBounds.startMs).getMonth(), 1);
    while (cursor < timelineEnd) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const segStart = Math.max(monthStart.getTime(), timelineBounds.startMs);
      const segEnd = Math.min(monthEnd.getTime(), timelineBounds.endMs);
      if (segEnd > segStart) {
        const leftPct = ((segStart - timelineBounds.startMs) / timelineBounds.spanMs) * 100;
        const widthPct = ((segEnd - segStart) / timelineBounds.spanMs) * 100;
        segments.push({
          key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
          label: fiscalMonthLabel(monthStart).toUpperCase(),
          leftPct,
          widthPct,
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return segments;
  })();

  const rollingGoalTimeline = deriveRollingTimelineMonths(timelineMonthSegments, today, 1);
  const visibleTimelineSegments = rollingGoalTimeline.visibleMonths;
  const goalTimelineScale = progressiveScale(rollingGoalTimeline.scaleProgress, 0.15);
  const lastGoalEW = tl.length ? Math.max(...tl.map((g) => (Number.isFinite(g.eW) ? g.eW : 0))) : 0;

  const nextYearSequentialEstimates = (() => {
    if (!config) return {};
    const estimates = {};
    let cumulativeWeeks = 0;
    for (const g of tl) {
      if (Number.isFinite(g.eW)) continue;
      const est = estimateGoalNextYear(g.remainingAtEnd ?? g.target, config, expenses);
      if (!est) continue;
      cumulativeWeeks += est.weeksFromFYStart;
      const [fy, fm, fd] = FISCAL_YEAR_START.split('-').map(Number);
      const nextFYStart = new Date(fy + 1, fm - 1, fd);
      const estDate = new Date(nextFYStart.getTime() + cumulativeWeeks * 7 * DAY_MS);
      estimates[g.id] = { ...est, estDate, label: fiscalMonthLabel(estDate) };
    }
    return estimates;
  })();

  useEffect(() => {
    document.body.classList.toggle("modal-open", showReorderModal);
    return () => document.body.classList.remove("modal-open");
  }, [showReorderModal]);

  useEffect(() => {
    if (!currentWeek || !setGoals) return;
    const needsUpdate = tl.filter((g) => {
      if (g.eW === null) return false;
      return g.dueWeek !== currentWeek.idx + Math.ceil(g.eW);
    });
    if (!needsUpdate.length) return;
    setGoals((prev) => prev.map((goal) => {
      const match = needsUpdate.find((g) => g.id === goal.id);
      return match ? { ...goal, dueWeek: currentWeek.idx + Math.ceil(match.eW) } : goal;
    }));
  }, [tl, currentWeek, setGoals]);

  useEffect(() => {
    if (!setGoals) return;
    const fundedNow = tl.filter((g) => g.eW !== null && g.eW <= 0).map((g) => g.id);
    if (!fundedNow.length) return;
    setGoals((prev) => prev.map((goal) => (
      fundedNow.includes(goal.id) && !goal.completed
        ? { ...goal, completed: true, completedAt: goal.completedAt ?? new Date().toISOString() }
        : goal
    )));
  }, [tl, setGoals]);

  const fiscalWeekLabel = formatPayPeriodLabel(fiscalWeekInfo, checksPerYear);
  const nowIdx = currentWeek ? getFiscalWeekNumber(currentWeek.idx) : 1;
  const weeksLeft = futureWeeks?.length ?? Math.max(FISCAL_WEEKS_PER_YEAR - nowIdx, 0);
  const totalActiveGoals = activeGoals.reduce((s, g) => s + (Number(g.target) || 0), 0);
  // Year-end-projected goal draw: unlike totalActiveGoals (full remaining target across
  // every active goal), this is scoped to only the portion each goal is actually projected
  // to be funded by fiscal year end — a goal that starts in September and doesn't finish
  // until next spring should only subtract its September-through-Dec-31 slice from this
  // year's outlook, not its full target. tl (computeGoalTimeline) already simulates this
  // per goal; remainingAtEnd is the unfunded leftover once the year-end simulation stops
  // (falls back to the full target when tl's early-return shape omits it, i.e. no time
  // left in the year to fund anything further).
  const yearEndGoalDraw = tl.reduce((s, g) => {
    const remaining = Number(g.remainingAtEnd ?? g.target) || 0;
    return s + Math.max((Number(g.target) || 0) - remaining, 0);
  }, 0);

  const ordinalSuffix = (day) => {
    if (day >= 11 && day <= 13) return "th";
    const mod = day % 10;
    if (mod === 1) return "st";
    if (mod === 2) return "nd";
    if (mod === 3) return "rd";
    return "th";
  };
  const formatGoalFinishDate = (rawDate) => {
    const parsed = safeDate(rawDate);
    if (!parsed) return null;
    const month = parsed.toLocaleDateString("en-US", { month: "short" });
    const day = parsed.getDate();
    const yearSuffix = parsed.getFullYear() !== FY_YEAR ? ` '${String(parsed.getFullYear()).slice(2)}` : "";
    return `${month} ${day}${ordinalSuffix(day)}${yearSuffix}`;
  };
  const buildGoalFinishLabel = (offsetRaw) => {
    if (!Number.isFinite(offsetRaw)) return null;
    const offset = Math.max(Math.ceil(offsetRaw), 0);
    const weekNum = Math.min(nowIdx + offset, FISCAL_WEEKS_PER_YEAR);
    const finishIdx = futureWeeks?.length ? Math.min(offset, futureWeeks.length - 1) : null;
    const finishWeek = finishIdx != null ? futureWeeks[finishIdx] : null;
    const finishDate = finishWeek?.payPeriodEndDate ?? finishWeek?.weekEnd ?? null;
    const dateLabel = formatGoalFinishDate(finishDate);
    const checkNum = weekNumToPaycheckNum(weekNum, checksPerYear);
    const pUnit = payPeriodUnit(checksPerYear, 'full').toLowerCase();
    return dateLabel ? `By ${dateLabel}, ${pUnit} ${checkNum}` : `${payPeriodUnit(checksPerYear, 'full')} ${checkNum}`;
  };
  const resolveGoalFinishLabel = (goal) => {
    const primary = Number.isFinite(goal.eW) ? buildGoalFinishLabel(goal.eW) : null;
    if (primary) return primary;
    const nextYr = nextYearSequentialEstimates[goal.id];
    if (nextYr) return `~${nextYr.label}`;
    const startOffset = Number.isFinite(goal.sW) ? goal.sW : 0;
    const duration = Number.isFinite(goal.wN) ? goal.wN : null;
    if (!Number.isFinite(duration)) return "Timeline pending";
    return buildGoalFinishLabel(startOffset + duration) ?? "Timeline pending";
  };

  const startEditGoal = (g) => { setEditGoalId(g.id); setEditGoalVals({ label: g.label, target: g.target, note: g.note }); };
  // Every handler below computes `next` synchronously from the `goals` prop
  // (not a setState updater) so the same value can go to setGoals AND
  // onSaveGoalsNow — same eager-save pattern used throughout ProfilePanel.
  // Each is a complete, discrete action (add/edit/delete/reorder one goal)
  // that shouldn't sit in the ambient debounce window.
  const saveEditGoal = (id) => {
    if (!setGoals) return;
    const next = goals.map((g) => (g.id === id ? { ...g, ...editGoalVals, target: parseFloat(editGoalVals.target) || 0 } : g));
    setGoals(next);
    onSaveGoalsNow?.(next);
    setEditGoalId(null);
  };
  const addGoal = () => {
    if (!setGoals) return;
    const next = [...goals, {
      id: `g_${Date.now()}`,
      label: newGoal.label,
      target: parseFloat(newGoal.target) || 0,
      color: GOAL_SYSTEM_COLOR,
      note: newGoal.note,
      completed: false,
    }];
    setGoals(next);
    onSaveGoalsNow?.(next);
    setAddingGoal(false);
    setNewGoal({ label: "", target: "", note: "" });
  };
  const deleteGoal = (id) => {
    if (!setGoals) return;
    const next = goals.filter((g) => g.id !== id);
    setGoals(next);
    onSaveGoalsNow?.(next);
    setDelGoalId(null);
  };
  const toggleComplete = (id) => {
    const next = goals.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g));
    setGoals?.(next);
    onSaveGoalsNow?.(next);
  };
  // Re-anchor the active-goal funding sequence to the user's next paycheck. Weekly
  // users have no isPayWeek flags (getNextPayWeek → null), so fall back to the next
  // future week. Persists to config so computeGoalTimeline recomputes from the new
  // anchor and the change survives reload / Force Sync.
  const resetGoalTimeline = () => {
    const epochIdx = nextPayWeek?.idx ?? futureWeeks?.[0]?.idx ?? null;
    const newConfig = { ...config, goalTimelineEpochIdx: epochIdx };
    setConfig?.(newConfig);
    saveConfigNow?.(newConfig);
    // Drop stale projected due weeks on active goals so they recompute from the anchor.
    const nextGoals = goals.map((g) => (g.completed ? g : { ...g, dueWeek: undefined }));
    setGoals?.(nextGoals);
    onSaveGoalsNow?.(nextGoals);
    setShowResetTimeline(false);
  };
  const handleMarkDone = (id) => {
    setCelebrating(id);
    setTimeout(() => {
      // Captured via the setGoals updater (not the outer `goals` closure) so
      // this reflects state as of when the timeout actually fires, not when
      // it was scheduled 900ms earlier — same freshness guarantee a plain
      // functional updater gives, just also exposing the computed value for
      // the eager save.
      let nextGoals;
      setGoals?.((prev) => {
        nextGoals = prev.map((g) => (g.id === id ? { ...g, completed: true, completedAt: new Date().toISOString() } : g));
        return nextGoals;
      });
      onSaveGoalsNow?.(nextGoals);
      setCelebrating(null);
      setShowCompleted(true);
    }, 900);
  };
  const moveGoal = (id, dir) => {
    const idx = goals.findIndex((g) => g.id === id);
    if (idx === -1) return;
    const arr = [...goals];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setGoals?.(arr);
    onSaveGoalsNow?.(arr);
  };
  const moveGoalInActiveList = (id, dir) => {
    const idx = activeGoals.findIndex((g) => g.id === id);
    if (idx === -1) return;
    const next = idx + dir;
    if (next < 0 || next >= activeGoals.length) return;
    moveGoal(id, dir);
  };
  const reorderGoalByDrag = (draggedId, overId, insertIndexOverride = null) => {
    const active = goals.filter((g) => !g.completed);
    const completed = goals.filter((g) => g.completed);
    const dragged = active.find((g) => g.id === draggedId);
    if (!dragged) return;
    const activeWithoutDragged = active.filter((g) => g.id !== draggedId);
    const explicitIndex = typeof insertIndexOverride === "number" && !Number.isNaN(insertIndexOverride)
      ? Math.max(0, Math.min(insertIndexOverride, activeWithoutDragged.length))
      : null;
    let insertIndex = activeWithoutDragged.length;
    if (explicitIndex !== null) {
      insertIndex = explicitIndex;
    } else if (overId) {
      const overIndex = activeWithoutDragged.findIndex((g) => g.id === overId);
      if (overIndex !== -1) insertIndex = overIndex;
    }
    const reordered = [...activeWithoutDragged];
    reordered.splice(insertIndex, 0, dragged);
    const next = [...reordered, ...completed];
    setGoals?.(next);
    onSaveGoalsNow?.(next);
  };
  const canShowReorder = activeGoals.length > 1 && typeof moveGoal === "function" && typeof reorderGoalByDrag === "function";
  const closeReorderModal = () => {
    setShowReorderModal(false);
    setDraggingReorderId(null);
    setDragOverReorderId(null);
  };
  const CARD_SLOT_PX = 94;
  const handleMoveWithAnim = (id, dir, i) => {
    if (animPhase !== null) return;
    if (dir === -1 && i === 0) return;
    if (dir === 1 && i === activeGoals.length - 1) return;
    const swapId = activeGoals[i + dir].id;
    moveGoalInActiveList(id, dir);
    setEnterAnims({ [id]: -dir * CARD_SLOT_PX, [swapId]: dir * CARD_SLOT_PX });
    setAnimPhase('init');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimPhase('settle');
        setTimeout(() => { setEnterAnims({}); setAnimPhase(null); }, 320);
      });
    });
  };

  return (
    <div style={{ paddingBottom: "8px" }}>
      {goals.length === 0 && (
        <div
          style={{
            marginBottom: "14px",
            padding: "12px 14px",
            background: "rgba(0,200,150,0.07)",
            border: "1px solid rgba(0,200,150,0.18)",
            borderRadius: "10px",
            fontSize: "12px",
            color: "var(--color-text-secondary)",
          }}
        >
          No active goals yet. Add your first goal below to unlock timeline forecasting.
        </div>
      )}
      <div id="home-goals-section" style={{ marginBottom: "28px", textAlign: "center", padding: "6px 0" }}>
        <div style={{ fontSize: "9px", letterSpacing: "4px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "14px" }}>
          Authority Finance
        </div>
        <div style={{
          fontSize: "52px",
          fontWeight: 800,
          fontFamily: "var(--font-display)",
          color: "var(--color-accent-primary)",
          letterSpacing: "-1.8px",
          lineHeight: 1,
          marginBottom: "16px",
        }}>
          Goals
        </div>
        <div style={{ width: "40px", height: "2px", background: "var(--color-accent-primary)", margin: "0 auto 16px", borderRadius: "1px", opacity: 0.55 }} />
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", letterSpacing: "0.3px", lineHeight: 1.75 }}>
          {activeGoals.length > 0 ? `${activeGoals.length} active · track your targets` : "Start your first goal"}
        </div>
      </div>

      <div>
        {currentWeek && (
          <div style={{ background: "rgba(0,200,150,0.09)", border: "1px solid rgba(0,200,150,0.32)", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-green)" }}>{fiscalWeekLabel}</div>
            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>
              {formatRotationDisplay(currentWeek, { isAdmin })}
              {nextPayWeek
                ? ` · pay period ends${daysUntilPaycheck === 0 ? " today" : ` in ${daysUntilPaycheck}d`} · ${fmtLoanDate(toLocalIso(nextPayWeek.payPeriodEndDate), fiscalYearEnd)}`
                : ` · ends ${fmtFullDate(safeDate(currentWeek.payPeriodEndDate))}`
              }
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <MetricCard label={leftThisCheckLabel} val={fmt$(leftThisWeek * perCheckFactor)} rawVal={leftThisWeek * perCheckFactor} status={leftThisWeek >= 0 ? "green" : "red"} insight={pulseLeftThisWeek} />
          <MetricCard label="Active Goals Total" val={fmt$(totalActiveGoals)} rawVal={totalActiveGoals} status="teal" />
          <MetricCard
            label={`${payPeriodUnit(checksPerYear, 'fullPlural')} to Complete All`}
            val={`~${Math.ceil(lastGoalEW / (FISCAL_WEEKS_PER_YEAR / checksPerYear))} ${payPeriodUnit(checksPerYear, 'abbrev').toLowerCase()}s`}
            status={lastGoalEW <= weeksLeft ? "green" : "red"}
          />
          <MetricCard
            label="Goals"
            val={`${completedGoals.length}/${goals.length}`}
            sub={completedGoals.length > 0
              ? `${fmt$(completedGoalValue)} of ${fmt$(totalGoalTarget)} funded`
              : `${fmt$(totalGoalTarget)} total target`}
            status={goals.length > 0 && completedGoals.length === goals.length ? "green" : "teal"}
            insight={pulseGoals}
          />
        </div>

        <div style={{ marginBottom: "16px", padding: "12px 0", borderRadius: "10px", border: "1px solid #222", background: "rgba(16,16,16,0.55)", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tl.length ? "10px" : "0", padding: "0 12px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)" }}>Active Goals</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {tl.length > 0 && setConfigProp && !readOnly && (
                <Pressable
                  onClick={() => setShowResetTimeline(true)}
                  style={{
                    fontSize: "9px",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    color: "var(--color-text-secondary)",
                    background: "var(--color-bg-raised)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "12px",
                    padding: "4px 10px",
                    cursor: "pointer",
                    minHeight: "28px",
                  }}
                >
                  Reset Timeline
                </Pressable>
              )}
              <div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{tl.length}</div>
            </div>
          </div>
          {!tl.length && <div style={{ border: "1px dashed #333", borderRadius: "8px", padding: "10px 12px", fontSize: "10px", color: "var(--color-text-primary)", letterSpacing: "1px", textTransform: "uppercase", margin: "0 12px" }}>No active goals yet</div>}
          {isMobile ? (
            <ScrollSnapRow itemWidth="calc(100% - 40px)">
              {tl.map((g, i) => {
                const isEditing = editGoalId === g.id;
                const isNextYear = !Number.isFinite(g.eW);
                const sWPct = timelineBounds
                  ? clamp01((currentWeekStartMs + (g.sW ?? 0) * 7 * DAY_MS - timelineBounds.startMs) / timelineBounds.spanMs) * 100
                  : clamp01((g.sW ?? 0) / Math.max(weeksLeft, 1)) * 100;
                const eWPct = isNextYear ? sWPct : (timelineBounds
                  ? clamp01((currentWeekStartMs + Math.ceil(g.eW) * 7 * DAY_MS - timelineBounds.startMs) / timelineBounds.spanMs) * 100
                  : clamp01(Math.ceil(g.eW) / Math.max(weeksLeft, 1)) * 100);
                const fillWidthPct = Math.max(0, eWPct - sWPct);
                return (
                  <div
                    key={g.id}
                    style={{
                      background: "var(--color-bg-surface)",
                      border: `1px solid ${isEditing ? "var(--color-accent-primary)" : "var(--color-border-subtle)"}`,
                      borderRadius: "8px",
                      padding: "16px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{
                      fontSize: isMobile ? "72px" : "96px",
                      fontWeight: 900,
                      fontFamily: "var(--font-display)",
                      color: "rgba(255, 255, 255, 0.09)",
                      lineHeight: 1,
                      position: "absolute",
                      top: "-8px",
                      right: "12px",
                      pointerEvents: "none",
                      userSelect: "none",
                      zIndex: 0,
                    }}>{i + 1}</div>
                    <div style={{ position: "relative", zIndex: 1 }}>
                    {isEditing ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={editGoalVals.label} onChange={(e) => setEditGoalVals((v) => ({ ...v, label: e.target.value }))} style={iS} /></div>
                          <div><label style={lS}>Target ($)</label><input type="number" value={editGoalVals.target} onChange={(e) => setEditGoalVals((v) => ({ ...v, target: e.target.value }))} style={iS} /></div>
                          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note</label><input type="text" value={editGoalVals.note} onChange={(e) => setEditGoalVals((v) => ({ ...v, note: e.target.value }))} style={iS} /></div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <SmBtn onClick={() => saveEditGoal(g.id)} c="var(--color-green)">SAVE</SmBtn>
                          <SmBtn onClick={() => setEditGoalId(null)}>CANCEL</SmBtn>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                              <span style={{ fontSize: "14px", fontWeight: "bold" }}>{g.label}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", marginLeft: "12px" }}>
                            <div style={{ fontSize: "18px", fontWeight: "bold", color: GOAL_SYSTEM_COLOR }}>{fmt$(g.target)}</div>
                            <div style={{ fontSize: "10px", color: !Number.isFinite(g.eW) ? "var(--color-warning)" : (g.eW <= weeksLeft ? "var(--color-green)" : "var(--color-deduction)") }}>{resolveGoalFinishLabel(g)}</div>
                            {!Number.isFinite(g.eW) && <div style={{ fontSize: "9px", color: "var(--color-warning)", background: "rgba(245,158,11,0.12)", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px", display: "inline-block" }}>NEXT YR EST</div>}
                            {g.dueWeek && nowIdx > g.dueWeek && <div style={{ fontSize: "9px", color: "var(--color-deduction)", background: "#2d1a1a", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px" }}>PAST DUE · {payPeriodUnit(checksPerYear, 'abbrev')} {weekNumToPaycheckNum(getFiscalWeekNumber(g.dueWeek), checksPerYear)}</div>}
                          </div>
                        </div>
                        <div style={{ height: `${Math.round(16 * goalTimelineScale)}px`, borderRadius: "6px", border: "1px solid #232323", background: "#111", position: "relative", overflow: "hidden", marginBottom: "8px", opacity: isNextYear ? 0.35 : 1 }}>
                          {visibleTimelineSegments.map((seg) => (
                            <div key={seg.key} style={{ position: "absolute", top: 0, left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, height: "100%", borderLeft: "1px solid #232323", opacity: seg.key < today.slice(0, 7) ? 0.28 : 0.72 }} />
                          ))}
                          <div style={{ position: "absolute", top: "2px", left: `${celebrating === g.id ? 0 : sWPct}%`, width: `${celebrating === g.id ? 100 : fillWidthPct}%`, height: "calc(100% - 4px)", borderRadius: "3px", background: celebrating === g.id ? "var(--color-green)" : GOAL_SYSTEM_COLOR }} />
                        </div>
                        <div style={{ position: "relative", height: `${Math.round(14 * goalTimelineScale)}px`, marginBottom: "8px" }}>
                          {visibleTimelineSegments.map((seg) => (
                            <span key={`${seg.key}-label`} style={{
                              position: "absolute",
                              left: `${seg.leftPct}%`,
                              width: `${seg.widthPct}%`,
                              textAlign: "center",
                              fontSize: `${Math.max(7, Math.round(8 * goalTimelineScale))}px`,
                              letterSpacing: "1.1px",
                              color: seg.key < today.slice(0, 7) ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              textTransform: "uppercase",
                              lineHeight: 1.1,
                              whiteSpace: "nowrap",
                            }}>
                              {seg.label}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px" }}><span>{payPeriodUnit(checksPerYear, 'abbrev')} {weekNumToPaycheckNum(nowIdx, checksPerYear)}</span><span>{payPeriodUnit(checksPerYear, 'abbrev')} {checksPerYear}</span></div>
                        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                          {isAdmin && (
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                              {(() => {
                                const pN = checksPerYear === 52 ? g.wN : g.wN / (FISCAL_WEEKS_PER_YEAR / checksPerYear);
                                const rate = pN > 0 ? g.target / pN : 0;
                                const pUnit = payPeriodUnit(checksPerYear, 'lower');
                                return <>
                                  <span style={{ color: GOAL_SYSTEM_COLOR }}>{f2(rate)}/{pUnit} projected</span>
                                  {" · "}{Number.isFinite(pN) ? pN.toFixed(1) : "0.0"} {pUnit}s to fund
                                </>;
                              })()}
                            </div>
                          )}
                          {!readOnly && (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            {canShowReorder && (
                              <SmBtn onClick={() => setShowReorderModal(true)} c="var(--color-text-secondary)" style={{ flex: 1 }}>
                                ⠿ REORDER
                              </SmBtn>
                            )}
                            <SmBtn onClick={() => startEditGoal(g)} c="var(--color-teal)" style={{ flex: 1 }}>EDIT</SmBtn>
                            <SmBtn onClick={() => handleMarkDone(g.id)} c="var(--color-green)" style={{ flex: 1 }}>✓ DONE</SmBtn>
                            {delGoalId === g.id ? (
                              <>
                                <SmBtn onClick={() => deleteGoal(g.id)} c="var(--color-deduction)" style={{ flex: 1 }}>DEL</SmBtn>
                                <SmBtn onClick={() => setDelGoalId(null)} style={{ flex: 1 }}>NO</SmBtn>
                              </>
                            ) : <SmBtn onClick={() => setDelGoalId(g.id)} c="var(--color-deduction)" style={{ flex: 1 }}>✕</SmBtn>}
                          </div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </ScrollSnapRow>
          ) : (
            <>
              {tl.map((g, i) => {
                const isEditing = editGoalId === g.id;
                const isNextYear = !Number.isFinite(g.eW);
                const sWPct = timelineBounds
                  ? clamp01((currentWeekStartMs + (g.sW ?? 0) * 7 * DAY_MS - timelineBounds.startMs) / timelineBounds.spanMs) * 100
                  : clamp01((g.sW ?? 0) / Math.max(weeksLeft, 1)) * 100;
                const eWPct = isNextYear ? sWPct : (timelineBounds
                  ? clamp01((currentWeekStartMs + Math.ceil(g.eW) * 7 * DAY_MS - timelineBounds.startMs) / timelineBounds.spanMs) * 100
                  : clamp01(Math.ceil(g.eW) / Math.max(weeksLeft, 1)) * 100);
                const fillWidthPct = Math.max(0, eWPct - sWPct);
                return (
                  <div
                    key={g.id}
                    style={{
                      background: "var(--color-bg-surface)",
                      border: "1px solid var(--color-border-accent)",
                      borderRadius: "8px",
                      padding: "16px",
                      marginBottom: "12px",
                      cursor: "default",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{
                      fontSize: isMobile ? "72px" : "96px",
                      fontWeight: 900,
                      fontFamily: "var(--font-display)",
                      color: "rgba(255, 255, 255, 0.09)",
                      lineHeight: 1,
                      position: "absolute",
                      top: "-8px",
                      right: "12px",
                      pointerEvents: "none",
                      userSelect: "none",
                      zIndex: 0,
                    }}>{i + 1}</div>
                    <div style={{ position: "relative", zIndex: 1 }}>
                    {isEditing ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={editGoalVals.label} onChange={(e) => setEditGoalVals((v) => ({ ...v, label: e.target.value }))} style={iS} /></div>
                          <div><label style={lS}>Target ($)</label><input type="number" value={editGoalVals.target} onChange={(e) => setEditGoalVals((v) => ({ ...v, target: e.target.value }))} style={iS} /></div>
                          <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note</label><input type="text" value={editGoalVals.note} onChange={(e) => setEditGoalVals((v) => ({ ...v, note: e.target.value }))} style={iS} /></div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <SmBtn onClick={() => saveEditGoal(g.id)} c="var(--color-green)">SAVE</SmBtn>
                          <SmBtn onClick={() => setEditGoalId(null)}>CANCEL</SmBtn>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                              <span style={{ fontSize: "14px", fontWeight: "bold" }}>{g.label}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", marginLeft: "12px" }}>
                            <div style={{ fontSize: "18px", fontWeight: "bold", color: GOAL_SYSTEM_COLOR }}>{fmt$(g.target)}</div>
                            <div style={{ fontSize: "10px", color: !Number.isFinite(g.eW) ? "var(--color-warning)" : (g.eW <= weeksLeft ? "var(--color-green)" : "var(--color-deduction)") }}>{resolveGoalFinishLabel(g)}</div>
                            {!Number.isFinite(g.eW) && <div style={{ fontSize: "9px", color: "var(--color-warning)", background: "rgba(245,158,11,0.12)", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px", display: "inline-block" }}>NEXT YR EST</div>}
                            {g.dueWeek && nowIdx > g.dueWeek && <div style={{ fontSize: "9px", color: "var(--color-deduction)", background: "#2d1a1a", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px" }}>PAST DUE · {payPeriodUnit(checksPerYear, 'abbrev')} {weekNumToPaycheckNum(getFiscalWeekNumber(g.dueWeek), checksPerYear)}</div>}
                          </div>
                        </div>
                        <div style={{ height: `${Math.round(16 * goalTimelineScale)}px`, borderRadius: "6px", border: "1px solid #232323", background: "#111", position: "relative", overflow: "hidden", marginBottom: "8px", opacity: isNextYear ? 0.35 : 1 }}>
                          {visibleTimelineSegments.map((seg) => (
                            <div key={seg.key} style={{ position: "absolute", top: 0, left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, height: "100%", borderLeft: "1px solid #232323", opacity: seg.key < today.slice(0, 7) ? 0.28 : 0.72 }} />
                          ))}
                          <div style={{ position: "absolute", top: "2px", left: `${celebrating === g.id ? 0 : sWPct}%`, width: `${celebrating === g.id ? 100 : fillWidthPct}%`, height: "calc(100% - 4px)", borderRadius: "3px", background: celebrating === g.id ? "var(--color-green)" : GOAL_SYSTEM_COLOR }} />
                        </div>
                        <div style={{ position: "relative", height: `${Math.round(14 * goalTimelineScale)}px`, marginBottom: "8px" }}>
                          {visibleTimelineSegments.map((seg) => (
                            <span key={`${seg.key}-label`} style={{
                              position: "absolute",
                              left: `${seg.leftPct}%`,
                              width: `${seg.widthPct}%`,
                              textAlign: "center",
                              fontSize: `${Math.max(7, Math.round(8 * goalTimelineScale))}px`,
                              letterSpacing: "1.1px",
                              color: seg.key < today.slice(0, 7) ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              textTransform: "uppercase",
                              lineHeight: 1.1,
                              whiteSpace: "nowrap",
                            }}>
                              {seg.label}
                            </span>
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px" }}><span>{payPeriodUnit(checksPerYear, 'abbrev')} {weekNumToPaycheckNum(nowIdx, checksPerYear)}</span><span>{payPeriodUnit(checksPerYear, 'abbrev')} {checksPerYear}</span></div>
                        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                          {isAdmin && (
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                              {(() => {
                                const pN = checksPerYear === 52 ? g.wN : g.wN / (FISCAL_WEEKS_PER_YEAR / checksPerYear);
                                const rate = pN > 0 ? g.target / pN : 0;
                                const pUnit = payPeriodUnit(checksPerYear, 'lower');
                                return <>
                                  <span style={{ color: GOAL_SYSTEM_COLOR }}>{f2(rate)}/{pUnit} projected</span>
                                  {" · "}{Number.isFinite(pN) ? pN.toFixed(1) : "0.0"} {pUnit}s to fund
                                </>;
                              })()}
                            </div>
                          )}
                          {!readOnly && (
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            {canShowReorder && (
                              <SmBtn onClick={() => setShowReorderModal(true)} c="var(--color-text-secondary)" style={{ flex: 1 }}>
                                ⠿ REORDER
                              </SmBtn>
                            )}
                            <SmBtn onClick={() => startEditGoal(g)} c="var(--color-teal)" style={{ flex: 1 }}>EDIT</SmBtn>
                            <SmBtn onClick={() => handleMarkDone(g.id)} c="var(--color-green)" style={{ flex: 1 }}>✓ DONE</SmBtn>
                            {delGoalId === g.id ? (
                              <>
                                <SmBtn onClick={() => deleteGoal(g.id)} c="var(--color-deduction)" style={{ flex: 1 }}>DEL</SmBtn>
                                <SmBtn onClick={() => setDelGoalId(null)} style={{ flex: 1 }}>NO</SmBtn>
                              </>
                            ) : <SmBtn onClick={() => setDelGoalId(g.id)} c="var(--color-deduction)" style={{ flex: 1 }}>✕</SmBtn>}
                          </div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        {/* Portaled to document.body so position:fixed resolves against the viewport,
            not the scrolling .main-content ancestor — iOS Safari hit-tests a fixed
            element nested in an overflow:auto container at a scrollTop offset, which
            made the modal's controls need repeated taps. */}
        {reorderFold.mounted && createPortal(
          <div
            className="fold-backdrop" data-fold={reorderFold.fold}
            onClick={closeReorderModal}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              background: "rgba(0,0,0,0.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 12px",
            }}
          >
            <div
              className="fold-modal" data-fold={reorderFold.fold}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "480px",
                background: "var(--color-bg-surface)",
                borderRadius: "20px",
                padding: "20px 20px 24px",
                maxHeight: "78vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexShrink: 0 }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)" }}>
                  REORDER GOALS
                </div>
                <Pressable
                  onClick={closeReorderModal}
                  style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "4px" }}
                >
                  ✕
                </Pressable>
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "18px", flexShrink: 0 }}>
                {isCoarsePointer ? "Tap ↑ ↓ to reprioritize. Goals fund in order." : "Drag goals to reorder. Goals fund in order."}
              </div>
              {/* Vertical card list */}
              <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
                {activeGoals.map((g, i) => {
                  const isDragging = draggingReorderId === g.id;
                  const isDropTarget = dragOverReorderId === g.id && draggingReorderId !== g.id;
                  const displaced = enterAnims[g.id];
                  const isEntering = displaced !== undefined;
                  const cardTransform = isEntering
                    ? (animPhase === 'init' ? `translateY(${displaced}px)` : 'translateY(0)')
                    : undefined;
                  const cardTransition = isEntering && animPhase === 'settle'
                    ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), border-color 150ms, opacity 120ms'
                    : 'border-color 150ms, opacity 120ms';
                  const upDisabled = i === 0 || animPhase !== null;
                  const downDisabled = i === activeGoals.length - 1 || animPhase !== null;
                  return (
                    <div
                      key={g.id}
                      draggable={!isCoarsePointer}
                      onDragStart={!isCoarsePointer ? () => setDraggingReorderId(g.id) : undefined}
                      onDragEnd={!isCoarsePointer ? () => {
                        if (draggingReorderId && dragOverReorderId && draggingReorderId !== dragOverReorderId) {
                          reorderGoalByDrag(draggingReorderId, dragOverReorderId);
                        }
                        setDraggingReorderId(null);
                        setDragOverReorderId(null);
                      } : undefined}
                      onDragOver={!isCoarsePointer ? (e) => { e.preventDefault(); setDragOverReorderId(g.id); } : undefined}
                      style={{
                        height: "84px",
                        background: "var(--color-bg-raised)",
                        border: `1px solid ${isDropTarget ? "var(--color-accent-primary)" : "var(--color-border-subtle)"}`,
                        borderRadius: "14px",
                        padding: "0 16px",
                        position: "relative",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        cursor: isCoarsePointer ? "default" : "grab",
                        opacity: isDragging ? 0.35 : 1,
                        flexShrink: 0,
                        transform: cardTransform,
                        transition: cardTransition,
                        zIndex: isEntering ? 10 : 1,
                        willChange: isEntering ? "transform" : undefined,
                      }}
                    >
                      {/* Ghost ordinal */}
                      <div style={{
                        fontSize: "68px",
                        fontWeight: 900,
                        fontFamily: "var(--font-display)",
                        color: "rgba(255,255,255,0.05)",
                        position: "absolute",
                        top: "-8px",
                        right: "12px",
                        pointerEvents: "none",
                        zIndex: 0,
                        lineHeight: 1,
                        userSelect: "none",
                      }}>
                        {i + 1}
                      </div>
                      {/* Visible ordinal */}
                      <div style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--color-text-disabled)",
                        width: "16px",
                        textAlign: "center",
                        flexShrink: 0,
                        zIndex: 1,
                      }}>
                        {i + 1}
                      </div>
                      {/* Label + target */}
                      <div style={{ flex: 1, zIndex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginBottom: "4px",
                        }}>
                          {g.label}
                        </div>
                        <div style={{
                          fontSize: "12px",
                          color: "var(--color-accent-primary)",
                          fontWeight: 600,
                        }}>
                          {fmt$(g.target)}
                        </div>
                      </div>
                      {/* Touch: inline ↑ ↓ per card — pill control */}
                      {isCoarsePointer && (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          border: "1px solid var(--color-border-subtle)",
                          borderRadius: "10px",
                          overflow: "hidden",
                          zIndex: 1,
                          flexShrink: 0,
                        }}>
                          <Pressable
                            onClick={() => handleMoveWithAnim(g.id, -1, i)}
                            disabled={upDisabled}
                            style={{
                              background: "none",
                              border: "none",
                              borderBottom: "1px solid var(--color-border-subtle)",
                              color: upDisabled ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              width: "44px",
                              height: "38px",
                              cursor: upDisabled ? "default" : "pointer",
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >↑</Pressable>
                          <Pressable
                            onClick={() => handleMoveWithAnim(g.id, 1, i)}
                            disabled={downDisabled}
                            style={{
                              background: "none",
                              border: "none",
                              color: downDisabled ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              width: "44px",
                              height: "38px",
                              cursor: downDisabled ? "default" : "pointer",
                              fontSize: "14px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >↓</Pressable>
                        </div>
                      )}
                      {/* Desktop: drag handle */}
                      {!isCoarsePointer && (
                        <div style={{
                          fontSize: "20px",
                          color: "var(--color-text-disabled)",
                          zIndex: 1,
                          flexShrink: 0,
                          pointerEvents: "none",
                          userSelect: "none",
                          letterSpacing: "-2px",
                        }}>
                          ⠿
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Done button */}
              <Pressable
                onClick={closeReorderModal}
                style={{
                  marginTop: "18px",
                  flexShrink: 0,
                  background: "var(--color-bg-raised)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "12px",
                  color: "var(--color-text-primary)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  padding: "12px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Done
              </Pressable>
            </div>
          </div>,
          document.body,
        )}

        {resetTimelineFold.mounted && createPortal(
          <div
            className="fold-backdrop" data-fold={resetTimelineFold.fold}
            onClick={() => setShowResetTimeline(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 400,
              background: "rgba(0,0,0,0.86)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px 16px",
            }}
          >
            <div
              className="fold-modal" data-fold={resetTimelineFold.fold}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "400px",
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "20px",
                padding: "22px 20px 20px",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-teal)", marginBottom: "12px" }}>
                Reset Goal Timeline
              </div>
              <div style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--color-text-primary)", marginBottom: "8px" }}>
                This restarts every active goal's timeline so funding begins on your{" "}
                {(() => {
                  const anchor = nextPayWeek ?? futureWeeks?.[0] ?? null;
                  const d = formatGoalFinishDate(anchor?.payPeriodEndDate ?? anchor?.weekEnd);
                  return d ? <>next paycheck (<strong>{d}</strong>)</> : "next paycheck";
                })()}.
              </div>
              <div style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--color-text-secondary)", marginBottom: "20px" }}>
                It's okay — this happens. If you had to pull your savings for an emergency or spent
                what you set aside, this re-anchors your goals to reality. Targets, due dates, and
                labels stay; only the timeline start moves.
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <Pressable
                  onClick={() => setShowResetTimeline(false)}
                  style={{
                    flex: 1,
                    background: "var(--color-bg-raised)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "12px",
                    color: "var(--color-text-secondary)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    padding: "11px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </Pressable>
                <Pressable
                  onClick={resetGoalTimeline}
                  style={{
                    flex: 1,
                    background: "var(--color-teal)",
                    border: "none",
                    borderRadius: "12px",
                    color: "var(--color-bg-base)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    padding: "11px",
                    cursor: "pointer",
                  }}
                >
                  Reset Timeline
                </Pressable>
              </div>
            </div>
          </div>,
          document.body,
        )}

        {!readOnly && (addingGoal ? (
          <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "18px", marginBottom: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lS}>Label</label><input type="text" value={newGoal.label} onChange={(e) => setNewGoal((v) => ({ ...v, label: e.target.value }))} style={iS} /></div>
              <div><label style={lS}>Target ($)</label><input type="number" value={newGoal.target} onChange={(e) => setNewGoal((v) => ({ ...v, target: e.target.value }))} style={iS} /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={lS}>Note</label><input type="text" value={newGoal.note} onChange={(e) => setNewGoal((v) => ({ ...v, note: e.target.value }))} style={iS} /></div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <SmBtn onClick={addGoal} c="var(--color-green)">ADD GOAL</SmBtn>
              <SmBtn onClick={() => { setAddingGoal(false); setNewGoal({ label: "", target: "", note: "" }); }}>CANCEL</SmBtn>
            </div>
          </div>
        ) : <Pressable onClick={() => setAddingGoal(true)} style={{ background: "var(--color-bg-surface)", color: "var(--color-teal)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD GOAL</Pressable>)}

        {completedGoals.length > 0 && (
          <div style={{ marginTop: "8px", border: "1px solid #1e1e1e", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
            <Pressable onClick={() => setShowCompleted((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111", border: "none", padding: "12px 16px", cursor: "pointer" }}>
              <span style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Funded History ({completedGoals.length})</span>
              <span style={{ fontSize: "11px", color: "var(--color-text-primary)" }}>{showCompleted ? "Hide" : "Show"}</span>
            </Pressable>
            {fundedFold.mounted && (
              <div className="fold-scale" data-fold={fundedFold.fold}>
                {completedGoals.map((g) => (
                  <div key={g.id} style={{ borderTop: "1px solid #1a1a1a", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: "var(--color-text-primary)", textDecoration: "line-through" }}>{g.label}</div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <div style={{ color: "var(--color-text-primary)" }}>{fmt$(g.target)}</div>
                      <SmBtn onClick={() => toggleComplete(g.id)} c="#555">UNDO</SmBtn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <div style={{ marginTop: "28px", marginBottom: "28px", textAlign: "center", padding: "6px 0" }}>
        <div style={{
          fontSize: "32px",
          fontWeight: 800,
          fontFamily: "var(--font-display)",
          color: "var(--color-accent-primary)",
          letterSpacing: "-1px",
          lineHeight: 1,
          marginBottom: "14px",
        }}>
          Financial Health
        </div>
        <div style={{ width: "28px", height: "2px", background: "var(--color-accent-primary)", margin: "0 auto 14px", borderRadius: "1px", opacity: 0.45 }} />
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", letterSpacing: "0.3px", lineHeight: 1.75 }}>
          {subtitle}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {tiles.map((tile, i) => (
          <MetricCard
            key={tile.title}
            label={tile.title}
            val={tile.value}
            rawVal={tile.rawVal ?? undefined}
            sub={tile.sub}
            status={tile.status}
            span={tile.span}
            size="30px"
            centered
            onClick={tile.onClick}
            entranceIndex={i}
            insight={tile.insight}
          />
        ))}
      </div>

      {showBreakthroughTips && (
        <NetWorthHealthTips seed={weekNumber ?? 0} />
      )}

      {/* §18.C — left the admin/tester-only standing constraint; now also
          open to a real trial/paid entitlement (docs/coach-entry-points.md
          §2). Beta testers are NOT investors — canAccessAskCoachGeneral must
          never fold in isInvestor. See docs/active-systems.md "Beta Tester
          Accounts". */}
      {canAccessAskCoachGeneral({ isAdmin, isTester, entitlement }) && (
        <CoachNetWorthCard
          config={config}
          setConfig={setConfig}
          saveConfigNow={saveConfigNow}
          expenses={expenses}
          goals={goals}
          weeklyIncome={weeklyIncome}
          avgWeeklySpend={avgWeeklySpend}
          fundedGoalSpend={fundedGoalSpend}
          netWorthHealth={netWorthHealth}
          currentWeek={currentWeek}
          today={todayIso}
        />
      )}

      <div style={{ marginTop: "28px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "12px", padding: "20px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--color-accent-primary), transparent)", opacity: 0.5 }} />
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "4px" }}>Fiscal Year {FY_YEAR}{startDateDisplay ? ` · ${startDateDisplay} – Dec 31` : ""}</div>
          <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px" }}>Year-End Outlook</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{payPeriodUnit(checksPerYear, 'fullPlural')} remaining</div>
            <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "var(--font-display)" }}>{weeksToChecksRemaining(weeksLeft, checksPerYear)}</div>
          </div>
          <div style={{ height: "1px", background: "var(--color-border-subtle)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Funded goals (absorbed)</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-deduction)" }}>-{fmt$(fundedGoalSpend)}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Adj. projected savings</div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-green)" }}>{fmt$(annualSavings)}</div>
          </div>
          <div style={{ height: "1px", background: "var(--color-border-subtle)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Surplus after all goals</div>
            <div style={{ fontSize: "19px", fontWeight: 800, fontFamily: "var(--font-display)", color: annualSavings - yearEndGoalDraw >= 0 ? "var(--color-green)" : "var(--color-deduction)" }}>
              {fmt$(annualSavings - yearEndGoalDraw)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
