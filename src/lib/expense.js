import { FISCAL_YEAR_START } from "../constants/config.js";

// ─── Billing cycle math helpers ──────────────────────────────────────────────
// Exported so BudgetPanel and BulkEditPanel share a single source of truth.

export const EXPENSE_CYCLE_OPTIONS = [
  { value: "weekly",      label: "Weekly",       days: 7 },
  { value: "biweekly",    label: "Biweekly",     days: 14 },
  { value: "every30days", label: "Every 30 days", days: 30 },
  { value: "yearly",      label: "Yearly",       days: 365 },
];

export const CHECKS_PER_MONTH = { weekly: 4, biweekly: 2, monthly: 1, salary: 2 };

export const normalizeCycle = (cycle) =>
  EXPENSE_CYCLE_OPTIONS.find(o => o.value === cycle) ? cycle : "every30days";

// Returns the next calendar date this expense is due, or null if the expense
// has no billingMeta amount / no anchor date. Used by §15.C5 countdown tiles.
//
// Cycle math: from billingMeta.effectiveFrom (anchor), advance by `cycleDays`
// until we land on or after `todayDate`. If today === anchor, that IS the
// next due day. We never return a date in the past.
export function getNextDueDate(expense, todayDate) {
  const meta = expense?.billingMeta;
  if (!meta || !meta.effectiveFrom || (meta.amount ?? 0) <= 0) return null;
  const cycle = EXPENSE_CYCLE_OPTIONS.find(o => o.value === normalizeCycle(meta.cycle));
  if (!cycle) return null;
  const anchor = new Date(meta.effectiveFrom + "T12:00:00");
  if (Number.isNaN(anchor.getTime())) return null;
  const today = todayDate instanceof Date ? todayDate : new Date(todayDate);
  const msPerDay = 86400000;
  if (today <= anchor) return anchor;
  const cyclesElapsed = Math.ceil((today - anchor) / (cycle.days * msPerDay));
  const next = new Date(anchor);
  next.setDate(next.getDate() + cyclesElapsed * cycle.days);
  return next;
}

export const roundToQuarter = (n) => Math.round(n * 4) / 4;

export const toMonthlyCost = (amount, cycle) => {
  const c = normalizeCycle(cycle);
  if (c === "every30days") return amount;
  if (c === "weekly")      return amount * 4;
  if (c === "biweekly")    return amount * 2;
  if (c === "yearly")      return amount / 12;
  return amount;
};

export const fromMonthlyCost = (monthly, cycle) => {
  const c = normalizeCycle(cycle);
  if (c === "every30days") return monthly;
  if (c === "weekly")      return monthly / 4;
  if (c === "biweekly")    return monthly / 2;
  if (c === "yearly")      return monthly * 12;
  return monthly;
};

// Converts a bill amount to a per-week reserve (weekly[q] storage unit).
// Always divides by 4 (weeks/month) regardless of pay schedule so the stored
// value is consistent: display * perCheckFactor = per-paycheck amount.
// For weekly users perCheckFactor=1, so weekly = per-paycheck — no change.
// For biweekly users perCheckFactor=2, so stored 175/wk × 2 = $350/check.
export const perPaycheckFromCycle = (amount, cycle, _cpm) =>
  roundToQuarter(toMonthlyCost(amount, cycle) / 4);

export const cycleAmountFromPerPaycheck = (perWeek, cycle, _cpm) =>
  fromMonthlyCost(roundToQuarter(perWeek * 4), cycle);

// Breakdown-tab annualization. The breakdown roots every expense on its monthly
// (30-day) cost — the way bills are actually charged. A $400/month bill is $400 a
// month, 12 times a year ($4,800); the weekly and biweekly figures are just that
// monthly cost split 4 / 2 ways for quick mental math. Sum the result across the
// 12 months to get the annual figure.
//   • Regular bills store monthlyCost ÷ 4 as the weekly reserve, so × 4 recovers
//     the monthly cost (annual = monthly × 12 = reserve × 48). This holds however
//     the bill was entered — a "$100/week" bill is treated as $400/mo, not $5,200.
//   • Loans store a true per-week amount on a 52-week basis because they have a
//     real payoff schedule, so × 52/12 recovers their monthly cost (annual = × 52).
export const breakdownMonthlyEquiv = (reserve, isLoan = false) =>
  isLoan ? reserve * (52 / 12) : reserve * 4;


