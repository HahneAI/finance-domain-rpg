// §18.C — Net Worth Trend Mental Health Trigger. Pure, side-effect-free signal
// resolution + rate-limiting; the calling component owns all persistence and
// rendering. Deliberately proxied against data that already exists rather than
// the literal spec in docs/TODO.md §18.C, since a few of those conditions need
// history this app doesn't persist yet:
//   - Amber uses netWorthHealthStatus().belowThreshold (thin savings cushion)
//     as a proxy for "flat/declining ≥3 consecutive weeks" — a real trend read
//     would need a persisted weekly net-worth series, which doesn't exist.
//   - Green is "previousTier was amber/red, now neither" — this reads our own
//     trigger history, not an independent net-worth-delta computation.
//   - "Single-period drop > 10%" and "goal ETA drift > 4 weeks" are NOT
//     implemented — both need historical snapshots this app doesn't store.
// See docs/TODO.md §18.C for the full/faithful spec and what's deferred.
//
// The Red tier's runway number used to come from a local estimateRunwayDays()
// here — a simplified, independent formula (drift-app-warden §21 F24) that
// ignored persisted jobLossCashOnHand and job-hunt income, so it always read
// as a conservative floor vs. the real computeJobLossRunway() (lib/
// jobLossRunway.js) the Job Loss panels use. Removed 2026-07-21: callers now
// pass runwayDays computed via computeJobLossRunway()/resolvePrimaryRunwayDays()
// directly, so every Coach surface quotes the same number as the Job Loss UI.

/**
 * Resolves which signal tier (if any) should be showing right now.
 * `previousTier` is the last tier that actually fired for this user
 * (persisted client-side) — required to detect Green (recovery).
 */
export function resolveNetWorthSignalTier({ netWorthHealth, runwayDays, previousTier }) {
  if (runwayDays != null && runwayDays < 30) return "red";
  if (netWorthHealth?.belowThreshold) return "amber";
  if (previousTier === "amber" || previousTier === "red") return "green";
  return null;
}

/**
 * At most one Coach message per week per tier — compares fiscal week index
 * (not wall-clock days) so it lines up with the app's own week boundaries.
 */
export function shouldFireForTier({ tier, lastFiredTier, lastFiredWeekIdx, currentWeekIdx }) {
  if (!tier) return false;
  if (tier === lastFiredTier && lastFiredWeekIdx === currentWeekIdx) return false;
  return true;
}
