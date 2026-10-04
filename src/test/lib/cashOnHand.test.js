import { describe, it, expect } from "vitest";
import { computeCashOnHand, computeNeedsSetAsidePerCheck, resolvePayPeriodWeeks, resolvePaycheckCreditIso } from "../../lib/cashOnHand.js";
import { getExactEffectiveAmountForMonth, getPhaseIndex } from "../../lib/finance.js";

// Weeks run Mon–Sun; pay period ends Sunday → credit lands Monday.
const mk = (idx, startIso, { isPayWeek = true, active = true } = {}) => {
  const weekStart = new Date(startIso + "T00:00:00");
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  return { idx, weekStart, weekEnd, payPeriodEndDate: new Date(weekEnd), isPayWeek, active };
};
// Sep 7, 14, 21, 28 2026 are Mondays.
const WEEKS = [mk(10, "2026-09-07"), mk(11, "2026-09-14"), mk(12, "2026-09-21"), mk(13, "2026-09-28")];
const NETS = { 10: { adjustedNet: 900 }, 11: { adjustedNet: 1000 }, 12: { adjustedNet: 1100 }, 13: { adjustedNet: 1200 } };

const bill = ({ id, amount, cycle = "every30days", category = "Needs", anchor, zeroFrom }) => {
  const perMonth = { weekly: 4, biweekly: 2, every30days: 1 }[cycle];
  const w = Math.round((amount * perMonth / 4) * 4) / 4;
  const history = [{ effectiveFrom: "2026-01-05", weekly: [w, w, w, w] }];
  if (zeroFrom) history.push({ effectiveFrom: zeroFrom, weekly: [0, 0, 0, 0] });
  return { id, label: id, category, history, billingMeta: { amount, cycle, effectiveFrom: "2026-01-05" }, dueDateAnchor: anchor };
};

const base = (cfg = {}, extra = {}) => ({
  config: { userPaySchedule: "weekly", freedomAllowanceEnabled: true, freedomAllowance: 50, cashOnHandAnchor: 1000, cashOnHandAnchorAsOf: "2026-09-15", ...cfg },
  expenses: [], allWeeks: WEEKS, weekNetLookup: NETS, weekConfirmations: {}, effectiveToday: "2026-10-01", ...extra,
});

describe("computeCashOnHand (TODO §22)", () => {
  it("returns null until a starting balance is set, and in New Job Season mode", () => {
    expect(computeCashOnHand(base({ cashOnHandAnchor: null }))).toBeNull();
    expect(computeCashOnHand(base({ newJobSeasonMode: true }))).toBeNull();
  });

  it("credits each paycheck after the anchor date through today (credit = day after the pay period ends)", () => {
    const r = computeCashOnHand(base());
    // week 10 credits 9/14 (≤ anchor 9/15 → already in balance); 11 → 9/21; 12 → 9/28; 13 → 10/5 (future)
    expect(r.credits.map(c => c.dateIso)).toEqual(["2026-09-28", "2026-09-21"]);
    expect(r.creditsTotal).toBe(2100);
    expect(r.cashOnHand).toBe(3100);
    expect(r.freedomAllowanceIncluded).toBe(100); // counted, reported separately
  });

  it("a credit is pending until that pay period's check-in exists; a correction replaces the estimate", () => {
    const r = computeCashOnHand(base({ cashOnHandCreditCorrections: { 12: 1050 } }, { weekConfirmations: { 11: { confirmedAt: "x" } } }));
    const byIdx = Object.fromEntries(r.credits.map(c => [c.weekIdx, c]));
    expect(byIdx[11].status).toBe("confirmed");
    expect(byIdx[12].status).toBe("pending");
    expect(byIdx[12]).toMatchObject({ amount: 1050, estimate: 1100, corrected: true });
    expect(r.pendingCount).toBe(1);
    expect(r.pendingTotal).toBe(1050);
    expect(r.cashOnHand).toBe(1000 + 1000 + 1050);
  });

  it("debits live Needs bills due since the anchor; Lifestyle and deleted bills never decay cash", () => {
    const expenses = [
      bill({ id: "rent", amount: 800, anchor: "2026-09-20" }),
      bill({ id: "fun", amount: 300, category: "Lifestyle", anchor: "2026-09-20" }),
      bill({ id: "gone", amount: 400, anchor: "2026-09-20", zeroFrom: "2026-06-01" }),
    ];
    const r = computeCashOnHand(base({}, { expenses }));
    expect(r.billsDueSince).toBe(800);
    expect(r.cashOnHand).toBe(3100 - 800);
  });

  it("traffic light: green when covered, orange within max($200, 20%) short, red beyond", () => {
    const expenses = [bill({ id: "rent", amount: 2000, cycle: "weekly", anchor: "2026-12-01" })]; // $2000/wk set-aside, nothing due before payday
    const at = (anchor) => computeCashOnHand(base({ cashOnHandAnchor: anchor, cashOnHandAnchorAsOf: "2026-10-01" }, { expenses }));
    expect(at(2000).status).toBe("green");
    expect(at(1600).status).toBe("orange"); // 20% of 2000 = 400 > 200
    expect(at(1599).status).toBe("red");
    expect(at(2000).ifStoppedWeeks).toBe(1);
    const small = [bill({ id: "rent", amount: 500, cycle: "weekly", anchor: "2026-12-01" })]; // 20% = 100 → $200 floor wins
    const s = (anchor) => computeCashOnHand(base({ cashOnHandAnchor: anchor, cashOnHandAnchorAsOf: "2026-10-01" }, { expenses: small })).status;
    expect(s(300)).toBe("orange");
    expect(s(299)).toBe("red");
  });

  it("red names the Needs bill due before the next payday that cash can't cover (rule b)", () => {
    // today 10/1, next payday 10/5 (week 13). Phone due 10/2, Rent due 10/3.
    const expenses = [bill({ id: "phone", amount: 100, anchor: "2026-10-02" }), bill({ id: "rent", amount: 900, anchor: "2026-10-03" })];
    const r = computeCashOnHand(base({ cashOnHandAnchor: 1500, cashOnHandAnchorAsOf: "2026-10-01" }, { expenses }));
    expect(r.nextPaydayIso).toBe("2026-10-05");
    expect(r.nextPaycheckEstimate).toBe(1200); // week 13's adjustedNet — same estimate a credit would carry
    expect(r.dueBeforePayday).toBe(1000);
    expect(r.atRiskBill).toBeNull();
    const short = computeCashOnHand(base({ cashOnHandAnchor: 600, cashOnHandAnchorAsOf: "2026-10-01" }, { expenses }));
    expect(short.status).toBe("red");
    expect(short.atRiskBill).toMatchObject({ id: "rent", dueIso: "2026-10-03", amount: 900 });
  });
});

