import { netWorthHealthStatus, getEffectiveAmountForMonth, getPhaseIndex, computeGoalTimeline, fmtFullDate } from "./finance.js";
import { getFiscalWeekNumber, FISCAL_WEEKS_PER_YEAR, getPayPeriodBounds, payPeriodUnit, weekNumToPaycheckNum, weeksToChecksRemaining, resolveActiveWeeksThisYear } from "./fiscalWeek.js";
import { EVENT_TYPES, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { EXPENSE_CYCLE_OPTIONS } from "./expense.js";
import { computeNewJobSeasonRunway, resolvePrimaryRunwayDays, sumJobHuntIncome } from "./newJobSeasonRunway.js";

// Pairs a fiscal week index with its real calendar date — full month name,
// never abbreviated — and the period number in the unit this account's pay
// schedule actually uses ("week" only for weekly pay; "paycheck"/"month"
// otherwise), per explicit instruction: date mentions get wider for larger
// pay periods, and Coach must mirror the app's own week-vs-check convention
// (payPeriodUnit/weekNumToPaycheckNum, lib/fiscalWeek.js) rather than
// defaulting to "week" out of habit. Reuses getPayPeriodBounds() — the same
// resolver HomePanel/IncomePanel use — instead of hand-deriving a date range.
function formatPeriodWithDate(weekIdx, allWeeks, checksPerYear) {
  const weekNumber = getFiscalWeekNumber(weekIdx);
  if (weekNumber == null) return "—";
  const periodNum = weekNumToPaycheckNum(weekNumber, checksPerYear) ?? weekNumber;
  const unit = payPeriodUnit(checksPerYear, "lower");
  const bounds = getPayPeriodBounds(weekIdx, allWeeks);
  if (!bounds) return `${unit} ${periodNum}`;
  const dateLabel = checksPerYear === 52
    ? `the week of ${fmtFullDate(bounds.start)}`
    : `${fmtFullDate(bounds.start)}–${fmtFullDate(bounds.end)}`;
  return `${dateLabel} (${unit} ${periodNum})`;
}

// Per-expense weekly cost, resolved the same way computeRemainingSpend()
// resolves it for the real "Weekly spend" aggregate — monthlyOverrides first,
// else the phase-indexed history[].weekly entry. billingMeta.amount is only
// the value entered on the add-expense form; it's never the authoritative
// current figure, so it must NOT be used here (it previously was, and
// disagreed with the real number by double digits on a live test).
function resolveWeeklyCost(expense, monthKey, phaseIdx) {
  if (monthKey != null && phaseIdx != null) {
    return getEffectiveAmountForMonth(expense, monthKey, phaseIdx);
  }
  // No date context to resolve history/overrides against (defensive only —
  // the app always passes `today`) — fall back to a rough billingMeta estimate.
  const amount = expense.billingMeta?.amount ?? 0;
  const cycle = expense.billingMeta?.cycle;
  const days = EXPENSE_CYCLE_OPTIONS.find((o) => o.value === cycle)?.days ?? 30;
  return days > 0 ? (amount / days) * 7 : 0;
}

const fmt$ = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "—");

// Per-goal timeline line — mirrors HomePanel.jsx's per-goal projected-rate math
// (checksPerYear-adjusted wN, rate = target / pN) exactly, so Coach's numbers
// can't drift from what the goal card itself shows. Goal LABELS are
// deliberately withheld here for user privacy — goals are identified only by
// funding-priority rank ("Goal 1 of N"), which is itself real, useful
// information (goals fund top to bottom in this order).
function formatGoalTimelineEntry(g, rank, total, checksPerYear, currentWeekIdx, allWeeks) {
  if (!Number.isFinite(g.eW)) {
    return `Goal ${rank} of ${total}: ${fmt$(g.target)} target, not on track to finish within this fiscal year at the current pace`;
  }
  const pN = checksPerYear === 52 ? g.wN : g.wN / (FISCAL_WEEKS_PER_YEAR / checksPerYear);
  const rate = pN > 0 ? g.target / pN : 0;
  const periodAbbrev = payPeriodUnit(checksPerYear, "abbrev").toLowerCase();
  const doneLabel = currentWeekIdx != null
    ? formatPeriodWithDate(currentWeekIdx + Math.ceil(g.eW), allWeeks, checksPerYear)
    : null;
  return `Goal ${rank} of ${total}: ${fmt$(g.target)} target, ~${fmt$(rate)}/${periodAbbrev} projected, ~${Number.isFinite(pN) ? pN.toFixed(1) : "0.0"} ${periodAbbrev}s to fund${doneLabel != null ? `, on track for ${doneLabel}` : ""}`;
}

