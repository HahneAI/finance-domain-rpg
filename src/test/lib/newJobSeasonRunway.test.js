import { describe, it, expect } from "vitest";
import { resolvePrimaryRunwayDays, sumBillsDueSince, computeNewJobSeasonRunway, resolveNextWeekdayOnOrAfter } from "../../lib/newJobSeasonRunway.js";
import { toLocalIso } from "../../lib/finance.js";

// Food special case (TODO §1) — turns a "what day do you shop" pick into a
// concrete weekly dueDateAnchor for NewJobSeasonEntry's due-date step.
describe("resolveNextWeekdayOnOrAfter", () => {
  it("stays on referenceIso itself when it already matches dow", () => {
    // 2026-06-15 is a Monday (dow 1).
    expect(toLocalIso(resolveNextWeekdayOnOrAfter(1, "2026-06-15"))).toBe("2026-06-15");
  });

  it("advances to the next occurrence of dow within the same week", () => {
    // 2026-06-15 (Mon) -> next Wednesday (dow 3) is 2026-06-17.
    expect(toLocalIso(resolveNextWeekdayOnOrAfter(3, "2026-06-15"))).toBe("2026-06-17");
  });

  it("wraps into the following week when dow already passed this week", () => {
    // 2026-06-15 (Mon) -> next Sunday (dow 0) is 2026-06-21, not yesterday.
    expect(toLocalIso(resolveNextWeekdayOnOrAfter(0, "2026-06-15"))).toBe("2026-06-21");
  });

  it("returns null without a dow or referenceIso", () => {
    expect(resolveNextWeekdayOnOrAfter(null, "2026-06-15")).toBeNull();
    expect(resolveNextWeekdayOnOrAfter(3, null)).toBeNull();
  });
});

// resolvePrimaryRunwayDays is the shared selector introduced to close
// drift-app-warden §8's F24 quarantine — it must mirror the exact
// `hasBenefits && includeBenefits` ternary NewJobSeasonHomePanel.jsx/
// NewJobSeasonBudgetPanel.jsx each use inline for their headline runway tile, so
// any other consumer (Coach) quoting "the" runway number can't disagree.
describe("resolvePrimaryRunwayDays", () => {
  it("returns null when there's no dash (not in New Job Season)", () => {
    expect(resolvePrimaryRunwayDays(null, { unemploymentEnabled: true }, true)).toBeNull();
  });

  it("returns withoutBenefits.days when unemploymentEnabled is off", () => {
    const dash = { projectedUnemploymentTotal: 0, withBenefits: { days: 90 }, withoutBenefits: { days: 30 } };
    expect(resolvePrimaryRunwayDays(dash, { unemploymentEnabled: false }, true)).toBe(30);
  });

  it("returns withoutBenefits.days when there's no projected unemployment total, even if enabled", () => {
    const dash = { projectedUnemploymentTotal: 0, withBenefits: { days: 90 }, withoutBenefits: { days: 30 } };
    expect(resolvePrimaryRunwayDays(dash, { unemploymentEnabled: true }, true)).toBe(30);
  });

  it("returns withBenefits.days when benefits exist and includeBenefits is true", () => {
    const dash = { projectedUnemploymentTotal: 1200, withBenefits: { days: 90 }, withoutBenefits: { days: 30 } };
    expect(resolvePrimaryRunwayDays(dash, { unemploymentEnabled: true }, true)).toBe(90);
  });

  it("returns withoutBenefits.days when benefits exist but the toggle is off", () => {
    const dash = { projectedUnemploymentTotal: 1200, withBenefits: { days: 90 }, withoutBenefits: { days: 30 } };
    expect(resolvePrimaryRunwayDays(dash, { unemploymentEnabled: true }, false)).toBe(30);
  });

  it("defaults includeBenefits to true when the caller omits it", () => {
    const dash = { projectedUnemploymentTotal: 1200, withBenefits: { days: 90 }, withoutBenefits: { days: 30 } };
    expect(resolvePrimaryRunwayDays(dash, { unemploymentEnabled: true })).toBe(90);
  });

  it("returns null instead of Infinity when the selected side has zero burn", () => {
    const dash = { projectedUnemploymentTotal: 0, withBenefits: { days: Infinity }, withoutBenefits: { days: Infinity } };
    expect(resolvePrimaryRunwayDays(dash, { unemploymentEnabled: false }, true)).toBeNull();
  });
});

