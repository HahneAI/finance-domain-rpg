import { describe, it, expect } from "vitest";
import { buildCoachContext } from "../../lib/aiContext.js";

describe("buildCoachContext", () => {
  it("produces a fixed-shape block from a baseline snapshot", () => {
    const block = buildCoachContext({
      weeklyIncome: 1000,
      avgWeeklySpend: 400,
      goals: [{ completed: true, target: 500 }, { completed: false, target: 1000 }],
      expenses: [{ jobLossStatus: "active" }, { jobLossStatus: "paused" }],
      fundedGoalSpend: 500,
      currentWeek: { idx: 27 },
      today: "2026-07-07",
    });

    expect(block).toContain("Weekly net income: $1,000");
    expect(block).toContain("Weekly spend: $400");
    expect(block).toContain("Weekly surplus: $600");
    expect(block).toContain("Goals: 1/2 completed, $500 funded");
    expect(block).toContain("Expenses: 1 active line, $400/week");
    expect(block).toContain("Fiscal week: 28 of 52 (24 left)");
    expect(block).toContain("Today: 2026-07-07");
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
