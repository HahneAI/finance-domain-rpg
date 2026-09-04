import { describe, it, expect } from "vitest";
import { buildCoachContext, buildJobHuntContext } from "../../lib/aiContext.js";
import { fmtFullDate } from "../../lib/finance.js";

// Builds a synthetic full fiscal year of week objects shaped the way
// getPayPeriodBounds()/computeGoalTimeline() expect (idx, weekStart, weekEnd,
// isPayWeek, payPeriodEndDate) — enough to exercise the real date-resolution
// path rather than the `allWeeks`-not-provided fallback. `isPayWeek` defaults
// to true for every week (weekly schedule: every week is its own period);
// pass a predicate for biweekly/monthly fixtures.
function buildAllWeeks(n, { startDate = new Date(2026, 0, 5), isPayWeek = () => true } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const weekStart = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    return { idx: i, active: true, weekStart, weekEnd, isPayWeek: isPayWeek(i), payPeriodEndDate: weekEnd };
  });
}

describe("buildCoachContext", () => {
  it("produces a fixed-shape block from a baseline snapshot", () => {
    const allWeeks = buildAllWeeks(52);
    const block = buildCoachContext({
      weeklyIncome: 1000,
      avgWeeklySpend: 400,
      goals: [{ completed: true, target: 500 }, { completed: false, target: 1000 }],
      expenses: [
        { label: "Food", category: "Needs", history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }], newJobSeasonStatus: "active" },
        { label: "Old Gym", category: "Lifestyle", history: [{ effectiveFrom: "2026-01-01", weekly: [40, 40, 40, 40] }], newJobSeasonStatus: "paused" },
      ],
      fundedGoalSpend: 500,
      currentWeek: { idx: 27 },
      today: "2026-07-07",
      allWeeks,
    });

    expect(block).toContain("Weekly net income: $1,000");
    expect(block).toContain("Weekly spend: $400");
    expect(block).toContain("Weekly surplus: $600");
    expect(block).toContain("Next week takehome (Home tile): $1,000 (projected average — no confirmed weeks yet)");
    expect(block).toContain("Left this week (Home tile): $600");
    expect(block).toContain("Net worth trend (Home tile — projected annual savings): $31,300");
    expect(block).toContain("Runway Health (Home tile): 40% spend ratio (well-managed)");
    expect(block).toContain("Goals: 2 goals set (1 completed), $500 funded so far, $1,500 total target");
    expect(block).toContain("Active goals total (Home tile — unfunded target sum): $1,000");
    expect(block).toContain("Expenses: 1 active line, $400/week");
    expect(block).toContain("Expense breakdown: Food (Needs): ~$400/wk");
    // Regression: a live test asked Coach for a fiscal week number and got a
    // vague, seemingly-guessed "mid-November" — the raw ISO date and bare
    // week number weren't enough for Coach to state a real, non-abbreviated
    // calendar date. Current period now pairs the two, resolved via the same
    // getPayPeriodBounds() HomePanel/IncomePanel use.
    expect(block).toContain(`Current period: the week of ${fmtFullDate(allWeeks[27].weekStart)} (week 28), 25 weeks left in the fiscal year`);
    expect(block).toContain(`Today: ${fmtFullDate("2026-07-07")}`);
  });

  // Regression (TODO §1, 2026-07-19): buildCoachContext used to scale
  // annualSavings/netWorthHealth by a hardcoded 52 regardless of config —
  // drifting from HomePanel.jsx's own activeWeeksThisYear-scaled figure any
  // time firstActiveIdx wasn't 0 (e.g. a mid-year signup or Back to Work
  // account). It now derives the same activeWeeksThisYear from config, so
  // the Coach can't state a "Home tile" number the Home tile doesn't show.
  it("scales annual savings/net worth by activeWeeksThisYear from config.firstActiveIdx, not a flat 52", () => {
    const block = buildCoachContext({
      config: { firstActiveIdx: 28 }, // TOTAL_FISCAL_WEEKS(53) - 28 = 25 weeks left in the fiscal year
      weeklyIncome: 700,
      avgWeeklySpend: 200,
      fundedGoalSpend: 0,
    });
    // 25 * (700 - 200) = 12,500 — NOT 52 * 500 = 26,000, the old drifted figure.
    expect(block).toContain("Net worth trend (Home tile — projected annual savings): $12,500");
    expect(block).not.toContain("$26,000");
  });

  // Regression: a live test asked "What's my Next Week Takehome?" and Coach
  // had to hedge with "isn't showing in the data" — buildCoachContext never
  // carried futureWeekNets (distinct from timelineWeekNets, which only feeds
  // computeGoalTimeline). These match HomePanel.jsx's exact fallback chain,
  // status thresholds, and perCheckFactor scaling for the same tile.
  it("cites the real Next Week Takehome figure and status when futureWeekNets has a real entry", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, futureWeekNets: [900] });
    expect(block).toContain("Next week takehome (Home tile): $900 (slightly below average), -$100 vs your average");
  });

  it("flags Next Week Takehome as below average and adds the vs-average delta past the 3% flat band", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, futureWeekNets: [700] });
    expect(block).toContain("Next week takehome (Home tile): $700 (below average — check Log), -$300 vs your average");
  });

  it("reads Next Week Takehome as on track and omits the delta within the 3% flat band", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, futureWeekNets: [1010] });
    expect(block).toContain("Next week takehome (Home tile): $1,010 (on track)");
    expect(block).not.toContain("vs your average");
  });

  it("falls back to the last confirmed week for Next Week Takehome when no scheduled week exists yet", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, prevWeekNet: 900 });
    expect(block).toContain("Next week takehome (Home tile): $900 (projected from your last confirmed pay)");
  });

  it("uses prevWeekNet for Left This Week when a confirmed week exists, not just weeklyIncome", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, prevWeekNet: 850 });
    expect(block).toContain("Left this week (Home tile): $450");
  });

  // Regression: a live test showed Coach unable to speak to the goal-focused
  // tile row (Active Goals Total, Weeks to Complete All, per-goal projected
  // rate/finish week) at all — none of it was in context. Goal LABELS are
  // deliberately withheld for privacy; only funding-priority rank is given.
  it("gives a real per-goal projected rate and finish date from computeGoalTimeline, never the goal's label", () => {
    const allWeeks = buildAllWeeks(10);
    const timelineWeekNets = Array(10).fill(700);
    const block = buildCoachContext({
      weeklyIncome: 700,
      avgWeeklySpend: 0,
      currentWeek: { idx: 0 },
      goals: [{ id: "g1", label: "Car", target: 2800, completed: false }],
      futureWeeks: allWeeks,
      timelineWeekNets,
      allWeeks,
    });
    expect(block).toContain("Active goals total (Home tile — unfunded target sum): $2,800");
    expect(block).toContain("Weeks to complete all active goals (Home tile): ~4 weeks");
    // eW resolves to 4 → currentWeekIdx(0) + ceil(4) = week idx 4 = allWeeks[4]
    expect(block).toContain(`Goal breakdown (ranked by funding priority — goal names withheld for privacy): Goal 1 of 1: $2,800 target, ~$700/wk projected, ~4.0 wks to fund, on track for the week of ${fmtFullDate(allWeeks[4].weekStart)} (week 5)`);
    expect(block).not.toContain("Car");
  });

  it("switches to check-based terminology and a wider date range for a biweekly pay schedule", () => {
    const isPayWeek = (i) => i % 2 === 1;
    const allWeeks = buildAllWeeks(20, { isPayWeek });
    const timelineWeekNets = Array(20).fill(700);
    const block = buildCoachContext({
      config: { userPaySchedule: "biweekly" },
      weeklyIncome: 700,
      avgWeeklySpend: 0,
      currentWeek: { idx: 0 },
      goals: [{ id: "g1", target: 2800, completed: false }],
      futureWeeks: allWeeks,
      timelineWeekNets,
      allWeeks,
    });
    // Current period spans the whole 2-week pay period, not a single week,
    // and is labeled "paycheck," never "week," for a biweekly account.
    expect(block).toContain(`Current period: ${fmtFullDate(allWeeks[0].weekStart)}–${fmtFullDate(allWeeks[1].weekEnd)} (paycheck 1), 26 paychecks left in the fiscal year`);
    expect(block).not.toMatch(/Current period: the week of/);
    // Weeks-to-complete-all converts to paychecks (4 weeks ≈ 2 paychecks), and
    // the per-goal rate/duration unit follows the same schedule, not "wk"/"wks".
    expect(block).toContain("Weeks to complete all active goals (Home tile): ~2 paychecks");
    expect(block).toMatch(/Goal 1 of 1: \$2,800 target, ~\$1,400\/chk projected, ~2\.0 chks to fund/);
  });

  it("falls back to a plain period label with no date when allWeeks isn't provided", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, currentWeek: { idx: 27 } });
    expect(block).toContain("Current period: week 28, 25 weeks left in the fiscal year");
  });

  it("reports a goal as not on track rather than a bogus finish week when it can't fund within the fiscal year", () => {
    const futureWeeks = Array.from({ length: 2 }, (_, i) => ({ idx: i, weekEnd: new Date(2026, 0, (i + 1) * 7) }));
    const timelineWeekNets = Array(2).fill(10);
    const block = buildCoachContext({
      weeklyIncome: 10,
      avgWeeklySpend: 0,
      currentWeek: { idx: 0 },
      goals: [{ id: "g1", label: "Dream Vacation", target: 10000, completed: false }],
      futureWeeks,
      timelineWeekNets,
    });
    expect(block).toContain("Goal 1 of 1: $10,000 target, not on track to finish within this fiscal year at the current pace");
    expect(block).not.toContain("Dream Vacation");
  });

  it("omits the active-goals/weeks-to-complete/goal-breakdown lines entirely when every goal is completed", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      goals: [{ id: "g1", target: 500, completed: true }],
    });
    expect(block).not.toContain("Active goals total");
    expect(block).not.toContain("Weeks to complete all active goals");
    expect(block).not.toContain("Goal breakdown");
  });

  // Regression: a live test showed Coach flatly denying it had any "budget
  // health score" data, even though it's a real, prominent Home tile — the
  // context block simply never carried it. These three cases match
  // HomePanel.jsx's exact spendRatio thresholds/labels so the two can never
  // disagree.
  it.each([
    [0.3, "30% spend ratio (well-managed)"],
    [0.6, "60% spend ratio (healthy range)"],
    [0.9, "90% spend ratio (watch spend)"],
  ])("labels Runway Health at spend ratio %s as %s", (ratio, expected) => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 1000 * ratio });
    expect(block).toContain(`Runway Health (Home tile): ${expected}`);
  });

  it("disambiguates the goals line so 0 completed never reads as 0 goals set", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      goals: [{ completed: false, target: 1000 }],
      fundedGoalSpend: 0,
    });
    expect(block).toContain("Goals: 1 goal set (0 completed), $0 funded so far");
  });

  it("names each active expense by label, category, and its real history-resolved weekly cost", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      today: "2026-07-07",
      expenses: [
        { label: "Rent", category: "Needs", history: [{ effectiveFrom: "2026-01-01", weekly: [280, 280, 280, 280] }], newJobSeasonStatus: "active" },
        { label: "Netflix", category: "Lifestyle", history: [{ effectiveFrom: "2026-01-01", weekly: [4, 4, 4, 4] }], newJobSeasonStatus: "active" },
        { label: "Old Gym", category: "Lifestyle", history: [{ effectiveFrom: "2026-01-01", weekly: [40, 40, 40, 40] }], newJobSeasonStatus: "paused" },
      ],
    });
    expect(block).toContain("Expense breakdown: Rent (Needs): ~$280/wk; Netflix (Lifestyle): ~$4/wk");
    expect(block).not.toContain("Old Gym");
  });

  // Regression: a live test showed Coach citing $93/wk for an expense the app
  // itself displays (and uses in all its real math) as $100/wk. The bug was
  // computing the per-item figure from billingMeta.amount/cycle — the value
  // entered on the add-expense form — instead of the phase-indexed
  // history[].weekly entry that computeRemainingSpend() actually uses for
  // the real "Weekly spend" aggregate.
  it("uses the real history-resolved amount, not billingMeta, when the two disagree", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 100,
      today: "2026-07-07",
      expenses: [{
        label: "Food",
        category: "Needs",
        billingMeta: { amount: 400, cycle: "every30days" }, // naive amount/days*7 ≈ $93 — wrong
        history: [{ effectiveFrom: "2026-01-01", weekly: [100, 100, 100, 100] }], // real, authoritative
        newJobSeasonStatus: "active",
      }],
    });
    expect(block).toContain("Food (Needs): ~$100/wk");
    expect(block).not.toContain("$93");
  });

  it("prefers a monthlyOverrides entry over history for the current month, matching getEffectiveAmountForMonth", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 150,
      today: "2026-07-07",
      expenses: [{
        label: "Utilities",
        category: "Needs",
        history: [{ effectiveFrom: "2026-01-01", weekly: [100, 100, 100, 100] }],
        monthlyOverrides: { "2026-07": { perPaycheck: 150 } },
        newJobSeasonStatus: "active",
      }],
    });
    expect(block).toContain("Utilities (Needs): ~$150/wk");
  });

  it("falls back to a rough billingMeta estimate only when there's no `today` to resolve history against", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      expenses: [{ label: "Netflix", category: "Lifestyle", billingMeta: { amount: 15, cycle: "every30days" }, newJobSeasonStatus: "active" }],
    });
    expect(block).toContain("Netflix (Lifestyle): ~$4/wk");
  });

  it("falls back to a Loan category for loan-type expenses missing a category", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      today: "2026-07-07",
      expenses: [{ label: "Car Loan", type: "loan", history: [{ effectiveFrom: "2026-01-01", weekly: [300, 300, 300, 300] }], newJobSeasonStatus: "active" }],
    });
    expect(block).toContain("Car Loan (Loan): ~$300/wk");
  });

  it("omits the expense breakdown line entirely when there are no active expenses", () => {
    const block = buildCoachContext({ weeklyIncome: 800, avgWeeklySpend: 0, expenses: [] });
    expect(block).not.toContain("Expense breakdown");
  });

  it("reports zero log entries plainly rather than omitting the line", () => {
    const block = buildCoachContext({ weeklyIncome: 800, avgWeeklySpend: 300 });
    expect(block).toContain("Log entries: 0 logged");
    expect(block).not.toContain("most recent");
  });

  it("names the most recent log entry by weekEnd, not insertion order", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      logs: [
        { type: "bonus", weekEnd: "2026-03-01" },
        { type: "missed_unpaid", weekEnd: "2026-06-01" },
      ],
    });
    // These rows carry no weekIdx, so this covers the fallback phrasing.
    expect(block).toContain(`Log entries: 2 logged, most recent: Missed Shift (Unpaid/Approved) (week ending ${fmtFullDate("2026-06-01")})`);
  });

  it("states the most recent log entry's week in the same convention as Current period", () => {
    // Regression (live-tested 2026-09-02): a fiscal week ENDS on the same
    // calendar day the next one BEGINS, so labelling a log entry by its end
    // date while labelling the current period by its start date put two
    // different weeks behind one identical date string, two lines apart.
    // Coach conflated them and attributed a week-10 event to week 11.
    const allWeeks = buildAllWeeks(52);
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      logs: [{ type: "missed_unpaid", weekIdx: 9, weekEnd: "2026-03-09" }],
      currentWeek: { idx: 10 },
      allWeeks,
    });
    const logLine = block.split("\n").find((l) => l.startsWith("Log entries:"));
    const periodLine = block.split("\n").find((l) => l.startsWith("Current period:"));
    // The log's own week, stated as a start date plus its own period number...
    expect(logLine).toContain(`Missed Shift (Unpaid/Approved), the week of ${fmtFullDate(allWeeks[9].weekStart)} (week 10)`);
    // formatPeriodWithDate brings its own parens; don't nest another pair.
    expect(logLine).not.toContain("((");
    expect(logLine).not.toContain("(the week of");
    // ...and distinct from the period Coach is currently in.
    expect(periodLine).toContain("(week 11)");
    expect(logLine).not.toContain("week 11");
    expect(logLine).not.toContain("week ending");
  });

  it("falls back to the raw type string for an unrecognized log type", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      logs: [{ type: "mystery_event", weekEnd: "2026-01-01" }],
    });
    expect(block).toContain(`most recent: mystery_event (week ending ${fmtFullDate("2026-01-01")})`);
  });

  it("omits the job-loss line when newJobSeasonMode is off", () => {
    const block = buildCoachContext({ weeklyIncome: 800, avgWeeklySpend: 300 });
    expect(block).not.toContain("New Job Season");
  });

  it("appends a job-loss line with runway only when newJobSeasonMode is on", () => {
    const block = buildCoachContext({
      config: { newJobSeasonMode: true },
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      runwayDays: 45,
    });
    expect(block).toContain("New Job Season: active, ~45 days of runway");
  });

  it("stays deterministic across repeated calls with identical inputs", () => {
    const input = {
      weeklyIncome: 900,
      avgWeeklySpend: 500,
      goals: [{ completed: false, target: 200 }],
      expenses: [],
      fundedGoalSpend: 0,
      currentWeek: { idx: 10 },
      today: "2026-01-01",
    };
    expect(buildCoachContext(input)).toBe(buildCoachContext({ ...input }));
  });

  it("handles missing/zeroed inputs without throwing", () => {
    expect(() => buildCoachContext()).not.toThrow();
    expect(buildCoachContext()).toContain("Weekly net income: $0");
  });
});

