import { Pressable } from "./ui.jsx";

// An eager save (wizard completion, weekly check-in confirm, profile edit)
// failed and the automatic retry (App.jsx's savePersistedStateNow, 3s later)
// also didn't land — surface it so a real failure isn't invisible. Clears
// itself automatically the moment any save (auto-retry or manual) succeeds.
// `message` is the real Supabase/network error text (not a generic guess) —
// shown as-is so a genuine server-side rejection is distinguishable from
// actually being offline.
export function SaveFailedBanner({ message, onRetry, onDismiss }) {
  return (
    <div style={{
      background: "rgba(244,164,164,0.08)", border: "1px solid rgba(244,164,164,0.28)",
      borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-deduction)", flexShrink: 0 }} />
      <div className="text-sm" style={{ flex: 1, minWidth: "180px", color: "var(--color-deduction)" }}>
        Couldn't save your last change{message ? ` — ${message}` : ""}
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <Pressable
          onClick={onRetry}
          className="text-xs" style={{ background: "var(--color-deduction)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "6px 14px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
        >
          Retry
        </Pressable>
        <Pressable
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-md" style={{ background: "transparent", color: "var(--color-deduction)", border: "none", cursor: "pointer", padding: "2px 6px" }}
        >
          ✕
        </Pressable>
      </div>
    </div>
  );
}
