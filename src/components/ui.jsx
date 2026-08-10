import { useState, useEffect, useRef, Children } from "react";
import { LiquidGlass } from "./LiquidGlass.jsx";
import { useSwipeStack } from "../hooks/useSwipeStack.js";

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

// eslint-disable-next-line react-refresh/only-export-components
export const iS = { background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "10px 12px", borderRadius: "8px", fontSize: "16px", width: "100%", boxSizing: "border-box", fontFamily: "var(--font-sans)", minHeight: "44px" };
// eslint-disable-next-line react-refresh/only-export-components
export const lS = { fontSize: "11px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "4px", display: "block", fontFamily: "var(--font-sans)" };

// ─────────────────────────────────────────────────────────────
// TAP FEEDBACK — default press system
//
// This is the app-wide standard for press/tap feedback. Every clickable surface
// should adopt it so the whole app feels consistent. Two primary cues:
//   1. Green press fill — a quick fill of the lighter same-family green
//      (--color-teal-bright #33e0b0) that fades quickly to whatever the control
//      settles to (the selected green #00c896 on tabs, or the control's own bg).
//   2. Scale spring — a subtle scale(0.94) press-in with a gentle overshoot
//      spring back. Supporting cue only; the green fill is the star.
// Stays within the CLAUDE.md press budget (scale-only, ≤500ms).
//
// Three ways to consume it (in order of preference):
//   • <Pressable> — drop-in replacement for <button>/<div onClick>. Easiest; use
//     for new or refactored call sites.
//   • usePressFeedback() + <PressFlashOverlay> — when a component needs to keep
//     its own element/state but wants the same feedback (e.g. MetricCard).
//   • Copy the inline pattern — only if neither fits.
// ─────────────────────────────────────────────────────────────

// usePressFeedback — handlers + state driving the press fill + scale.
// `pressed` drives the scale; `lit` drives the green fill and lingers briefly after
// release (via litTimer) so a fast tap still shows the fill.
// eslint-disable-next-line react-refresh/only-export-components
export function usePressFeedback() {
  const [pressed, setPressed] = useState(false);
  const [lit, setLit]         = useState(false);
  const litTimer = useRef(null);

  // Clean up a pending timer on unmount so we never setState after teardown.
  useEffect(() => () => clearTimeout(litTimer.current), []);

  const down = () => {
    clearTimeout(litTimer.current);
    setPressed(true);
    setLit(true);
  };
  const up = () => {
    setPressed(false);
    // Hold the fill briefly after lift so quick taps still register, then fade.
    clearTimeout(litTimer.current);
    litTimer.current = setTimeout(() => setLit(false), 90);
  };

  return {
    pressed,
    lit,
    handlers: { onPointerDown: down, onPointerUp: up, onPointerLeave: up },
  };
}

// pressScaleStyle — transform + transition for the scale spring. Spread onto any
// element already wired with usePressFeedback handlers.
// eslint-disable-next-line react-refresh/only-export-components
export function pressScaleStyle(pressed, scale = 0.94, extra = "") {
  const tail = extra ? `, ${extra}` : "";
  return {
    transform: pressed ? `scale(${scale})` : "scale(1)",
    transition: pressed
      ? `transform 90ms ease-out${tail}`
      : `transform 340ms cubic-bezier(0.34, 1.7, 0.5, 1)${tail}`,
    WebkitTapHighlightColor: "transparent",
  };
}

// ── Press-fill color derivation ──────────────────────────────────────────────
// The press fill is a lighter shade of the tappable target's OWN resting color,
// same family — so a red ✕/Cancel flashes lighter red, a teal tab flashes lighter
// teal, a green Save flashes lighter green, etc. We read the control's computed
// colors at press time and lighten the most chromatic one in HSL.

function _parseRgb(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(",").map(s => parseFloat(s.trim()));
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

function _rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}

// Returns a CSS color string: a lighter, same-family shade of the target's color.
// Falls back to teal-bright if nothing usable is found (or in non-DOM/test env).
function deriveTapFillColor(el, fallback = "var(--color-teal-bright)") {
  try {
    if (!el || typeof getComputedStyle !== "function") return fallback;
    const cs = getComputedStyle(el);
    const cands = [cs.backgroundColor, cs.borderTopColor, cs.color]
      .map(_parseRgb)
      .filter(c => c && c.a > 0.05)            // ignore transparent (e.g. ghost-button bg)
      .map(c => ({ ...c, hsl: _rgbToHsl(c) }));
    if (!cands.length) return fallback;
    // Pick the most chromatic color — that's the control's identity (red, teal, …),
    // not the dark neutral surface behind it.
    cands.sort((a, b) => b.hsl.s - a.hsl.s);
    const { h, s, l } = cands[0].hsl;
    // Lighten within the family: clearly lighter, but never blown out to white.
    const targetL = Math.min(Math.max(l + 0.22, 0.55), 0.82);
    return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(targetL * 100)}%)`;
  } catch {
    return fallback;
  }
}

// PressFlashOverlay — the press fill. Renders behind the control's content
// (zIndex -1, so it never covers text/icons) and clips to the parent's radius.
// `color` defaults to teal-bright but callers normally pass a derived family color.
// The parent MUST set `position: relative`, `overflow: hidden`, and
// `isolation: isolate` (Pressable and the primitives below all do).
export function PressFlashOverlay({ lit, color = "var(--color-teal-bright)", opacity = 1 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background: color,
        zIndex: -1,
        opacity: lit ? opacity : 0,
        // Quick fill in on press; fade quickly to the settled color on release.
        transition: lit ? "opacity 40ms ease-out" : "opacity 180ms ease-out",
        pointerEvents: "none",
      }}
    />
  );
}

// Pressable — drop-in <button>/<div> with the default tap feedback baked in.
// Keeps the consumer's style/onClick/aria props; just adds the press fill + spring.
// The fill auto-derives from the target's own resting color (lighter, same family);
// pass `flashColor` to override. `as` switches the element (default "button");
// `scale`/`flashOpacity` tune the feedback. Disabled buttons get no feedback.
export function Pressable({
  as: Tag = "button",
  children,
  style,
  onClick,
  scale = 0.94,
  flashColor,
  flashOpacity,
  disabled = false,
  ...rest
}) {
  const { pressed, lit, handlers } = usePressFeedback();
  const elRef = useRef(null);
  // Derived lighter-shade fill, computed from the element's own color on press.
  const [fill, setFill] = useState(flashColor);
  const interactive = !disabled;

  const onPointerDown = (e) => {
    if (!flashColor) setFill(deriveTapFillColor(elRef.current));
    handlers.onPointerDown(e);
  };

  // Preserve any transition the consumer set (e.g. hover color) by appending it to
  // the scale-spring transition instead of letting `...style` clobber it.
  const { transition: consumerTransition, ...restStyle } = style || {};

  return (
    <Tag
      ref={elRef}
      onClick={onClick}
      {...(Tag === "button" ? { disabled } : {})}
      {...(interactive ? { ...handlers, onPointerDown } : {})}
      {...rest}
      style={{
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        ...pressScaleStyle(interactive && pressed, scale, consumerTransition),
        ...restStyle,
      }}
    >
      <PressFlashOverlay lit={interactive && lit} color={fill ?? flashColor} opacity={flashOpacity} />
      {children}
    </Tag>
  );
}

// ─────────────────────────────────────────────────────────────
// FOLD-UP TRANSITION SYSTEM — page moves · modals · dropdowns
// Companion to index.css (@keyframes foldLift*/foldScale*/foldBackdrop*).
// Because exit animates, the element must stay mounted through the out-tween.
// ─────────────────────────────────────────────────────────────

// useFoldTransition — drive enter/exit for a conditionally-shown surface.
// `open` is the desired visibility; returns { mounted, fold } where fold is
// "entering" | "entered" | "exiting". Spread data-fold={fold} onto the .fold-*
// element (and any .fold-backdrop), and gate rendering on `mounted`.
// eslint-disable-next-line react-refresh/only-export-components
export function useFoldTransition(open, { ms = 280 } = {}) {
  const [mounted, setMounted] = useState(open);
  const [fold, setFold] = useState(open ? "entered" : "exited");
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      // Mount + mark entering in one commit so the enter keyframe plays on first paint.
      setMounted(true);
      setFold("entering");
      timer.current = setTimeout(() => setFold("entered"), ms);
    } else if (mounted) {
      setFold("exiting");
      timer.current = setTimeout(() => { setFold("exited"); setMounted(false); }, ms);
    }
    return () => clearTimeout(timer.current);
    // `mounted` is read but intentionally omitted: including it would re-fire the
    // exit branch after unmount. Only `open`/`ms` should drive transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ms]);

  return { mounted, fold };
}

// FoldSwitch — cross-fade page moves. Keeps the outgoing view mounted (absolutely
// positioned, inert) through its faster exit while the incoming view lifts in.
// Keyed on `activeKey`; when it changes, old children exit and new children enter.
// Once the enter finishes it flips the live view to data-fold="entered" so NO
// transform / will-change lingers — a settled panel must not hold a stacking
// context or containing block (that traps the fixed bottom nav + portaled modals).
export function FoldSwitch({ activeKey, children, enterMs = 340, exitMs = 180, className = "fold-lift" }) {
  const [cur, setCur] = useState({ key: activeKey, node: children });
  const [curFold, setCurFold] = useState("entered"); // first mount is already settled — no entrance
  const [prev, setPrev] = useState(null);
  const enterTimer = useRef(null);
  const exitTimer = useRef(null);

  useEffect(() => {
    if (activeKey !== cur.key) {
      setPrev(cur);
      setCur({ key: activeKey, node: children });
      setCurFold("entering");
      clearTimeout(enterTimer.current);
      enterTimer.current = setTimeout(() => setCurFold("entered"), enterMs);
      clearTimeout(exitTimer.current);
      exitTimer.current = setTimeout(() => setPrev(null), exitMs);
    } else if (children !== cur.node) {
      setCur({ key: activeKey, node: children }); // same view, refreshed props — no replay
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, children]);

  useEffect(() => () => { clearTimeout(enterTimer.current); clearTimeout(exitTimer.current); }, []);

  return (
    <div style={{ position: "relative" }}>
      {prev && (
        <div key={prev.key} className={className} data-fold="exiting" aria-hidden="true"
             style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {prev.node}
        </div>
      )}
      <div key={cur.key} className={className} data-fold={curFold}>
        {cur.node}
      </div>
    </div>
  );
}

// StepSlide — direction-aware horizontal push/pop for wizard-style step navigation.
// Keyed on `stepKey`; `direction` (1 = forward/Next, -1 = back) sets the slide way.
// Keeps the outgoing step mounted (absolute, inert) through its exit like FoldSwitch,
// so Next slides the new step in from the right while the old exits left (and reverse
// on Back). Companion CSS: step-in-right/left, step-out-left/right (index.css).
export function StepSlide({ stepKey, direction = 1, children, ms = 300 }) {
  const [cur, setCur] = useState({ key: stepKey, node: children });
  const [prev, setPrev] = useState(null);
  const [dir, setDir] = useState(1);
  const timer = useRef(null);

  useEffect(() => {
    if (stepKey !== cur.key) {
      setDir(direction);
      setPrev(cur);
      setCur({ key: stepKey, node: children });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPrev(null), ms);
    } else if (children !== cur.node) {
      setCur({ key: stepKey, node: children });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, children]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const forward = dir >= 0;
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      {prev && (
        <div key={prev.key} className={forward ? "step-out-left" : "step-out-right"} aria-hidden="true"
             style={{ position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" }}>
          {prev.node}
        </div>
      )}
      <div key={cur.key} className={forward ? "step-in-right" : "step-in-left"}>
        {cur.node}
      </div>
    </div>
  );
}

// NT — nav tab. Uses the default tap feedback via Pressable.
export function NT({ label, active, onClick }) {
  return (
    <Pressable
      onClick={onClick}
      className="text-xs"
      style={{
        padding: "10px 18px", minHeight: "44px", letterSpacing: "2px",
        textTransform: "uppercase", fontFamily: "var(--font-sans)",
        background: active ? "var(--color-teal)" : "var(--color-bg-surface)",
        color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)",
        border: "1px solid " + (active ? "var(--color-teal)" : "var(--color-border-subtle)"),
        borderRadius: "12px", cursor: "pointer",
      }}
    >
      {label}
    </Pressable>
  );
}

// VT — view tab. Uses the default tap feedback via Pressable: a quick lighter-green
// fill (--color-teal-bright) that fades to the selected green, plus a subtle spring.
export function VT({ label, active, onClick }) {
  return (
    <Pressable
      onClick={onClick}
      className="text-xs"
      style={{
        padding: "10px 16px", minHeight: "44px", letterSpacing: "2px",
        textTransform: "uppercase", fontFamily: "var(--font-sans)",
        background: active ? "var(--color-teal)" : "var(--color-bg-surface)",
        color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)",
        border: "1px solid " + (active ? "var(--color-teal)" : "var(--color-border-subtle)"),
        borderRadius: "12px", cursor: "pointer",
      }}
    >
      {label}
    </Pressable>
  );
}

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
//   status  — "green" | "teal" | "red" → tinted bg + matching val color
//   onClick — makes the card a pressable button
//   span    — 2 = gridColumn "span 2" (for HomePanel grid tiles)
// ─────────────────────────────────────────────────────────────

const METRIC_STATUS = {
  green: { bg: "linear-gradient(170deg, rgba(0,200,150,0.16), rgba(7,19,15,0.65))", border: "rgba(0,200,150,0.28)", val: "var(--color-green)" },
  teal:  { bg: "linear-gradient(170deg, rgba(0,200,150,0.12), rgba(7,19,15,0.60))", border: "rgba(0,200,150,0.24)", val: "var(--color-accent-primary)" },
  red:   { bg: "linear-gradient(170deg, rgba(239,68,68,0.16), rgba(29,10,10,0.65))",  border: "rgba(239,68,68,0.3)",  val: "var(--color-deduction)" },
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
// Glass tier overrides for visualTier="glass" | "overlay"
const GLASS_TIER = {
  glass:   { background: "rgba(0, 200, 150, 0.08)", border: "rgba(0, 200, 150, 0.20)", blur: "12px" },
  overlay: { background: "rgba(0, 200, 150, 0.12)", border: "rgba(0, 200, 150, 0.28)", blur: "20px" },
};

export function MetricCard({ label, val, sub, color, size = "22px", status, onClick, span, rawVal, entranceIndex, insight, visualTier, centered }) {
  const { pressed, lit, handlers } = usePressFeedback();
  const btnRef = useRef(null);
  // Press fill derived from the card's own color (status green/teal/red, etc).
  const [fill, setFill] = useState(undefined);
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 150); // stays teal 150ms, CSS transition fades over 600ms
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

  const g = visualTier ? GLASS_TIER[visualTier] : null;
  const containerStyle = {
    gridColumn: span === 2 ? "span 2" : undefined,
    background: g ? g.background : (s ? s.bg : "var(--color-bg-surface)"),
    border: `1px solid ${g ? g.border : (s ? s.border : "var(--color-border-subtle)")}`,
    borderRadius: "16px",
    padding: isButton ? "16px 18px" : "18px 16px",
    textAlign: centered ? "center" : "left",
    color: "inherit",
    boxShadow: "0 8px 26px rgba(0,0,0,0.32)",
    minWidth: 0,
    ...(g && { backdropFilter: `blur(${g.blur})`, WebkitBackdropFilter: `blur(${g.blur})` }),
    ...entranceStyle,
    ...(isButton && {
      cursor: "pointer",
      // Press feedback: subtle scale (larger surface → gentler than tabs) + green
      // fill via PressFlashOverlay below. position/overflow/isolation let the
      // overlay clip to the radius and sit behind content (zIndex -1).
      position: "relative",
      overflow: "hidden",
      isolation: "isolate",
      transform: pressed ? "scale(0.97)" : "scale(1)",
      transition: pressed
        ? "transform 90ms ease-out, box-shadow 160ms ease"
        : "transform 340ms cubic-bezier(0.34, 1.7, 0.5, 1), box-shadow 160ms ease",
      WebkitTapHighlightColor: "transparent",
      minHeight: "88px",
      display: "flex",
      flexDirection: "column",
      alignItems: centered ? "center" : undefined,
      gap: "4px",
      minWidth: 0,
    }),
  };

  // Flash overrides the status color briefly, then CSS transition fades back
  const baseValColor = color || (s ? s.val : "var(--color-text-primary)");
  const valColor     = flashing ? "var(--color-teal-bright)" : baseValColor;
  const displayVal   = rawVal != null ? _fmt$(counted) : val;

  const content = (
    <>
      <div className="text-xs" style={{ letterSpacing: "2.5px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: isButton ? "2px" : "8px", fontFamily: "var(--font-sans)" }}>
        {label}
      </div>
      <div style={{ fontSize: size, fontWeight: "bold", color: valColor, fontFamily: "var(--font-display)", lineHeight: 1, fontVariantNumeric: "tabular-nums", transition: "color 0.6s ease" }}>
        {displayVal}
      </div>
      {sub && (
        <div className={isButton ? "text-xs" : "text-sm"} style={{ color: "var(--color-text-secondary)", marginTop: isButton ? "auto" : "5px", paddingTop: isButton ? "6px" : 0, fontFamily: "var(--font-sans)" }}>
          {sub}
        </div>
      )}
      {insight && <InsightRow {...insight} />}
    </>
  );

  return isButton ? (
    <button
      ref={btnRef}
      {...handlers}
      onPointerDown={(e) => { setFill(deriveTapFillColor(btnRef.current)); handlers.onPointerDown(e); }}
      onClick={onClick}
      style={containerStyle}
    >
      <PressFlashOverlay lit={lit} color={fill} />
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
        <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>{label}</div>
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

      <div className="text-xs" style={{ marginTop: "7px", color: "var(--color-text-secondary)", letterSpacing: "0.4px" }}>
        {trendLabel ?? "Consistency trend · last 6 projected cycles"}
      </div>
    </div>
  );
}

export function SmBtn({ children, onClick, c = "var(--color-text-secondary)", bg = "var(--color-bg-surface)", style: extraStyle }) { return <Pressable onClick={onClick} className="text-xs" style={{ background: bg, color: c, border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "10px 14px", minHeight: "44px", fontFamily: "var(--font-sans)", cursor: "pointer", ...extraStyle }}>{children}</Pressable>; }
export function SH({ children, color, textColor, right }) { const c = color || "var(--color-teal)"; const tc = textColor || c; return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", marginTop: "4px" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><div style={{ width: "3px", height: "18px", background: c, borderRadius: "2px", flexShrink: 0 }} /><div className="text-xs" style={{ letterSpacing: "3px", color: tc, textTransform: "uppercase", fontWeight: "bold", fontFamily: "var(--font-sans)" }}>{children}</div></div>{right != null && <div className="text-sm" style={{ color: tc, fontWeight: "bold", fontFamily: "var(--font-sans)" }}>{right}</div>}</div>; }

export function PanelHero({ eyebrow, children }) {
  return (
    <div style={{ marginBottom: "28px", textAlign: "center" }}>
      <div className="text-2xs" style={{ letterSpacing: "4px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "12px" }}>{eyebrow}</div>
      <div style={{ fontSize: "32px", fontWeight: 900, fontFamily: "var(--font-display)", color: "var(--color-accent-primary)", letterSpacing: "0.04em", lineHeight: 1.15, marginBottom: "14px" }}>{children}</div>
      <div style={{ width: "28px", height: "2px", background: "var(--color-accent-primary)", margin: "0 auto", borderRadius: "1px", opacity: 0.45 }} />
    </div>
  );
}

export function SectionHeader({ children, sub, right }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, var(--color-accent-primary), transparent)", marginBottom: "16px", opacity: 0.35 }} />
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "0.02em", lineHeight: 1.15, marginBottom: sub ? "6px" : 0 }}>{children}</div>
          {sub && <div className="text-xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>{sub}</div>}
        </div>
        {right != null && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INSIGHT ROW — Pulse layer component
//
// The primary Pulse UI element. Always renders below a primary metric,
// never replaces it. Uses signal-blue/purple exclusively — never Flow green.
//
// Props:
//   arrow   — "up" | "down" | "flat"  →  ↑ ↓ →
//   delta   — string like "+8%" or "+$120" (optional)
//   label   — short plain-language context string
//   variant — "blue" (default) | "purple"
//             blue  = trend / directional signal
//             purple = AI-generated / forward-looking insight moment
// ─────────────────────────────────────────────────────────────
export function InsightRow({ arrow, delta, label, variant = "blue" }) {
  const color = variant === "purple"
    ? "var(--color-signal-purple)"
    : "var(--color-signal-blue)";
  const tone = variant === "purple" ? "purple" : "blue";
  const arrowChar = arrow === "up" ? "↑" : arrow === "down" ? "↓" : "→";
  return (
    <LiquidGlass
      purpose="pulse"
      tone={tone}
      intensity="light"
      withBorder
      className="text-xs"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        marginTop: "6px",
        padding: "3px 8px 3px 6px",
        borderRadius: "6px",
        fontFamily: "var(--font-sans)",
        letterSpacing: "0.3px",
        lineHeight: 1.4,
      }}
    >
      <span className="text-xs" style={{ color, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>{arrowChar}</span>
      {delta && <span style={{ color, fontWeight: 600 }}>{delta}</span>}
      <span style={{ color: "var(--color-text-disabled)" }}>{label}</span>
    </LiquidGlass>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGINATION DOTS
// Renders a frosted pill indicator row for snap stacks.
//
// Props:
//   count  — total number of items
//   active — 0-based index of the visible item
//   color  — override active dot color (default --color-accent-primary)
// ─────────────────────────────────────────────────────────────
export function PaginationDots({ count, active, color }) {
  const activeColor = color || "var(--color-accent-primary)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "6px",
        padding: "5px 14px",
        width: "fit-content",
        margin: "0 auto",
        borderRadius: "20px",
        // Subtle glass pill — Liquid Glass "Subtle" preset values, applied inline
        // since this element is too small to warrant the full LiquidGlass wrapper.
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        background: "rgba(0, 200, 150, 0.06)",
        border: "1px solid rgba(0, 200, 150, 0.14)",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: i === active ? activeColor : "rgba(0, 200, 150, 0.28)",
            transition: "background 200ms ease",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCROLL SNAP ROW
// Horizontal snap container with optional pagination dots.
//
// Props:
//   children   — snap items (each wrapped in a snap-aligned div)
//   itemWidth  — CSS width string for each item (default "min(88vw, 320px)")
//   gap        — CSS gap string (default "16px")
//   showDots   — boolean, renders PaginationDots below (default true)
//   dotColor   — override active dot color (default --color-accent-primary)
//
// CSS shape:
//   display: flex | overflow-x: scroll | scroll-snap-type: x mandatory
//   -webkit-overflow-scrolling: touch | scrollbar-width: none
//   gap: 16px | padding: 4px 0 12px (bottom pad for dots clearance)
//   .snap-scroll-row::-webkit-scrollbar { display:none } → src/index.css
// ─────────────────────────────────────────────────────────────
export function ScrollSnapRow({
  children,
  itemWidth = "min(88vw, 320px)",
  gap = "16px",
  showDots = true,
  dotColor,
}) {
  const items = Children.toArray(children);
  const count = items.length;
  const { containerRef, activeIndex } = useSwipeStack(count);

  return (
    <div>
      <div
        ref={containerRef}
        className="snap-scroll-row"
        style={{
          display: "flex",
          overflowX: "scroll",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          gap,
          padding: "4px 0 12px",
        }}
      >
        {items.map((child, i) => (
          <div
            key={i}
            style={{
              scrollSnapAlign: "start",
              flexShrink: 0,
              width: itemWidth,
            }}
          >
            {child}
          </div>
        ))}
      </div>
      {showDots && count > 1 && (
        <PaginationDots count={count} active={activeIndex} color={dotColor} />
      )}
    </div>
  );
}
