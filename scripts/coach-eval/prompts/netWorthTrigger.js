// Phase 5 (docs/TODO.md §2.L) — Net Worth Trigger's three tiers
// (buildNetWorthSystemPrompt(tier), src/lib/coachPrompts.js). Imports the
// real export, never a copied string.
//
// Matches CoachNetWorthCard.jsx's actual call shape: a fixed trigger
// message ("Write my check-in message now.", never a real user question —
// this surface speaks up on its own), and buildCoachContext()'s narrower
// param set the real component passes (no logs/futureWeeks/timelineWeekNets/
// etc. — those default the same way for both).
//
// This is the DESIGNED counterpart to Phase 4's accidental finding: Red's
// addendum explicitly instructs dropping metaphor for urgency ("urgency
// outranks flavor... drop the corner-man phrasing entirely"), unlike Ask
// Coach's severity flexing, which happened with no instruction for it at
// all. Worth comparing the two once both are sampled.
import { buildNetWorthSystemPrompt } from "../../../src/lib/coachPrompts.js";
import { buildTestContext } from "../fixtures/testAccount.js";

const TIER_CONTEXT = {
  // Amber's real trigger condition (coachTriggers.js): projected savings
  // cushion running thin. 770/845 lands the real netWorthHealthStatus()
  // "below 10% target" flag (9%), not just the addendum text alone.
  amber: () => buildTestContext({ weeklyIncome: 845, avgWeeklySpend: 770 }),
  // Red's real trigger condition: New Job Season, runway under 30 days —
  // needs newJobSeasonMode + runwayDays set, not just the addendum text.
  red: () => buildTestContext({ weeklyIncome: 845, avgWeeklySpend: 700, newJobSeasonMode: true, runwayDays: 22 }),
  // Green's real trigger condition: a previously-flagged account that's no
  // longer flagged. Standing in with a genuinely healthy account state
  // (same shape as Phase 4's "healthy" variant) — this probes the
  // addendum's OUTPUT style given good numbers, not the trigger-detection
  // logic itself, which lives in coachTriggers.js and isn't what this
  // harness tests.
  green: () => buildTestContext({ weeklyIncome: 845, avgWeeklySpend: 85 }),
};

export default function ({ vars }) {
  const systemPrompt = buildNetWorthSystemPrompt(vars.tier);
  const context = TIER_CONTEXT[vars.tier]();
  return [
    { role: "system", content: `${systemPrompt}\n\n${context}` },
    { role: "user", content: "Write my check-in message now." },
  ];
}