// Timeline-aware cash on hand (TODO §1.H17) — newJobSeasonCashOnHand is a
// point-in-time snapshot; essential bills whose due date passes since it was
// last confirmed (newJobSeasonCashOnHandAsOf) get subtracted automatically.
const RENT = {
  id: "exp_rent", category: "Needs", label: "Rent", newJobSeasonStatus: "active",
  dueDateAnchor: "2026-06-10",
  billingMeta: { amount: 1000, cycle: "every30days", effectiveFrom: "2026-01-01" },
};
const GYM = {
  id: "exp_gym", category: "Lifestyle", label: "Gym", newJobSeasonStatus: "active",
  dueDateAnchor: "2026-06-05",
  billingMeta: { amount: 50, cycle: "weekly", effectiveFrom: "2026-01-01" },
};
const LOAN = {
  id: "exp_loan", type: "loan", category: "Loans", label: "Car Note", newJobSeasonStatus: "active",
  loanMeta: { paymentAmount: 300, paymentFrequency: "monthly", firstPaymentDate: "2026-06-12" },
};

describe("sumBillsDueSince", () => {
  it("sums an essential bill's due-date occurrence inside the window", () => {
    expect(sumBillsDueSince([RENT], "2026-06-01", "2026-06-15")).toBe(1000);
  });

  it("excludes an occurrence landing exactly on the (exclusive) start date", () => {
    const rentDueOnStart = { ...RENT, dueDateAnchor: "2026-06-01" };
    // next occurrence after the exclusive start (cycle 30d) lands 2026-07-01, outside the window
    expect(sumBillsDueSince([rentDueOnStart], "2026-06-01", "2026-06-15")).toBe(0);
  });

  it("excludes Lifestyle bills", () => {
    expect(sumBillsDueSince([GYM], "2026-06-01", "2026-06-15")).toBe(0);
  });

  it("excludes paused bills", () => {
    expect(sumBillsDueSince([{ ...RENT, newJobSeasonStatus: "paused" }], "2026-06-01", "2026-06-15")).toBe(0);
  });

  it("excludes untracked bills", () => {
    expect(sumBillsDueSince([{ ...RENT, trackDuringNewJobSeason: false }], "2026-06-01", "2026-06-15")).toBe(0);
  });

  it("includes loan payments — category is Loans, not Lifestyle", () => {
    expect(sumBillsDueSince([LOAN], "2026-06-01", "2026-06-15")).toBe(300);
  });

  it("sums every occurrence of a fast-recurring bill within the window, not just one", () => {
    const weeklyNeeds = { ...GYM, id: "exp_weekly", category: "Needs", dueDateAnchor: "2026-06-02" };
    // occurrences at 06-02 and 06-09 fall inside (06-01, 06-15]; 06-16 does not
    expect(sumBillsDueSince([weeklyNeeds], "2026-06-01", "2026-06-15")).toBe(100);
  });

  it("returns 0 when either boundary date is missing", () => {
    expect(sumBillsDueSince([RENT], null, "2026-06-15")).toBe(0);
    expect(sumBillsDueSince([RENT], "2026-06-01", null)).toBe(0);
  });
});

