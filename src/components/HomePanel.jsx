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


export function HomePanel({
  navigate,
  weeklyIncome,
  adjustedTakeHome,
  adjustedWeeklyAvg,
  remainingSpend,
  goals,
  futureWeekNets,
  currentWeek,
}) {
  const weeklyTakeHome = adjustedTakeHome / 52;
  const avgWeeklySpend = remainingSpend?.avgWeeklySpend ?? 0;
  const annualSavings = adjustedWeeklyAvg * 52;
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  const nextWeekNet = futureWeekNets?.[0];

  const completedGoals = goals.filter(g => g.completed);
  const totalGoalTarget = goals.reduce((s, g) => s + g.target, 0);
  const completedGoalValue = completedGoals.reduce((s, g) => s + g.target, 0);

  const emergencyGoal = goals.find(g => g.label.toLowerCase().includes("emergency"));

  // ── Tile definitions in display order ──
  // rawVal: raw number passed to MetricCard for countup + flash ($ tiles only)
  const tiles = [
    {
      title: "Take Home",
      value: fmt$(weeklyTakeHome),
      rawVal: weeklyTakeHome,
      sub: "per week · all events applied",
      status: weeklyTakeHome > 0 ? "green" : "red",
      span: 2,
      key: "income",
    },
    {
      title: "Weekly Left",
      value: fmt$(adjustedWeeklyAvg),
      rawVal: adjustedWeeklyAvg,
      sub: "after all expenses",
      status: adjustedWeeklyAvg > 100 ? "green" : adjustedWeeklyAvg >= 0 ? "gold" : "red",
      span: 1,
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
      title: "Budget Health",
      value: fmtPct(spendRatio),
      // no rawVal — percent, not a dollar countup
      sub: `${fmt$(avgWeeklySpend)}/wk spend · ${fmt$(weeklyIncome)}/wk income`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "gold" : "red",
      span: 2,
      key: "budget",
    },
    {
      title: "Emergency Fund",
      value: emergencyGoal ? fmt$(emergencyGoal.target) : "—",
      rawVal: emergencyGoal?.target ?? null,
      sub: emergencyGoal
        ? (emergencyGoal.completed ? "funded ✓" : `target · ${emergencyGoal.label}`)
        : "no emergency goal set",
      status: emergencyGoal?.completed ? "green" : emergencyGoal ? "gold" : "red",
      span: 1,
      key: "budget",
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
    },
  ];

  return (
    <div style={{ paddingBottom: "8px" }}>
      {/* Section header */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{
          fontSize: "10px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          color: "var(--color-gold)",
          marginBottom: "4px",
        }}>
          Financial Health
        </div>
        <div style={{ fontSize: "11px", color: "#555", letterSpacing: "1px" }}>
          {currentWeek
            ? `Week ${currentWeek.idx} of 52 · ${currentWeek.rotation}`
            : "2026 Dashboard"}
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
    </div>
  );
}
