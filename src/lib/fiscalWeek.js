import { toLocalIso } from "./finance.js";

export const FISCAL_WEEKS_PER_YEAR = 52;

export function getCurrentFiscalWeek(allWeeks, todayIso = toLocalIso(new Date())) {
  return (allWeeks ?? []).find((week) => week?.active && toLocalIso(week.weekEnd) >= todayIso) ?? null;
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

// Returns the next (or current) week where isPayWeek===true, starting from todayIso.
// Weekly users (checksPerYear===52) return null — every week is a pay week, no indicator needed.
// For biweekly/salary: driven by w.isPayWeek from buildYear.
// For monthly: driven by the last-week-of-month isPayWeek flag set in buildYear.
export function getNextPayWeek(allWeeks, todayIso, checksPerYear = 52) {
  if (!allWeeks?.length || checksPerYear === 52) return null;
  return allWeeks.find(w => w.active && w.isPayWeek && toLocalIso(w.weekEnd) >= todayIso) ?? null;
}
