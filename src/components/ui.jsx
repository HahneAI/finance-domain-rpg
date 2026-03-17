// ─────────────────────────────────────────────────────────────
// SHARED UI PRIMITIVES
// ─────────────────────────────────────────────────────────────

export const iS = { background: "#0d0d0d", border: "1px solid #333", color: "#ddd8cc", padding: "6px 8px", borderRadius: "3px", fontSize: "12px", fontFamily: "'Courier New',monospace", width: "100%", boxSizing: "border-box" };
export const lS = { fontSize: "9px", letterSpacing: "2px", color: "#666", textTransform: "uppercase", marginBottom: "4px", display: "block" };

export function NT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "7px 15px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "#c8a84b" : "#1a1a1a", color: active ? "#0d0d0d" : "#888", border: "1px solid " + (active ? "#c8a84b" : "#333"), borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{label}</button>; }
export function VT({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: "6px 13px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", background: active ? "#c8a84b" : "#1a1a1a", color: active ? "#0d0d0d" : "#888", border: "1px solid " + (active ? "#c8a84b" : "#333"), borderRadius: "4px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{label}</button>; }
export function Card({ label, val, sub, color, size = "17px" }) {
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "12px 10px" }}>
      <div style={{ fontSize: "9px", letterSpacing: "3px", color: "#aaa", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: size, fontWeight: "bold", color: color || "#e8e0d0" }}>{val}</div>
      {sub && <div style={{ fontSize: "10px", color: "#999", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
export function SmBtn({ children, onClick, c = "#888", bg = "#1a1a1a" }) { return <button onClick={onClick} style={{ background: bg, color: c, border: `1px solid ${c}44`, borderRadius: "3px", padding: "3px 8px", fontSize: "10px", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>{children}</button>; }
