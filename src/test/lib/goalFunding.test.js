import { describe, expect, it } from "vitest";
import { getFundedGoalSpend } from "../../lib/goalFunding.js";

describe("getFundedGoalSpend", () => {
  it("sums completed goal targets as absorbed spend", () => {
    const goals = [
      { id: "g1", target: 1000, completed: true, completedAt: "2026-03-15T12:00:00.000Z" },
      { id: "g2", target: 2500, completed: false },
      { id: "g3", target: 600, completed: true, completedAt: "2026-03-20T12:00:00.000Z" },
    ];
    expect(getFundedGoalSpend(goals, "2026-04-03")).toBe(1600);
  });

  it("excludes future-dated completions from re-entering surplus early", () => {
    const goals = [
      { id: "g1", target: 1200, completed: true, completedAt: "2026-04-10T12:00:00.000Z" },
      { id: "g2", target: 800, completed: true, completedAt: "2026-04-02T12:00:00.000Z" },
    ];
    expect(getFundedGoalSpend(goals, "2026-04-03")).toBe(800);
  });

  it("counts legacy completed goals that are missing completedAt", () => {
    const goals = [
      { id: "legacy", target: 900, completed: true },
      { id: "open", target: 400, completed: false },
    ];
    expect(getFundedGoalSpend(goals, "2026-04-03")).toBe(900);
  });
});