export const monthlyFromPerPaycheck = (perWeek, _cpm) => roundToQuarter(perWeek * 4);

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

// Month-level override helpers
// monthKey format: "YYYY-MM"

// Write a single month override. Does not touch any other months.
export function applyMonthEdit(expense, monthKey, perPaycheck, amount, cycle) {
  return {
    ...expense,
    monthlyOverrides: {
      ...(expense.monthlyOverrides ?? {}),
      [monthKey]: { perPaycheck, amount, cycle },
    },
  };
}

// Write monthKey and all following months through end of the fiscal year.
// Skips months that already have a custom override so future customizations
// are preserved — always overwrites the explicitly selected month.
export function applyMonthEditForward(expense, monthKey, perPaycheck, amount, cycle, fiscalYear = 2026, editedAt = new Date().toISOString()) {
  const [, startMon] = monthKey.split("-").map(Number);
  const overrides = { ...(expense.monthlyOverrides ?? {}) };
  for (let m = startMon; m <= 12; m++) {
    const key = `${fiscalYear}-${String(m).padStart(2, "0")}`;
    if (!overrides[key]) overrides[key] = { perPaycheck, amount, cycle, lastEditedAt: editedAt };
  }
  overrides[monthKey] = { perPaycheck, amount, cycle, lastEditedAt: editedAt };
  return { ...expense, monthlyOverrides: overrides };
}

// ─── Quarter-scoped override helpers ─────────────────────────────────────────
// These power the "Q[n]+ Onward" and "All Qtrs" save buttons. Unlike
// applyMonthEditForward, they OVERWRITE any finer overrides already in range
// (Decision 1): the user picked a broad scope, so in-range customizations are
// intentionally flattened.

// Resolves the first month an "onward" quarter save should write. The window
// starts at the viewed quarter's first month, but never rewrites elapsed months:
// for the current (or a past) quarter it clamps forward to the current month
// (Decision 2 — "onward" = today forward). Both args are "YYYY-MM" keys.
export function onwardStartMonthKey(quarterFirstMonthKey, currentMonthKey) {
  return quarterFirstMonthKey > currentMonthKey ? quarterFirstMonthKey : currentMonthKey;
}

// Q[n]+ ONWARD: write an override for every month from startMonthKey ("YYYY-MM")
// through December, overwriting anything already in range.
export function applyQuarterForward(expense, startMonthKey, perPaycheck, amount, cycle) {
  const [year, startMon] = startMonthKey.split("-").map(Number);
  const overrides = { ...(expense.monthlyOverrides ?? {}) };
  for (let m = startMon; m <= 12; m++) {
    overrides[`${year}-${String(m).padStart(2, "0")}`] = { perPaycheck, amount, cycle };
  }
  return { ...expense, monthlyOverrides: overrides };
}

// ALL QTRS: write an override for every month of the fiscal year, including
// already-elapsed months — this button's explicit "whole year" scope.
export function applyAllQuarters(expense, perPaycheck, amount, cycle, fiscalYear = 2026) {
  const overrides = { ...(expense.monthlyOverrides ?? {}) };
  for (let m = 1; m <= 12; m++) {
    overrides[`${fiscalYear}-${String(m).padStart(2, "0")}`] = { perPaycheck, amount, cycle };
  }
  return { ...expense, monthlyOverrides: overrides };
}

// Zero a single month (soft-delete for that month only).
export function clearMonth(expense, monthKey, editedAt = new Date().toISOString()) {
  return {
    ...expense,
    monthlyOverrides: {
      ...(expense.monthlyOverrides ?? {}),
      [monthKey]: { perPaycheck: 0, amount: 0, cycle: "every30days", lastEditedAt: editedAt },
    },
  };
}

// Zero this month and all following months through end of the fiscal year.
export function clearMonthForward(expense, monthKey, fiscalYear = 2026, editedAt = new Date().toISOString()) {
  const [, startMon] = monthKey.split("-").map(Number);
  const overrides = { ...(expense.monthlyOverrides ?? {}) };
  for (let m = startMon; m <= 12; m++) {
    const key = `${fiscalYear}-${String(m).padStart(2, "0")}`;
    overrides[key] = { perPaycheck: 0, amount: 0, cycle: "every30days", lastEditedAt: editedAt };
  }
  return { ...expense, monthlyOverrides: overrides };
}

