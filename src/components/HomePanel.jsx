import { MetricCard } from "./ui.jsx";

const fmt$ = (n) => {
  if (n == null || isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}$${s}`;
};

const fmtPct = (n) => `${Math.round(n * 100)}%`;
const fmtDeltaPct = (n) => `${n > 0 ? "+" : ""}${Math.round(n)}%`;


export function HomePanel({
  navigate,
  weeklyIncome,
  adjustedTakeHome,
  adjustedWeeklyAvg,
  remainingSpend,
  goals,
  futureWeekNets,
  currentWeek,
  today,
}) {
  const avgWeeklySpend = remainingSpend?.avgWeeklySpend ?? 0;
  const annualSavings = adjustedWeeklyAvg * 52;
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  const nextWeekNet = futureWeekNets?.[0];

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
  const subtitle = weekdayName && dayOrdinal
    ? `${weekdayName} ${dayOrdinal} · tracking ${topGoal} performance`
    : currentWeek ? `Week ${currentWeek.idx} of 52 · ${currentWeek.rotation}` : "2026 Dashboard";

  const weeklyDeltaPct = weeklyIncome > 0 ? ((adjustedWeeklyAvg - weeklyIncome) / weeklyIncome) * 100 : 0;
  const projectedVsCurrent = (nextWeekNet ?? adjustedWeeklyAvg) - adjustedWeeklyAvg;
  const savingsRate = weeklyIncome > 0 ? (adjustedWeeklyAvg / weeklyIncome) * 100 : 0;

  // ── Tile definitions in display order ──
  // rawVal: raw number passed to MetricCard for countup + flash ($ tiles only)
  const tiles = [
    {
      title: "Weekly Left",
      value: fmt$(adjustedWeeklyAvg),
      rawVal: adjustedWeeklyAvg,
      sub: "after all expenses",
      status: adjustedWeeklyAvg > 100 ? "green" : adjustedWeeklyAvg >= 0 ? "gold" : "red",
      span: 2,
      key: "budget",
      trend: {
        dir: weeklyDeltaPct >= 0 ? "up" : "down",
        text: `${fmtDeltaPct(weeklyDeltaPct)} vs income baseline`,
      },
    },
    {
      title: "Net Worth Trend",
      value: fmt$(annualSavings),
      rawVal: annualSavings,
      sub: "projected annual savings",
      status: annualSavings > 5000 ? "green" : annualSavings >= 0 ? "gold" : "red",
      span: 1,
      key: "income",
      trend: {
        dir: annualSavings >= 0 ? "up" : "down",
        text: `${fmtDeltaPct(savingsRate)} savings rate signal`,
      },
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
      trend: {
        dir: completedGoals.length > 0 ? "up" : "flat",
        text: `${completedGoals.length} active completions`,
      },
    },
    {
      title: "Budget Health",
      value: fmtPct(spendRatio),
      // no rawVal — percent, not a dollar countup
      sub: `${fmt$(avgWeeklySpend)}/wk spend · ${fmt$(weeklyIncome)}/wk income`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "gold" : "red",
      span: 2,
      key: "budget",
      trend: {
        dir: spendRatio < 0.75 ? "up" : "down",
        text: `${fmtDeltaPct((1 - spendRatio) * 100)} efficiency margin`,
      },
    },
    {
      title: "Next Week",
      value: nextWeekNet != null ? fmt$(nextWeekNet) : fmt$(weeklyIncome),
      rawVal: nextWeekNet ?? weeklyIncome,
      sub: nextWeekNet != null
        ? (nextWeekNet < weeklyIncome * 0.80 ? "below avg · check log"
          : nextWeekNet < weeklyIncome * 0.95 ? "slightly below avg"
          : "on track")
        : "projected average",
      status: nextWeekNet == null ? "green"
            : nextWeekNet >= weeklyIncome * 0.95 ? "green"
            : nextWeekNet >= weeklyIncome * 0.80 ? "gold" : "red",
      span: 2,
      key: "log",
      trend: {
        dir: projectedVsCurrent >= 0 ? "up" : "down",
        text: `${fmt$(Math.abs(projectedVsCurrent))} ${projectedVsCurrent >= 0 ? "above" : "below"} current`,
      },
    },
  ];

  return (
    <div style={{ paddingBottom: "8px" }}>
      {goals.length === 0 && (
        <div style={{
          marginBottom: "14px",
          padding: "12px 14px",
          background: "rgba(91,140,255,0.12)",
          border: "1px solid rgba(91,140,255,0.3)",
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
          color: "var(--color-accent-secondary)",
          marginBottom: "4px",
        }}>
          Pulse Analytics
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", letterSpacing: "0.8px" }}>
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
            trend={tile.trend}
          />
        ))}
      </div>
    </div>
  );
}
