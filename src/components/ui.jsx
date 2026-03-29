import { useState, useEffect, useRef } from "react";

function useCountUp(target, duration = 1200) {
  const [counted, setCounted] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (target == null || isNaN(target)) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    const sign = target < 0 ? -1 : 1;
    const abs = Math.abs(target);

    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCounted(sign * Math.round(abs * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return counted;
}

export const iS = {
  background: "var(--color-bg-secondary)",
  border: "1px solid var(--color-border-subtle)",
  color: "var(--color-text-primary)",
  padding: "10px 12px",
  borderRadius: "10px",
  fontSize: "16px",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "'JetBrains Mono', 'SF Mono', 'Courier New', monospace",
  minHeight: "44px",
};

export const lS = {
  fontSize: "10px",
  letterSpacing: "2px",
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  marginBottom: "4px",
  display: "block",
  fontFamily: "var(--font-sans)",
};

function tokenButton(active) {
  return {
    padding: "10px 16px",
    minHeight: "44px",
    fontSize: "11px",
    letterSpacing: "2px",
    textTransform: "uppercase",
    fontFamily: "var(--font-sans)",
    background: active ? "rgba(110,91,255,0.16)" : "var(--color-bg-secondary)",
    color: active ? "var(--color-accent-primary)" : "var(--color-text-secondary)",
    border: `1px solid ${active ? "rgba(110,91,255,0.45)" : "var(--color-border-subtle)"}`,
    borderRadius: "12px",
    cursor: "pointer",
  };
}

export function NT({ label, active, onClick }) {
  return <button onClick={onClick} style={tokenButton(active)}>{label}</button>;
}

export function VT({ label, active, onClick }) {
  return <button onClick={onClick} style={tokenButton(active)}>{label}</button>;
}

const METRIC_STATUS = {
  green: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.28)", val: "var(--color-success)" },
  gold: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.26)", val: "var(--color-warning)" },
  red: { bg: "rgba(239,68,68,0.09)", border: "rgba(239,68,68,0.28)", val: "var(--color-danger)" },
};

const _fmt$ = (n) => {
  if (n == null || isNaN(n)) return "$—";
  const abs = Math.abs(n);
  const s = abs >= 1000
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : Math.round(abs).toString();
  return `${n < 0 ? "-" : ""}$${s}`;
};