// §18.E — Job Hunt Assistant's dedicated context. Every figure must resolve
// through computeNewJobSeasonRunway/resolvePrimaryRunwayDays/sumJobHuntIncome —
// the same functions NewJobSeasonHomePanel/NewJobSeasonBudgetPanel read for their own
// tiles (drift-app-warden §21's grounding rule) — never a parallel estimate.
describe("buildCoachContext — detailAvailableViaTools", () => {
  const account = () => ({
    weeklyIncome: 1000, avgWeeklySpend: 400, fundedGoalSpend: 0,
    currentWeek: { idx: 10 }, today: "2026-03-09", allWeeks: buildAllWeeks(52),
    futureWeeks: buildAllWeeks(52).slice(10).map((w) => ({ ...w, weekEnd: new Date(w.weekEnd) })),
    timelineWeekNets: Array.from({ length: 42 }, () => 1000),
    goals: [{ id: "g1", label: "Emergency Fund", target: 2000, completed: false }],
    expenses: [
      { label: "Rent", category: "Needs", newJobSeasonStatus: "active", history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }] },
      { label: "Groceries", category: "Needs", newJobSeasonStatus: "active", history: [{ effectiveFrom: "2026-01-01", weekly: [60, 60, 60, 60] }] },
    ],
  });

  it("keeps the full per-item breakdowns by default", () => {
    // CoachNetWorthCard is a single-shot generator with no tools — it relies on
    // this, which is why the trim is opt-in rather than the default.
    const block = buildCoachContext(account());
    expect(block).toContain("Expense breakdown: Rent (Needs): ~$400/wk");
    expect(block).toMatch(/Goal breakdown .*Goal 1 of 1: \$2,000 target, ~\$\d+\/wk projected/);
  });

  it("replaces them with an index when tools can serve the detail", () => {
    const block = buildCoachContext({ ...account(), detailAvailableViaTools: true });
    expect(block).not.toContain("Expense breakdown:");
    expect(block).not.toContain("Goal breakdown");
    expect(block).toContain("Expense labels (cost, cycle, due date and month overrides via get_expense_detail): Rent, Groceries");
    expect(block).toContain("Goal 1: $2,000");
    // The derived detail is what moves to the tools — not the identity.
    // Scoped to the goal line: "projected" also appears in the Net Worth trend
    // line, which this trim deliberately leaves alone.
    const goalLine = block.split("\n").find((l) => l.startsWith("Active goals by funding"));
    expect(goalLine).not.toMatch(/projected/);
    expect(goalLine).not.toMatch(/to fund/);
    // The finish date STAYS — dropping it sent a broad question from 0 tool
    // calls to 3, because "when do my goals land" is what such an answer needs.
    expect(goalLine).toMatch(/on track for the week of/);
  });

  it("keeps expense names in the index so a nonexistent bill can still be refuted", () => {
    // Live regression: "what's going on with my Netflix bill?" was answered
    // correctly off this line. Dropping the names would force a wrong-label
    // tool call just to discover what exists.
    const block = buildCoachContext({ ...account(), detailAvailableViaTools: true });
    expect(block).toContain("Rent, Groceries");
  });

  it("still withholds goal names under the trim", () => {
    const block = buildCoachContext({ ...account(), detailAvailableViaTools: true });
    expect(block).not.toContain("Emergency Fund");
    expect(block).toContain("names withheld for privacy");
  });

  it("changes nothing outside the two breakdown lines", () => {
    const full = buildCoachContext(account()).split("\n");
    const trimmed = buildCoachContext({ ...account(), detailAvailableViaTools: true }).split("\n");
    const isBreakdown = (l) => /^(Expense breakdown|Goal breakdown|Expense labels|Active goals by funding)/.test(l);
    expect(trimmed.filter((l) => !isBreakdown(l))).toEqual(full.filter((l) => !isBreakdown(l)));
  });

  it("shrinks more as the account grows, because the pointer is fixed-size", () => {
    const big = {
      ...account(),
      expenses: Array.from({ length: 12 }, (_, i) => ({
        label: `Bill ${i}`, category: "Needs", newJobSeasonStatus: "active",
        history: [{ effectiveFrom: "2026-01-01", weekly: [20, 20, 20, 20] }],
      })),
      goals: Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, target: 1000 * (i + 1), completed: false })),
    };
    const smallSaving = buildCoachContext(account()).length
      - buildCoachContext({ ...account(), detailAvailableViaTools: true }).length;
    const bigSaving = buildCoachContext(big).length
      - buildCoachContext({ ...big, detailAvailableViaTools: true }).length;
    expect(bigSaving).toBeGreaterThan(smallSaving * 3);
  });
});


