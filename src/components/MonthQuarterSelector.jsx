import { PHASES } from "../constants/config.js";
import { LiquidGlass } from "./LiquidGlass.jsx";

const MONTH_KEYS = [
  "2026-01", "2026-02", "2026-03",
  "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12",
];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const Q_LABELS = ["Q1", "Q2", "Q3", "Q4"];

// One month back from a "YYYY-MM" key
function prevMonth(key) {
  const [y, m] = key.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export function MonthQuarterSelector({
  activeMonth,
  activeQuarter,
  currentMonthKey,
  currentPhaseIdx,
  monthsWithOverrides,
  onSelectMonth,
  onSelectQuarter,
}) {
  // Rolling drop-off: only show the previous month + current + future.
  // Jan and Feb disappear in April; all of Q1 disappears once May is current.
  const cutoff = prevMonth(currentMonthKey);
  const visibleMonthKeys = MONTH_KEYS.filter(k => k >= cutoff);

  // Visible month count per quarter (index 0–3)
  const visiblePerQ = [0, 1, 2, 3].map(q =>
    visibleMonthKeys.filter(k => Math.floor((parseInt(k.slice(5, 7), 10) - 1) / 3) === q).length
  );
  const totalVisible = visibleMonthKeys.length;

  // Strong quarter-boundary divider after the last visible month in each non-final quarter
  const dividerAfter = new Set();
  [0, 1, 2, 3].forEach(q => {
    const qVisible = visibleMonthKeys.filter(k => Math.floor((parseInt(k.slice(5, 7), 10) - 1) / 3) === q);
    const hasNextQ = visiblePerQ.slice(q + 1).some(n => n > 0);
    if (qVisible.length > 0 && hasNextQ) dividerAfter.add(qVisible.at(-1));
  });

  // Indicator bar: position and width are proportional to visible month slots
  const barLeftMonths = visibleMonthKeys.filter(
    k => Math.floor((parseInt(k.slice(5, 7), 10) - 1) / 3) < activeQuarter
  ).length;
  const barLeft = totalVisible > 0 ? (barLeftMonths / totalVisible) * 100 : 0;
  const barWidth = totalVisible > 0 ? ((visiblePerQ[activeQuarter] ?? 0) / totalVisible) * 100 : 25;

  return (
    <LiquidGlass
      purpose="phase-btn"
      tone="teal"
      intensity="light"
      style={{
        width: "100%",
        borderRadius: "20px",
        background: "rgba(0, 200, 150, 0.15)",
        border: "1px solid rgba(0, 200, 150, 0.40)",
        boxShadow: "0 8px 32px rgba(0, 200, 150, 0.22), 0 4px 16px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
        overflow: "hidden",
        position: "relative",
        marginBottom: "16px",
      }}
    >
      {/* Top-edge sheen */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: "45%",
        background: "linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, transparent 100%)",
        borderRadius: "20px 20px 0 0",
        pointerEvents: "none",
        zIndex: 1,
      }} />

      {/* Indicator bar — proportional to visible month slots */}
      <div style={{
        position: "absolute",
        top: 0,
        left: `${barLeft}%`,
        width: `${barWidth}%`,
        height: "2px",
        background: "var(--color-accent-primary)",
        transition: "left 0.3s ease, width 0.3s ease",
        borderRadius: "0 0 1px 1px",
        zIndex: 2,
      }} />

      {/* ── Month row — only visible months, each flex:1 so they scale to fill ── */}
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {visibleMonthKeys.map((key) => {
          const i = MONTH_KEYS.indexOf(key);
          const isActive = activeMonth === key;
          const isCurrent = key === currentMonthKey;
          const isPast = key < currentMonthKey;
          const hasOverride = monthsWithOverrides?.has(key);
          return (
            <button
              key={key}
              onClick={() => onSelectMonth(key)}
              style={{
                flex: 1,
                minWidth: 0,
                background: isActive ? "rgba(0, 200, 150, 0.22)" : "transparent",
                border: "none",
                borderRight: dividerAfter.has(key)
                  ? "1px solid rgba(0, 200, 150, 0.28)"
                  : "1px solid rgba(0, 200, 150, 0.07)",
                color: isActive
                  ? "var(--color-accent-primary)"
                  : isCurrent
                  ? "var(--color-text-primary)"
                  : isPast
                  ? "var(--color-text-disabled)"
                  : "var(--color-text-secondary)",
                cursor: "pointer",
                padding: "9px 2px 5px",
                fontSize: "8px",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                fontWeight: isActive ? "bold" : "normal",
                fontFamily: "var(--font-sans)",
                textAlign: "center",
                position: "relative",
                transition: "background 150ms ease, color 150ms ease",
                minHeight: "44px",
              }}
            >
              {MONTH_LABELS[i]}
              {isCurrent && (
                <span style={{
                  display: "block",
                  width: "4px",
                  height: "4px",
                  borderRadius: "50%",
                  background: "var(--color-accent-primary)",
                  margin: "2px auto 0",
                  opacity: 0.9,
                }} />
              )}
              {hasOverride && !isCurrent && (
                <span style={{
                  display: "block",
                  fontSize: "5px",
                  lineHeight: 1,
                  color: "var(--color-warning)",
                  margin: "2px auto 0",
                  opacity: 0.8,
                }}>◆</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "rgba(0, 200, 150, 0.22)", position: "relative", zIndex: 2 }} />

      {/* ── Quarter row — hidden quarters (all months dropped) are omitted;
           flex matches visible month count so columns align perfectly ── */}
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {PHASES.map((p, i) => {
          if (visiblePerQ[i] === 0) return null;
          const isCurrent = i === currentPhaseIdx;
          const isActive = activeQuarter === i;
          const isQActive = isActive && activeMonth === null;
          const isOtherQuarterMonthSelected = activeMonth !== null && !isActive;
          const hasNextVisibleQ = visiblePerQ.slice(i + 1).some(n => n > 0);
          return (
            <button
              key={p.id}
              onClick={() => onSelectQuarter(i)}
              style={{
                flex: visiblePerQ[i],
                background: "transparent",
                border: "none",
                borderRight: i < 3 && hasNextVisibleQ ? "1px solid rgba(0, 200, 150, 0.15)" : "none",
                color: isQActive
                  ? "var(--color-accent-primary)"
                  : isActive && activeMonth !== null
                  ? "rgba(0,200,150,0.6)"
                  : isOtherQuarterMonthSelected
                  ? "var(--color-text-disabled)"
                  : "var(--color-text-secondary)",
                cursor: "pointer",
                padding: "8px 4px 9px",
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontWeight: isQActive ? "bold" : "500",
                fontFamily: "var(--font-sans)",
                position: "relative",
                textAlign: "center",
                transition: "color 150ms ease",
                minHeight: "44px",
              }}
            >
              {isCurrent && !isQActive && (
                <span style={{
                  position: "absolute", top: "6px", right: "5px",
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: "var(--color-accent-primary)",
                }} />
              )}
              {Q_LABELS[i]}
              <br />
              <span style={{ fontSize: "7px", fontWeight: "normal", opacity: isQActive ? 0.85 : 0.5 }}>
                {p.label}
              </span>
              {isCurrent && (
                <span style={{ display: "block", fontSize: "7px", marginTop: "1px", color: "var(--color-accent-primary)", opacity: 0.85 }}>
                  ● now
                </span>
              )}
            </button>
          );
        })}
      </div>
    </LiquidGlass>
  );
}