/**
 * §2.G — deterministic compressed financial snapshot for Coach's system
 * prompt. Same line order/shape on every call (job-loss line only appears
 * when config.newJobSeasonMode is set) so the block prompt-caches across a
 * session even as the underlying numbers change.
 */
export function buildCoachContext({
  config = null,
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  goals = [],
  expenses = [],
  fundedGoalSpend = 0,
  currentWeek = null,
  today = null,
  runwayDays = null,
  logs = [],
  futureWeeks = [],
  timelineWeekNets = [],
  futureWeekNets = [],
  logNetLost = 0,
  logNetGained = 0,
  futureEventDeductions = {},
  prevWeekNet = null,
  allWeeks = [],
} = {}) {
  const avgWeeklySurplus = weeklyIncome - avgWeeklySpend;
  // Matches HomePanel.jsx's activeWeeksThisYear exactly (same shared helper)
  // so the Coach's stated annual savings/net-worth figures can't drift from
  // the Home tile they're described as matching — a flat 52 here double-
  // diluted weeklyIncome's own already-per-active-week average for any
  // account that didn't start at fiscal week 0 (TODO §1, 2026-07-19).
  const activeWeeksThisYear = resolveActiveWeeksThisYear(config?.firstActiveIdx);
  const annualSavings = avgWeeklySurplus * activeWeeksThisYear - fundedGoalSpend;
  const netWorthHealth = netWorthHealthStatus(annualSavings, weeklyIncome * activeWeeksThisYear);

  // Matches HomePanel.jsx's "Budget Health" tile exactly: spendRatio =
  // avgWeeklySpend / weeklyIncome, same <50%/<75% thresholds and labels.
  const spendRatio = weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
  const budgetHealthLabel = spendRatio < 0.5 ? "well-managed" : spendRatio < 0.75 ? "healthy range" : "watch spend";

  const completedGoals = goals.filter((g) => g.completed);
  const activeGoals = goals.filter((g) => !g.completed);
  const totalActiveGoalsTarget = activeGoals.reduce((s, g) => s + (Number(g.target) || 0), 0);
  const totalGoalTarget = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);
  const activeExpenses = expenses.filter((e) => (e.newJobSeasonStatus ?? "active") === "active");
  const weekNumber = currentWeek ? getFiscalWeekNumber(currentWeek.idx) : null;
  const weeksLeft = weekNumber != null ? Math.max(FISCAL_WEEKS_PER_YEAR - weekNumber, 0) : null;
  const mostRecentLog = logs.length
    ? [...logs].sort((a, b) => (b.weekEnd ?? "").localeCompare(a.weekEnd ?? ""))[0]
    : null;

  // Matches HomePanel.jsx's "Left This Week" tile: prevWeekNet (falling back
  // to weeklyIncome before any week is confirmed) minus average weekly spend.
  const leftThisWeek = (prevWeekNet ?? weeklyIncome) - avgWeeklySpend;

  // Matches HomePanel.jsx's own computeGoalTimeline() call exactly (same
  // args, same config.goalTimelineEpochIdx epoch) so "weeks to complete all"
  // and each goal's projected rate/date can't disagree with the goal cards.
  const goalTimeline = computeGoalTimeline(
    activeGoals, futureWeeks, timelineWeekNets, expenses, logNetLost, logNetGained,
    futureEventDeductions, config?.goalTimelineEpochIdx ?? null
  );
  const lastGoalEW = goalTimeline.length ? Math.max(...goalTimeline.map((g) => (Number.isFinite(g.eW) ? g.eW : 0))) : 0;
  const checksPerYear = PAYCHECKS_PER_YEAR[config?.userPaySchedule ?? "weekly"] ?? 52;
  const perCheckFactor = 52 / checksPerYear;

  // Matches HomePanel.jsx's "Next Week Takehome" tile exactly: the first
  // entry of futureWeekNets (a real confirmed/scheduled figure) if one
  // exists, else the last confirmed week, else the plain weekly average —
  // same fallback order, same status thresholds, same perCheckFactor scaling.
  const nextWeekNet = futureWeekNets?.[0] ?? null;
  const nextWeekFallbackSource = nextWeekNet != null ? null : (prevWeekNet != null ? "prev" : "avg");
  const nextWeekFallbackNet = nextWeekFallbackSource === "prev" ? prevWeekNet : weeklyIncome;
  const nextWeekDisplay = nextWeekNet ?? nextWeekFallbackNet;
  const nextWeekStatus = nextWeekNet != null
    ? (nextWeekNet < weeklyIncome * 0.8 ? "below average — check Log"
      : nextWeekNet < weeklyIncome * 0.95 ? "slightly below average"
        : "on track")
    : (nextWeekFallbackSource === "prev" ? "projected from your last confirmed pay" : "projected average — no confirmed weeks yet");
  let nextWeekLine = `Next week takehome (Home tile): ${fmt$(nextWeekDisplay * perCheckFactor)} (${nextWeekStatus})`;
  if (nextWeekNet != null) {
    const diff = nextWeekNet - weeklyIncome;
    if (Math.abs(diff) >= weeklyIncome * 0.03) {
      nextWeekLine += `, ${diff > 0 ? "+" : "-"}${fmt$(Math.abs(diff) * perCheckFactor)} vs your average`;
    }
  }

  // Matches the app's own week-vs-check convention exactly (payPeriodUnit,
  // weeksToChecksRemaining, lib/fiscalWeek.js): weekly-pay accounts see
  // "week", every other schedule sees "paycheck"/"month" with a wider date
  // range — never hardcode "week" regardless of pay schedule.
  const periodUnitPlural = payPeriodUnit(checksPerYear, "lowerPlural");
  const currentPeriodLabel = currentWeek ? formatPeriodWithDate(currentWeek.idx, allWeeks, checksPerYear) : "—";
  const periodsLeft = weeksLeft != null ? weeksToChecksRemaining(weeksLeft, checksPerYear) : null;
  const lastGoalPeriods = checksPerYear === 52 ? lastGoalEW : lastGoalEW / (FISCAL_WEEKS_PER_YEAR / checksPerYear);

  const lines = [
    `Weekly net income: ${fmt$(weeklyIncome)}`,
    `Weekly spend: ${fmt$(avgWeeklySpend)}`,
    `Weekly surplus: ${fmt$(avgWeeklySurplus)}`,
    nextWeekLine,
    `Left this week (Home tile): ${fmt$(leftThisWeek)}`,
    `Savings rate: ${netWorthHealth.rate != null ? `${Math.round(netWorthHealth.rate * 100)}%` : "—"}${netWorthHealth.belowThreshold ? " (below 10% target)" : ""}`,
    `Net worth trend (Home tile — projected annual savings): ${fmt$(annualSavings)}`,
    `Budget Health (Home tile): ${Math.round(spendRatio * 100)}% spend ratio (${budgetHealthLabel})`,
    `Goals: ${goals.length} goal${goals.length === 1 ? "" : "s"} set (${completedGoals.length} completed), ${fmt$(fundedGoalSpend)} funded so far, ${fmt$(totalGoalTarget)} total target`,
    `Expenses: ${activeExpenses.length} active line${activeExpenses.length === 1 ? "" : "s"}, ${fmt$(avgWeeklySpend)}/week`,
    ...(activeGoals.length ? [
      `Active goals total (Home tile — unfunded target sum): ${fmt$(totalActiveGoalsTarget)}`,
      `Weeks to complete all active goals (Home tile): ~${Math.ceil(lastGoalPeriods)} ${periodUnitPlural}`,
    ] : []),
    `Log entries: ${logs.length} logged${mostRecentLog ? `, most recent: ${EVENT_TYPES[mostRecentLog.type]?.label ?? mostRecentLog.type} (week ending ${fmtFullDate(mostRecentLog.weekEnd)})` : ""}`,
    `Current period: ${currentPeriodLabel}${periodsLeft != null ? `, ${periodsLeft} ${periodUnitPlural} left in the fiscal year` : ""}`,
    `Today: ${today ? fmtFullDate(today) : "—"}`,
  ];

  if (activeExpenses.length) {
    const monthKey = today ? today.slice(0, 7) : null;
    const phaseIdx = today ? getPhaseIndex(new Date(`${today}T12:00:00`)) : null;
    const items = activeExpenses
      .map((exp) => `${exp.label ?? "Unnamed"} (${exp.category ?? (exp.type === "loan" ? "Loan" : "Needs")}): ~${fmt$(resolveWeeklyCost(exp, monthKey, phaseIdx))}/wk`)
      .join("; ");
    lines.push(`Expense breakdown: ${items}`);
  }

  if (goalTimeline.length) {
    const items = goalTimeline
      .map((g, i) => formatGoalTimelineEntry(g, i + 1, goalTimeline.length, checksPerYear, currentWeek?.idx ?? null, allWeeks))
      .join("; ");
    lines.push(`Goal breakdown (ranked by funding priority — goal names withheld for privacy): ${items}`);
  }

  if (config?.newJobSeasonMode) {
    lines.push(`New Job Season: active${runwayDays != null ? `, ~${runwayDays} days of runway` : ""}`);
  }

  return lines.join("\n");
}

