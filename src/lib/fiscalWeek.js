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
  return `Week ${weekInfo.num} of ${weekInfo.total}`;
}
