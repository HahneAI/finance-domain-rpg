// A single shared, fabricated-but-realistic test account, run through the
// REAL buildCoachContext() (src/lib/aiContext.js) — the same function
// api/coach.js's live traffic uses — rather than hand-typing a context
// string per prompt file. This is what "manually build a data fixture"
// should mean here: fake INPUT numbers (fine for a style/personality test,
// never fine for a data-accuracy one), but the function that turns those
// numbers into the text Coach actually reads is the real one, so this
// fixture can never silently drift from what buildCoachContext() actually
// produces in production.
//
// Deliberately no goals/expenses beyond one simple rent line — an earlier
// draft included a goal, which produced a nonsensical "~0 weeks to fund
// $3,000 at $0/wk" line because computeGoalTimeline() needs a real
// futureWeeks/timelineWeekNets series to project against, which this
// fixture doesn't build. Rather than fake that whole series just to make
// one line look sensible, the fixture stays goal-free — exactly the kind
// of silently-wrong-number risk drift-app-warden.md's D1 rule warns about,
// avoided here by not reaching for a shortcut.
//
// Reuse this same shape (with different weeklyIncome/avgWeeklySpend ratios)
// for Phase 4's severity-flexing rows (budget near-limit vs. healthy) —
// that's real engine math doing the work, not two hand-typed guesses at
// what "99% used" looks like.
//
// newJobSeasonMode/runwayDays added for Phase 5's Net Worth Trigger Red-tier
// test (docs/TODO.md §2.L) — Red's own trigger condition per coachTriggers.js
// is specifically "New Job Season, runway under 30 days," and
// buildCoachContext() only emits its "New Job Season: active" line when
// config.newJobSeasonMode is true, so a realistic Red-tier test needs both
// set, not just the addendum text alone.
import { buildCoachContext } from "../../../src/lib/aiContext.js";

// Returns the raw ARGUMENT BAG buildTestContext() feeds buildCoachContext(),
// rather than the rendered string. Split out 2026-09-02 so a second consumer
// — Coach's drill-down tools (src/lib/coachTools.js), which take the same
// prop bag AskCoachPanel assembles, not a context string — can be exercised
// against this exact account instead of a parallel hand-rolled one.
//
// buildTestContext() below is now a one-line wrapper over this, which is what
// makes its output byte-identical to before by CONSTRUCTION rather than by
// inspection: there is only one bag, and the string is derived from it. Do not
// add fields here to serve a tool — every field is an input to
// buildCoachContext(), so anything added changes the eval harness's prompt text
// and invalidates Phase 4/5's word-for-word repeat comparisons. Tool-shaped
// data belongs in buildToolTestAccount() at the bottom of this file.
export function buildTestAccountArgs({
  weeklyIncome = 845, avgWeeklySpend = 520, newJobSeasonMode = false, runwayDays = null,
} = {}) {
  const config = {
    firstActiveIdx: 0,
    userPaySchedule: "weekly",
    goalTimelineEpochIdx: null,
    newJobSeasonMode,
  };
  const currentWeek = { idx: 10 };
  const allWeeks = Array.from({ length: 52 }, (_, i) => ({
    idx: i,
    weekEnd: `2026-${String(1 + Math.floor(i / 4)).padStart(2, "0")}-${String(1 + (i % 4) * 7).padStart(2, "0")}`,
  }));

  return {
    config,
    weeklyIncome,
    avgWeeklySpend,
    goals: [],
    expenses: [{
      id: "e1", label: "Rent", category: "Needs",
      history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }],
    }],
    fundedGoalSpend: 0,
    currentWeek,
    today: "2026-03-09",
    runwayDays,
    logs: [],
    futureWeeks: [],
    timelineWeekNets: [],
    futureWeekNets: [weeklyIncome + 55],
    logNetLost: 0,
    logNetGained: 0,
    futureEventDeductions: {},
    prevWeekNet: weeklyIncome + 5,
    allWeeks,
  };
}

export function buildTestContext(opts = {}) {
  return buildCoachContext(buildTestAccountArgs(opts));
}

