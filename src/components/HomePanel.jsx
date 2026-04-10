import { FlowSparklineCard, MetricCard } from "./ui.jsx";
import { FISCAL_WEEKS_PER_YEAR, getFiscalWeekNumber } from "../lib/fiscalWeek.js";
import { formatRotationDisplay } from "../lib/rotation.js";

const fmt$ = (n) => {
  if (n == null || Number.isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}$${s}`;
};

const fmtPct = (n) => `${Math.round(n * 100)}%`;

export function HomePanel({
  navigate,
  weeklyIncome,
  adjustedTakeHome,
  remainingSpend,
  goals = [],
  futureWeekNets = [],
  prevWeekNet,
  currentWeek,
  today,
  fundedGoalSpend = 0,
  isAdmin = false,
}) {
  const avgWeeklySpend = remainingSpend?.avgWeeklySpend ?? 0;
  const incomingWeekNet = futureWeekNets?.[0] ?? weeklyIncome;
  const monthlyExpenses = avgWeeklySpend * (FISCAL_WEEKS_PER_YEAR / 12);
  const monthlyTakehome = (adjustedTakeHome ?? (weeklyIncome * FISCAL_WEEKS_PER_YEAR)) / 12;
  const projectedWeeklyLeft = incomingWeekNet - avgWeeklySpend;
  const finalizedWeekNet = prevWeekNet ?? weeklyIncome;
  const leftThisWeek = finalizedWeekNet - avgWeeklySpend;
  const avgWeeklySurplus = weeklyIncome - avgWeeklySpend;
  const annualSavings = avgWeeklySurplus * 52 - fundedGoalSpend;
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  const nextWeekNet = futureWeekNets?.[0] ?? null;
  const fallbackSource = nextWeekNet != null ? null : (prevWeekNet != null ? "prev" : "avg");
  const fallbackNet = fallbackSource === "prev" ? prevWeekNet : weeklyIncome;
  const nextWeekDisplay = nextWeekNet ?? fallbackNet;
  const flowScore = Math.min(
    100,
    Math.round(
      Math.max(
        0,
        (1 - spendRatio) * 55
          + (projectedWeeklyLeft > 0 ? 25 : 10)
          + (goals.length ? (goals.filter((g) => g.completed).length / goals.length) * 20 : 0),
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
      title: "Left This Week",
      value: fmt$(leftThisWeek),
      rawVal: leftThisWeek,
      sub: "last finalized paycheck after avg spend",
      status: leftThisWeek > 100 ? "green" : leftThisWeek >= 0 ? "gold" : "red",
      span: 2,
      key: "budget",
      insight: pulseLeftThisWeek,
    },
    {
      title: "Net Worth Trend",
      value: fmt$(annualSavings),
      rawVal: annualSavings,
      sub: "projected annual savings",
      status: annualSavings > 5000 ? "green" : annualSavings >= 0 ? "gold" : "red",
      span: 1,
      key: "income",
      insight: pulseNetWorth,
    },
    {
      title: "Goals",
      value: `${completedGoals.length}/${goals.length}`,
      sub: completedGoals.length > 0
        ? `${fmt$(completedGoalValue)} of ${fmt$(totalGoalTarget)} funded`
        : `${fmt$(totalGoalTarget)} total target`,
      status: goals.length > 0 && completedGoals.length === goals.length ? "green" : "gold",
      span: 1,
      key: "budget",
      insight: pulseGoals,
    },
    {
      title: "Budget Health",
      value: fmtPct(spendRatio),
      sub: `${fmt$(monthlyExpenses)}/mo expenses · ${fmt$(monthlyTakehome)}/mo take-home`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "gold" : "red",
      span: 2,
      key: "budget",
      insight: pulseBudgetHealth,
    },
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
      key: "log",
      insight: pulseNextWeek,
    },
  ];

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
          No active goals yet. Add your first goal in Budget to unlock timeline forecasting.
        </div>
      )}
      <div style={{ marginBottom: "18px", textAlign: "center" }}>
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--color-gold)",
            marginBottom: "4px",
          }}
        >
          Financial Health
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", letterSpacing: "0.8px", lineHeight: 1.6 }}>
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
            onClick={() => navigate(tile.key)}
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
    </div>
  );
}
