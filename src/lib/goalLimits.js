// Goal planning limits (TODO §31). Two caps, enforced only at the moment a user
// tries to cross one — never shown otherwise:
//   1. COUNT  — at most MAX_ACTIVE_GOALS active (unclaimed) goals.
//   2. AMOUNT — the sum of active goal targets may not exceed five years of the
//      current job's NEEDS-ONLY surplus: (monthly take-home − monthly Needs) × 60.
//      Lifestyle spend is deliberately ignored. Claiming a goal frees room.
// Pure: every caller (Home add/edit, archetype picker, Coach propose_goal) runs
// the same check, so no surface can be a back door (warden F184).
import { computeNeedsSetAsidePerCheck } from "./cashOnHand.js";
import { FISCAL_WEEKS_PER_YEAR } from "./fiscalWeek.js";

export const MAX_ACTIVE_GOALS = 6;
export const GOAL_PLAN_HORIZON_MONTHS = 60;

export const GOAL_COUNT_LIMIT_MESSAGE = "Goal limit reached — you must not spread yourself too thin in planning alone.";
export const GOAL_AMOUNT_LIMIT_MESSAGE = "This extends past your realistic, five-year timeline. You should only plan five years ahead — as you claim goals, you'll free up more space.";

const WEEKS_PER_MONTH = FISCAL_WEEKS_PER_YEAR / 12;
const fmt$ = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Five-year Needs-only surplus cap, or null when there is no honest cap to apply:
 * no income (New Job Season / not set up) or a surplus ≤ 0 (the Claim Date
 * stalemate card already covers that case — a $0 cap would just lock every goal).
 * `weeklyIncome` is App's typical-active-week take-home (warden F14); Needs come
 * from computeNeedsSetAsidePerCheck — the same Needs + loans figure Cash on Hand
 * sets aside — never a second Needs sum.
 */
export function computeGoalAmountCap({ weeklyIncome, expenses, todayIso, userPaySchedule }) {
  if (!Number.isFinite(weeklyIncome) || weeklyIncome <= 0 || !todayIso) return null;
  const { weeklyNeeds } = computeNeedsSetAsidePerCheck(expenses ?? [], todayIso, userPaySchedule);
  const monthlySurplus = (weeklyIncome - weeklyNeeds) * WEEKS_PER_MONTH;
  if (!(monthlySurplus > 0)) return null;
  return monthlySurplus * GOAL_PLAN_HORIZON_MONTHS;
}

/**
 * Would this change cross a limit?
 *   adding  — targets of goals about to be created (picker / add form / Coach)
 *   editing — { id, target } for an edit to one existing goal
 * Only a change that GROWS the plan is ever blocked: an account already past a
 * limit can still lower targets, rename, claim, or delete — never trapped.
 * @returns null when allowed, else { reason: "count"|"amount", message, cap }
 */
export function checkGoalLimits({ goals = [], adding = [], editing = null, cap = null }) {
  const active = goals.filter((g) => !g.completed);
  if (adding.length > 0 && active.length + adding.length > MAX_ACTIVE_GOALS) {
    return { reason: "count", message: GOAL_COUNT_LIMIT_MESSAGE, cap: MAX_ACTIVE_GOALS };
  }
  if (cap == null) return null;
  const currentTotal = active.reduce((s, g) => s + (Number(g.target) || 0), 0);
  let nextTotal = currentTotal + adding.reduce((s, t) => s + (Number(t) || 0), 0);
  if (editing) {
    const old = active.find((g) => g.id === editing.id);
    if (old) nextTotal += (Number(editing.target) || 0) - (Number(old.target) || 0);
  }
  if (nextTotal > cap + 0.005 && nextTotal > currentTotal + 0.005) {
    return { reason: "amount", message: `${GOAL_AMOUNT_LIMIT_MESSAGE} Your limit is ${fmt$(cap)} across all active goals.`, cap };
  }
  return null;
}