// Weekly Pre-Game Briefing (docs/TODO.md §8.A, "3 sentences max: this week's
// projected check, bills due, goal contributions, one heads-up") — not built
// yet, but buildCoachContext() already carries every field its spec asks
// for, so this fixture is ready to plug into a real prompt loader the
// moment one exists. Unlike buildTestContext() above, this one DOES fund a
// real goal with a genuine trend line, because "goal contributions" is
// explicitly part of the spec — that needs computeGoalTimeline() to have
// something real to project, not the goal-free shortcut buildTestContext()
// takes for tests that don't care about goal data.
//
// The earlier "~0 weeks to fund $3,000 at $0/wk" bug (see the note above)
// turned out to be one thing, not two: computeGoalTimeline() calls
// getPhaseIndex(week.weekEnd), which calls week.weekEnd.getFullYear() —
// it needs a real Date object per future week, not a date STRING the way
// buildTestContext()'s allWeeks (only ever used for label formatting, a
// different code path) gets away with. Empty futureWeeks/timelineWeekNets
// wasn't really the fix, just the thing that avoided ever hitting this.
export function buildWeeklyBriefingAccountArgs({
  weeklyIncome = 845, avgWeeklySpend = 520, goalTarget = 2000,
} = {}) {
  const config = { firstActiveIdx: 0, userPaySchedule: "weekly", goalTimelineEpochIdx: null, newJobSeasonMode: false };
  const currentWeek = { idx: 10 };
  // Real Date objects, 8 weeks out — enough for a short-horizon goal to
  // show a genuine funding date, not an instant/degenerate one.
  const futureWeeks = Array.from({ length: 8 }, (_, i) => ({
    idx: 11 + i,
    weekEnd: new Date(`2026-${String(3 + Math.floor((11 + i) / 4)).padStart(2, "0")}-${String(1 + ((11 + i) % 4) * 7).padStart(2, "0")}T12:00:00`),
  }));
  const timelineWeekNets = futureWeeks.map(() => weeklyIncome + 55);

  return {
    config,
    weeklyIncome,
    avgWeeklySpend,
    goals: [{ id: "g1", target: goalTarget, completed: false }],
    expenses: [{
      id: "e1", label: "Rent", category: "Needs",
      history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }],
    }],
    fundedGoalSpend: 0,
    currentWeek,
    today: "2026-03-09",
    runwayDays: null,
    logs: [],
    futureWeeks,
    timelineWeekNets,
    futureWeekNets: [weeklyIncome + 55],
    logNetLost: 0,
    logNetGained: 0,
    futureEventDeductions: {},
    prevWeekNet: weeklyIncome + 5,
    allWeeks: futureWeeks,
  };
}

export function buildWeeklyBriefingContext(opts = {}) {
  return buildCoachContext(buildWeeklyBriefingAccountArgs(opts));
}

// ─────────────────────────────────────────────────────────────────────────
// Tool-ready account — for Coach's drill-down tools (src/lib/coachTools.js)
// ─────────────────────────────────────────────────────────────────────────
//
// WHY A THIRD FIXTURE RATHER THAN ENRICHING buildTestAccountArgs(): the two
// fixtures above cannot carry this data without changing the prompt text the
// eval harness measures. Adding goals adds a "Goal breakdown" line, adding
// logs rewrites the "Log entries" line, adding expenses rewrites "Expense
// breakdown" — and Phase 4/5's findings rest on runs being word-for-word
// identical across repeats. So this is a SIBLING account, deliberately tuned
// to the same identity (~$845/wk net, $520/wk baseline spend, $400/wk rent,
// today 2026-03-09, fiscal week 10, weekly pay) so a finding here is
// comparable to a finding there — not a second unrelated persona.
//
// WHAT MAKES IT TOOL-READY: buildTestAccountArgs()'s `allWeeks` are
// label-shaped — `{ idx, weekEnd: "2026-03-01" }`, a date STRING with no
// weekStart, grossPay, taxableGross, active or payrollDeductions. That is
// entirely sufficient for the period-label formatting buildCoachContext()
// does, and entirely insufficient for get_week_breakdown, which reads the
// real pay fields. Rather than hand-type richer week objects (a parallel
// formula, and the exact D1 risk drift-app-warden.md §12 catalogues), this
// fixture runs the REAL buildYear() over a real config — the same function
// that builds every week in production — and derives income, spend and log
// impacts through the real computeNet()/computeRemainingSpend()/
// calcEventImpact(). Same principle as the two fixtures above, applied one
// layer deeper: fake INPUT numbers, real functions turning them into data.
//
// The bag it returns is a superset of buildCoachContext()'s parameters, so it
// can ALSO be passed straight to buildCoachContext() to get a context string
// for this same account — meaning a prompt test and a tool test can be run
// against one account, which is the whole point of putting it here rather
// than in the app's own test tree.
import { buildYear, computeNet, computeRemainingSpend, calcEventImpact, toLocalIso } from "../../../src/lib/finance.js";
import { TOTAL_FISCAL_WEEKS } from "../../../src/constants/config.js";

