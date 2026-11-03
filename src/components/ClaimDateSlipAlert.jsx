import { Pressable } from "./ui.jsx";
import { formatClaimDay, slipLengthText } from "../lib/claimDateWatch.js";
import { claimSlipCoachSeed } from "../lib/coachSeeds.js";

// Claim Date slip alert (TODO §32 C3). Fixed copy over lib/claimDateWatch.js's slips — no model call,
// so the dates are exactly the goal cards' own. "Got it" moves the baseline to today's dates (the
// caller eager-saves); "Ask Coach why" hands Coach a rank-only question (only when onAskCoach exists).
export function ClaimDateSlipAlert({ slips = [], onAcknowledge, onAskCoach }) {
  if (!slips.length) return null;
  const top = [...slips].sort((a, b) => b.daysLater - a.daysLater)[0];
  const others = slips.length - 1;
  return (
    <div
      data-testid="claim-slip-alert"
      role="status"
      style={{ marginBottom: "16px", padding: "14px 16px", background: "var(--color-bg-surface)", border: "1px solid var(--color-warning)", borderRadius: "12px" }}
    >
      <div className="text-2xs" style={{ letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-warning)", marginBottom: "6px" }}>
        Coach — Claim Date moved
      </div>
      <div className="text-base" style={{ color: "var(--color-text-primary)", lineHeight: 1.5 }}>
        Goal {top.rank}'s Claim Date slipped {slipLengthText(top.daysLater)}, from {formatClaimDay(top.fromIso)} to {formatClaimDay(top.toIso)}.
        {others > 0 ? ` ${others} other ${others === 1 ? "goal" : "goals"} moved too.` : ""}
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
        {onAskCoach && (
          <Pressable
            onClick={() => onAskCoach(claimSlipCoachSeed(top.rank, formatClaimDay(top.fromIso), formatClaimDay(top.toIso)))}
            className="text-xs"
            style={{ padding: "8px 16px", borderRadius: "12px", border: "none", background: "var(--color-teal)", color: "var(--color-bg-base)", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
          >Ask Coach why</Pressable>
        )}
        <Pressable
          onClick={onAcknowledge}
          className="text-xs"
          style={{ padding: "7px 14px", borderRadius: "12px", background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
        >Got it</Pressable>
      </div>
    </div>
  );
}