describe("nextPaycheckEstimate (TODO §22.F)", () => {
  it("sums the next payday's whole pay period, the same way a credit's estimate does", () => {
    const r = computeCashOnHand(base({ userPaySchedule: "biweekly" }, { effectiveToday: "2026-09-29" }));
    // next payday is week 13's (10/5); biweekly → weeks 12 + 13
    expect(r.nextPaydayIso).toBe("2026-10-05");
    expect(r.nextPaycheckEstimate).toBe(1100 + 1200);
  });
  it("is null when no payday is left on the grid", () => {
    expect(computeCashOnHand(base({}, { effectiveToday: "2026-10-10" })).nextPaycheckEstimate).toBeNull();
  });
});

describe("pay periods and set-aside", () => {
  it("biweekly checks cover the prior week too; monthly covers the month's active weeks", () => {
    expect(resolvePayPeriodWeeks(WEEKS[2], WEEKS, "biweekly").map(w => w.idx)).toEqual([11, 12]);
    expect(resolvePayPeriodWeeks(WEEKS[2], WEEKS, "monthly").map(w => w.idx)).toEqual([10, 11, 12]);
    expect(resolvePayPeriodWeeks(WEEKS[3], WEEKS, "monthly").map(w => w.idx)).toEqual([13]); // ends Oct 4
    expect(resolvePaycheckCreditIso(WEEKS[0])).toBe("2026-09-14");
  });

  it("Needs set-aside matches the Upkeep Needs total (regular Needs + loans) × perCheckFactor", () => {
    const expenses = [bill({ id: "rent", amount: 400, cycle: "weekly" }), bill({ id: "fun", amount: 90, cycle: "weekly", category: "Lifestyle" })];
    const today = "2026-10-01";
    const upkeepNeeds = expenses.filter(e => e.category === "Needs")
      .reduce((s, e) => s + getExactEffectiveAmountForMonth(e, today.slice(0, 7), getPhaseIndex(new Date(today + "T12:00:00"))), 0);
    expect(computeNeedsSetAsidePerCheck(expenses, today, "weekly").perCheck).toBe(upkeepNeeds);
    expect(computeNeedsSetAsidePerCheck(expenses, today, "biweekly").perCheck).toBe(upkeepNeeds * 2);
  });

  it("weeklyLifestyle matches the Upkeep Lifestyle total and never enters the set-aside (TODO §22.F)", () => {
    const expenses = [bill({ id: "rent", amount: 400, cycle: "weekly" }), bill({ id: "fun", amount: 90, cycle: "weekly", category: "Lifestyle" })];
    const today = "2026-10-01";
    const upkeepLifestyle = expenses.filter(e => e.category === "Lifestyle")
      .reduce((s, e) => s + getExactEffectiveAmountForMonth(e, today.slice(0, 7), getPhaseIndex(new Date(today + "T12:00:00"))), 0);
    const r = computeNeedsSetAsidePerCheck(expenses, today, "weekly");
    expect(upkeepLifestyle).toBeGreaterThan(0);
    expect(r.weeklyLifestyle).toBe(upkeepLifestyle);
    expect(r.perCheck).toBe(r.weeklyNeeds); // weekly pay: set-aside is Needs alone
  });
});
