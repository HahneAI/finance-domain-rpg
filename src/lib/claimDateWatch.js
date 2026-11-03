// Claim Date slip alert (TODO §32 C3, 2026-11-03). Compares each active goal's Claim Date — always
// resolveGoalFinishInfo()'s finishDate, never a recomputation (warden F177) — against the date the
// user last acknowledged (config.claimDateWatch: { [goalId]: { date: "YYYY-MM-DD", target, rank } }).
// Pure: no React, no I/O.
//
// A goal with no baseline yet gets one (newBaselines) without alerting — and so does a goal whose
// target or priority rank changed since its baseline: the user moved that date themselves, so it is a
// new starting point, not a slip. A date that moves EARLIER never alerts and never moves the baseline;
// only a slip of at least `thresholdDays` alerts, and that baseline moves only when the user taps
// "Got it".

export const CLAIM_SLIP_THRESHOLD_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// `goals` in funding-priority order (HomePanel's `tl`), so rank = index + 1 matches the goal card's
// `data-coach-ref="goal:<rank>"` and Coach's get_goal_detail rank.
export function detectClaimDateSlips({ goals = [], resolveGoalFinishInfo, watch = {}, thresholdDays = CLAIM_SLIP_THRESHOLD_DAYS }) {
  const slips = [];
  const newBaselines = {};
  goals.forEach((goal, i) => {
    if (!goal?.id || goal.completed) return;
    const currentIso = toIso(resolveGoalFinishInfo?.(goal)?.finishDate);
    if (!currentIso) return; // stalemate / no date: nothing to compare
    const rank = i + 1;
    const baseline = watch?.[goal.id];
    const target = Number(goal.target) || 0;
    if (!baseline?.date || baseline.target !== target || baseline.rank !== rank) {
      newBaselines[goal.id] = { date: currentIso, target, rank };
      return;
    }
    const daysLater = Math.round((isoToDate(currentIso) - isoToDate(baseline.date)) / DAY_MS);
    if (daysLater >= thresholdDays) slips.push({ goalId: goal.id, rank, target, fromIso: baseline.date, toIso: currentIso, daysLater });
  });
  return { slips, newBaselines };
}

export function formatClaimDay(iso) {
  return isoToDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function slipLengthText(daysLater) {
  const weeks = Math.round(daysLater / 7);
  return weeks <= 1 ? "about a week" : `about ${weeks} weeks`;
}