describe("buildJobHuntContext", () => {
  const baseConfig = { newJobSeasonMode: true, newJobSeasonDate: "2026-06-01" };
  const essentialExpense = {
    label: "Rent", category: "Needs", newJobSeasonStatus: "active",
    history: [{ effectiveFrom: "2026-01-01", weekly: [300, 300, 300, 300] }],
  };

  it("returns an empty string when not in New Job Season (no dash to ground on)", () => {
    const block = buildJobHuntContext({ config: { newJobSeasonMode: false }, effectiveToday: "2026-07-07" });
    expect(block).toBe("");
  });

  it("states runway, weekly essential burn, and essential expense count", () => {
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000 },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toMatch(/Cash Runway: ~\d+ days · weekly essential burn \$300 across 1 tracked expense/);
  });

  it("omits the lifestyle line when there's no active lifestyle spend", () => {
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000 },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).not.toContain("Lifestyle spend");
  });

  it("surfaces lifestyle spend separately when present, matching the runway calc's own split", () => {
    const lifestyleExpense = {
      label: "Streaming", category: "Lifestyle", newJobSeasonStatus: "active",
      history: [{ effectiveFrom: "2026-01-01", weekly: [20, 20, 20, 20] }],
    };
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000 },
      expenses: [essentialExpense, lifestyleExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toContain("Lifestyle spend still tracked (not counted in runway above): $20/wk");
  });

  it("folds logged job-hunt income into the runway itself, not just the display line", () => {
    // Regression: this used to pass `savings` to computeNewJobSeasonRunway(),
    // which only destructures `extraCash` — the whole figure was silently
    // dropped, so the runway number never moved no matter how much gig income
    // was logged, even while the line right next to it said otherwise.
    const days = (block) => Number(block.match(/Cash Runway: ~(\d+) days/)?.[1]);
    const withoutIncome = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 2000 },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    const withIncome = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 2000, jobHuntIncomeLog: [{ id: "1", amount: 1000, loggedAt: "2026-07-01T00:00:00Z" }] },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(days(withIncome)).toBeGreaterThan(days(withoutIncome));
  });

  it("includes job-hunt income only when the user has logged any", () => {
    const withoutIncome = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000 },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(withoutIncome).not.toContain("job-hunt income");

    const withIncome = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000, jobHuntIncomeLog: [{ id: "1", amount: 150, loggedAt: "2026-07-01T00:00:00Z" }] },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(withIncome).toContain("Extra job-hunt income logged so far: $150");
  });

  it("includes target income only when set", () => {
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000, targetIncomeAnnual: 58000 },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toContain("Target annual income: $58,000");
  });

  it("reports no applications logged plainly rather than omitting the line", () => {
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000 },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toContain("No applications logged yet.");
  });

  it("lists applications by real company/role name — not withheld the way goal names are", () => {
    const block = buildJobHuntContext({
      config: {
        ...baseConfig, newJobSeasonCashOnHand: 3000,
        jobApplications: [
          { id: "a1", company: "Acme Logistics", role: "Warehouse Lead", status: "interview", dateApplied: "2026-06-20" },
        ],
      },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toContain("Applications (1 total): Acme Logistics — Warehouse Lead (interview, applied 2026-06-20)");
  });

  it("shows only the 5 most recent applications and flags the total when there are more", () => {
    const apps = Array.from({ length: 7 }, (_, i) => ({
      id: `a${i}`, company: `Company ${i}`, role: "Associate", status: "applied",
      dateApplied: `2026-06-${String(10 + i).padStart(2, "0")}`,
    }));
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000, jobApplications: apps },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toContain("Applications (7 total, 5 most recent shown):");
    expect(block).toContain("Company 6"); // newest by dateApplied
    expect(block).not.toContain("Company 0"); // oldest, past the 5-most-recent cutoff
  });

  it("includes the return-to-work date only when already set", () => {
    const block = buildJobHuntContext({
      config: { ...baseConfig, newJobSeasonCashOnHand: 3000, returnToWorkDate: "2026-09-01" },
      expenses: [essentialExpense],
      effectiveToday: "2026-07-07",
    });
    expect(block).toContain("Expected return-to-work date already set: 2026-09-01");
  });

  it("matches resolvePrimaryRunwayDays' own includeBenefits selection, same as the on-screen tile", () => {
    const config = {
      ...baseConfig, newJobSeasonCashOnHand: 0,
      unemploymentEnabled: true, unemploymentWeekly: 400, unemploymentDurationWeeks: 20, unemploymentWaitingWeek: false,
    };
    const withBenefits = buildJobHuntContext({ config, expenses: [essentialExpense], effectiveToday: "2026-07-07", includeBenefits: true });
    const withoutBenefits = buildJobHuntContext({ config, expenses: [essentialExpense], effectiveToday: "2026-07-07", includeBenefits: false });
    expect(withBenefits).not.toBe(withoutBenefits);
  });

  it("handles missing/zeroed inputs without throwing", () => {
    expect(() => buildJobHuntContext()).not.toThrow();
    expect(buildJobHuntContext()).toBe("");
  });
});
