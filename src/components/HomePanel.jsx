import { useEffect, useState } from "react";
import { computeGoalTimeline, fiscalMonthLabel, estimateGoalNextYear } from "../lib/finance.js";
import { FISCAL_YEAR_START } from "../constants/config.js";
import { FISCAL_WEEKS_PER_YEAR, formatFiscalWeekLabel, getFiscalWeekNumber } from "../lib/fiscalWeek.js";
import { deriveRollingTimelineMonths, progressiveScale } from "../lib/rollingTimeline.js";
import { formatRotationDisplay } from "../lib/rotation.js";
import { FlowSparklineCard, MetricCard, SmBtn, iS, lS, ScrollSnapRow } from "./ui.jsx";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_SUBDIVISIONS = 4;
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
  onLocalSignOut,
  weeklyIncome,
  adjustedTakeHome,
  remainingSpend,
  goals = [],
  setGoals,
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
}) {
  const avgWeeklySpend = remainingSpend?.avgWeeklySpend ?? 0;
  const monthlyExpenses = avgWeeklySpend * (FISCAL_WEEKS_PER_YEAR / 12);
  const monthlyTakehome = (adjustedTakeHome ?? (weeklyIncome * FISCAL_WEEKS_PER_YEAR)) / 12;
  const projectedWeeklyLeft = (futureWeekNets?.[0] ?? weeklyIncome) - avgWeeklySpend;
  const finalizedWeekNet = prevWeekNet ?? weeklyIncome;
  const leftThisWeek = finalizedWeekNet - avgWeeklySpend;
  const avgWeeklySurplus = weeklyIncome - avgWeeklySpend;
  const annualSavings = avgWeeklySurplus * 52 - fundedGoalSpend;
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  const nextWeekNet = futureWeekNets?.[0] ?? null;
  const fallbackSource = nextWeekNet != null ? null : (prevWeekNet != null ? "prev" : "avg");
  const fallbackNet = fallbackSource === "prev" ? prevWeekNet : weeklyIncome;
  const nextWeekDisplay = nextWeekNet ?? fallbackNet;

  const completedGoals = goals.filter((g) => g.completed);
  const totalGoalTarget = goals.reduce((s, g) => s + g.target, 0);
  const completedGoalValue = completedGoals.reduce((s, g) => s + g.target, 0);
  const topGoal = goals.find((g) => !g.completed)?.label?.toLowerCase() ?? "financial";

  const flowScore = Math.min(
    100,
    Math.round(
      Math.max(
        0,
        (1 - spendRatio) * 55
          + (projectedWeeklyLeft > 0 ? 25 : 10)
          + (goals.length ? (completedGoals.length / goals.length) * 20 : 0),
      ),
    ),
  );

  const flowTrendSource = [projectedWeeklyLeft, ...(futureWeekNets || []).slice(0, 5)].filter((v) => v != null);
  const flowTrendPoints = (
    flowTrendSource.length > 1
      ? flowTrendSource
      : [projectedWeeklyLeft, weeklyIncome * 0.92, weeklyIncome * 0.98, weeklyIncome * 1.04, weeklyIncome * 1.09, weeklyIncome * 1.12]
  ).map((amount) => {
    const base = Math.max(1, weeklyIncome || 1);
    return Math.max(5, Math.min(98, Math.round(50 + ((amount - base * 0.9) / (base * 0.9)) * 22)));
  });

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
  const subtitle = weekdayName && dayOrdinal
    ? `Another beautiful day, ${weekdayName} the ${dayOrdinal}. You are working on your ${topGoal} goal`
    : weekNumber != null && currentWeek
      ? `Week ${weekNumber}, ${weeksLeftCount} left · ${formatRotationDisplay(currentWeek, { isAdmin })}`
      : "2026 Dashboard";

  // ── Pulse insight signals ───────────────────────────────────────────────
  // Each signal is derived from real computed data. Returns undefined when
  // no meaningful signal exists so InsightRow simply doesn't render.
  // Rule: signal-blue = directional trend; signal-purple = warning / AI moment.

  const pulseLeftThisWeek = (() => {
    if (!weeklyIncome) return undefined;
    // Prefer forward-looking delta when next week projection is available
    if (nextWeekNet != null) {
      const nextLeft = nextWeekNet - avgWeeklySpend;
      const diff = Math.round(nextLeft - leftThisWeek);
      if (Math.abs(diff) >= 20) {
        return {
          arrow: diff > 0 ? "up" : "down",
          delta: `${diff > 0 ? "+" : ""}${fmt$(diff)}`,
          label: "next week vs this",
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
    const rate = annualSavings / (weeklyIncome * 52);
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
      return { arrow: "flat", delta: null, label: "on avg weekly pace", variant: "blue" };
    return {
      arrow:   diff > 0 ? "up" : "down",
      delta:   `${pct}%`,
      label:   `vs avg (${diff > 0 ? "+" : ""}${fmt$(Math.round(diff))})`,
      variant: diff > 0 ? "blue" : "purple",
    };
  })() : undefined;

  const tiles = [
    {
      title: "Next Week Takehome",
      value: nextWeekDisplay != null ? fmt$(nextWeekDisplay) : fmt$(weeklyIncome),
      rawVal: nextWeekDisplay ?? weeklyIncome,
      sub: nextWeekNet != null
        ? (nextWeekNet < weeklyIncome * 0.8 ? "est. · below avg · check log"
          : nextWeekNet < weeklyIncome * 0.95 ? "est. · slightly below avg"
            : "est. · on track")
        : `${fallbackSource === "prev" ? "last confirmed pay" : "projected average"} (projected)`,
      status: nextWeekDisplay != null
        ? (nextWeekDisplay >= weeklyIncome * 0.95 ? "green"
          : nextWeekDisplay >= weeklyIncome * 0.8 ? "gold" : "red")
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
      sub: weekNumber != null ? `projected annual savings · Wk ${weekNumber}` : "projected annual savings",
      status: annualSavings > 5000 ? "green" : annualSavings >= 0 ? "gold" : "red",
      span: 2,
      onClick: () => navigate("income"),
      key: "income",
      insight: pulseNetWorth,
    },
    {
      title: "Budget Health",
      value: fmtPct(spendRatio),
      sub: `${fmt$(monthlyExpenses)}/mo expenses · ${fmt$(monthlyTakehome)}/mo take-home`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "gold" : "red",
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
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [draggingReorderId, setDraggingReorderId] = useState(null);
  const [dragOverReorderId, setDragOverReorderId] = useState(null);
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
  );

  const timelineBounds = (() => {
    if (!futureWeeks?.length) return null;
    const validWeeks = futureWeeks
      .map((week) => ({ start: safeDate(week?.weekStart), end: safeDate(week?.weekEnd) }))
      .filter((week) => week.start && week.end && week.end > week.start);
    if (!validWeeks.length) return null;
    const startMs = Math.min(...validWeeks.map((week) => week.start.getTime()));
    const rawEndMs = Math.max(...validWeeks.map((week) => week.end.getTime())) + DAY_MS;
    const endMs = rawEndMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    return { startMs, endMs, spanMs: endMs - startMs };
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
        const blockWidthPct = widthPct / MONTH_SUBDIVISIONS;
        segments.push({
          key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
          label: fiscalMonthLabel(monthStart).toUpperCase(),
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
  })();

  const rollingGoalTimeline = deriveRollingTimelineMonths(timelineMonthSegments, today, 0);
  const visibleTimelineSegments = rollingGoalTimeline.visibleMonths;
  const goalTimelineScale = progressiveScale(rollingGoalTimeline.scaleProgress, 0.15);
  const lastGoalEW = tl.length ? Math.max(...tl.map((g) => (Number.isFinite(g.eW) ? g.eW : 0))) : 0;

  useEffect(() => {
    if (!currentWeek || !setGoals) return;
    const needsUpdate = tl.filter((g) => g.eW !== null && !g.dueWeek);
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

  const fiscalWeekLabel = formatFiscalWeekLabel(fiscalWeekInfo);
  const nowIdx = currentWeek ? getFiscalWeekNumber(currentWeek.idx) : 1;
  const weeksLeft = futureWeeks?.length ?? Math.max(FISCAL_WEEKS_PER_YEAR - nowIdx, 0);
  const totalActiveGoals = activeGoals.reduce((s, g) => s + (Number(g.target) || 0), 0);

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
    const finishDate = finishIdx != null ? futureWeeks[finishIdx]?.weekEnd : null;
    const dateLabel = formatGoalFinishDate(finishDate);
    return dateLabel ? `By ${dateLabel}, week ${weekNum}` : `Week ${weekNum}`;
  };
  const resolveGoalFinishLabel = (goal) => {
    const primary = Number.isFinite(goal.eW) ? buildGoalFinishLabel(goal.eW) : null;
    if (primary) return primary;
    // Goal can't complete this fiscal year — project into next year using proper surplus math
    if (config) {
      const nextYr = estimateGoalNextYear(goal.remainingAtEnd ?? goal.target, config, expenses);
      if (nextYr) return `~${nextYr.label}`;
    }
    // Fallback when config unavailable
    const startOffset = Number.isFinite(goal.sW) ? goal.sW : 0;
    const duration = Number.isFinite(goal.wN) ? goal.wN : null;
    if (!Number.isFinite(duration)) return "Timeline pending";
    return buildGoalFinishLabel(startOffset + duration) ?? "Timeline pending";
  };

  const startEditGoal = (g) => { setEditGoalId(g.id); setEditGoalVals({ label: g.label, target: g.target, note: g.note }); };
  const saveEditGoal = (id) => {
    if (!setGoals) return;
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...editGoalVals, target: parseFloat(editGoalVals.target) || 0 } : g)));
    setEditGoalId(null);
  };
  const addGoal = () => {
    if (!setGoals) return;
    setGoals((prev) => [...prev, {
      id: `g_${Date.now()}`,
      label: newGoal.label,
      target: parseFloat(newGoal.target) || 0,
      color: GOAL_SYSTEM_COLOR,
      note: newGoal.note,
      completed: false,
    }]);
    setAddingGoal(false);
    setNewGoal({ label: "", target: "", note: "" });
  };
  const deleteGoal = (id) => {
    if (!setGoals) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setDelGoalId(null);
  };
  const toggleComplete = (id) => setGoals?.((prev) => prev.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g)));
  const handleMarkDone = (id) => {
    setCelebrating(id);
    setTimeout(() => {
      setGoals?.((prev) => prev.map((g) => (g.id === id ? { ...g, completed: true, completedAt: new Date().toISOString() } : g)));
      setCelebrating(null);
      setShowCompleted(true);
    }, 900);
  };
  const moveGoal = (id, dir) => {
    setGoals?.((prev) => {
      const idx = prev.findIndex((g) => g.id === id);
      if (idx === -1) return prev;
      const arr = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= arr.length) return prev;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return arr;
    });
  };
  const moveGoalInActiveList = (id, dir) => {
    const idx = activeGoals.findIndex((g) => g.id === id);
    if (idx === -1) return;
    const next = idx + dir;
    if (next < 0 || next >= activeGoals.length) return;
    moveGoal(id, dir);
  };
  const reorderGoalByDrag = (draggedId, overId, insertIndexOverride = null) => {
    setGoals?.((prev) => {
      const active = prev.filter((g) => !g.completed);
      const completed = prev.filter((g) => g.completed);
      const dragged = active.find((g) => g.id === draggedId);
      if (!dragged) return prev;
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
      return [...reordered, ...completed];
    });
  };
  const canShowReorder = activeGoals.length > 1 && typeof moveGoal === "function" && typeof reorderGoalByDrag === "function";
  const closeReorderModal = () => {
    setShowReorderModal(false);
    setDraggingReorderId(null);
    setDragOverReorderId(null);
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
      <div style={{ marginBottom: "28px", textAlign: "center", padding: "6px 0" }}>
        <div style={{ fontSize: "9px", letterSpacing: "4px", textTransform: "uppercase", color: "var(--color-text-disabled)", marginBottom: "12px" }}>
          Authority Finance
        </div>
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
        {typeof onLocalSignOut === "function" && (
          <button
            onClick={onLocalSignOut}
            style={{ marginTop: "14px", padding: "9px 14px", background: "transparent", border: "1px solid rgba(224,92,92,0.3)", borderRadius: "12px", color: "var(--color-red)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "700", cursor: "pointer" }}
          >
            Sign Out
          </button>
        )}
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

      <FlowSparklineCard
        label="Flow Score"
        score={flowScore}
        points={flowTrendPoints}
        trendLabel={`Projected pace · ${flowTrendPoints.length} checkpoints`}
      />

      <div id="home-goals-section" style={{ marginTop: "28px" }}>
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
          <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, var(--color-accent-primary), transparent)", marginBottom: "20px", opacity: 0.35 }} />
          <div style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.5px", lineHeight: 1, marginBottom: "6px" }}>Goals</div>
          <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
            {activeGoals.length > 0 ? `${activeGoals.length} active · track your targets` : "Start your first goal"}
          </div>
        </div>
        {currentWeek && (
          <div style={{ background: "rgba(0,200,150,0.09)", border: "1px solid rgba(0,200,150,0.32)", borderRadius: "6px", padding: "8px 12px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-green)" }}>{fiscalWeekLabel}</div>
            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>{formatRotationDisplay(currentWeek, { isAdmin })} · ends {safeDate(currentWeek.weekEnd)?.toLocaleDateString("en-US")}</div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: "12px", marginBottom: "20px" }}>
          <MetricCard label="Left This Week" val={fmt$(leftThisWeek)} rawVal={leftThisWeek} status={leftThisWeek >= 0 ? "green" : "red"} />
          <MetricCard label="Active Goals Total" val={fmt$(totalActiveGoals)} rawVal={totalActiveGoals} status="gold" />
          <MetricCard label="Weeks to Complete All" val={`~${Math.ceil(lastGoalEW)} wks`} status={lastGoalEW <= weeksLeft ? "green" : "red"} />
          <MetricCard
            label="Goals"
            val={`${completedGoals.length}/${goals.length}`}
            sub={completedGoals.length > 0
              ? `${fmt$(completedGoalValue)} of ${fmt$(totalGoalTarget)} funded`
              : `${fmt$(totalGoalTarget)} total target`}
            status={goals.length > 0 && completedGoals.length === goals.length ? "green" : "gold"}
            insight={pulseGoals}
          />
        </div>

        <div style={{ marginBottom: "16px", padding: "12px 0", borderRadius: "10px", border: "1px solid #222", background: "rgba(16,16,16,0.55)", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: tl.length ? "10px" : "0", padding: "0 12px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-gold)" }}>Active Goals</div>
            <div style={{ fontSize: "10px", color: "#666" }}>{tl.length}</div>
          </div>
          {!tl.length && <div style={{ border: "1px dashed #333", borderRadius: "8px", padding: "10px 12px", fontSize: "10px", color: "#666", letterSpacing: "1px", textTransform: "uppercase", margin: "0 12px" }}>No active goals yet</div>}
          {isMobile ? (
            <ScrollSnapRow itemWidth="calc(100% - 40px)">
              {tl.map((g, i) => {
                const isEditing = editGoalId === g.id;
                const projectedWeeks = Number.isFinite(g.eW) ? Math.max(0, Math.ceil(g.eW)) : 0;
                const fillWidthPct = clamp01(projectedWeeks / Math.max(weeksLeft, 1)) * 100;
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
                            <div style={{ fontSize: "10px", color: !Number.isFinite(g.eW) ? "var(--color-warning)" : (g.eW <= weeksLeft ? "var(--color-green)" : "var(--color-red)") }}>{resolveGoalFinishLabel(g)}</div>
                            {!Number.isFinite(g.eW) && <div style={{ fontSize: "9px", color: "var(--color-warning)", background: "rgba(245,158,11,0.12)", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px", display: "inline-block" }}>NEXT YR EST</div>}
                            {g.dueWeek && nowIdx > g.dueWeek && <div style={{ fontSize: "9px", color: "var(--color-red)", background: "#2d1a1a", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px" }}>PAST DUE · Wk {g.dueWeek}</div>}
                          </div>
                        </div>
                        <div style={{ height: `${Math.round(16 * goalTimelineScale)}px`, borderRadius: "6px", border: "1px solid #232323", background: "#111", position: "relative", overflow: "hidden", marginBottom: "8px" }}>
                          {visibleTimelineSegments.map((seg) => (
                            <div key={seg.key} style={{ position: "absolute", top: 0, left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, height: "100%", borderLeft: "1px solid #232323", opacity: seg.key < today.slice(0, 7) ? 0.28 : 0.72 }}>
                              {seg.subdivisions.map((sub) => (
                                <div key={`${seg.key}-${sub.key}`} style={{ position: "absolute", top: "1px", bottom: "1px", left: `${sub.leftPct - seg.leftPct}%`, width: `${sub.widthPct}%`, borderRight: sub.key < MONTH_SUBDIVISIONS - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }} />
                              ))}
                            </div>
                          ))}
                          <div style={{ position: "absolute", top: "2px", left: 0, width: `${Math.max(fillWidthPct, celebrating === g.id ? 100 : 0)}%`, height: "calc(100% - 4px)", borderRadius: "3px", background: celebrating === g.id ? "var(--color-green)" : GOAL_SYSTEM_COLOR }} />
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
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px" }}><span>Wk {nowIdx}</span><span>Wk 52</span></div>
                        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                          {isAdmin && (
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                              <span style={{ color: GOAL_SYSTEM_COLOR }}>{f2(g.wN > 0 ? g.target / g.wN : 0)}/wk projected</span>
                              {" · "}{Number.isFinite(g.wN) ? g.wN.toFixed(1) : "0.0"} weeks to fund
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            {canShowReorder && (
                              <SmBtn onClick={() => setShowReorderModal(true)} c="var(--color-text-secondary)" style={{ flex: 1 }}>
                                ⠿ REORDER
                              </SmBtn>
                            )}
                            <SmBtn onClick={() => startEditGoal(g)} c="var(--color-gold)" style={{ flex: 1 }}>EDIT</SmBtn>
                            <SmBtn onClick={() => handleMarkDone(g.id)} c="var(--color-green)" style={{ flex: 1 }}>✓ DONE</SmBtn>
                            {delGoalId === g.id ? (
                              <>
                                <SmBtn onClick={() => deleteGoal(g.id)} c="var(--color-red)" style={{ flex: 1 }}>DEL</SmBtn>
                                <SmBtn onClick={() => setDelGoalId(null)} style={{ flex: 1 }}>NO</SmBtn>
                              </>
                            ) : <SmBtn onClick={() => setDelGoalId(g.id)} c="var(--color-red)" style={{ flex: 1 }}>✕</SmBtn>}
                          </div>
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
                const projectedWeeks = Number.isFinite(g.eW) ? Math.max(0, Math.ceil(g.eW)) : 0;
                const fillWidthPct = clamp01(projectedWeeks / Math.max(weeksLeft, 1)) * 100;
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
                            <div style={{ fontSize: "10px", color: !Number.isFinite(g.eW) ? "var(--color-warning)" : (g.eW <= weeksLeft ? "var(--color-green)" : "var(--color-red)") }}>{resolveGoalFinishLabel(g)}</div>
                            {!Number.isFinite(g.eW) && <div style={{ fontSize: "9px", color: "var(--color-warning)", background: "rgba(245,158,11,0.12)", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px", display: "inline-block" }}>NEXT YR EST</div>}
                            {g.dueWeek && nowIdx > g.dueWeek && <div style={{ fontSize: "9px", color: "var(--color-red)", background: "#2d1a1a", padding: "2px 6px", borderRadius: "12px", marginTop: "3px", letterSpacing: "1px" }}>PAST DUE · Wk {g.dueWeek}</div>}
                          </div>
                        </div>
                        <div style={{ height: `${Math.round(16 * goalTimelineScale)}px`, borderRadius: "6px", border: "1px solid #232323", background: "#111", position: "relative", overflow: "hidden", marginBottom: "8px" }}>
                          {visibleTimelineSegments.map((seg) => (
                            <div key={seg.key} style={{ position: "absolute", top: 0, left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, height: "100%", borderLeft: "1px solid #232323", opacity: seg.key < today.slice(0, 7) ? 0.28 : 0.72 }}>
                              {seg.subdivisions.map((sub) => (
                                <div key={`${seg.key}-${sub.key}`} style={{ position: "absolute", top: "1px", bottom: "1px", left: `${sub.leftPct - seg.leftPct}%`, width: `${sub.widthPct}%`, borderRight: sub.key < MONTH_SUBDIVISIONS - 1 ? "1px solid rgba(255,255,255,0.07)" : "none" }} />
                              ))}
                            </div>
                          ))}
                          <div style={{ position: "absolute", top: "2px", left: 0, width: `${Math.max(fillWidthPct, celebrating === g.id ? 100 : 0)}%`, height: "calc(100% - 4px)", borderRadius: "3px", background: celebrating === g.id ? "var(--color-green)" : GOAL_SYSTEM_COLOR }} />
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
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-text-disabled)", marginBottom: "10px" }}><span>Wk {nowIdx}</span><span>Wk 52</span></div>
                        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: "10px" }}>
                          {isAdmin && (
                            <div style={{ fontSize: "10px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                              <span style={{ color: GOAL_SYSTEM_COLOR }}>{f2(g.wN > 0 ? g.target / g.wN : 0)}/wk projected</span>
                              {" · "}{Number.isFinite(g.wN) ? g.wN.toFixed(1) : "0.0"} weeks to fund
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            {canShowReorder && (
                              <SmBtn onClick={() => setShowReorderModal(true)} c="var(--color-text-secondary)" style={{ flex: 1 }}>
                                ⠿ REORDER
                              </SmBtn>
                            )}
                            <SmBtn onClick={() => startEditGoal(g)} c="var(--color-gold)" style={{ flex: 1 }}>EDIT</SmBtn>
                            <SmBtn onClick={() => handleMarkDone(g.id)} c="var(--color-green)" style={{ flex: 1 }}>✓ DONE</SmBtn>
                            {delGoalId === g.id ? (
                              <>
                                <SmBtn onClick={() => deleteGoal(g.id)} c="var(--color-red)" style={{ flex: 1 }}>DEL</SmBtn>
                                <SmBtn onClick={() => setDelGoalId(null)} style={{ flex: 1 }}>NO</SmBtn>
                              </>
                            ) : <SmBtn onClick={() => setDelGoalId(g.id)} c="var(--color-red)" style={{ flex: 1 }}>✕</SmBtn>}
                          </div>
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
        {showReorderModal && (
          <div
            onClick={closeReorderModal}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              background: "rgba(0,0,0,0.82)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: "480px",
                background: "var(--color-bg-surface)",
                borderRadius: "20px",
                padding: "20px",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexShrink: 0 }}>
                <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-gold)" }}>
                  REORDER GOALS
                </div>
                <button
                  onClick={closeReorderModal}
                  style={{ background: "none", border: "none", color: "var(--color-text-primary)", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "16px", flexShrink: 0 }}>
                {isCoarsePointer ? "Use ↑ ↓ to move each goal." : "Drag goals to reorder."}
              </div>
              {/* Vertical card list */}
              <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeGoals.map((g, i) => {
                  const isDragging = draggingReorderId === g.id;
                  const isDropTarget = dragOverReorderId === g.id && draggingReorderId !== g.id;
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
                        height: "72px",
                        background: "var(--color-bg-raised)",
                        border: `1px solid ${isDropTarget ? "var(--color-accent-primary)" : "var(--color-border-subtle)"}`,
                        borderRadius: "12px",
                        padding: "0 14px",
                        position: "relative",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        cursor: isCoarsePointer ? "default" : "grab",
                        opacity: isDragging ? 0.4 : 1,
                        flexShrink: 0,
                        transition: "border-color 120ms, opacity 120ms",
                      }}
                    >
                      {/* Ghost ordinal */}
                      <div style={{
                        fontSize: "56px",
                        fontWeight: 900,
                        fontFamily: "var(--font-display)",
                        color: "rgba(255,255,255,0.06)",
                        position: "absolute",
                        top: "-6px",
                        right: "10px",
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
                        width: "18px",
                        textAlign: "center",
                        flexShrink: 0,
                        zIndex: 1,
                      }}>
                        {i + 1}
                      </div>
                      {/* Label + target */}
                      <div style={{ flex: 1, zIndex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {g.label}
                        </div>
                        <div style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                          marginTop: "2px",
                        }}>
                          ${Number(g.target || 0).toLocaleString()}
                        </div>
                      </div>
                      {/* Touch: inline ↑ ↓ per card */}
                      {isCoarsePointer && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", zIndex: 1, flexShrink: 0 }}>
                          <button
                            onClick={() => moveGoalInActiveList(g.id, -1)}
                            disabled={i === 0}
                            style={{
                              background: "none",
                              border: `1px solid ${i === 0 ? "var(--color-border-subtle)" : "var(--color-border-accent)"}`,
                              color: i === 0 ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              borderRadius: "6px",
                              width: "30px",
                              height: "26px",
                              cursor: i === 0 ? "default" : "pointer",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >↑</button>
                          <button
                            onClick={() => moveGoalInActiveList(g.id, 1)}
                            disabled={i === activeGoals.length - 1}
                            style={{
                              background: "none",
                              border: `1px solid ${i === activeGoals.length - 1 ? "var(--color-border-subtle)" : "var(--color-border-accent)"}`,
                              color: i === activeGoals.length - 1 ? "var(--color-text-disabled)" : "var(--color-text-primary)",
                              borderRadius: "6px",
                              width: "30px",
                              height: "26px",
                              cursor: i === activeGoals.length - 1 ? "default" : "pointer",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >↓</button>
                        </div>
                      )}
                      {/* Desktop: drag handle */}
                      {!isCoarsePointer && (
                        <div style={{
                          fontSize: "18px",
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
            </div>
          </div>
        )}

        {addingGoal ? (
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
        ) : <button onClick={() => setAddingGoal(true)} style={{ background: "var(--color-bg-surface)", color: "var(--color-gold)", border: "1px solid rgba(0,200,150,0.22)", borderRadius: "6px", padding: "10px", width: "100%", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", marginBottom: "16px" }}>+ ADD GOAL</button>}

        {completedGoals.length > 0 && (
          <div style={{ marginTop: "8px", border: "1px solid #1e1e1e", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
            <button onClick={() => setShowCompleted((v) => !v)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111", border: "none", padding: "12px 16px", cursor: "pointer" }}>
              <span style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>Funded History ({completedGoals.length})</span>
              <span style={{ fontSize: "11px", color: "#666" }}>{showCompleted ? "Hide" : "Show"}</span>
            </button>
            {showCompleted && completedGoals.map((g) => (
              <div key={g.id} style={{ borderTop: "1px solid #1a1a1a", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "#777", textDecoration: "line-through" }}>{g.label}</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ color: "#666" }}>{fmt$(g.target)}</div>
                  <SmBtn onClick={() => toggleComplete(g.id)} c="#555">UNDO</SmBtn>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "12px", padding: "20px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, var(--color-accent-primary), transparent)", opacity: 0.5 }} />
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-text-disabled)", marginBottom: "4px" }}>Fiscal Year 2026</div>
            <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px" }}>Year-End Outlook</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Weeks remaining</div>
              <div style={{ fontSize: "15px", fontWeight: 700, fontFamily: "var(--font-display)" }}>{weeksLeft}</div>
            </div>
            <div style={{ height: "1px", background: "var(--color-border-subtle)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Funded goals (absorbed)</div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-red)" }}>-{fmt$(fundedGoalSpend)}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Adj. projected savings</div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-green)" }}>{fmt$(annualSavings)}</div>
            </div>
            <div style={{ height: "1px", background: "var(--color-border-subtle)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Surplus after all goals</div>
              <div style={{ fontSize: "19px", fontWeight: 800, fontFamily: "var(--font-display)", color: annualSavings - totalActiveGoals >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                {fmt$(annualSavings - totalActiveGoals)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
