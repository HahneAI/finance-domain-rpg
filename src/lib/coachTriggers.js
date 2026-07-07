import { getEffectiveAmount, getPhaseIndex } from "./finance.js";

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Best-effort runway estimate for the Red tier. Deliberately independent of
 * JobLossDashboard's own runway calc, which includes a session-only
 * "additional savings" override the user types live in that component — this
 * trigger runs in the background with no access to that input, so it assumes
 * $0 extra savings (the conservative floor). Returns null when not in Job
 * Loss Mode or there's no essential burn to divide against.
 */
export function estimateRunwayDays(config, expenses, effectiveToday) {
  if (!config?.jobLossMode || !config?.jobLossDate || !effectiveToday) return null;

  const todayDate = new Date(`${effectiveToday}T12:00:00`);
  const phaseIdx = getPhaseIndex(todayDate);

  const weeklyBurn = (expenses ?? [])
    .filter((exp) => (exp.jobLossStatus ?? "active") === "active" && exp.category !== "Lifestyle")
    .reduce((sum, exp) => sum + getEffectiveAmount(exp, todayDate, phaseIdx), 0);
  if (weeklyBurn <= 0) return null;

  const jobLossStartMs = new Date(`${config.jobLossDate}T00:00:00`).getTime();
  const weeksSinceLoss = Math.max(0, Math.floor((todayDate.getTime() - jobLossStartMs) / (7 * MS_PER_DAY)));

  let benefitsRemainingWeeks = 0;
  if (config.unemploymentEnabled && (config.unemploymentWeekly ?? 0) > 0 && (config.unemploymentDurationWeeks ?? 0) > 0) {
    const offset = config.unemploymentWaitingWeek ? 1 : 0;
    benefitsRemainingWeeks = Math.max(0, config.unemploymentDurationWeeks - Math.max(0, weeksSinceLoss - offset));
  }
  const projectedUnemploymentTotal = benefitsRemainingWeeks * (config.unemploymentWeekly ?? 0);

  return Math.floor((projectedUnemploymentTotal / weeklyBurn) * 7);
}

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
