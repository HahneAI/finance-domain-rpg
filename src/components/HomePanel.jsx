import { FlowSparklineCard, MetricCard } from "./ui.jsx";
import { FISCAL_WEEKS_PER_YEAR, getFiscalWeekNumber } from "../lib/fiscalWeek.js";

const fmt$ = (n) => {
  if (n == null || isNaN(n)) return "$—";
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
  goals,
  futureWeekNets,
  prevWeekNet,
  currentWeek,
  today,
}) {
  const avgWeeklySpend = remainingSpend?.avgWeeklySpend ?? 0;
  const incomingWeekNet = futureWeekNets?.[0] ?? weeklyIncome;
  const weeklyLeft = incomingWeekNet - avgWeeklySpend;
  const annualSavings = weeklyLeft * 52;
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  const nextWeekNet = futureWeekNets?.[0] ?? null;
  const fallbackSource = nextWeekNet != null ? null : (prevWeekNet != null ? "prev" : "avg");
  const fallbackNet = fallbackSource === "prev" ? prevWeekNet : weeklyIncome;
  const nextWeekDisplay = nextWeekNet ?? fallbackNet;
  const flowScore = Math.min(100, Math.round(Math.max(0, (1 - spendRatio) * 55 + (weeklyLeft > 0 ? 25 : 10) + (goals.length ? (goals.filter(g => g.completed).length / goals.length) * 20 : 0))));
  const flowTrendSource = [weeklyLeft, ...(futureWeekNets || []).slice(0, 5)].filter((v) => v != null);
  const flowTrendPoints = (flowTrendSource.length > 1 ? flowTrendSource : [weeklyLeft, weeklyIncome * 0.92, weeklyIncome * 0.98, weeklyIncome * 1.04, weeklyIncome * 1.09, weeklyIncome * 1.12])
    .map((amount) => {
      const base = Math.max(1, weeklyIncome || 1);
      return Math.max(5, Math.min(98, Math.round(50 + ((amount - base * 0.9) / (base * 0.9)) * 22)));
    });

  const completedGoals = goals.filter(g => g.completed);
  const totalGoalTarget = goals.reduce((s, g) => s + g.target, 0);
  const completedGoalValue = completedGoals.reduce((s, g) => s + g.target, 0);

  // Subtitle: "Another beautiful day, {Weekday} the {Nth}. You are working on your {goal} goal"
  const topGoal = goals.find(g => !g.completed)?.label?.toLowerCase() ?? "financial";
  const todayDate = today ? new Date(today + "T12:00:00") : null;
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
    : weekNumber != null ? `Week ${weekNumber}, ${weeksLeftCount} left · ${currentWeek.rotation}` : "2026 Dashboard";

  // ── Tile definitions in display order ──
  // rawVal: raw number passed to MetricCard for countup + flash ($ tiles only)
  const tiles = [
    {
      title: "Weekly Left",
      value: fmt$(weeklyLeft),
      rawVal: weeklyLeft,
      sub: "next paycheck after avg spend",
      status: weeklyLeft > 100 ? "green" : weeklyLeft >= 0 ? "gold" : "red",
      span: 2,
      key: "budget",
    },
    {
      title: "Net Worth Trend",
      value: fmt$(annualSavings),
      rawVal: annualSavings,
      sub: "projected annual savings",
      status: annualSavings > 5000 ? "green" : annualSavings >= 0 ? "gold" : "red",
      span: 1,
      key: "income",
    },
    {
      title: "Goals",
      value: `${completedGoals.length}/${goals.length}`,
      // no rawVal — fraction string, not a $ value
      sub: completedGoals.length > 0
        ? `${fmt$(completedGoalValue)} of ${fmt$(totalGoalTarget)} funded`
        : `${fmt$(totalGoalTarget)} total target`,
      status: goals.length > 0 && completedGoals.length === goals.length ? "green"
            : completedGoals.length > 0 ? "gold" : "gold",
      span: 1,
      key: "budget",
    },
    {
      title: "Budget Health",
      value: fmtPct(spendRatio),
      // no rawVal — percent, not a dollar countup
      sub: `${fmt$(avgWeeklySpend)}/wk spend · ${fmt$(weeklyIncome)}/wk income`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "gold" : "red",
      span: 2,
      key: "budget",
    },
    {
      title: "Next Week Takehome",
      value: nextWeekDisplay != null ? fmt$(nextWeekDisplay) : fmt$(weeklyIncome),
      rawVal: nextWeekDisplay ?? weeklyIncome,
      sub: nextWeekNet != null
        ? (nextWeekNet < weeklyIncome * 0.80 ? "below avg · check log"
          : nextWeekNet < weeklyIncome * 0.95 ? "slightly below avg"
          : "on track")
        : `${fallbackSource === "prev" ? "last confirmed pay" : "projected average"} (projected)`,
      status: nextWeekDisplay != null
            ? (nextWeekDisplay >= weeklyIncome * 0.95 ? "green"
              : nextWeekDisplay >= weeklyIncome * 0.80 ? "gold" : "red")
            : "green",
      span: 2,
      key: "log",
    },
  ];

  return (
    <div style={{ paddingBottom: "8px" }}>
      {goals.length === 0 && (
        <div style={{
          marginBottom: "14px",
          padding: "12px 14px",
          background: "rgba(0,200,150,0.07)",
          border: "1px solid rgba(0,200,150,0.18)",
          borderRadius: "10px",
          fontSize: "12px",
          color: "var(--color-text-secondary)",
        }}>
          No active goals yet. Add your first goal in Budget to unlock timeline forecasting.
        </div>
      )}
      {/* Section header */}
      <div style={{ marginBottom: "18px", textAlign: "center" }}>
        <div style={{
          fontSize: "10px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: "var(--color-gold)",
          marginBottom: "4px",
        }}>
          Financial Health
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", letterSpacing: "0.8px", lineHeight: 1.6 }}>
          {subtitle}
        </div>
      </div>

      {/* 2-column tile grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
      }}>
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
          />
        ))}
      </div>

      {/* Flow Score — placeholder, revisit later */}
      <FlowSparklineCard
        label="Flow Score"
        score={flowScore}
        points={flowTrendPoints}
        trendLabel={`Projected pace · ${flowTrendPoints.length} checkpoints`}
      />
    </div>
  );
}
