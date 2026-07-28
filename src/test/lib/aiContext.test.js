import { describe, it, expect } from "vitest";
import { buildCoachContext } from "../../lib/aiContext.js";
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
        { label: "Food", category: "Needs", history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }], jobLossStatus: "active" },
        { label: "Old Gym", category: "Lifestyle", history: [{ effectiveFrom: "2026-01-01", weekly: [40, 40, 40, 40] }], jobLossStatus: "paused" },
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
    expect(block).toContain("Net worth trend (Home tile — projected annual savings): $30,700");
    expect(block).toContain("Budget Health (Home tile): 40% spend ratio (well-managed)");
    expect(block).toContain("Goals: 2 goals set (1 completed), $500 funded so far, $1,500 total target");
    expect(block).toContain("Active goals total (Home tile — unfunded target sum): $1,000");
    expect(block).toContain("Expenses: 1 active line, $400/week");
    expect(block).toContain("Expense breakdown: Food (Needs): ~$400/wk");
    // Regression: a live test asked Coach for a fiscal week number and got a
    // vague, seemingly-guessed "mid-November" — the raw ISO date and bare
    // week number weren't enough for Coach to state a real, non-abbreviated
    // calendar date. Current period now pairs the two, resolved via the same
    // getPayPeriodBounds() HomePanel/IncomePanel use.
    expect(block).toContain(`Current period: the week of ${fmtFullDate(allWeeks[27].weekStart)} (week 28), 24 weeks left in the fiscal year`);
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
      config: { firstActiveIdx: 28 }, // 24 weeks left in the fiscal year
      weeklyIncome: 700,
      avgWeeklySpend: 200,
      fundedGoalSpend: 0,
    });
    // 24 * (700 - 200) = 12,000 — NOT 52 * 500 = 26,000, the old drifted figure.
    expect(block).toContain("Net worth trend (Home tile — projected annual savings): $12,000");
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
    expect(block).toContain(`Current period: ${fmtFullDate(allWeeks[0].weekStart)}–${fmtFullDate(allWeeks[1].weekEnd)} (paycheck 1), 25 paychecks left in the fiscal year`);
    expect(block).not.toMatch(/Current period: the week of/);
    // Weeks-to-complete-all converts to paychecks (4 weeks ≈ 2 paychecks), and
    // the per-goal rate/duration unit follows the same schedule, not "wk"/"wks".
    expect(block).toContain("Weeks to complete all active goals (Home tile): ~2 paychecks");
    expect(block).toMatch(/Goal 1 of 1: \$2,800 target, ~\$1,400\/chk projected, ~2\.0 chks to fund/);
  });

  it("falls back to a plain period label with no date when allWeeks isn't provided", () => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 400, currentWeek: { idx: 27 } });
    expect(block).toContain("Current period: week 28, 24 weeks left in the fiscal year");
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
  ])("labels Budget Health at spend ratio %s as %s", (ratio, expected) => {
    const block = buildCoachContext({ weeklyIncome: 1000, avgWeeklySpend: 1000 * ratio });
    expect(block).toContain(`Budget Health (Home tile): ${expected}`);
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
        { label: "Rent", category: "Needs", history: [{ effectiveFrom: "2026-01-01", weekly: [280, 280, 280, 280] }], jobLossStatus: "active" },
        { label: "Netflix", category: "Lifestyle", history: [{ effectiveFrom: "2026-01-01", weekly: [4, 4, 4, 4] }], jobLossStatus: "active" },
        { label: "Old Gym", category: "Lifestyle", history: [{ effectiveFrom: "2026-01-01", weekly: [40, 40, 40, 40] }], jobLossStatus: "paused" },
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
        jobLossStatus: "active",
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
        jobLossStatus: "active",
      }],
    });
    expect(block).toContain("Utilities (Needs): ~$150/wk");
  });

  it("falls back to a rough billingMeta estimate only when there's no `today` to resolve history against", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      expenses: [{ label: "Netflix", category: "Lifestyle", billingMeta: { amount: 15, cycle: "every30days" }, jobLossStatus: "active" }],
    });
    expect(block).toContain("Netflix (Lifestyle): ~$4/wk");
  });

  it("falls back to a Loan category for loan-type expenses missing a category", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      today: "2026-07-07",
      expenses: [{ label: "Car Loan", type: "loan", history: [{ effectiveFrom: "2026-01-01", weekly: [300, 300, 300, 300] }], jobLossStatus: "active" }],
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
    expect(block).toContain(`Log entries: 2 logged, most recent: Missed Shift (Unpaid/Approved) (week ending ${fmtFullDate("2026-06-01")})`);
  });

  it("falls back to the raw type string for an unrecognized log type", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      logs: [{ type: "mystery_event", weekEnd: "2026-01-01" }],
    });
    expect(block).toContain(`most recent: mystery_event (week ending ${fmtFullDate("2026-01-01")})`);
  });

  it("omits the job-loss line when jobLossMode is off", () => {
    const block = buildCoachContext({ weeklyIncome: 800, avgWeeklySpend: 300 });
    expect(block).not.toContain("Job Loss Mode");
  });

  it("appends a job-loss line with runway only when jobLossMode is on", () => {
    const block = buildCoachContext({
      config: { jobLossMode: true },
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      runwayDays: 45,
    });
    expect(block).toContain("Job Loss Mode: active, ~45 days of runway");
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
