// ─────────────────────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────

export const iS = { background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", padding: "7px 9px", borderRadius: "3px", fontSize: "16px", width: "100%", boxSizing: "border-box", fontFamily: "'JetBrains Mono', 'Courier New', monospace" };
export const lS = { fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "4px", display: "block" };

export function NT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "8px 17px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "var(--color-gold)" : "var(--color-bg-surface)", color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)", border: "1px solid " + (active ? "var(--color-gold)" : "var(--color-border-subtle)"), borderRadius: "4px", cursor: "pointer", }}>{label}</button>; }
export function VT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "7px 14px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "var(--color-gold)" : "var(--color-bg-surface)", color: active ? "var(--color-bg-base)" : "var(--color-text-secondary)", border: "1px solid " + (active ? "var(--color-gold)" : "var(--color-border-subtle)"), borderRadius: "4px", cursor: "pointer", }}>{label}</button>; }
export function Card({ label, val, sub, color, size = "19px" }) {
  return (
    <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", padding: "13px 11px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: "7px" }}>{label}</div>
      <div style={{ fontSize: size, fontWeight: "bold", color: color || "var(--color-text-primary)", fontFamily: "'DM Serif Display', Georgia, serif" }}>{val}</div>
      {sub && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
export function SmBtn({ children, onClick, c = "var(--color-text-secondary)", bg = "var(--color-bg-surface)" }) { return <button onClick={onClick} style={{ background: bg, color: c, border: `1px solid ${c}44`, borderRadius: "3px", padding: "4px 9px", fontSize: "11px", cursor: "pointer", }}>{children}</button>; }
export function SH({ children, color, right }) { const c = color || "var(--color-gold)"; return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", marginTop: "4px" }}><div style={{ display: "flex", alignItems: "center", gap: "12px" }}><div style={{ width: "3px", height: "18px", background: c, borderRadius: "2px", flexShrink: 0 }} /><div style={{ fontSize: "11px", letterSpacing: "3px", color: c, textTransform: "uppercase", fontWeight: "bold" }}>{children}</div></div>{right != null && <div style={{ fontSize: "12px", color: c, fontWeight: "bold" }}>{right}</div>}</div>; }
