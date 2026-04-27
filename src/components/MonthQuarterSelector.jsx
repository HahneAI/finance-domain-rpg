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

// Spring-overshoot easing for left/right jitter
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const SLIDE  = "cubic-bezier(0.4, 0, 0.2, 1)";

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

  const monthsByQ = [0, 1, 2, 3].map(q =>
    visibleMonthKeys.filter(k => Math.floor((parseInt(k.slice(5, 7), 10) - 1) / 3) === q)
  );

  const visibleQIndices = [0, 1, 2, 3].filter(q => monthsByQ[q].length > 0);
  const totalVisibleQ = visibleQIndices.length;
  const isMonthMode = activeMonth !== null;

  // Active quarter's position in the visible list
  const activeQPos = Math.max(0, visibleQIndices.indexOf(activeQuarter));

  // ── Top bar (month row) — tracks the selected month pill ──
  const monthsInActiveQ = monthsByQ[activeQuarter]?.length || 1;
  const activeMInQIdx  = activeMonth
    ? Math.max(0, monthsByQ[activeQuarter]?.indexOf(activeMonth) ?? 0)
    : 0;
  const topBarLeft  = totalVisibleQ > 0
    ? (activeQPos / totalVisibleQ + activeMInQIdx / (monthsInActiveQ * totalVisibleQ)) * 100
    : 0;
  const topBarWidth = totalVisibleQ > 0
    ? (1 / (monthsInActiveQ * totalVisibleQ)) * 100
    : 25;

  // ── Bottom bar (quarter row) — spans the selected quarter column ──
  const botBarLeft  = totalVisibleQ > 0 ? (activeQPos / totalVisibleQ) * 100 : 0;
  const botBarWidth = totalVisibleQ > 0 ? (1 / totalVisibleQ) * 100 : 25;

  const indicatorBar = (left, width, visible, slideIn, slideOut) => ({
    position: "absolute",
    top: 0,
    left: `${left}%`,
    width: `${width}%`,
    height: "2px",
    background: "var(--color-accent-primary)",
    borderRadius: "0 0 1px 1px",
    zIndex: 3,
    pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : `translateY(${slideOut})`,
    transition: [
      `left 0.28s ${SPRING}`,
      `width 0.22s ${SLIDE}`,
      `opacity 0.18s ease`,
      `transform 0.18s ease`,
    ].join(", "),
  });

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

      {/* ── Month row ── */}
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {/* Top indicator bar — slides to selected month, fades out when quarter mode active */}
        <div style={indicatorBar(topBarLeft, topBarWidth, isMonthMode, "slideIn", "6px")} />

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
                        width: "4px", height: "4px",
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

      {/* ── Quarter row ── */}
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {/* Bottom indicator bar — spans the selected quarter, fades out when month mode active */}
        <div style={indicatorBar(botBarLeft, botBarWidth, !isMonthMode, "slideIn", "-6px")} />

        {visibleQIndices.map((q, qPos) => {
          const p = PHASES[q];
          const isCurrent = q === currentPhaseIdx;
          const isActive = activeQuarter === q;
          const isQActive = isActive && !isMonthMode;
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
                  : isActive && isMonthMode
                  ? "rgba(0,200,150,0.6)"
                  : !isActive && isMonthMode
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
