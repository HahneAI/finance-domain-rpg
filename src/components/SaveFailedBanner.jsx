import { Pressable } from "./ui.jsx";

// An eager save (wizard completion, weekly check-in confirm, profile edit)
// failed and the automatic retry (App.jsx's savePersistedStateNow, 3s later)
// also didn't land — surface it so a real failure isn't invisible. Clears
// itself automatically the moment any save (auto-retry or manual) succeeds.
export function SaveFailedBanner({ onRetry }) {
  return (
    <div style={{
      background: "rgba(244,164,164,0.08)", border: "1px solid rgba(244,164,164,0.28)",
      borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-deduction)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: "180px", fontSize: "12px", color: "var(--color-deduction)" }}>
        Couldn't save your last change — check your connection.
      </div>
      <Pressable
        onClick={onRetry}
        style={{ background: "var(--color-deduction)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "6px 14px", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
      >
        Retry
      </Pressable>
    </div>
  );
}
