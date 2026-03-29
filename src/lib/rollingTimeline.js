import { toLocalIso } from "./finance.js";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

const toDateMs = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
};

export function deriveRollingIncomeWeeks(allWeeks, todayIso = toLocalIso(new Date()), completedWeeksToKeep = 4) {
  const activeWeeks = (allWeeks ?? [])
    .filter((week) => week?.active)
    .map((week) => ({ week, endMs: toDateMs(week.weekEnd) }))
    .filter((entry) => entry.endMs !== null)
    .sort((a, b) => a.endMs - b.endMs);

  const past = activeWeeks.filter((entry) => toLocalIso(entry.week.weekEnd) < todayIso);
  const currentOrFuture = activeWeeks.filter((entry) => toLocalIso(entry.week.weekEnd) >= todayIso);

  const visiblePast = past.slice(Math.max(0, past.length - completedWeeksToKeep));
  const visibleCurrent = currentOrFuture.length > 0 ? [currentOrFuture[0]] : [];
  const visibleSet = new Set([...visiblePast, ...visibleCurrent].map((entry) => entry.week.idx));

  return {
    visibleWeeks: activeWeeks.filter((entry) => visibleSet.has(entry.week.idx)).map((entry) => entry.week),
    hiddenWeeks: activeWeeks.filter((entry) => !visibleSet.has(entry.week.idx)).map((entry) => entry.week),
  };
}

export function deriveRollingTimelineMonths(monthSegments, todayIso = toLocalIso(new Date()), visibleMonthCount = 4) {
  const currentMonthKey = todayIso.slice(0, 7);
  const segments = (monthSegments ?? []).filter((seg) => MONTH_KEY_RE.test(seg?.key));
  const firstVisibleIdx = Math.max(
    0,
    segments.findIndex((seg) => seg.key >= currentMonthKey)
  );

  const visibleMonths = segments.slice(firstVisibleIdx, firstVisibleIdx + visibleMonthCount);
  const visibleKeys = new Set(visibleMonths.map((seg) => seg.key));

  return {
    visibleMonths,
    hiddenMonths: segments.filter((seg) => !visibleKeys.has(seg.key)),
  };
}
