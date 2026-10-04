// Claim Date math — the goal timeline and every goal's finish date/badge, as
// shown on Home's Claim Date surface (drift-app-warden §8 F18/F177).
//
// Extracted verbatim from HomePanel.jsx (TODO §22.F, 2026-10-04) so App.jsx can
// read the same "next Claim Date" for the Cyborg Resource snapshot without a
// second derivation. HomePanel and the snapshot both call computeClaimDates();
// nothing else may compute a Claim Date.
import { computeGoalTimeline, fiscalMonthLabel, estimateGoalNextYear, getGoalProjectionHorizonDate, GOAL_PROJECTION_HORIZON_YEARS, toLocalIso } from "./finance.js";
import { FISCAL_YEAR_START, TOTAL_FISCAL_WEEKS, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { getFiscalWeekNumber, weekNumToPaycheckNum, payPeriodUnit } from "./fiscalWeek.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const FY_YEAR = parseInt(FISCAL_YEAR_START.split('-')[0]);

export const safeDate = (raw) => {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Stable timeline anchor: start of previous calendar month.
// Using the current fiscal week start caused month bars to shrink as weeks passed.
export function resolvePrevMonthStart(today) {
  const iso = today ?? new Date().toISOString().slice(0, 10);
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return new Date(py, pm - 1, 1);
}

export function resolveCurrentWeekStartMs(futureWeeks, today) {
  const prevMonthStart = resolvePrevMonthStart(today);
  return futureWeeks?.length
    ? (safeDate(futureWeeks[0]?.weekStart)?.getTime() ?? prevMonthStart.getTime())
    : prevMonthStart.getTime();
}

const ordinalSuffix = (day) => {
  if (day >= 11 && day <= 13) return "th";
  const mod = day % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
};

export const formatGoalFinishDate = (rawDate) => {
  const parsed = safeDate(rawDate);
  if (!parsed) return null;
  const month = parsed.toLocaleDateString("en-US", { month: "short" });
  const day = parsed.getDate();
  const yearSuffix = parsed.getFullYear() !== FY_YEAR ? ` '${String(parsed.getFullYear()).slice(2)}` : "";
  return `${month} ${day}${ordinalSuffix(day)}${yearSuffix}`;
};

/**
 * Everything the Claim Date surface reads, from the same props HomePanel gets.
 * Returns the goal timeline (`tl`), the per-goal resolver and its helpers, and
 * the claim queue (every active goal with a real date, soonest first).
 */
export function computeClaimDates({
  goals, futureWeeks, timelineWeekNets, expenses, logNetLost, logNetGained,
  futureEventDeductions, config, currentWeek, today,
}) {
  const checksPerYear = PAYCHECKS_PER_YEAR[config?.userPaySchedule ?? "weekly"] ?? 52;
  const todayIso = today ?? toLocalIso(new Date());
  // Rolling 5-year goal-projection cutoff, shared by every "goal ETA falls in a
  // future fiscal year" code path below — computed from todayIso so it advances
  // a day every real day with no stored state (see GOAL_PROJECTION_HORIZON_YEARS).
  const goalHorizonBaseDate = new Date(`${todayIso}T00:00:00`);
  const goalHorizonDate = getGoalProjectionHorizonDate(goalHorizonBaseDate);

  const activeGoals = (goals ?? []).filter((g) => !g.completed);
  const tl = computeGoalTimeline(
    activeGoals,
    futureWeeks ?? [],
    timelineWeekNets ?? [],
    expenses,
    logNetLost,
    logNetGained ?? 0,
    futureEventDeductions ?? {},
    config?.goalTimelineEpochIdx ?? null,
  );

  const currentWeekStartMs = resolveCurrentWeekStartMs(futureWeeks, today);
  const nowIdx = currentWeek ? getFiscalWeekNumber(currentWeek.idx) : 1;

  const nextYearSequentialEstimates = (() => {
    if (!config) return {};
    const estimates = {};
    let cumulativeWeeks = 0;
    // Same per-week rate computeGoalTimeline itself smears logged Bonus/Extra Pay,
    // Tips/Commission, and loss events across (its perWeekGain - perWeekLost) —
    // without this, a logged event never moves a goal that misses the current
    // fiscal year, since estimateGoalNextYear's own formula only reads cfg/expenses.
    const weeklyLogAdjustment = ((logNetGained ?? 0) - (logNetLost ?? 0)) / (futureWeeks?.length || 1);
    for (const g of tl) {
      if (Number.isFinite(g.eW)) continue;
      const est = estimateGoalNextYear(g.remainingAtEnd ?? g.target, config, expenses, goalHorizonBaseDate, weeklyLogAdjustment);
      if (!est) continue;
      cumulativeWeeks += est.weeksFromFYStart;
      const [fy, fm, fd] = FISCAL_YEAR_START.split('-').map(Number);
      const nextFYStart = new Date(fy + 1, fm - 1, fd);
      const estDate = new Date(nextFYStart.getTime() + cumulativeWeeks * 7 * DAY_MS);
      // Re-derive withinHorizon against the sequential (queued-behind-other-goals)
      // estDate, not est's own standalone one — stacking cumulativeWeeks onto later
      // goals can push a goal that was individually within horizon past it.
      estimates[g.id] = { ...est, estDate, label: fiscalMonthLabel(estDate), withinHorizon: estDate <= goalHorizonDate, horizonDate: goalHorizonDate };
    }
    return estimates;
  })();

  // Badge text for a goal landing in a future fiscal year: a specific "N YR EST"
  // (years measured from today, ceiling — a date 2.1-3.0 years out reads "3 YR
  // EST") for anything within the rolling horizon, or one unified
  // "BEYOND Nyr" once it crosses goalHorizonDate. Shared by every finish-date
  // path below so the badge always agrees with whatever date (if any) is shown
  // next to it.
  const resolveGoalYearBadge = (finishDate) => {
    if (!finishDate) return null;
    if (finishDate > goalHorizonDate) return `BEYOND ${GOAL_PROJECTION_HORIZON_YEARS}YR`;
    const yearsOut = Math.max(1, Math.ceil((finishDate.getTime() - goalHorizonBaseDate.getTime()) / (365.25 * DAY_MS)));
    return `${yearsOut} YR EST`;
  };
  // Returns { text, finishDate, badge } for a goal's offset (weeks from now).
  // text/badge are null once finishDate crosses the horizon — callers show the
  // single BEYOND-horizon badge in place of both a date line and a badge, not
  // one of each.
  const buildGoalFinishInfo = (offsetRaw) => {
    if (!Number.isFinite(offsetRaw)) return null;
    const offset = Math.max(Math.ceil(offsetRaw), 0);
    // Real calendar date for this offset, computed arithmetically from the current
    // week's start — NOT by indexing into futureWeeks (which only covers the
    // current fiscal year). Indexing used to silently clamp any offset beyond
    // futureWeeks.length to the year's LAST week, so a goal that actually takes
    // 128+ weeks to fund displayed a wrong "Jan 3rd '27, week 53" instead of its
    // real (much later) date.
    const finishDate = currentWeekStartMs != null ? new Date(currentWeekStartMs + offset * 7 * DAY_MS) : null;
    if (finishDate && finishDate > goalHorizonDate) return { text: null, finishDate, badge: resolveGoalYearBadge(finishDate) };
    const dateLabel = formatGoalFinishDate(finishDate);
    // No real paycheck-number sequence exists past the current single-fiscal-year
    // grid (buildYear() only generates TOTAL_FISCAL_WEEKS weeks — docs/TODO.md §9),
    // so once the offset crosses it, show the estimated date only, no "week N".
    const beyondCurrentYear = nowIdx + offset > TOTAL_FISCAL_WEEKS;
    if (beyondCurrentYear) return { text: dateLabel ? `~By ${dateLabel}` : null, finishDate, badge: resolveGoalYearBadge(finishDate) };
    const weekNum = nowIdx + offset;
    const checkNum = weekNumToPaycheckNum(weekNum, checksPerYear);
    const pUnit = payPeriodUnit(checksPerYear, 'full').toLowerCase();
    return {
      text: dateLabel ? `By ${dateLabel}, ${pUnit} ${checkNum}` : `${payPeriodUnit(checksPerYear, 'full')} ${checkNum}`,
      finishDate,
      badge: null, // completes within the current fiscal year — no year badge needed
    };
  };

  // Single source of truth for a goal card's date line + badge, across the three
  // paths a goal's ETA can come from: computeGoalTimeline's real per-week
  // simulation (goal.eW finite), estimateGoalNextYear's flat-rate queued
  // estimate (nextYearSequentialEstimates), or the wN/sW fallback (real average
  // surplus, just an unclamped date instead of computeGoalTimeline's own).
  const resolveGoalFinishInfo = (goal) => {
    const primary = Number.isFinite(goal.eW) ? buildGoalFinishInfo(goal.eW) : null;
    if (primary?.text) return primary;
    const nextYr = nextYearSequentialEstimates[goal.id];
    if (nextYr) {
      return nextYr.withinHorizon
        ? { text: `~${nextYr.label}`, finishDate: nextYr.estDate, badge: resolveGoalYearBadge(nextYr.estDate) }
        : { text: null, finishDate: nextYr.estDate, badge: resolveGoalYearBadge(nextYr.estDate) };
    }
    const startOffset = Number.isFinite(goal.sW) ? goal.sW : 0;
    const duration = Number.isFinite(goal.wN) ? goal.wN : null;
    // A non-finite wN is, after finance.js's computeGoalTimeline fix, ONLY
    // ever produced by avgSurplus <= 0 (see that function's own comment) — so
    // this is never "we don't have data yet," it's "this household's income
    // doesn't clear its upkeep, so the goal is structurally stalemated at the
    // current pace." That's a stronger, more specific claim than generic
    // "Timeline pending" and gets its own card treatment (`stalemate: true`,
    // GOAL_STALEMATE_MESSAGE) rather than sharing that catch-all text.
    if (!Number.isFinite(duration)) return { text: null, finishDate: null, badge: null, stalemate: true };
    const fallback = buildGoalFinishInfo(startOffset + duration);
    return fallback ?? { text: null, finishDate: null, badge: null, stalemate: true };
  };

  // The claim queue — every active goal that has a real date, soonest first.
  // Built entirely from resolveGoalFinishInfo (F18's authoritative path, already
  // on every card); this adds a second *view* of those dates, never a second
  // derivation of them. A goal whose timeline is still pending has no date to
  // claim and drops out rather than showing a placeholder.
  const claimQueue = tl
    .map((g) => ({ goal: g, info: resolveGoalFinishInfo(g) }))
    .filter((x) => x.info.finishDate instanceof Date && !Number.isNaN(x.info.finishDate.getTime()))
    .sort((a, b) => a.info.finishDate - b.info.finishDate);

  return {
    tl,
    nowIdx,
    currentWeekStartMs,
    goalHorizonBaseDate,
    goalHorizonDate,
    nextYearSequentialEstimates,
    resolveGoalYearBadge,
    buildGoalFinishInfo,
    resolveGoalFinishInfo,
    claimQueue,
    nextClaim: claimQueue[0] ?? null,
  };
}
