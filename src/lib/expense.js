import { FISCAL_YEAR_START } from "../constants/config.js";

/**
 * Builds the weekly[4] array for a new history entry.
 *
 * Cascade rule: phases before phaseIdx keep their base value unchanged.
 * phaseIdx gets perPaycheck. Future phases also get perPaycheck UNLESS
 * they already have an explicit byPhase override (which means the user
 * deliberately chose a different amount for that quarter).
 */
export function buildCascadedWeekly(phaseIdx, perPaycheck, baseWeekly, existingByPhase) {
  return [0, 1, 2, 3].map(q => {
    if (q < phaseIdx) return baseWeekly[q] ?? 0;
    if (q === phaseIdx) return perPaycheck;
    return existingByPhase?.[q] ? (baseWeekly[q] ?? 0) : perPaycheck;
  });
}

/**
 * Returns the most recent history entry with effectiveFrom <= todayIso.
 *
 * Future ADV. EDIT entries (e.g. a June override created in April) are
 * excluded so that regular card edits never accidentally overwrite a
 * scheduled future change. Falls back to the oldest entry if every
 * entry is in the future (brand-new expense, effectiveFrom = today).
 */
export function latestPastEntry(existing, todayIso) {
  const past = existing.filter(en => en.effectiveFrom <= todayIso);
  return past.length > 0
    ? past.reduce((b, en) => en.effectiveFrom > b.effectiveFrom ? en : b, past[0])
    : existing[0];
}

/**
 * Returns the most recent history entry with effectiveFrom <= iso.
 * Used by the ADV. EDIT modal for month-level lookups so it always reads
 * the amount that was in effect at the selected month, not the current day.
 * Falls back to the oldest entry when every entry is after iso.
 */
export function getBaseEntryAt(exp, iso) {
  const history = exp.history ?? [{ effectiveFrom: FISCAL_YEAR_START, weekly: exp.weekly ?? [0, 0, 0, 0] }];
  return (
    history
      .filter(en => en.effectiveFrom <= iso)
      .reduce((b, en) => (!b || en.effectiveFrom >= b.effectiveFrom ? en : b), null) ?? history[0]
  );
}

/**
 * Returns the ISO "YYYY-MM-01" string for the month after the given ISO month string.
 * Handles December → January year rollover.
 */
export function nextMonthIso(iso) {
  const [y, m] = iso.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}
