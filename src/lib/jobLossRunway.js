import { getEffectiveAmount, getPhaseIndex } from "./finance.js";

// TODO §15 mode rebuild — Job Loss Home and Budget are now two separate
// components (not one "pinned to top" card layered over the normal panels),
// but both need the exact same runway numbers: Home displays the headline
// metrics, Budget owns the "additional savings" input and benefit scenario
// toggle that feed them. Pulled out here as the single source of truth
// rather than let two components duplicate — or subtly drift from — the
// same formula. Also consolidates firstUnemploymentPaymentDate, which used
// to be copy-pasted between JobLossDashboard.jsx and ExpenseTriage.jsx.

// First unemployment payment date — null when no benefits are configured.
// Treats the user's "weekly" payout as landing at the end of each benefit
// week from jobLossDate forward. With waiting-week on, that's day 14; off,
// day 7.
export function firstUnemploymentPaymentDate(cfg) {
  if (!cfg?.unemploymentEnabled) return null;
  if ((cfg.unemploymentWeekly ?? 0) <= 0) return null;
  if (!cfg.jobLossDate) return null;
  const start = new Date(cfg.jobLossDate + "T12:00:00");
  const offsetDays = cfg.unemploymentWaitingWeek ? 14 : 7;
  const d = new Date(start);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

// Sums the "log extra income while job hunting" widget (Job Loss Home) —
// gig work, odd jobs, anything earned outside real re-employment. Folded
// into the runway's savings side, same as the manual "additional savings"
// draft input.
export function sumJobHuntIncome(cfg) {
  return (cfg?.jobHuntIncomeLog ?? []).reduce((s, entry) => s + (entry.amount ?? 0), 0);
}

// ── Pending/final paycheck (TODO §15.H15) ────────────────────────────────
// A job loss rarely lines up with a pay period boundary — there's usually one
// more check still owed for days actually worked before the loss date. None
// of the above modeled this: buildYear() zeroes the whole fiscal week
// containing jobLossDate (not prorated), and the runway calc only knew about
// cash-on-hand + gig income, both "already in hand" today. This resolves the
// two JobLossEntry wizard questions (days worked in the final week; which
// day-of-week checks normally arrive) into a concrete estimated amount +
// date, computed once at Activate time and stored on config — mirrors
// DueDatePicker's resolve-to-a-concrete-value-at-confirm pattern rather than
// storing the raw picker state.

// The pay period the user was mid-way through when they lost their job ends
// on the first occurrence of payPeriodEndDay on/after jobLossDate — true
// regardless of period length (weekly vs. biweekly both just repeat that same
// weekday every N weeks), so no separate biweekly branch is needed. Monthly
// has no "day of week" concept — falls back to the calendar month's last day.
export function resolveLastPayPeriodEnd(jobLossDateIso, payPeriodEndDay, userPaySchedule) {
  const jobLossDate = new Date(jobLossDateIso + "T00:00:00");
  if (userPaySchedule === "monthly") {
    return new Date(jobLossDate.getFullYear(), jobLossDate.getMonth() + 1, 0);
  }
  const targetDow = payPeriodEndDay ?? 0;
  const d = new Date(jobLossDate);
  d.setDate(d.getDate() + ((targetDow - d.getDay() + 7) % 7));
  return d;
}

// First occurrence of arrivalDow strictly after periodEndDate — payroll always
// lands at least a day after the period it covers actually closes.
export function resolvePendingCheckArrivalDate(periodEndDate, arrivalDow) {
  const d = new Date(periodEndDate);
  d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + ((arrivalDow - d.getDay() + 7) % 7));
  return d;
}

// Rough net estimate for the final check — same flat-rate sketch
// ReemploymentTracker.jsx uses for its target-income preview (gross minus
// fed/state/FICA/401k rates already on file). Not a full computeNet pass:
// this is a one-time estimate for a check that predates Job Loss Mode
// zeroing income, not a week buildYear will ever actually compute.
export function estimatePendingCheckAmount(workedDaysCount, cfg) {
  if (!workedDaysCount) return 0;
  const grossPerDay = (cfg?.shiftHours ?? 8) * (cfg?.baseRate ?? 0);
  const gross = workedDaysCount * grossPerDay;
  const rate = (cfg?.fedRateLow ?? 0) + (cfg?.stateRateLow ?? 0) + (cfg?.ficaRate ?? 0.0765) + (cfg?.k401Rate ?? 0);
  return Math.max(0, gross * (1 - rate));
}

/**
 * Computes the runway/burn numbers Job Loss Home + Budget both render.
 * `savings` is the combined cash figure (manual "additional savings" draft +
 * sumJobHuntIncome(config)) — computed by the caller so this stays a pure
 * function of its arguments, not a hook.
 *
 * Returns null when jobLossMode/jobLossDate aren't set (nothing to compute).
 */
