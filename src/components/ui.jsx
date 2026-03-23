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

export const iS = { background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "8px 10px", borderRadius: "6px", fontSize: "16px", width: "100%", boxSizing: "border-box", fontFamily: "'JetBrains Mono', 'Courier New', monospace" };
export const lS = { fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "4px", display: "block" };

export function NT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "8px 17px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "var(--color-gold)" : "var(--color-bg-surface)", color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)", border: "1px solid " + (active ? "var(--color-gold)" : "var(--color-border-subtle)"), borderRadius: "12px", cursor: "pointer", }}>{label}</button>; }
export function VT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "7px 14px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "var(--color-gold)" : "var(--color-bg-surface)", color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)", border: "1px solid " + (active ? "var(--color-gold)" : "var(--color-border-subtle)"), borderRadius: "12px", cursor: "pointer", }}>{label}</button>; }

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
  green: { bg: "rgba(76,175,125,0.10)", border: "rgba(76,175,125,0.22)", val: "var(--color-green)" },
  gold:  { bg: "rgba(201,168,76,0.10)", border: "rgba(201,168,76,0.22)", val: "var(--color-gold)" },
  red:   { bg: "rgba(224,92,92,0.10)",  border: "rgba(224,92,92,0.22)",  val: "var(--color-red)" },
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
    ...entranceStyle,
    ...(isButton && {
      cursor: "pointer",
      transform: pressed ? "scale(0.97)" : "scale(1)",
      transition: "transform 80ms ease",
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
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: isButton ? "2px" : "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: size, fontWeight: "bold", color: valColor, fontFamily: "'DM Serif Display', Georgia, serif", lineHeight: 1, fontVariantNumeric: "tabular-nums", transition: "color 0.6s ease" }}>
        {displayVal}
      </div>
      {sub && (
        <div style={{ fontSize: isButton ? "10px" : "11px", color: "var(--color-text-secondary)", marginTop: isButton ? "auto" : "5px", paddingTop: isButton ? "6px" : 0 }}>
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

export function SmBtn({ children, onClick, c = "var(--color-text-secondary)", bg = "var(--color-bg-surface)" }) { return <button onClick={onClick} style={{ background: bg, color: c, border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "5px 12px", fontSize: "11px", cursor: "pointer", }}>{children}</button>; }
export function SH({ children, color, right }) { const c = color || "var(--color-gold)"; return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", marginTop: "4px" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><div style={{ width: "3px", height: "18px", background: c, borderRadius: "2px", flexShrink: 0 }} /><div style={{ fontSize: "11px", letterSpacing: "3px", color: c, textTransform: "uppercase", fontWeight: "bold" }}>{children}</div></div>{right != null && <div style={{ fontSize: "12px", color: c, fontWeight: "bold" }}>{right}</div>}</div>; }
