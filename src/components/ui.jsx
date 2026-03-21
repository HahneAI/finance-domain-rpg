// ─────────────────────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────

export const iS = { background: "#0d0d0d", border: "1px solid #333", color: "#ddd8cc", padding: "7px 9px", borderRadius: "3px", fontSize: "16px", fontFamily: "'Courier New',monospace", width: "100%", boxSizing: "border-box", minHeight: "48px" };
export const lS = { fontSize: "10px", letterSpacing: "2px", color: "#666", textTransform: "uppercase", marginBottom: "4px", display: "block" };

export function NT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "8px 17px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "#c8a84b" : "#1a1a1a", color: active ? "#0d0d0d" : "#888", border: "1px solid " + (active ? "#c8a84b" : "#333"), borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{label}</button>; }
export function VT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "7px 14px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "#c8a84b" : "#1a1a1a", color: active ? "#0d0d0d" : "#888", border: "1px solid " + (active ? "#c8a84b" : "#333"), borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{label}</button>; }
export function Card({ label, val, sub, color, size = "19px" }) {
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", padding: "13px 11px", position: "relative" }}>
      {/* ASCII corner decorators */}
      <span style={{ position: "absolute", top: "-1px", left: "-1px", color: "#444", fontFamily: "'Courier New',monospace", fontSize: "11px", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>┌</span>
      <span style={{ position: "absolute", top: "-1px", right: "-1px", color: "#444", fontFamily: "'Courier New',monospace", fontSize: "11px", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>┐</span>
      <span style={{ position: "absolute", bottom: "-1px", left: "-1px", color: "#444", fontFamily: "'Courier New',monospace", fontSize: "11px", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>└</span>
      <span style={{ position: "absolute", bottom: "-1px", right: "-1px", color: "#444", fontFamily: "'Courier New',monospace", fontSize: "11px", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>┘</span>
      <div style={{ fontSize: "10px", letterSpacing: "3px", color: "#aaa", textTransform: "uppercase", marginBottom: "7px" }}>{label}</div>
      <div style={{ fontSize: size, fontWeight: "bold", color: color || "#e8e0d0", textAlign: "right", fontFamily: "'Courier New',monospace" }}>{val}</div>
      {sub && <div style={{ fontSize: "11px", color: "#999", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
export function SmBtn({ children, onClick, c = "#888", bg = "#1a1a1a" }) { return <button onClick={onClick} style={{ background: bg, color: c, border: `1px solid ${c}44`, borderRadius: "3px", padding: "4px 9px", fontSize: "11px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{children}</button>; }
