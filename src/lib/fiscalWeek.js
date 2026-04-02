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

export function formatFiscalWeekLabel(weekInfo) {
  if (!weekInfo) return "—";
  const total = Number.isFinite(weekInfo.total) ? weekInfo.total : FISCAL_WEEKS_PER_YEAR;
  const num = Number.isFinite(weekInfo.num) ? weekInfo.num : null;
  if (num == null) return "—";
  const weeksLeft = Math.max(total - num, 0);
  return `Week ${num}, ${weeksLeft} left`;
}