export function MetricCard({ label, val, sub, color, size = "22px", status, onClick, span, rawVal, entranceIndex, progress }) {
  const [pressed, setPressed] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const prevRaw = useRef(null);

  const counted = useCountUp(rawVal ?? 0);

  useEffect(() => {
    if (rawVal == null) return;
    if (prevRaw.current === null) {
      prevRaw.current = rawVal;
      return;
    }
    if (prevRaw.current !== rawVal) {
      prevRaw.current = rawVal;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 150);
      return () => clearTimeout(t);
    }
  }, [rawVal]);

  const s = status ? METRIC_STATUS[status] : null;
  const isButton = !!onClick;

  const entranceStyle = entranceIndex != null
    ? {
      animation: "fadeSlideUp 0.4s ease-out both",
      animationDelay: `${Math.min(entranceIndex * 0.08, 0.4)}s`,
    }
    : {};

  const containerStyle = {
    gridColumn: span === 2 ? "span 2" : undefined,
    background: s ? s.bg : "var(--color-bg-secondary)",
    border: `1px solid ${s ? s.border : "var(--color-border-subtle)"}`,
    borderRadius: "18px",
    padding: isButton ? "16px 18px" : "18px 16px",
    textAlign: "left",
    color: "inherit",
    minWidth: 0,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
    ...entranceStyle,
    ...(isButton && {
      cursor: "pointer",
      transform: pressed ? "scale(0.98)" : "scale(1)",
      transition: "transform 100ms ease, border-color 0.2s ease",
      minHeight: "88px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      minWidth: 0,
    }),
  };

  const baseValColor = color || (s ? s.val : "var(--color-text-primary)");
  const valColor = flashing ? "var(--color-accent-soft)" : baseValColor;
  const displayVal = rawVal != null ? _fmt$(counted) : val;

  const content = (
    <>
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: isButton ? "2px" : "8px", fontFamily: "var(--font-sans)" }}>
        {label}
      </div>
      <div style={{ fontSize: size, fontWeight: 600, color: valColor, fontFamily: "var(--font-display)", lineHeight: 1, fontVariantNumeric: "tabular-nums", transition: "color 0.6s ease" }}>
        {displayVal}
      </div>
      {sub && (
        <div style={{ fontSize: isButton ? "10px" : "11px", color: "var(--color-text-secondary)", marginTop: isButton ? "auto" : "5px", paddingTop: isButton ? "6px" : 0, fontFamily: "var(--font-sans)" }}>
          {sub}
        </div>
      )}
      {typeof progress === "number" && (
        <div style={{ marginTop: "8px", height: "4px", width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
              background: "linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-soft))",
              borderRadius: "999px",
            }}
          />
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

export const Card = MetricCard;

function toneFromStatus(status) {
  if (status === "green") {
    return {
      border: "rgba(34,197,94,0.34)",
      bg: "rgba(34,197,94,0.08)",
      text: "var(--color-success)",
    };
  }
  if (status === "red") {
    return {
      border: "rgba(239,68,68,0.34)",
      bg: "rgba(239,68,68,0.08)",
      text: "var(--color-danger)",
    };
  }
  return {
    border: "rgba(110,91,255,0.40)",
    bg: "rgba(110,91,255,0.10)",
    text: "var(--color-accent-soft)",
  };
}

export function ExecutivePulseCard({ title = "Executive Pulse", summary, tags = [], status = "gold", detail }) {
  const tone = toneFromStatus(status);
  return (
    <div
      style={{
        marginBottom: "12px",
        borderRadius: "18px",
        border: `1px solid ${tone.border}`,
        background: "linear-gradient(165deg, rgba(18,18,26,0.96) 0%, rgba(18,18,26,0.74) 100%)",
        padding: "15px 16px",
        boxShadow: "0 8px 28px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "2.8px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
          {title}
        </div>
        <div style={{ padding: "4px 9px", borderRadius: "999px", border: `1px solid ${tone.border}`, background: tone.bg, color: tone.text, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", fontWeight: 600 }}>
          {status === "green" ? "Stable" : status === "red" ? "Needs Focus" : "Building"}
        </div>
      </div>

      <div style={{ color: "var(--color-text-primary)", fontSize: "14px", lineHeight: 1.55, marginBottom: tags.length ? "12px" : "4px" }}>
        {summary}
      </div>

      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "10px",
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "999px",
                padding: "5px 9px",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {detail && (
        <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--color-text-secondary)", letterSpacing: "0.3px" }}>
          {detail}
        </div>
      )}
    </div>
  );
}

export function SmBtn({ children, onClick, c = "var(--color-text-secondary)", bg = "var(--color-bg-secondary)" }) {
  return <button onClick={onClick} style={{ background: bg, color: c, border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "10px 14px", minHeight: "44px", fontSize: "11px", fontFamily: "var(--font-sans)", cursor: "pointer" }}>{children}</button>;
}

export function SH({ children, color, right }) {
  const c = color || "var(--color-accent-primary)";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", marginTop: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "3px", height: "18px", background: c, borderRadius: "2px", flexShrink: 0 }} />
        <div style={{ fontSize: "11px", letterSpacing: "3px", color: c, textTransform: "uppercase", fontWeight: 600, fontFamily: "var(--font-sans)" }}>{children}</div>
      </div>
      {right != null && <div style={{ fontSize: "12px", color: c, fontWeight: 600, fontFamily: "var(--font-sans)" }}>{right}</div>}
    </div>
  );
}
