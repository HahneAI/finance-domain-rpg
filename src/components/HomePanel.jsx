import { useState } from "react";

const fmt$ = (n) => {
  if (n == null || isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : abs.toFixed(0);
  return `${n < 0 ? "-" : ""}$${s}`;
};

const fmtPct = (n) => `${Math.round(n * 100)}%`;

// Status → color tokens (10-15% opacity tint backgrounds)
const STATUS_COLORS = {
  green: { bg: "rgba(109,191,138,0.12)", border: "rgba(109,191,138,0.22)", val: "#6dbf8a" },
  gold:  { bg: "rgba(200,168,75,0.12)",  border: "rgba(200,168,75,0.22)",  val: "#c8a84b" },
  red:   { bg: "rgba(232,133,106,0.12)", border: "rgba(232,133,106,0.22)", val: "#e8856a" },
};

function Tile({ title, value, sub, status, span, onClick }) {
  const [pressed, setPressed] = useState(false);
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.gold;

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        gridColumn: span === 2 ? "span 2" : "span 1",
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: "10px",
        padding: "16px",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "'Courier New',monospace",
        color: "inherit",
        transform: pressed ? "scale(0.97)" : "scale(1)",
        transition: "transform 80ms ease",
        minHeight: "88px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        // Ensure minimum 44×44px tap target even if content is small
        minWidth: 0,
      }}
    >
      {/* Title — small caps at top */}
      <div style={{
        fontSize: "9px",
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: "#666",
        marginBottom: "2px",
      }}>
        {title}
      </div>

      {/* Hero number */}
      <div style={{
        fontSize: "30px",
        fontWeight: "bold",
        color: c.val,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.5px",
      }}>
        {value}
      </div>

      {/* Status / sub line — pushes to bottom */}
      <div style={{
        fontSize: "10px",
        color: "#555",
        letterSpacing: "0.5px",
        marginTop: "auto",
        paddingTop: "6px",
      }}>
        {sub}
      </div>
    </button>
  );
}

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
  const tiles = [
    {
      title: "Take Home",
      value: fmt$(weeklyTakeHome),
      sub: "per week · all events applied",
      status: weeklyTakeHome > 0 ? "green" : "red",
      span: 2,
      key: "income",
    },
    {
      title: "Weekly Left",
      value: fmt$(adjustedWeeklyAvg),
      sub: "after all expenses",
      status: adjustedWeeklyAvg > 100 ? "green" : adjustedWeeklyAvg >= 0 ? "gold" : "red",
      span: 1,
      key: "budget",
    },
    {
      title: "Net Worth Trend",
      value: fmt$(annualSavings),
      sub: "projected annual savings",
      status: annualSavings > 5000 ? "green" : annualSavings >= 0 ? "gold" : "red",
      span: 1,
      key: "income",
    },
    {
      title: "Budget Health",
      value: fmtPct(spendRatio),
      sub: `${fmt$(avgWeeklySpend)}/wk spend · ${fmt$(weeklyIncome)}/wk income`,
      status: spendRatio < 0.5 ? "green" : spendRatio < 0.75 ? "gold" : "red",
      span: 2,
      key: "budget",
    },
    {
      title: "Emergency Fund",
      value: emergencyGoal ? fmt$(emergencyGoal.target) : "—",
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
          color: "#c8a84b",
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
        gap: "10px",
      }}>
        {tiles.map(tile => (
          <Tile
            key={tile.title}
            title={tile.title}
            value={tile.value}
            sub={tile.sub}
            status={tile.status}
            span={tile.span}
            onClick={() => navigate(tile.key)}
          />
        ))}
      </div>
    </div>
  );
}
