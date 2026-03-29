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
  const visibleSet = new Set([...visiblePast, ...currentOrFuture].map((entry) => entry.week.idx));
  const maxHiddenWeeks = Math.max(activeWeeks.length - completedWeeksToKeep, 1);

  return {
    visibleWeeks: activeWeeks.filter((entry) => visibleSet.has(entry.week.idx)).map((entry) => entry.week),
    hiddenWeeks: activeWeeks.filter((entry) => !visibleSet.has(entry.week.idx)).map((entry) => entry.week),
    scaleProgress: Math.min(
      1,
      Math.max(0, (past.length - completedWeeksToKeep) / maxHiddenWeeks)
    ),
  };
}

export function deriveRollingTimelineMonths(monthSegments, todayIso = toLocalIso(new Date()), lookbackMonths = 1) {
  const currentMonthKey = todayIso.slice(0, 7);
  const segments = (monthSegments ?? []).filter((seg) => MONTH_KEY_RE.test(seg?.key));
  const currentMonthIdx = Math.max(0, segments.findIndex((seg) => seg.key >= currentMonthKey));
  const firstVisibleIdx = Math.max(0, currentMonthIdx - lookbackMonths);
  const visibleMonths = segments.slice(firstVisibleIdx);
  const visibleKeys = new Set(visibleMonths.map((seg) => seg.key));
  const hiddenMonths = segments.filter((seg) => !visibleKeys.has(seg.key));
  const maxHiddenMonths = Math.max(segments.length - (lookbackMonths + 1), 1);

  return {
    visibleMonths,
    hiddenMonths,
    scaleProgress: Math.min(1, Math.max(0, hiddenMonths.length / maxHiddenMonths)),
  };
}

export function progressiveScale(scaleProgress, maxIncrease = 0.15) {
  const clampedProgress = Math.min(1, Math.max(0, scaleProgress ?? 0));
  return 1 + (clampedProgress * maxIncrease);
}
