import { useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";

// Net Worth Health — Coach's static tips
// ---------------------------------------------------------------------------
// A quiet, opt-in nudge surfaced beneath the Home "Net Worth Trend" tile when a
// user's projected savings cushion is thin (savings rate < 10%, see
// netWorthHealthStatus in finance.js). The gate decision lives in the parent;
// this component only renders the affordance + tips.
//
// Tone is deliberate: reassuring, never condescending — the goal is to validate
// that living close to the line is okay and common, while gently noting that a
// thin cushion can weigh on mental health over the long run. No shame, no
// percentages shoved in the user's face, no "you're doing it wrong."
//
// Copy rewritten 2026-07-25 (docs/TODO.md §18.C's copy-audit note) to sound like
// Coach instead of a generic self-help placeholder: first person, direct, and —
// per the rewrite's own instruction — every tip below names a real lever inside
// the app (Budget, Home's goal order, Account's paycheck buffer, Log, Income),
// not a generic affirmation. Deliberately near-zero boxing metaphor here, the
// same restraint coachPrompts.js's Red tier uses — this fires at exactly the
// kind of thin-cushion moment where plainness should outrank flavor.
//
// Tips are curated/static for now. The `aiTip` prop is a forward slot so a
// future Claude-API personalized insight (Phase 3) can render alongside them.

const TIPS = [
  {
    title: "Pick one number, not the whole budget",
    body: "Open Budget and find one Lifestyle expense you can trim or pause this month — one change that sticks beats a full overhaul that doesn't.",
  },
  {
    title: "Put your easiest goal first",
    body: "Goals fund in the order you rank them on Home — drag your smallest one to the top so it finishes first and gives you something real to point to.",
  },
  {
    title: "Check your buffer, not just your balance",
    body: "Your paycheck buffer in Account is there to absorb a rough week — if it's set low or off, that's worth a second look before you need it.",
  },
  {
    title: "Log it the moment it happens",
    body: "A raise, extra hours, a missed shift — log it in Log as soon as it happens so your projections reflect what's actually true, not what you assumed.",
  },
  {
    title: "Watch the trend, not the number",
    body: "Net Worth Trend on Home tracks direction over time — a cushion that's growing, even slowly, is real progress no matter how thin it still looks today.",
  },
  {
    title: "Know what's coming before it lands",
    body: "Check Income for next week's net before payday — no surprises means no scrambling, and scrambling is what actually drains a thin cushion fastest.",
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
            A note from Coach
          </span>
          <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.35 }}>
            A few real levers for a thin cushion
          </span>
          {!open && (
            <span style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              No pressure — tap to read
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
            Your savings cushion is running thin right now — that's common, not a
            failure, and it doesn't mean you're doing anything wrong. Here are a
            few real levers you can pull inside the app, whenever you're ready.
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
            If the money worry itself is wearing on you, that's worth taking
            seriously — support exists beyond what this app can offer, and
            reaching for it isn't a last resort. These are levers, not rules.
          </p>
        </div>
      )}
    </div>
  );
}
