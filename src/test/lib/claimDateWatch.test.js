// TODO §32 C3 — Claim Date slip detection over resolveGoalFinishInfo's own dates.
import { describe, it, expect } from "vitest";
import { detectClaimDateSlips, formatClaimDay, slipLengthText } from "../../lib/claimDateWatch.js";

const d = (iso) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(y, m - 1, dd); };
const goals = [{ id: "g1", target: 2000 }, { id: "g2", target: 5000 }];
const resolver = (dates) => (g) => ({ finishDate: dates[g.id] ? d(dates[g.id]) : null });

describe("detectClaimDateSlips", () => {
  it("seeds a baseline for goals it hasn't seen, without alerting", () => {
    const r = detectClaimDateSlips({ goals, resolveGoalFinishInfo: resolver({ g1: "2026-04-27", g2: "2026-08-10" }), watch: {} });
    expect(r.slips).toEqual([]);
    expect(r.newBaselines).toEqual({ g1: { date: "2026-04-27", target: 2000, rank: 1 }, g2: { date: "2026-08-10", target: 5000, rank: 2 } });
  });

  it("alerts on a slip of 14+ days, by rank, with both dates", () => {
    const watch = { g1: { date: "2026-04-27", target: 2000, rank: 1 }, g2: { date: "2026-08-10", target: 5000, rank: 2 } };
    const r = detectClaimDateSlips({ goals, resolveGoalFinishInfo: resolver({ g1: "2026-05-18", g2: "2026-08-17" }), watch });
    expect(r.slips).toEqual([{ goalId: "g1", rank: 1, target: 2000, fromIso: "2026-04-27", toIso: "2026-05-18", daysLater: 21 }]);
    expect(r.newBaselines).toEqual({});
  });

  it("never alerts when a date moves earlier", () => {
    const watch = { g1: { date: "2026-04-27", target: 2000, rank: 1 } };
    const r = detectClaimDateSlips({ goals: [goals[0]], resolveGoalFinishInfo: resolver({ g1: "2026-04-06" }), watch });
    expect(r.slips).toEqual([]);
  });

  it("treats a changed target or rank as the user's own move — a new baseline, not a slip", () => {
    const watch = { g1: { date: "2026-04-27", target: 1500, rank: 1 }, g2: { date: "2026-08-10", target: 5000, rank: 1 } };
    const r = detectClaimDateSlips({ goals, resolveGoalFinishInfo: resolver({ g1: "2026-06-01", g2: "2026-10-01" }), watch });
    expect(r.slips).toEqual([]);
    expect(Object.keys(r.newBaselines).sort()).toEqual(["g1", "g2"]);
  });

  it("skips completed goals and goals with no date (stalemate)", () => {
    const r = detectClaimDateSlips({ goals: [{ id: "g1", target: 1, completed: true }, { id: "g3", target: 1 }], resolveGoalFinishInfo: resolver({}), watch: {} });
    expect(r).toEqual({ slips: [], newBaselines: {} });
  });

  it("formats the alert's dates and lengths", () => {
    expect(formatClaimDay("2026-05-18")).toBe("May 18");
    expect(slipLengthText(21)).toBe("about 3 weeks");
    expect(slipLengthText(15)).toBe("about 2 weeks");
    expect(slipLengthText(9)).toBe("about a week");
  });
});
