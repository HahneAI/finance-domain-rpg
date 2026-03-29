import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// COUNTUP HOOK
// Animates a numeric value from 0 → target over `duration` ms (ease-out cubic).
// Restarts cleanly if target changes (data refresh mid-session).
// ─────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200) {
  const [counted, setCounted] = useState(0);
  const rafRef   = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (target == null || isNaN(target)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    const sign = target < 0 ? -1 : 1;
    const abs  = Math.abs(target);

    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t      = Math.min((ts - startRef.current) / duration, 1);
      const eased  = 1 - Math.pow(1 - t, 3);          // ease-out cubic
      setCounted(sign * Math.round(abs * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return counted;
}

// ─────────────────────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────

export const iS = { background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "10px 12px", borderRadius: "8px", fontSize: "16px", width: "100%", boxSizing: "border-box", fontFamily: "'JetBrains Mono', 'Courier New', monospace", minHeight: "44px" };
export const lS = { fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "4px", display: "block", fontFamily: "var(--font-sans)" };

export function NT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "10px 18px", minHeight: "44px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "var(--font-sans)", background: active ? "var(--color-gold)" : "var(--color-bg-surface)", color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)", border: "1px solid " + (active ? "var(--color-gold)" : "var(--color-border-subtle)"), borderRadius: "12px", cursor: "pointer", }}>{label}</button>; }
export function VT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "10px 16px", minHeight: "44px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "var(--font-sans)", background: active ? "var(--color-gold)" : "var(--color-bg-surface)", color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)", border: "1px solid " + (active ? "var(--color-gold)" : "var(--color-border-subtle)"), borderRadius: "12px", cursor: "pointer", }}>{label}</button>; }

// ─────────────────────────────────────────────────────────────
// METRIC CARD
// Handles both static (info display) and interactive (clickable tile) modes.
//
// Props:
//   label   — uppercase label at top
//   val     — hero number / value
//   sub     — optional sublabel at bottom
//   color   — explicit value color (overrides status)
//   size    — font size of val (default "22px")
//   status  — "green" | "gold" | "red" → tinted bg + matching val color
//   onClick — makes the card a pressable button
//   span    — 2 = gridColumn "span 2" (for HomePanel grid tiles)
// ─────────────────────────────────────────────────────────────

const METRIC_STATUS = {
  green: { bg: "linear-gradient(170deg, rgba(0,200,150,0.16), rgba(7,19,15,0.65))", border: "rgba(0,200,150,0.28)", val: "var(--color-accent-soft)" },
  gold:  { bg: "linear-gradient(170deg, rgba(0,200,150,0.12), rgba(7,19,15,0.60))", border: "rgba(0,200,150,0.24)", val: "var(--color-accent-primary)" },
  red:   { bg: "linear-gradient(170deg, rgba(239,68,68,0.16), rgba(29,10,10,0.65))",  border: "rgba(239,68,68,0.3)",  val: "var(--color-red)" },
};

// fmt$ used by MetricCard to display counted dollar values
const _fmt$ = (n) => {
  if (n == null || isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const s   = abs >= 1000
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : Math.round(abs).toString();
  return `${n < 0 ? "-" : ""}$${s}`;
};

// ─────────────────────────────────────────────────────────────
// METRIC CARD
//
// New props:
//   rawVal        — raw number for countup + flash (pass only for $ values)
//   entranceIndex — stagger index (0-based) for HomePanel grid entrance
// ─────────────────────────────────────────────────────────────
export function MetricCard({ label, val, sub, color, size = "22px", status, onClick, span, rawVal, entranceIndex }) {
  const [pressed,  setPressed]  = useState(false);
  const [flashing, setFlashing] = useState(false);
  const prevRaw = useRef(null);

  // Countup — only runs when rawVal is provided
  const counted = useCountUp(rawVal ?? 0);

  // Flash on data change (skip initial mount)
  useEffect(() => {
    if (rawVal == null) return;
    if (prevRaw.current === null) { prevRaw.current = rawVal; return; }
    if (prevRaw.current !== rawVal) {
      prevRaw.current = rawVal;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 150); // stays gold 150ms, CSS transition fades over 600ms
      return () => clearTimeout(t);
    }
  }, [rawVal]);

  const s        = status ? METRIC_STATUS[status] : null;
  const isButton = !!onClick;

  // Entrance animation: fade-up 0.4s, stagger 80ms/card, max delay 400ms
  const entranceStyle = entranceIndex != null ? {
    animation:      "fadeSlideUp 0.4s ease-out both",
    animationDelay: `${Math.min(entranceIndex * 0.08, 0.4)}s`,
  } : {};

  const containerStyle = {
    gridColumn: span === 2 ? "span 2" : undefined,
    background: s ? s.bg : "var(--color-bg-surface)",
    border: `1px solid ${s ? s.border : "var(--color-border-subtle)"}`,
    borderRadius: "16px",
    padding: isButton ? "16px 18px" : "18px 16px",
    textAlign: "left",
    color: "inherit",
    boxShadow: "0 8px 26px rgba(0,0,0,0.32)",
    minWidth: 0,
    ...entranceStyle,
    ...(isButton && {
      cursor: "pointer",
      transform: pressed ? "scale(0.97)" : "scale(1)",
      transition: "transform 120ms ease, box-shadow 160ms ease",
      minHeight: "88px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      minWidth: 0,
    }),
  };

  // Flash overrides the status color briefly, then CSS transition fades back
  const baseValColor = color || (s ? s.val : "var(--color-text-primary)");
  const valColor     = flashing ? "var(--color-gold-bright)" : baseValColor;
  const displayVal   = rawVal != null ? _fmt$(counted) : val;

  const content = (
    <>
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: isButton ? "2px" : "8px", fontFamily: "var(--font-sans)" }}>
        {label}
      </div>
      <div style={{ fontSize: size, fontWeight: "bold", color: valColor, fontFamily: "var(--font-display)", lineHeight: 1, fontVariantNumeric: "tabular-nums", transition: "color 0.6s ease" }}>
        {displayVal}
      </div>
      {sub && (
        <div style={{ fontSize: isButton ? "10px" : "11px", color: "var(--color-text-secondary)", marginTop: isButton ? "auto" : "5px", paddingTop: isButton ? "6px" : 0, fontFamily: "var(--font-sans)" }}>
          {sub}
        </div>
      )}
    </>
  );

  return isButton ? (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={containerStyle}
    >
      {content}
    </button>
  ) : (
    <div style={containerStyle}>{content}</div>
  );
}

