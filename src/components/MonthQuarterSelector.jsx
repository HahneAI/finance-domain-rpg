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
  const cutoff = prevMonth(currentMonthKey);
  const visibleMonthKeys = MONTH_KEYS.filter(k => k >= cutoff);

  // Months grouped by quarter index — determines which quarters are visible
  const monthsByQ = [0, 1, 2, 3].map(q =>
    visibleMonthKeys.filter(k => Math.floor((parseInt(k.slice(5, 7), 10) - 1) / 3) === q)
  );

  // A quarter is visible only if it still has at least one visible month
  const visibleQIndices = [0, 1, 2, 3].filter(q => monthsByQ[q].length > 0);
  const totalVisibleQ = visibleQIndices.length;

  // Indicator bar — equal-width quarters, tracks by visible quarter position
  const activeQPos = Math.max(0, visibleQIndices.indexOf(activeQuarter));
  const barLeft  = totalVisibleQ > 0 ? (activeQPos / totalVisibleQ) * 100 : 0;
  const barWidth = totalVisibleQ > 0 ? (1 / totalVisibleQ) * 100 : 25;

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

      {/* Indicator bar — 1/N of total width, equal per visible quarter */}
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

      {/* ── Month row: each visible quarter gets flex:1; months inside fill that space ── */}
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {visibleQIndices.map((q, qPos) => {
          const months = monthsByQ[q];
          const isLastQ = qPos === visibleQIndices.length - 1;
          return (
            <div
              key={q}
              style={{
                flex: 1,
                display: "flex",
                borderRight: isLastQ ? "none" : "1px solid rgba(0, 200, 150, 0.28)",
              }}
            >
              {months.map((key, mPos) => {
                const i = MONTH_KEYS.indexOf(key);
                const isActive = activeMonth === key;
                const isCurrent = key === currentMonthKey;
                const isPast = key < currentMonthKey;
                const hasOverride = monthsWithOverrides?.has(key);
                const isLastInQ = mPos === months.length - 1;
                return (
                  <button
                    key={key}
                    onClick={() => onSelectMonth(key)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: isActive ? "rgba(0, 200, 150, 0.22)" : "transparent",
                      border: "none",
                      borderRight: isLastInQ ? "none" : "1px solid rgba(0, 200, 150, 0.07)",
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
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: "1px", background: "rgba(0, 200, 150, 0.22)", position: "relative", zIndex: 2 }} />

      {/* ── Quarter row — equal divisions; drops only when last month in quarter drops off ── */}
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {visibleQIndices.map((q, qPos) => {
          const p = PHASES[q];
          const isCurrent = q === currentPhaseIdx;
          const isActive = activeQuarter === q;
          const isQActive = isActive && activeMonth === null;
          const isLastQ = qPos === visibleQIndices.length - 1;
          return (
            <button
              key={p.id}
              onClick={() => onSelectQuarter(q)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                borderRight: isLastQ ? "none" : "1px solid rgba(0, 200, 150, 0.15)",
                color: isQActive
                  ? "var(--color-accent-primary)"
                  : isActive && activeMonth !== null
                  ? "rgba(0,200,150,0.6)"
                  : activeMonth !== null && !isActive
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
              {Q_LABELS[q]}
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
