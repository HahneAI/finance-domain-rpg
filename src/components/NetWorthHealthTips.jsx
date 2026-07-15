import { useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";

// Net Worth Health — Financial Breakthrough Tips
// ---------------------------------------------------------------------------
// A quiet, opt-in nudge surfaced beneath the Home "Net Worth Trend" tile when a
// user's projected savings cushion is thin (savings rate < 10%, see
// netWorthHealthStatus in finance.js). The gate decision lives in the parent;
// this component only renders the affordance + tips.
//
// Tone is deliberate: reassuring, never condescending. The goal is to validate
// that living close to the line is okay and common, while gently noting that a
// thin cushion can weigh on mental health over the long run — and offering
// small, no-pressure steps. No shame, no percentages shoved in the user's face,
// no "you're doing it wrong."
//
// Tips are curated/static for now. The `aiTip` prop is a forward slot so a
// future Claude-API personalized insight (Phase 3) can render alongside them.

const TIPS = [
  {
    title: "Start impossibly small",
    body: "Even $5 set aside each paycheck builds the habit. The rhythm matters more than the amount — momentum compounds.",
  },
  {
    title: "Pick one tiny win",
    body: "Trim a single expense this month, not your whole budget. One change that sticks beats ten that don't.",
  },
  {
    title: "Automate the boring part",
    body: "A small auto-transfer on payday saves you from deciding every week. Out of sight, quietly growing.",
  },
  {
    title: "Protect your sleep, not just your wallet",
    body: "A modest emergency buffer often calms more worry than its dollar value suggests. Peace of mind counts.",
  },
  {
    title: "Say it out loud",
    body: "Money stress grows in silence. A partner, a friend, or a free resource can lighten the weight of carrying it alone.",
  },
  {
    title: "Notice direction, not size",
    body: "Saving anything at all this month is real progress. Honor the trend — the numbers follow the habit.",
  },
];

// Deterministic 3-tip rotation keyed to the fiscal week, so the set is stable
// within a visit but gently refreshes over time. No randomness on render.
function pickTips(seed, count = 3) {
  const start = ((Number.isFinite(seed) ? seed : 0) % TIPS.length + TIPS.length) % TIPS.length;
  return Array.from({ length: count }, (_, i) => TIPS[(start + i) % TIPS.length]);
}

export function NetWorthHealthTips({ seed = 0, aiTip = null }) {
  const [open, setOpen] = useState(false);
  // Fold-up transition prototype (dropdown): open + close both fold from the top edge.
  const tipsFold = useFoldTransition(open, { ms: 280 });
  const tips = pickTips(seed);

  return (
    <div
      style={{
        marginTop: "12px",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-accent)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Collapsed header — calm teal cue, never alarm-colored */}
      <Pressable
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          minHeight: "44px",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--color-accent-primary)",
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: "9px",
              letterSpacing: "2.5px",
              textTransform: "uppercase",
              color: "var(--color-accent-primary)",
              marginBottom: "3px",
            }}
          >
            Financial Breakthrough
          </span>
          <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.35 }}>
            A gentle note on your savings cushion
          </span>
          {!open && (
            <span style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              A few small, no-pressure ideas — tap to read
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 200ms ease",
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </Pressable>

      {tipsFold.mounted && (
        <div className="fold-scale" data-fold={tipsFold.fold} style={{ padding: "0 16px 18px" }}>
          <div style={{ height: "1px", background: "var(--color-border-subtle)", margin: "0 0 14px" }} />

          {/* Reassuring framing — validate first, nudge second */}
          <p style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
            Your projected savings are running thin right now, and that's a really
            common place to be — you're covering your life, and that's no small
            thing. Living this way is okay. Over the long run, though, a slim
            cushion can quietly add background stress, so here are a few small
            steps if and when you're ready. No rush.
          </p>

          {/* Optional future AI-personalized insight slot */}
          {aiTip && (
            <div
              style={{
                background: "var(--color-bg-raised)",
                border: "1px solid var(--color-border-accent)",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "14px",
              }}
            >
              <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", marginBottom: "4px" }}>
                Personalized
              </div>
              <div style={{ fontSize: "12.5px", lineHeight: 1.55, color: "var(--color-text-primary)" }}>{aiTip}</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {tips.map((tip) => (
              <div key={tip.title} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "var(--color-accent-primary)",
                    marginTop: "6px",
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "2px" }}>
                    {tip.title}
                  </div>
                  <div style={{ fontSize: "12px", lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                    {tip.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Mental-health acknowledgment + soft footer */}
          <div style={{ height: "1px", background: "var(--color-border-subtle)", margin: "16px 0 12px" }} />
          <p style={{ fontSize: "11.5px", lineHeight: 1.55, color: "var(--color-text-secondary)", margin: 0 }}>
            If money worry is wearing on you, that's worth taking seriously —
            you're not alone in it, and support is out there. These are gentle
            ideas, not rules. You know your life best.
          </p>
        </div>
      )}
    </div>
  );
}