// Backward-compat alias — all existing <Card> usages continue to work
export const Card = MetricCard;

export function FlowSparklineCard({
  label = "Flow Score",
  score = 0,
  points = [],
  trendLabel,
}) {
  const width = 260;
  const height = 72;
  const padX = 6;
  const padY = 8;
  const safePoints = (Array.isArray(points) ? points : []).slice(0, 7);
  const fallbackPoints = safePoints.length > 1 ? safePoints : [35, 44, 52, 58, 63, 70];
  const min = Math.min(...fallbackPoints);
  const max = Math.max(...fallbackPoints);
  const range = Math.max(1, max - min);
  const stepX = (width - padX * 2) / (fallbackPoints.length - 1);

  const pointPairs = fallbackPoints.map((p, i) => {
    const x = padX + i * stepX;
    const norm = (p - min) / range;
    const y = height - padY - norm * (height - padY * 2);
    return [x, y];
  });

  const linePath = pointPairs
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${(width - padX).toFixed(1)} ${(height - padY).toFixed(1)} L${padX.toFixed(1)} ${(height - padY).toFixed(1)} Z`;
  const [lastX, lastY] = pointPairs[pointPairs.length - 1];
  const clampedScore = Math.max(0, Math.min(100, Math.round(score || 0)));

  return (
    <div
      style={{
        marginTop: "14px",
        borderRadius: "16px",
        border: "1px solid rgba(0, 200, 150, 0.24)",
        background: "linear-gradient(180deg, rgba(15,42,33,0.72), rgba(7,19,15,0.94))",
        padding: "12px",
        boxShadow: "0 10px 26px rgba(0,0,0,0.24)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
        <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>{label}</div>
        <div style={{ fontSize: "23px", lineHeight: 1, fontWeight: 700, color: "var(--color-accent-soft)", fontFamily: "var(--font-display)" }}>{clampedScore}</div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="72" role="img" aria-label="Flow trend">
        <defs>
          <linearGradient id="flow-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(74,222,128,0.35)" />
            <stop offset="100%" stopColor="rgba(74,222,128,0)" />
          </linearGradient>
          <linearGradient id="flow-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--color-accent-primary)" />
            <stop offset="100%" stopColor="var(--color-accent-soft)" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#flow-area)" />
        <path d={linePath} fill="none" stroke="url(#flow-line)" strokeWidth="3" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r="4" fill="var(--color-accent-soft)" />
      </svg>

      <div style={{ marginTop: "7px", fontSize: "10px", color: "var(--color-text-secondary)", letterSpacing: "0.4px" }}>
        {trendLabel ?? "Consistency trend · last 6 projected cycles"}
      </div>
    </div>
  );
}

export function SmBtn({ children, onClick, c = "var(--color-text-secondary)", bg = "var(--color-bg-surface)" }) { return <button onClick={onClick} style={{ background: bg, color: c, border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "10px 14px", minHeight: "44px", fontSize: "11px", fontFamily: "var(--font-sans)", cursor: "pointer", }}>{children}</button>; }
export function SH({ children, color, right }) { const c = color || "var(--color-gold)"; return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", marginTop: "4px" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><div style={{ width: "3px", height: "18px", background: c, borderRadius: "2px", flexShrink: 0 }} /><div style={{ fontSize: "11px", letterSpacing: "3px", color: c, textTransform: "uppercase", fontWeight: "bold", fontFamily: "var(--font-sans)" }}>{children}</div></div>{right != null && <div style={{ fontSize: "12px", color: c, fontWeight: "bold", fontFamily: "var(--font-sans)" }}>{right}</div>}</div>; }