export function computeJobLossRunway({ config, expenses, effectiveToday, savings = 0 }) {
  if (!config?.jobLossMode || !config?.jobLossDate || !effectiveToday) return null;

  const todayDate = new Date(effectiveToday + "T12:00:00");
  const phaseIdx = getPhaseIndex(todayDate);

  // Essential = Needs / non-Lifestyle, tracked during Job Loss Mode (the
  // expense review step's checklist — TODO §15 mode rebuild). Untracked
  // expenses (trackDuringJobLoss === false) are excluded from the runway
  // entirely, same as they're excluded from the Job Loss Budget list — they
  // stay untouched for normal-mode Budget, just not part of this math.
  // Lifestyle rows still drag on burn when active, but are excluded here so
  // the runway focuses on survival spend.
  const essentialActive = (expenses ?? []).filter(exp => {
    const status = exp.jobLossStatus ?? "active";
    const flexible = exp.category === "Lifestyle";
    const tracked = exp.trackDuringJobLoss !== false;
    return status === "active" && !flexible && tracked;
  });
  const weeklyBurn = essentialActive.reduce(
    (sum, exp) => sum + getEffectiveAmount(exp, todayDate, phaseIdx),
    0,
  );

  // Lifestyle spend (TODO §15.H14 bullet 2): still tracked/active rows in this
  // category are deliberately excluded from weeklyBurn above ("focuses on
  // survival spend"), but a user who keeps them checked is still actually
  // paying for them — surfaced separately so the runway UI can caption it
  // instead of letting the headline number silently omit real spend.
  const lifestyleActive = (expenses ?? []).filter(exp => {
    const status = exp.jobLossStatus ?? "active";
    const flexible = exp.category === "Lifestyle";
    const tracked = exp.trackDuringJobLoss !== false;
    return status === "active" && flexible && tracked;
  });
  const lifestyleWeeklySpend = lifestyleActive.reduce(
    (sum, exp) => sum + getEffectiveAmount(exp, todayDate, phaseIdx),
    0,
  );

  const jobLossStartMs = new Date(config.jobLossDate + "T00:00:00").getTime();
  const weeksSinceLoss = Math.max(0, Math.floor((todayDate.getTime() - jobLossStartMs) / (7 * 86400000)));

  let benefitsRemainingWeeks = 0;
  if (
    config.unemploymentEnabled
    && (config.unemploymentWeekly ?? 0) > 0
    && (config.unemploymentDurationWeeks ?? 0) > 0
  ) {
    const offset = config.unemploymentWaitingWeek ? 1 : 0;
    const elapsedBenefit = Math.max(0, weeksSinceLoss - offset);
    benefitsRemainingWeeks = Math.max(0, config.unemploymentDurationWeeks - elapsedBenefit);
  }
  const projectedUnemploymentTotal = benefitsRemainingWeeks * (config.unemploymentWeekly ?? 0);

  const safeSavings = Math.max(0, savings || 0);
  const withBenefitsCash = safeSavings + projectedUnemploymentTotal;
  const withoutBenefitsCash = safeSavings;

  // Pending check (TODO §15.H15): a known future inflow, landing on a specific
  // day rather than already-in-hand cash — so it extends the runway from the
  // day it's due, not from today. If cash runs dry before that day, the check
  // hasn't helped yet — the cliff lands at the dry-out point, same as if it
  // didn't exist; the piecewise math below only "un-dries" the runway once the
  // check's own arrival day is reached.
  const pendingAmount = Math.max(0, config.jobLossPendingCheckAmount ?? 0);
  const pendingDateIso = config.jobLossPendingCheckDate ?? null;
  const pendingDaysOut = (pendingAmount > 0 && pendingDateIso)
    ? Math.max(0, Math.round((new Date(pendingDateIso + "T00:00:00").getTime() - todayDate.getTime()) / 86400000))
    : null;

  const daysFromCash = (cash) => {
    if (weeklyBurn <= 0) return Infinity;
    const dailyBurn = weeklyBurn / 7;
    if (pendingDaysOut == null) return (cash / weeklyBurn) * 7;
    const cashAtPending = cash - dailyBurn * pendingDaysOut;
    if (cashAtPending <= 0) return cash / dailyBurn;
    return pendingDaysOut + (cashAtPending + pendingAmount) / dailyBurn;
  };
  const cliffFromDays = (days) => {
    if (!Number.isFinite(days)) return null;
    const d = new Date(todayDate);
    d.setDate(d.getDate() + Math.round(days));
    return d;
  };

  return {
    weeklyBurn,
    essentialCount: essentialActive.length,
    lifestyleWeeklySpend,
    benefitsRemainingWeeks,
    projectedUnemploymentTotal,
    pendingCheck: pendingDaysOut != null
      ? { amount: pendingAmount, date: pendingDateIso, daysOut: pendingDaysOut }
      : null,
    withBenefits: {
      cash: withBenefitsCash,
      days: daysFromCash(withBenefitsCash),
      cliff: cliffFromDays(daysFromCash(withBenefitsCash)),
    },
    withoutBenefits: {
      cash: withoutBenefitsCash,
      days: daysFromCash(withoutBenefitsCash),
      cliff: cliffFromDays(daysFromCash(withoutBenefitsCash)),
    },
  };
}
