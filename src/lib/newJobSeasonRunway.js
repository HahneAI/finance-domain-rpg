import { getEffectiveAmount, getPhaseIndex } from "./finance.js";
import { getNextDueDate, getExpenseDisplayAmount } from "./expense.js";

// TODO §1 mode rebuild — New Job Season Home and Budget are now two separate
// components (not one "pinned to top" card layered over the normal panels),
// but both need the exact same runway numbers: Home displays the headline
// metrics, Budget owns the "additional savings" input and benefit scenario
// toggle that feed them. Pulled out here as the single source of truth
// rather than let two components duplicate — or subtly drift from — the
// same formula. Also consolidates firstUnemploymentPaymentDate, which used
// to be copy-pasted between NewJobSeasonDashboard.jsx and ExpenseTriage.jsx.

// First unemployment payment date — null when no benefits are configured.
// Treats the user's "weekly" payout as landing at the end of each benefit
// week from newJobSeasonDate forward. With waiting-week on, that's day 14; off,
// day 7.
export function firstUnemploymentPaymentDate(cfg) {
  if (!cfg?.unemploymentEnabled) return null;
  if ((cfg.unemploymentWeekly ?? 0) <= 0) return null;
  if (!cfg.newJobSeasonDate) return null;
  const start = new Date(cfg.newJobSeasonDate + "T12:00:00");
  const offsetDays = cfg.unemploymentWaitingWeek ? 14 : 7;
  const d = new Date(start);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

// Sums the "log extra income while job hunting" widget (New Job Season Home) —
// gig work, odd jobs, anything earned outside real re-employment. Folded
// into the runway's savings side, same as the manual "additional savings"
// draft input.
export function sumJobHuntIncome(cfg) {
  return (cfg?.jobHuntIncomeLog ?? []).reduce((s, entry) => s + (entry.amount ?? 0), 0);
}

// ── Pending/final paycheck (TODO §1.H15) ────────────────────────────────
// A job loss rarely lines up with a pay period boundary — there's usually one
// more check still owed for days actually worked before the loss date. None
// of the above modeled this: buildYear() zeroes the whole fiscal week
// containing newJobSeasonDate (not prorated), and the runway calc only knew about
// cash-on-hand + gig income, both "already in hand" today. This resolves the
// two NewJobSeasonEntry wizard questions (days worked in the final week; which
// day-of-week checks normally arrive) into a concrete estimated amount +
// date, computed once at Activate time and stored on config — mirrors
// DueDatePicker's resolve-to-a-concrete-value-at-confirm pattern rather than
// storing the raw picker state.

// The pay period the user was mid-way through when they lost their job ends
// on the first occurrence of payPeriodEndDay on/after newJobSeasonDate — true
// regardless of period length (weekly vs. biweekly both just repeat that same
// weekday every N weeks), so no separate biweekly branch is needed. Monthly
// has no "day of week" concept — falls back to the calendar month's last day.
export function resolveLastPayPeriodEnd(newJobSeasonDateIso, payPeriodEndDay, userPaySchedule) {
  const newJobSeasonDate = new Date(newJobSeasonDateIso + "T00:00:00");
  if (userPaySchedule === "monthly") {
    return new Date(newJobSeasonDate.getFullYear(), newJobSeasonDate.getMonth() + 1, 0);
  }
  const targetDow = payPeriodEndDay ?? 0;
  const d = new Date(newJobSeasonDate);
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

// ── Food special case (TODO §1) ──────────────────────────────────────────
// Food isn't a once-a-month bill like rent or insurance — it's an ongoing
// weekly grocery spend, so the New Job Season due-date step asks "what day do
// you usually shop" instead of the generic week-of-month/custom-date
// DueDatePicker. Next occurrence of dow (0=Sun..6=Sat) on/after referenceIso
// — unlike resolvePendingCheckArrivalDate (strictly *after* a period end),
// this stays on referenceIso itself when it already matches dow, since
// "today" is a perfectly valid answer to "what day do you shop."
export function resolveNextWeekdayOnOrAfter(dow, referenceIso) {
  if (dow == null || !referenceIso) return null;
  const d = new Date(referenceIso + "T00:00:00");
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return d;
}

// Rough net estimate for the final check — same flat-rate sketch
// ReemploymentTracker.jsx uses for its target-income preview (gross minus
// fed/state/FICA/401k rates already on file). Not a full computeNet pass:
// this is a one-time estimate for a check that predates New Job Season
// zeroing income, not a week buildYear will ever actually compute.
export function estimatePendingCheckAmount(workedDaysCount, cfg) {
  if (!workedDaysCount) return 0;
  const grossPerDay = (cfg?.shiftHours ?? 8) * (cfg?.baseRate ?? 0);
  const gross = workedDaysCount * grossPerDay;
  const rate = (cfg?.fedRateLow ?? 0) + (cfg?.stateRateLow ?? 0) + (cfg?.ficaRate ?? 0.0765) + (cfg?.k401Rate ?? 0);
  return Math.max(0, gross * (1 - rate));
}

// ── Timeline-aware cash on hand (TODO §1.H17) ───────────────────────────
// Shared "does this expense count as an essential/needs bill for New Job Season
// Mode math" predicate — was three separately copy-pasted inline filters
// (weeklyBurn's essentialActive, lifestyleWeeklySpend's lifestyleActive, and
// now this) before being pulled out here; a future change to what counts as
// "essential" only needs to happen once.
function isTrackedActiveEssential(exp) {
  const status = exp.newJobSeasonStatus ?? "active";
  const flexible = exp.category === "Lifestyle";
  const tracked = exp.trackDuringNewJobSeason !== false;
  return status === "active" && !flexible && tracked;
}
function isTrackedActiveLifestyle(exp) {
  const status = exp.newJobSeasonStatus ?? "active";
  const flexible = exp.category === "Lifestyle";
  const tracked = exp.trackDuringNewJobSeason !== false;
  return status === "active" && flexible && tracked;
}

// Sums every essential (Needs-like, active, tracked) bill's real payment
// amount for each due-date occurrence landing in
// (fromDateExclusiveIso, throughDateInclusiveIso] — i.e. bills that have
// come due since the cash-on-hand figure was last confirmed by the user.
// getNextDueDate only exposes "next due on/after a date," not "how many
// occurrences between two dates" (the underlying cycle math is a pure
// advance-forward function, not a closed form) — so this walks one
// occurrence at a time, advancing the cursor past each hit, same approach
// NewJobSeasonBudgetPanel's upcomingBills list uses for a single occurrence.
export function sumBillsDueSince(expenses, fromDateExclusiveIso, throughDateInclusiveIso) {
  if (!fromDateExclusiveIso || !throughDateInclusiveIso) return 0;
  const through = new Date(throughDateInclusiveIso + "T12:00:00");
  let total = 0;
  for (const exp of expenses ?? []) {
    if (!isTrackedActiveEssential(exp)) continue;
    const amount = getExpenseDisplayAmount(exp);
    if (amount <= 0) continue;
    const cursor = new Date(fromDateExclusiveIso + "T12:00:00");
    cursor.setDate(cursor.getDate() + 1); // exclusive start
    // Safety cap — a zero/near-zero cycle length could otherwise loop forever.
    for (let i = 0; i < 366; i++) {
      const due = getNextDueDate(exp, cursor);
      if (!due || due > through) break;
      total += amount;
      cursor.setTime(due.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return total;
}

/**
 * Computes the runway/burn numbers New Job Season Home + Budget both render.
 * `extraCash` is cash beyond the persisted `config.newJobSeasonCashOnHand` figure
 * — today that's just `sumJobHuntIncome(config)` (gig/odd-job income logged
 * on Home). The raw cash-on-hand figure itself is read from `config`
 * directly (not passed in) so it can be timeline-decayed internally — see
 * `effectiveCashOnHand` below (TODO §1.H17). Computed by the caller so this
 * stays a pure function of its arguments, not a hook.
 *
 * Returns null when newJobSeasonMode/newJobSeasonDate aren't set (nothing to compute).
 */
export function computeNewJobSeasonRunway({ config, expenses, effectiveToday, extraCash = 0 }) {
  if (!config?.newJobSeasonMode || !config?.newJobSeasonDate || !effectiveToday) return null;

  const todayDate = new Date(effectiveToday + "T12:00:00");
  const phaseIdx = getPhaseIndex(todayDate);

  // Essential = Needs / non-Lifestyle, tracked during New Job Season (the
  // expense review step's checklist — TODO §1 mode rebuild). Untracked
  // expenses (trackDuringNewJobSeason === false) are excluded from the runway
  // entirely, same as they're excluded from the New Job Season Budget list — they
  // stay untouched for normal-mode Budget, just not part of this math.
  // Lifestyle rows still drag on burn when active, but are excluded here so
  // the runway focuses on survival spend.
  const essentialActive = (expenses ?? []).filter(isTrackedActiveEssential);
  const weeklyBurn = essentialActive.reduce(
    (sum, exp) => sum + getEffectiveAmount(exp, todayDate, phaseIdx),
    0,
  );

  // Lifestyle spend (TODO §1.H14 bullet 2): still tracked/active rows in this
  // category are deliberately excluded from weeklyBurn above ("focuses on
  // survival spend"), but a user who keeps them checked is still actually
  // paying for them — surfaced separately so the runway UI can caption it
  // instead of letting the headline number silently omit real spend.
  const lifestyleActive = (expenses ?? []).filter(isTrackedActiveLifestyle);
  const lifestyleWeeklySpend = lifestyleActive.reduce(
    (sum, exp) => sum + getEffectiveAmount(exp, todayDate, phaseIdx),
    0,
  );

  const newJobSeasonStartMs = new Date(config.newJobSeasonDate + "T00:00:00").getTime();
  const weeksSinceLoss = Math.max(0, Math.floor((todayDate.getTime() - newJobSeasonStartMs) / (7 * 86400000)));

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

  // Timeline-aware cash on hand (TODO §1.H17): `newJobSeasonCashOnHand` is a
  // point-in-time snapshot the user confirms via the Cash On Hand card's
  // editor, stamped with `newJobSeasonCashOnHandAsOf` at that moment. From then
  // forward, every essential bill's due date that passes is assumed paid out
  // of it and subtracted automatically — the displayed figure decreases on
  // its own as bills come due instead of silently going stale until the user
  // remembers to re-check their bank balance. Accounts that set cash-on-hand
  // before this field existed have no `newJobSeasonCashOnHandAsOf` — falls back to
  // `newJobSeasonDate` (New Job Season's own start), the only other timestamp on
  // file that's a reasonable "since when has this figure been true" anchor.
  const rawCashOnHand = Math.max(0, config.newJobSeasonCashOnHand ?? 0);
  const cashAsOf = config.newJobSeasonCashOnHandAsOf ?? config.newJobSeasonDate;
  const billsDueSinceAsOf = sumBillsDueSince(expenses, cashAsOf, effectiveToday);
  const effectiveCashOnHand = Math.max(0, rawCashOnHand - billsDueSinceAsOf);

  const safeExtraCash = Math.max(0, extraCash || 0);
  const withBenefitsCash = effectiveCashOnHand + safeExtraCash + projectedUnemploymentTotal;
  const withoutBenefitsCash = effectiveCashOnHand + safeExtraCash;

  // Pending check (TODO §1.H15): a known future inflow, landing on a specific
  // day rather than already-in-hand cash — so it extends the runway from the
  // day it's due, not from today. If cash runs dry before that day, the check
  // hasn't helped yet — the cliff lands at the dry-out point, same as if it
  // didn't exist; the piecewise math below only "un-dries" the runway once the
  // check's own arrival day is reached.
  const pendingAmount = Math.max(0, config.newJobSeasonPendingCheckAmount ?? 0);
  const pendingDateIso = config.newJobSeasonPendingCheckDate ?? null;
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
    rawCashOnHand,
    cashAsOf,
    billsDueSinceAsOf,
    effectiveCashOnHand,
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

/**
 * Selects the single "primary" runway day count from a computeNewJobSeasonRunway()
 * result — with or without unemployment benefits folded in — matching the
 * exact `hasBenefits && includeBenefits` selection NewJobSeasonHomePanel.jsx and
 * NewJobSeasonBudgetPanel.jsx each do inline for their headline tile. Pulled out
 * so any *other* consumer (Coach's trigger/context) quoting "the" runway
 * number can't independently drift from what those two panels show (the
 * drift-app-warden §8 F24/quarantine-2 fix). If the two panels' inline
 * selection logic ever changes, update this to match.
 *
 * Returns null when there's no dash (not in New Job Season) or burn is zero
 * (infinite runway — nothing meaningful to report as a day count).
 */
export function resolvePrimaryRunwayDays(dash, config, includeBenefits = true) {
  if (!dash) return null;
  const hasBenefits = Boolean(config?.unemploymentEnabled) && dash.projectedUnemploymentTotal > 0;
  const primary = (hasBenefits && includeBenefits) ? dash.withBenefits : dash.withoutBenefits;
  return Number.isFinite(primary.days) ? primary.days : null;
}
