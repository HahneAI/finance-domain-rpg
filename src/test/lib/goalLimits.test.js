import { describe, it, expect } from "vitest";
import { computeGoalAmountCap, checkGoalLimits, MAX_ACTIVE_GOALS, GOAL_COUNT_LIMIT_MESSAGE, GOAL_AMOUNT_LIMIT_MESSAGE } from "../../lib/goalLimits.js";

const WPM = 52 / 12; // weeks per month, same constant the lib uses
const weeklyBill = (id, category, monthly, extra = {}) => {
  const w = monthly / WPM;
  return { id, label: id, category, history: [{ effectiveFrom: "2026-01-01", weekly: [w, w, w, w] }], ...extra };
};
const TODAY = "2026-10-06";

describe("computeGoalAmountCap — five years of the Needs-only surplus", () => {
  it("Anthony's example: $5,000/mo take-home, $2,000/mo Needs → $3,000 × 60 = $180,000", () => {
    const cap = computeGoalAmountCap({ weeklyIncome: 5000 / WPM, expenses: [weeklyBill("rent", "Needs", 2000)], todayIso: TODAY, userPaySchedule: "weekly" });
    expect(cap).toBeCloseTo(180000, 0);
  });
  it("ignores Lifestyle spend entirely", () => {
    const cap = computeGoalAmountCap({ weeklyIncome: 5000 / WPM, expenses: [weeklyBill("rent", "Needs", 2000), weeklyBill("fun", "Lifestyle", 1500)], todayIso: TODAY });
    expect(cap).toBeCloseTo(180000, 0);
  });
  it("counts loans as Needs (same set Cash on Hand sets aside)", () => {
    const cap = computeGoalAmountCap({ weeklyIncome: 5000 / WPM, expenses: [weeklyBill("rent", "Needs", 2000), weeklyBill("car", "Loans", 500, { type: "loan" })], todayIso: TODAY });
    expect(cap).toBeCloseTo(150000, 0);
  });
  it("returns null (no amount cap) with no income or a surplus ≤ 0", () => {
    expect(computeGoalAmountCap({ weeklyIncome: 0, expenses: [], todayIso: TODAY })).toBeNull();
    expect(computeGoalAmountCap({ weeklyIncome: 1000 / WPM, expenses: [weeklyBill("rent", "Needs", 2000)], todayIso: TODAY })).toBeNull();
  });
});

describe("checkGoalLimits", () => {
  const g = (id, target, completed = false) => ({ id, label: id, target, completed });
  const six = Array.from({ length: 6 }, (_, i) => g(`g${i}`, 100));

  it(`blocks adding a ${MAX_ACTIVE_GOALS + 1}th active goal with the count message`, () => {
    const r = checkGoalLimits({ goals: six, adding: [50] });
    expect(r.reason).toBe("count");
    expect(r.message).toBe(GOAL_COUNT_LIMIT_MESSAGE);
  });
  it("claimed goals free up count room", () => {
    expect(checkGoalLimits({ goals: [...six.slice(0, 5), g("done", 100, true)], adding: [50] })).toBeNull();
  });
  it("blocks an add that pushes the active total past the cap, naming the limit", () => {
    const r = checkGoalLimits({ goals: [g("a", 900)], adding: [200], cap: 1000 });
    expect(r.reason).toBe("amount");
    expect(r.message).toContain(GOAL_AMOUNT_LIMIT_MESSAGE);
    expect(r.message).toContain("$1,000");
  });
  it("claimed goals free up dollar room", () => {
    expect(checkGoalLimits({ goals: [g("a", 900, true)], adding: [900], cap: 1000 })).toBeNull();
  });
  it("blocks an edit that raises the total past the cap; allows one that lowers it even while still over", () => {
    const goals = [g("a", 800), g("b", 600)]; // 1400 > cap 1000 (pre-existing)
    expect(checkGoalLimits({ goals, editing: { id: "a", target: 900 }, cap: 1000 }).reason).toBe("amount");
    expect(checkGoalLimits({ goals, editing: { id: "a", target: 500 }, cap: 1000 })).toBeNull();
  });
  it("no cap → only the count limit applies", () => {
    expect(checkGoalLimits({ goals: [g("a", 1e9)], adding: [1e9], cap: null })).toBeNull();
  });
  it("edits never trip the count limit", () => {
    expect(checkGoalLimits({ goals: [...six, g("x", 1)], editing: { id: "x", target: 2 } })).toBeNull();
  });
});
