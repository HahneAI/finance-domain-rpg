import { Pressable } from "./ui.jsx";

// Confirms (or explains the failure of) the beta-code signup-link auto-apply
// (App.jsx's SIGNED_IN handler, PENDING_BETA_CODE_STORAGE_KEY) — someone who
// scanned a flyer QR code or clicked a website link expecting beta access
// deserves to know whether it actually landed, not just a silent console
// warning. Most common failure: the 40-seat cap (migration
// 034_beta_seat_cap.sql) — api/seed.js returns "The beta program is full"
// verbatim, shown here as-is, same "real message, not a generic guess"
// convention as SaveFailedBanner.
export function BetaSignupNoticeBanner({ status, message, onDismiss }) {
  const isSuccess = status === "success";
  const dotColor = isSuccess ? "var(--color-teal)" : "var(--color-warning)";
  const textColor = isSuccess ? "var(--color-text-primary)" : "var(--color-warning)";
  return (
    <div style={{
      background: "var(--color-bg-surface)",
      border: `1px solid ${isSuccess ? "var(--color-border-accent)" : "rgba(245,158,11,0.28)"}`,
      borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: "180px", fontSize: "12px", color: textColor }}>
        {isSuccess ? "You're in the beta — welcome aboard." : (message || "Beta signup didn't go through.")}
      </div>
      <Pressable
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: "transparent", color: textColor, border: "none", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}
      >
        ✕
      </Pressable>
    </div>
  );
}
