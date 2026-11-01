// One-line Coach note at the top of a panel (TODO §32 A4). Text comes from lib/coachNotes.js —
// fixed templates over figures the panel already shows; no model call. Renders nothing for null.
export function CoachNote({ text }) {
  if (!text) return null;
  return (
    <div
      data-testid="coach-note"
      style={{
        display: "flex", gap: "10px", alignItems: "flex-start",
        padding: "12px 14px", marginBottom: "16px",
        background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "12px",
      }}
    >
      <span className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)", fontWeight: 700, flexShrink: 0, paddingTop: "2px" }}>
        Coach
      </span>
      <span className="text-sm" style={{ color: "var(--color-text-primary)", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
