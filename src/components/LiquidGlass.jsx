// ─────────────────────────────────────────────────────────────
// LIQUID GLASS — Authority Finance premium UI layer
//
// Reusable frosted-glass container. Applies backdrop-filter blur
// + semi-transparent tint + optional accent border.
//
// Props:
//   tone       — "teal" (default) | "purple"
//   intensity  — "light" (default) | "strong"
//   withBorder — true (default) | false
//   purpose    — REQUIRED. Must be one of: "nav" | "pulse" | "modal" | "log-summary"
//   style      — additional inline styles merged onto the wrapper
//   className  — forwarded className
//
// Placement rules (enforced via DEV warning):
//   Allowed  → nav, pulse, modal, log-summary
//   Banned   → primary cards, tables, buttons
//   To add a new placement: update docs/premium-ui-TODO.md first,
//   then extend ALLOWED_PURPOSES here.
// ─────────────────────────────────────────────────────────────

const ALLOWED_PURPOSES = ["nav", "pulse", "modal", "log-summary"];

const BLUR = {
  light:  "12px",
  strong: "20px",
};

const TINT = {
  teal:   "rgba(0, 200, 150, 0.07)",
  purple: "rgba(124, 92, 255, 0.07)",
};

const BORDER_COLOR = {
  teal:   "rgba(0, 200, 150, 0.18)",
  purple: "rgba(124, 92, 255, 0.22)",
};

export function LiquidGlass({
  children,
  tone = "teal",
  intensity = "light",
  withBorder = true,
  purpose,
  style,
  className,
}) {
  if (import.meta.env.DEV && !ALLOWED_PURPOSES.includes(purpose)) {
    console.warn(
      `[LiquidGlass] Unwhitelisted purpose: "${purpose}". ` +
        `Allowed: ${ALLOWED_PURPOSES.join(", ")}. ` +
        `Update docs/premium-ui-TODO.md before adding new placements.`,
    );
  }

  const blurValue    = BLUR[intensity]       ?? BLUR.light;
  const tintValue    = TINT[tone]            ?? TINT.teal;
  const borderValue  = BORDER_COLOR[tone]    ?? BORDER_COLOR.teal;

  return (
    <div
      data-glass-purpose={purpose}
      style={{
        backdropFilter:         `blur(${blurValue})`,
        WebkitBackdropFilter:   `blur(${blurValue})`,
        background:             tintValue,
        ...(withBorder && { border: `1px solid ${borderValue}` }),
        ...style,
      }}
      className={className}
    >
      {children}
    </div>
  );
}