// baseRate 29.20 is reverse-solved, not arbitrary: at 40h with this config's
// 5% 401k, $22.50/wk benefits and 10%/4%/7.65% fed/state/FICA rates, real
// computeNet() lands at ~$845/wk — matching buildTestAccountArgs()'s
// hand-set weeklyIncome. If any rate below changes, re-derive this or the two
// fixtures stop describing the same person.
const TOOL_ACCOUNT_CONFIG = {
  employerPreset: null,
  userPaySchedule: "weekly",
  firstActiveIdx: 0,
  goalTimelineEpochIdx: null,
  newJobSeasonMode: false,
  baseRate: 29.20,
  shiftHours: 8,
  maxWeeklyHours: 40,
  standardWeeklyHours: 40,
  otThreshold: 40,
  otMultiplier: 1.5,
  diffRate: 1.75,
  nightDiffEnabled: false,
  nightDiffRate: 0,
  payPeriodEndDay: 0,
  ficaRate: 0.0765,
  fedRateLow: 0.10, fedRateHigh: 0.10,
  stateRateLow: 0.04, stateRateHigh: 0.04,
  // The legacy w1/w2 rate family, set to the SAME values as the generalized
  // fields above — which is exactly what a real account carries
  // (DEFAULT_CONFIG, constants/config.js:192, still defines all four, and
  // db.js:296 back-fills fedRateLow FROM w1FedRate on load).
  //
  // Not redundant: calcEventImpact (finance.js:1505) reads ONLY the legacy
  // names, with no `?? cfg.fedRateLow` fallback — the one rate consumer in the
  // app missing the fallback its four siblings all have (finance.js:114/773,
  // App.jsx:1800, BudgetPanel.jsx:450). Omitting these makes every log
  // entry's netLost/netGained NaN, which then propagates into
  // computeGoalTimeline's per-week surplus and silently reports every goal as
  // "not on track" — found exactly that way while building this fixture.
  w1FedRate: 0.10, w2FedRate: 0.10,
  w1StateRate: 0.04, w2StateRate: 0.04,
  k401Rate: 0.05, k401MatchRate: 0.03,
  healthPremium: 18.50,
  dentalPremium: 4.00,
  otherDeductions: [],
  // Every week taxed on schedule — an empty taxedWeeks would make buildYear
  // emit an entirely untaxed year and quietly inflate net by ~14%.
  //
  // TOTAL_FISCAL_WEEKS, never a hardcoded 52: the fiscal grid is 53 weeks, and
  // that constant exists specifically because hardcoding the wrong count has
  // drifted before (see its comment in constants/config.js). Hardcoding 52
  // here left the final week untaxed.
  taxedWeeks: Array.from({ length: TOTAL_FISCAL_WEEKS }, (_, i) => i),
};

// Baseline weekly spend is 400 + 60 + 60 = $520, deliberately equal to
// buildTestAccountArgs()'s hand-set avgWeeklySpend — but here it is composed
// of real expense objects the tools can actually drill into. March carries a
// monthlyOverrides bump on Groceries specifically so get_expense_detail has a
// real override to surface; that is the single most common reason a bill's
// true cost differs from the amount a user remembers entering, and it is
// invisible in the summary line the context block carries.
const TOOL_ACCOUNT_EXPENSES = [
  {
    id: "e1", label: "Rent", category: "Needs", newJobSeasonStatus: "active",
    billingMeta: { amount: 1733, cycle: "every30days", effectiveFrom: "2026-01-01" },
    history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }],
  },
  {
    id: "e2", label: "Groceries", category: "Needs", newJobSeasonStatus: "active",
    billingMeta: { amount: 60, cycle: "weekly", effectiveFrom: "2026-01-01" },
    history: [{ effectiveFrom: "2026-01-01", weekly: [60, 60, 60, 60] }],
    monthlyOverrides: { "2026-03": { perPaycheck: 90, amount: 90, cycle: "weekly" } },
  },
  {
    id: "e3", label: "Car Loan", type: "loan", category: "Loan", newJobSeasonStatus: "active",
    loanMeta: { totalAmount: 9360, paymentAmount: 260, paymentFrequency: "monthly", firstPaymentDate: "2026-01-15" },
    history: [{ effectiveFrom: "2026-01-01", weekly: [60, 60, 60, 60] }],
  },
];

