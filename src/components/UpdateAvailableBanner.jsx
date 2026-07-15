import { Pressable } from "./ui.jsx";

// New service worker is installed and waiting (main.jsx's onNeedRefresh).
// Reload is user-initiated only — see vite.config.js registerType comment for why
// an automatic reload here previously reset the app mid-session.
export function UpdateAvailableBanner({ onUpdate, onDismiss }) {
  return (
    <div style={{
      background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)",
      borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-gold)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: "180px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
        A new version is ready — refresh when you're done editing.
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <Pressable
          onClick={onUpdate}
          style={{ background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "6px 14px", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
        >
          Refresh
        </Pressable>
        <Pressable
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}
        >
          ✕
        </Pressable>
      </div>
    </div>
  );
}
