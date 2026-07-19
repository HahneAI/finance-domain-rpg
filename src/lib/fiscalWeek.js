import { toLocalIso } from "./finance.js";

export const FISCAL_WEEKS_PER_YEAR = 52;

export function getCurrentFiscalWeek(allWeeks, todayIso = toLocalIso(new Date())) {
  return (allWeeks ?? []).find((week) => week?.active && toLocalIso(week.weekEnd) >= todayIso) ?? null;
}

// Weeks remaining from firstActiveIdx through fiscal year-end — the divisor
// "typical weekly income"/annual-savings math should scale by instead of a
// flat 52, so a mid-year-start (or Back to Work) account isn't diluted by
// the inactive weeks before it (TODO §15, 2026-07-19). One shared source so
// App.jsx, DemoAccountTree.jsx, aiContext.js and HomePanel.jsx can't drift
// from each other on this — they all key off the same config.firstActiveIdx.
export function resolveActiveWeeksThisYear(firstActiveIdx) {
  return Math.max(FISCAL_WEEKS_PER_YEAR - (firstActiveIdx ?? 0), 0);
}

export function getFiscalWeekNumber(weekIdx, totalWeeks = FISCAL_WEEKS_PER_YEAR) {
  if (!Number.isFinite(weekIdx)) return null;
  return Math.min(Math.max(weekIdx + 1, 1), totalWeeks);
}

export function getFiscalWeekInfo(currentWeek, totalWeeks = FISCAL_WEEKS_PER_YEAR) {
  if (!currentWeek) return null;
  const num = getFiscalWeekNumber(currentWeek.idx, totalWeeks);
  if (num === null) return null;
  return { num, total: totalWeeks };
}

// ─── Pay-period translation helpers ──────────────────────────────────────────
// The fiscal year is always 52 weeks internally. These helpers convert the
// week-based numbers to paycheck-based numbers for display only.

// Week number (1-52) → paycheck number for the given pay schedule.
// biweekly (26): ceil(19 / 2) = 10  |  monthly (12): ceil(19×12/52) = 5
export function weekNumToPaycheckNum(weekNum, checksPerYear) {
  if (!Number.isFinite(weekNum) || weekNum < 1) return null;
  if (checksPerYear === 52) return weekNum;
  const weeksPerCheck = FISCAL_WEEKS_PER_YEAR / checksPerYear;
  return Math.min(Math.ceil(weekNum / weeksPerCheck), checksPerYear);
}

// Weeks remaining → paychecks remaining. Uses floor so a partial pay period
// at year-end isn't counted as a full check.
export function weeksToChecksRemaining(weeksLeft, checksPerYear) {
  if (!Number.isFinite(weeksLeft) || weeksLeft < 0) return 0;
  if (checksPerYear === 52) return weeksLeft;
  return Math.floor(weeksLeft / (FISCAL_WEEKS_PER_YEAR / checksPerYear));
}

// "Week" / "Paycheck" / "Month" labels in three forms.
// form: 'full' (Week) | 'abbrev' (Wk) | 'lower' (week)
export function payPeriodUnit(checksPerYear, form = 'full') {
  if (checksPerYear === 52) {
    return { full: 'Week', abbrev: 'Wk', lower: 'week', fullPlural: 'Weeks', lowerPlural: 'weeks' }[form] ?? 'Week';
  }
  if (checksPerYear === 12) {
    return { full: 'Month', abbrev: 'Mo', lower: 'month', fullPlural: 'Months', lowerPlural: 'months' }[form] ?? 'Month';
  }
  return { full: 'Paycheck', abbrev: 'Chk', lower: 'paycheck', fullPlural: 'Paychecks', lowerPlural: 'paychecks' }[form] ?? 'Paycheck';
}

// Pay-schedule-aware chip label — replaces formatFiscalWeekLabel for display.
// weekly:   "Week 19, 33 left"
// biweekly: "Paycheck 10, 16 left"
// monthly:  "Month 5, 7 left"
export function formatPayPeriodLabel(weekInfo, checksPerYear = 52) {
  if (!weekInfo) return "—";
  const num = Number.isFinite(weekInfo.num) ? weekInfo.num : null;
  if (num == null) return "—";
  const total = Number.isFinite(weekInfo.total) ? weekInfo.total : FISCAL_WEEKS_PER_YEAR;
  const weeksLeft = Math.max(total - num, 0);
  if (checksPerYear === 52) return `Week ${num}, ${weeksLeft} left`;
  const checkNum  = weekNumToPaycheckNum(num, checksPerYear);
  const checksLeft = weeksToChecksRemaining(weeksLeft, checksPerYear);
  return `${payPeriodUnit(checksPerYear, 'full')} ${checkNum}, ${checksLeft} left`;
}

// Legacy — kept so existing callers compile without change.
// New code should use formatPayPeriodLabel with checksPerYear.
export function formatFiscalWeekLabel(weekInfo) {
  return formatPayPeriodLabel(weekInfo, 52);
}

// Returns the start/end Date of the pay PERIOD that the given week belongs to.
// A pay period ends on an `isPayWeek` week (set by buildYear per pay schedule):
//   weekly   → every week is its own period
//   biweekly → two weeks ending on the pay week
//   monthly  → all active weeks in the calendar month
// We walk the active weeks: the period ends on the first pay week at/after the
// target week, and starts the week after the previous pay week. Using the
// isPayWeek flags keeps this correct for every schedule and parity.
export function getPayPeriodBounds(weekIdx, allWeeks) {
  if (!Array.isArray(allWeeks) || allWeeks.length === 0) return null;
  const sorted = allWeeks.filter(w => w.active).sort((a, b) => a.idx - b.idx);
  if (sorted.length === 0) return null;
  const target = sorted.find(w => w.idx === Number(weekIdx));
  if (!target) return null;
  const endW = sorted.find(w => w.idx >= target.idx && w.isPayWeek) ?? sorted[sorted.length - 1];
  const prevPayIdx = sorted
    .filter(w => w.idx < endW.idx && w.isPayWeek)
    .reduce((mx, w) => Math.max(mx, w.idx), -1);
  const group = sorted.filter(w => w.idx > prevPayIdx && w.idx <= endW.idx);
  const period = group.length > 0 ? group : [target];
  const start = period.reduce((a, w) => (w.weekStart < a ? w.weekStart : a), period[0].weekStart);
  const end = endW.payPeriodEndDate ?? endW.weekEnd;
  return { start, end };
}

// Returns the next (or current) week where isPayWeek===true, starting from todayIso.
// Weekly users (checksPerYear===52) return null — every week is a pay week, no indicator needed.
// For biweekly/salary: driven by w.isPayWeek from buildYear.
// For monthly: driven by the last-week-of-month isPayWeek flag set in buildYear.
export function getNextPayWeek(allWeeks, todayIso, checksPerYear = 52) {
  if (!allWeeks?.length) return null;
  return allWeeks.find(w => w.active && w.isPayWeek && w.payPeriodEndDate && toLocalIso(w.payPeriodEndDate) >= todayIso) ?? null;
}