// Zero just the three calendar months belonging to a quarter (phaseIdx 0–3).
// Leaves all other months untouched.
export function clearQuarterMonths(expense, phaseIdx, fiscalYear = 2026, editedAt = new Date().toISOString()) {
  const QUARTER_MONTHS = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]];
  const months = QUARTER_MONTHS[phaseIdx] ?? [];
  const overrides = { ...(expense.monthlyOverrides ?? {}) };
  for (const m of months) {
    const key = `${fiscalYear}-${String(m).padStart(2, "0")}`;
    overrides[key] = { perPaycheck: 0, amount: 0, cycle: "every30days", lastEditedAt: editedAt };
  }
  return { ...expense, monthlyOverrides: overrides };
}

// ─── Advanced edit payload builder ───────────────────────────────────────────
// Extracts the handleSave logic from BulkEditPanel so it can be unit-tested
// and reused without duplicating the patch-building logic.
//
// monthIso: full ISO-01 date string like "2026-05-01" (start-of-month)
// Returns { patches: [...], additions: [...] } ready for saveAdvancedEdit()
export function buildAdvancedEditPayload({ edits, deletions, additions, expenses, monthIso, phaseIdx, cpm }) {
  const editPatches = Object.entries(edits).flatMap(([expId, { amount, cycle, scope }]) => {
    const exp = expenses.find(e => e.id === expId);
    if (!exp) return [];
    const baseWeekly = getBaseEntryAt(exp, monthIso)?.weekly ?? [0, 0, 0, 0];
    const perPaycheck = perPaycheckFromCycle(parseFloat(amount) || 0, cycle, cpm);
    const newByPhase = { ...(exp.billingMeta?.byPhase ?? {}), [phaseIdx]: { amount: parseFloat(amount), cycle, effectiveFrom: monthIso } };
    if (scope === "month-only") {
      const thisMonthWeekly = baseWeekly.map((w, q) => q === phaseIdx ? perPaycheck : w);
      return [
        { expId, effectiveFrom: monthIso, newWeekly: thisMonthWeekly, newByPhase },
        { expId, effectiveFrom: nextMonthIso(monthIso), newWeekly: [...baseWeekly] },
      ];
    }
    const newWeekly = buildCascadedWeekly(phaseIdx, perPaycheck, baseWeekly, exp.billingMeta?.byPhase);
    return [{ expId, effectiveFrom: monthIso, newWeekly, newByPhase }];
  });

  const deletionPatches = Object.entries(deletions).flatMap(([expId, type]) => {
    const exp = expenses.find(e => e.id === expId);
    if (!exp) return [];
    const baseWeekly = getBaseEntryAt(exp, monthIso)?.weekly ?? [0, 0, 0, 0];
    if (type === "forward") {
      const newWeekly = buildCascadedWeekly(phaseIdx, 0, baseWeekly, exp.billingMeta?.byPhase);
      const newByPhase = { ...(exp.billingMeta?.byPhase ?? {}), [phaseIdx]: { amount: 0, cycle: "every30days", effectiveFrom: monthIso } };
      return [{ expId, effectiveFrom: monthIso, newWeekly, newByPhase }];
    }
    const zeroWeekly = baseWeekly.map((w, q) => q === phaseIdx ? 0 : w);
    return [
      { expId, effectiveFrom: monthIso, newWeekly: zeroWeekly },
      { expId, effectiveFrom: nextMonthIso(monthIso), newWeekly: [...baseWeekly] },
    ];
  });

  const additionObjects = additions.map(a => {
    const amount = parseFloat(a.amount) || 0;
    const perPaycheck = perPaycheckFromCycle(amount, a.cycle, cpm);
    return {
      label: a.label,
      category: a.category,
      cycle: a.cycle,
      amount,
      effectiveFrom: monthIso,
      weekly: [0, 1, 2, 3].map(q => q >= phaseIdx ? perPaycheck : 0),
      phaseIdx,
    };
  });

  return { patches: [...editPatches, ...deletionPatches], additions: additionObjects };
}
