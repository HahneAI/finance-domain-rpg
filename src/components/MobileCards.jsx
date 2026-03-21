// ─────────────────────────────────────────────────────────────
// MOBILE CARD-FIRST PRIMITIVES
//
// Three building blocks for the progressive-disclosure layout:
//   HeroCard   — full-width banner, single number, eye-catching
//   CategoryRow — tappable flex row, animates accordion on open
//   SwipeDeck / SwipeCard — horizontal snap-scroll card rail
//
// No external dependencies — pure React + inline CSS.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

// ── HeroCard ─────────────────────────────────────────────────
// The single most important number per panel.
// Typography is intentionally oversize so the eye lands here first.
export function HeroCard({ label, value, sub, color = "#c8a84b" }) {
  return (
    <div style={{
      background: "#141414",
      border: `2px solid ${color}44`,
      borderRadius: "12px",
      padding: "24px 20px 20px",
      marginBottom: "16px",
      textAlign: "center",
    }}>
      <div style={{
        fontSize: "10px", letterSpacing: "4px", color: "#555",
        textTransform: "uppercase", marginBottom: "10px",
        fontFamily: "'Courier New',monospace",
      }}>{label}</div>
      <div style={{
        fontSize: "44px", fontWeight: "bold", color,
        fontFamily: "'Courier New',monospace", lineHeight: 1,
        letterSpacing: "-1px",
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: "11px", color: "#555", marginTop: "10px",
          letterSpacing: "1px", fontFamily: "'Courier New',monospace",
        }}>{sub}</div>
      )}
    </div>
  );
}

// ── CategoryRow ───────────────────────────────────────────────
// A full-width tappable row: label left, value right.
// Tap gives 150 ms highlight then accordion expands via max-height.
// Chevron rotates 180° on open.
// Min-height 52px ensures ≥ 44px tap target with padding buffer.
export function CategoryRow({ label, value, color, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [pressed, setPressed] = useState(false);

  return (
    <div style={{ marginBottom: "6px" }}>
      <button
        onClick={() => setOpen(o => !o)}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        aria-expanded={open}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          minHeight: "52px",
          padding: "14px 16px",
          background: pressed ? "#1c1c1c" : "#141414",
          border: "1px solid #1e1e1e",
          borderBottom: open ? "1px solid #111" : "1px solid #1e1e1e",
          borderRadius: open ? "8px 8px 0 0" : "8px",
          cursor: "pointer",
          fontFamily: "'Courier New',monospace",
          transition: "background 150ms ease",
          boxSizing: "border-box",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "13px", color: "#e8e0d0" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <span style={{ fontSize: "15px", fontWeight: "bold", color: color ?? "#e8e0d0" }}>
            {value}
          </span>
          <span style={{
            fontSize: "10px", color: "#555",
            display: "inline-block",
            transition: "transform 200ms ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}>▾</span>
        </div>
      </button>

      {/* Accordion body — max-height transition from 0 → large value */}
      <div style={{
        overflow: "hidden",
        maxHeight: open ? "4000px" : "0",
        transition: open ? "max-height 200ms ease" : "max-height 200ms ease",
      }}>
        <div style={{
          background: "#111",
          border: "1px solid #1e1e1e",
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
          padding: "12px 16px",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── SwipeDeck ─────────────────────────────────────────────────
// Horizontal snap-scroll rail for goals / loans.
// scroll-snap-type: x mandatory — cards click into place.
// Scrollbar hidden via .swipe-deck CSS class (see App.css).
// -webkit-overflow-scrolling: touch — momentum scroll on iOS.
export function SwipeDeck({ children, title, action }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      {(title || action) && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "10px", padding: "0 2px",
        }}>
          {title && (
            <div style={{
              fontSize: "10px", letterSpacing: "3px", color: "#888",
              textTransform: "uppercase", fontFamily: "'Courier New',monospace",
            }}>{title}</div>
          )}
          {action && action}
        </div>
      )}
      <div
        className="swipe-deck"
        style={{
          display: "flex",
          overflowX: "auto",
          gap: "12px",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          paddingBottom: "8px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── SwipeCard ─────────────────────────────────────────────────
// Individual card inside a SwipeDeck.
// Width = min(280px, 100vw - 48px) so one card is always peeking.
export function SwipeCard({ children, color = "#333" }) {
  return (
    <div style={{
      scrollSnapAlign: "start",
      flexShrink: 0,
      width: "min(280px, calc(100vw - 48px))",
      background: "#141414",
      border: `1px solid ${color}`,
      borderRadius: "10px",
      padding: "16px",
      boxSizing: "border-box",
      position: "relative",
      overflow: "visible",
    }}>
      {children}
    </div>
  );
}
