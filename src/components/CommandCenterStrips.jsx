import { useEffect, useState } from "react";
import { Pressable } from "./ui.jsx";
import { loadCoachMemory } from "../lib/db.js";

// Home command center strips (TODO §32 D3). Both are read-only — nothing here saves.

const eyebrow = { letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: 700, marginBottom: "10px" };
const row = {
  display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", textAlign: "left",
  padding: "12px 14px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
  borderRadius: "12px", color: "var(--color-text-primary)", cursor: "pointer",
};

export const REMEMBERS_SHOWN = 3;

// "Coach remembers" — up to three saved memories, in the user's own words (F186), newest first
// (loadCoachMemory's order). Hidden when memory is switched off, while loading, or when there is
// nothing saved — including before migration 049 is applied, where the load fails quiet to [].
export function CoachRemembersStrip({ memoryOff = false, onSeeAll }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (memoryOff) return undefined;
    let cancelled = false;
    loadCoachMemory().then((rows) => { if (!cancelled) setItems(rows ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [memoryOff]);
  if (memoryOff || items.length === 0) return null;
  return (
    <section aria-label="Coach remembers" data-coach-ref="home-coach-remembers" style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div className="text-2xs" style={eyebrow}>Coach remembers</div>
        {onSeeAll && (
          <Pressable
            type="button" onClick={onSeeAll} className="text-xs"
            style={{ background: "transparent", border: "none", color: "var(--color-teal)", letterSpacing: "1px", textTransform: "uppercase", fontWeight: 700, padding: "4px 0", cursor: "pointer" }}
          >
            See all{items.length > REMEMBERS_SHOWN ? ` (${items.length})` : ""}
          </Pressable>
        )}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "8px" }}>
        {items.slice(0, REMEMBERS_SHOWN).map((m) => (
          <li key={m.id} className="text-sm" style={{ ...row, cursor: "default", lineHeight: 1.5 }}>“{m.body}”</li>
        ))}
      </ul>
    </section>
  );
}

// "Around the app" — each panel's own Coach note (lib/coachNotes.js, computed by the caller from the
// exact figures that panel shows — F113) as a one-liner that opens the panel. `label` is the
// panel's user-facing name from App's VIEW_LABELS (F178), never the route key.
export function AroundTheAppStrip({ items = [], onOpen }) {
  const shown = items.filter((it) => it.text);
  if (!shown.length || !onOpen) return null;
  return (
    <section aria-label="Around the app" data-coach-ref="home-around-the-app" style={{ marginBottom: "20px" }}>
      <div className="text-2xs" style={eyebrow}>Around the app</div>
      <div style={{ display: "grid", gap: "8px" }}>
        {shown.map((it) => (
          <Pressable key={it.view} type="button" onClick={() => onOpen(it.view)} aria-label={`Open ${it.label}: ${it.text}`} style={row}>
            <span className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)", fontWeight: 700, flexShrink: 0, paddingTop: "2px", minWidth: "52px" }}>
              {it.label}
            </span>
            <span className="text-sm" style={{ flex: 1, lineHeight: 1.5 }}>{it.text}</span>
            <span aria-hidden="true" className="text-md" style={{ color: "var(--color-text-secondary)" }}>›</span>
          </Pressable>
        ))}
      </div>
    </section>
  );
}