/**
 * The tool-ready sibling of buildTestAccountArgs(). Returns a bag accepted by
 * BOTH buildCoachContext() and executeCoachTool()'s data argument.
 *
 * Every derived figure resolves through the real engine function its UI twin
 * uses — buildYear for the weeks, computeNet for income, computeRemainingSpend
 * for spend, calcEventImpact for log totals — so this fixture cannot describe
 * an account the app itself could never produce.
 */
export function buildToolTestAccount({
  config: configOverrides = {}, goalTargets = [2000, 5000], today = "2026-03-09", currentWeekIdx = 10,
} = {}) {
  const config = { ...TOOL_ACCOUNT_CONFIG, ...configOverrides };
  const allWeeks = buildYear(config);
  const currentWeek = allWeeks.find((w) => w.idx === currentWeekIdx) ?? allWeeks[0];

  const netOf = (w) => computeNet(w, config, 0, false);
  // A full-fiscal-year average across the real grid length, not "this week's
  // check" — the same shape App.jsx's weeklyIncome has.
  const weeklyIncome = allWeeks.reduce((s, w) => s + netOf(w), 0) / allWeeks.length;

  const futureWeeks = allWeeks.filter((w) => w.idx >= currentWeekIdx);
  const timelineWeekNets = futureWeeks.map(netOf);
  const prevWeekNet = currentWeekIdx > 0 ? netOf(allWeeks[currentWeekIdx - 1]) : null;

  const expenses = TOOL_ACCOUNT_EXPENSES;
  const { avgWeeklySpend } = computeRemainingSpend(expenses, futureWeeks);

  const goals = goalTargets.map((target, i) => ({
    id: `g${i + 1}`,
    // Real labels are present so the tools' privacy rule is actually TESTABLE
    // here — get_goal_detail must never leak one (drift-app-warden §21 F114).
    // A label-free fixture would let a regression pass unnoticed.
    label: ["Emergency Fund", "Trip to Portugal", "New Laptop"][i] ?? `Goal ${i + 1}`,
    target,
    completed: false,
  }));

  // All three sit in past weeks relative to currentWeekIdx, so none of them
  // belong in futureEventDeductions (which targets current/future weeks only).
  const logs = [
    { id: "l1", type: "pto", weekIdx: 6, weekEnd: toLocalIso(allWeeks[6].weekEnd), ptoHours: 8, note: "Dentist" },
    { id: "l2", type: "bonus", weekIdx: 8, weekEnd: toLocalIso(allWeeks[8].weekEnd), amount: 500, note: "Q1 spot bonus" },
    { id: "l3", type: "missed_unpaid", weekIdx: 9, weekEnd: toLocalIso(allWeeks[9].weekEnd), shiftsLost: 1 },
  ];
  const logTotals = logs.reduce((acc, e) => {
    const impact = calcEventImpact(e, config, allWeeks.find((w) => w.idx === e.weekIdx) ?? null);
    return { netLost: acc.netLost + impact.netLost, netGained: acc.netGained + impact.netGained };
  }, { netLost: 0, netGained: 0 });

  return {
    config,
    weeklyIncome,
    avgWeeklySpend,
    goals,
    expenses,
    fundedGoalSpend: 0,
    currentWeek,
    today,
    runwayDays: null,
    logs,
    futureWeeks,
    timelineWeekNets,
    futureWeekNets: timelineWeekNets,
    logNetLost: logTotals.netLost,
    logNetGained: logTotals.netGained,
    futureEventDeductions: {},
    prevWeekNet,
    allWeeks,
  };
}

export function buildToolTestContext(opts = {}) {
  return buildCoachContext(buildToolTestAccount(opts));
}
