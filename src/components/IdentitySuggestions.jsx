import { Pressable } from "./ui.jsx";
import { getArchetype } from "../constants/goalArchetypes.js";
import { EXPENSE_CYCLE_OPTIONS } from "../lib/expense.js";

// "Suggested for <identity>" card in Upkeep (TODO §31 Phase 2). Bills the chosen
// identity usually brings, offered BEFORE the user knows their real ones so the
// identity feels lived-in. Pure presentation: these rows are not expenses — they
// count toward nothing until Add turns one into a real Lifestyle bill through
// Upkeep's own add path (warden F182). Not me dismisses it for good.

const cycleSuffix = (cycle) => ({ weekly: "wk", biweekly: "2wk", every30days: "mo", yearly: "yr" }[cycle]
  ?? EXPENSE_CYCLE_OPTIONS.find((o) => o.value === cycle)?.label ?? "mo");

const btn = {
  borderRadius: "10px",
  padding: "6px 12px",
  letterSpacing: "1px",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};

export function IdentitySuggestions({ identity, suggestions = [], onAdd, onDismiss }) {
  const a = identity ? getArchetype(identity.archetypeId) : null;
  if (!a || suggestions.length === 0) return null;
  return (
    <section
      data-testid="identity-suggestions"
      style={{
        marginBottom: "20px",
        padding: "14px 16px",
        borderRadius: "14px",
        background: "linear-gradient(180deg, rgba(91,140,255,0.10), rgba(91,140,255,0.02))",
        border: "1px solid rgba(91,140,255,0.28)",
      }}
    >
      <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
        Suggested for {a.name}
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-secondary)", margin: "4px 0 10px" }}>
        Lifestyle bills this identity usually brings. They don't count toward anything until you add them.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {suggestions.map((s) => (
          <div key={s.templateKey} data-testid={`suggestion-${s.templateKey}`} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px", minWidth: 0 }}>
              <div className="text-base" style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{s.label}</div>
              <div className="text-xs" style={{ color: "var(--color-text-secondary)" }}>${s.amount}/{cycleSuffix(s.cycle)} · Lifestyle</div>
            </div>
            <Pressable scale={0.97} className="text-2xs" aria-label={`Add ${s.label}`} style={{ ...btn, background: "var(--color-teal)", border: "none", color: "var(--color-bg-base)", fontWeight: 700 }} onClick={() => onAdd?.(s)}>Add</Pressable>
            <Pressable scale={0.97} className="text-2xs" aria-label={`Not me: ${s.label}`} style={{ ...btn, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-secondary)" }} onClick={() => onDismiss?.(s)}>Not me</Pressable>
          </div>
        ))}
      </div>
    </section>
  );
}