/**
 * §18.E — Job Hunt Assistant's dedicated context snapshot. A separate function
 * from buildCoachContext (not an extra branch on it) because this mode needs
 * fields — the full application log, target income — that would otherwise
 * bloat the general Ask Coach/Net Worth prompt's cached prefix for every user
 * not in this specific mode. Every figure resolves through the same
 * authoritative functions the on-screen panels use (§21 F113's grounding
 * rule): computeNewJobSeasonRunway/resolvePrimaryRunwayDays (NewJobSeasonHomePanel's
 * own runway tile) and sumJobHuntIncome — never a parallel estimate.
 *
 * Unlike the goal-breakdown line above, application company/role names are
 * deliberately NOT withheld — Job Hunt Assistant's whole point is company-
 * specific coaching ("prep me for the Acme interview"), so withholding the
 * name would break the feature, not just protect privacy the way it does
 * for goals.
 */
export function buildJobHuntContext({ config = null, expenses = [], effectiveToday = null, includeBenefits = true } = {}) {
  const lines = [];
  const manualSavings = Math.max(0, config?.newJobSeasonCashOnHand ?? 0);
  const huntIncome = sumJobHuntIncome(config);
  const dash = computeNewJobSeasonRunway({ config, expenses, effectiveToday, savings: manualSavings + huntIncome });
  if (!dash) return "";

  const runwayDays = resolvePrimaryRunwayDays(dash, config, includeBenefits);
  lines.push(`Cash Runway: ${runwayDays != null ? `~${Math.round(runwayDays)} days` : "no essential burn — effectively open-ended"} · weekly essential burn ${fmt$(dash.weeklyBurn)} across ${dash.essentialCount} tracked ${dash.essentialCount === 1 ? "expense" : "expenses"}`);
  if (dash.lifestyleWeeklySpend > 0) {
    lines.push(`Lifestyle spend still tracked (not counted in runway above): ${fmt$(dash.lifestyleWeeklySpend)}/wk`);
  }
  if (huntIncome > 0) lines.push(`Extra job-hunt income logged so far: ${fmt$(huntIncome)}`);

  if (config?.targetIncomeAnnual != null) {
    lines.push(`Target annual income: ${fmt$(config.targetIncomeAnnual)}`);
  }

  const apps = Array.isArray(config?.jobApplications) ? config.jobApplications : [];
  if (apps.length) {
    const recent = [...apps].sort((a, b) => (b.dateApplied ?? "").localeCompare(a.dateApplied ?? "")).slice(0, 5);
    const items = recent.map((a) => `${a.company} — ${a.role} (${a.status}, applied ${a.dateApplied})`).join("; ");
    lines.push(`Applications (${apps.length} total${recent.length < apps.length ? `, ${recent.length} most recent shown` : ""}): ${items}`);
  } else {
    lines.push("No applications logged yet.");
  }

  if (config?.returnToWorkDate) {
    lines.push(`Expected return-to-work date already set: ${config.returnToWorkDate}`);
  }

  return lines.join("\n");
}

