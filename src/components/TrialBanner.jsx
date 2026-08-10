import { Pressable } from "./ui.jsx";

// Persistent phase-aware banner (docs/TODO.md §17.F). Renders nothing once
// entitled via a real subscription (state "active") or when no trial window
// was ever seeded (state "none" — investor/demo/admin-bypassed accounts).
// Copy for grace/expired deliberately never hints that access continues
// past the public 14-day trial — same disclosure rule as the Upgrade panels.
export function TrialBanner({ entitlement, onUpgrade, onDismiss }) {
  const { state, trialDaysLeft } = entitlement;
  if (state !== "trial" && state !== "grace" && state !== "expired") return null;

  const urgent = state !== "trial" || trialDaysLeft <= 3;
  const tone = state === "expired" ? "red" : urgent ? "warning" : "neutral";

  const copy = state === "trial"
    ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial`
    : state === "grace"
      ? "Your trial ended — add a card to keep using the app"
      : "Trial ended — add a card to restore full access";

  const toneStyles = {
    neutral: { background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", dot: "var(--color-text-secondary)", text: "var(--color-text-secondary)" },
    warning: { background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.32)", dot: "var(--color-warning)", text: "var(--color-warning)" },
    red: { background: "rgba(244,164,164,0.08)", border: "1px solid rgba(244,164,164,0.28)", dot: "var(--color-deduction)", text: "var(--color-deduction)" },
  }[tone];

  return (
    <div style={{
      background: toneStyles.background, border: toneStyles.border,
      borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: toneStyles.dot, flexShrink: 0 }} />
      <div className="text-sm" style={{ flex: 1, minWidth: "180px", color: tone === "neutral" ? "var(--color-text-secondary)" : toneStyles.text }}>
        {copy}
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <Pressable
          onClick={onUpgrade}
          className="text-xs" style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "6px 14px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
        >
          Upgrade
        </Pressable>
        <Pressable
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-md" style={{ background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", padding: "2px 6px" }}
        >
          ✕
        </Pressable>
      </div>
    </div>
  );
}
