import { describe, it, expect } from "vitest";
import { buildCoachContext } from "../../lib/aiContext.js";

describe("buildCoachContext", () => {
  it("produces a fixed-shape block from a baseline snapshot", () => {
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
    });

    expect(block).toContain("Weekly net income: $1,000");
    expect(block).toContain("Weekly spend: $400");
    expect(block).toContain("Weekly surplus: $600");
    expect(block).toContain("Net worth trend (Home tile — projected annual savings): $30,700");
    expect(block).toContain("Budget Health (Home tile): 40% spend ratio (well-managed)");
    expect(block).toContain("Goals: 2 goals set (1 completed), $500 funded so far");
    expect(block).toContain("Expenses: 1 active line, $400/week");
    expect(block).toContain("Expense breakdown: Food (Needs): ~$400/wk");
    expect(block).toContain("Fiscal week: 28 of 52 (24 left)");
    expect(block).toContain("Today: 2026-07-07");
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
    expect(block).toContain("Log entries: 2 logged, most recent: Missed Shift (Unpaid/Approved) (week ending 2026-06-01)");
  });

  it("falls back to the raw type string for an unrecognized log type", () => {
    const block = buildCoachContext({
      weeklyIncome: 800,
      avgWeeklySpend: 300,
      logs: [{ type: "mystery_event", weekEnd: "2026-01-01" }],
    });
    expect(block).toContain("most recent: mystery_event (week ending 2026-01-01)");
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
