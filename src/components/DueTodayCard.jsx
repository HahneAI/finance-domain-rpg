import { useState } from "react";
import { Pressable } from "./ui.jsx";

// "Due today" card (TODO §20.C, shotgun run #3). A dismissible in-app banner — not a
// native push (PWA push is a separate scope). Shows once per calendar day: dismissing
// stores today's ISO date in localStorage, so it returns tomorrow. Presentation only —
// `bills` comes from getBillsDueOn (App.jsx computes it once, like the other Home figures).
const KEY = "afin.dueToday.dismissedOn";
const readDismissed = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const writeDismissed = (iso) => { try { localStorage.setItem(KEY, iso); } catch { /* storage unavailable — dismiss for this view only */ } };

export function DueTodayCard({ bills, todayIso }) {
  const [dismissedOn, setDismissedOn] = useState(readDismissed);
  if (!bills?.length || dismissedOn === todayIso) return null;
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const dismiss = () => { writeDismissed(todayIso); setDismissedOn(todayIso); };
  return (
    <div
      role="status" aria-label="Bills due today"
      style={{
        display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", marginBottom: "16px",
        background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.32)", borderRadius: "12px",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-2xs" style={{ color: "var(--color-warning)", letterSpacing: "2px", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
          Due today · ${Math.round(total).toLocaleString()}
        </div>
        <div className="text-base" style={{ color: "var(--color-text-primary)", lineHeight: 1.5 }}>
          {bills.map((b, i) => (
            <span key={b.id}>{i > 0 ? " · " : ""}{b.label} <span style={{ color: "var(--color-text-secondary)" }}>${Math.round(b.amount).toLocaleString()}</span></span>
          ))}
        </div>
      </div>
      <Pressable
        onClick={dismiss} aria-label="Dismiss due today"
        className="text-xs"
        style={{ background: "transparent", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-secondary)", padding: "6px 10px", cursor: "pointer", letterSpacing: "1.5px", textTransform: "uppercase" }}
      >
        Got it
      </Pressable>
    </div>
  );
}
