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

  const daysFromCash = (cash) => weeklyBurn > 0 ? (cash / weeklyBurn) * 7 : Infinity;
  const cliffFromDays = (days) => {
    if (!Number.isFinite(days)) return null;
    const d = new Date(todayDate);
    d.setDate(d.getDate() + Math.round(days));
    return d;
  };

  return {
    weeklyBurn,
    essentialCount: essentialActive.length,
    benefitsRemainingWeeks,
    projectedUnemploymentTotal,
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
 * Selects the single "primary" runway day count from a computeJobLossRunway()
 * result — with or without unemployment benefits folded in — matching the
 * exact `hasBenefits && includeBenefits` selection JobLossHomePanel.jsx and
 * JobLossBudgetPanel.jsx each do inline for their headline tile. Pulled out
 * so any *other* consumer (Coach's trigger/context) quoting "the" runway
 * number can't independently drift from what those two panels show (the
 * drift-app-warden §21 F24/quarantine-2 fix). If the two panels' inline
 * selection logic ever changes, update this to match.
 *
 * Returns null when there's no dash (not in Job Loss Mode) or burn is zero
 * (infinite runway — nothing meaningful to report as a day count).
 */
export function resolvePrimaryRunwayDays(dash, config, includeBenefits = true) {
  if (!dash) return null;
  const hasBenefits = Boolean(config?.unemploymentEnabled) && dash.projectedUnemploymentTotal > 0;
  const primary = (hasBenefits && includeBenefits) ? dash.withBenefits : dash.withoutBenefits;
  return Number.isFinite(primary.days) ? primary.days : null;
}