describe("computeNewJobSeasonRunway — timeline-aware cash on hand (§1.H17)", () => {
  const baseConfig = {
    newJobSeasonMode: true,
    newJobSeasonDate: "2026-06-01",
    newJobSeasonCashOnHand: 2000,
    newJobSeasonCashOnHandAsOf: "2026-06-01",
  };

  it("subtracts essential bills due since cashAsOf from the raw figure", () => {
    const dash = computeNewJobSeasonRunway({ config: baseConfig, expenses: [RENT], effectiveToday: "2026-06-15" });
    expect(dash.rawCashOnHand).toBe(2000);
    expect(dash.billsDueSinceAsOf).toBe(1000);
    expect(dash.effectiveCashOnHand).toBe(1000);
  });

  it("floors effectiveCashOnHand at 0 rather than going negative", () => {
    const dash = computeNewJobSeasonRunway({
      config: { ...baseConfig, newJobSeasonCashOnHand: 500 }, expenses: [RENT], effectiveToday: "2026-06-15",
    });
    expect(dash.effectiveCashOnHand).toBe(0);
  });

  it("falls back to newJobSeasonDate as the decay anchor when newJobSeasonCashOnHandAsOf is unset (pre-§1.H17 accounts)", () => {
    const legacyConfig = { newJobSeasonMode: true, newJobSeasonDate: "2026-06-01", newJobSeasonCashOnHand: 2000 };
    const dash = computeNewJobSeasonRunway({ config: legacyConfig, expenses: [RENT], effectiveToday: "2026-06-15" });
    expect(dash.cashAsOf).toBe("2026-06-01");
    expect(dash.billsDueSinceAsOf).toBe(1000);
  });

  it("does not decay when no essential bills have come due since asOf", () => {
    const dash = computeNewJobSeasonRunway({ config: baseConfig, expenses: [GYM], effectiveToday: "2026-06-15" });
    expect(dash.billsDueSinceAsOf).toBe(0);
    expect(dash.effectiveCashOnHand).toBe(2000);
  });

  it("feeds effectiveCashOnHand, not the raw figure, into withoutBenefits.cash — extraCash still adds on top", () => {
    const dash = computeNewJobSeasonRunway({
      config: baseConfig, expenses: [RENT], effectiveToday: "2026-06-15", extraCash: 100,
    });
    expect(dash.withoutBenefits.cash).toBe(1100); // (2000 - 1000) + 100
  });
});

// weeklyBurn/lifestyleWeeklySpend previously summed via getEffectiveAmount,
// which reads expense.history — a shape loans don't natively carry (loanMeta
// instead). A tracked loan with no synthetic history silently contributed $0
// to the Runway headline. sumBillsDueSince (above) and the Upcoming Bills
// list already handled loans correctly via getExpenseDisplayAmount; this
// closes the one remaining gap.
describe("computeNewJobSeasonRunway — loan payments count toward weeklyBurn", () => {
  const baseConfig = {
    newJobSeasonMode: true,
    newJobSeasonDate: "2026-06-01",
    newJobSeasonCashOnHand: 2000,
    newJobSeasonCashOnHandAsOf: "2026-06-01",
  };

  it("includes a tracked, active loan's weekly-equivalent payment in weeklyBurn, even with no history array", () => {
    expect(LOAN.history).toBeUndefined(); // exactly the shape a fresh/in-memory loan carries
    const dash = computeNewJobSeasonRunway({ config: baseConfig, expenses: [LOAN], effectiveToday: "2026-06-15" });
    // $300/mo -> loanWeeklyAmount = 300 * 12 / 52 ~= 69.23/wk — not 0.
    expect(dash.weeklyBurn).toBeCloseTo((300 * 12) / 52, 2);
  });

  it("excludes a paused loan from weeklyBurn, same as any other paused bill", () => {
    const dash = computeNewJobSeasonRunway({
      config: baseConfig, expenses: [{ ...LOAN, newJobSeasonStatus: "paused" }], effectiveToday: "2026-06-15",
    });
    expect(dash.weeklyBurn).toBe(0);
  });
});