// ── Future context extensions ───────────────────────────────────────────
// None of these fields exist yet — nothing below is built. Listed here so
// each feature extends buildCoachContext instead of growing its own bespoke
// context builder. Keep this map in sync with docs/TODO.md as items land.
//
// Benefits/401k (BenefitsPanel)   — deferred, not built: hold off until we've looked closer at how
//                                   a base (non-DHL) user onboards other employer comp (signing
//                                   bonuses, non-DHL 401k match/vesting) — don't bake in DHL-shaped
//                                   assumptions before that's settled. See docs/TODO.md §2.B.
// §2.D Statements AI Insights    — period totals: gross, taxes, goal velocity, biggest expense shift
// §2.J Tax Onboarding Interview  — taxedWeeksFed/State split, taxHistoryReliableFrom, account created_at
// §8.A Paycheck variance forecaster — confirmed-vs-scheduled variance band (last 6 weeks)
// §8.A Seasonal pattern memory   — prior-year seasonal deltas (OT spikes, utility swings)
// §8.A Cash-flow crunch warning  — lowest upcoming spendable week + amount
// §8.A Overtime ROI calculator   — marginal after-tax value of one more OT hour
// §8.A Goal ETA drift alerts     — per-goal projected-finish drift vs. trend line
// §8.B Schedule drift detector   — confirmed-vs-configured schedule deviation streak
// §8.B Bill-creep detector       — expense history creep, annualized
// §8.C Weekly pre-game briefing  — upcoming bills, goal contributions, one heads-up flag
// §8.C Raise-negotiation prep    — hours-worked %, OT reliability, attendance streak, tenure
// §8.C Yearly recap ("Wrapped")  — full-year aggregates: gross, taxes, goals funded, biggest OT week
// §8.F2 Council of Future Selves — multi-year projection curve (savings velocity, loan payoff, 401k)
// §8.F2 Burnout Sentinel         — consecutive-worked-days streak, fog index, missed-day corrections
// §8.F1 The Fog Index           — micro check-in answers, anxious-open frequency, streak breaks
// §8.F3 Heirloom Letters        — per-goal sealed-letter-pending-delivery flag (not financial data)
