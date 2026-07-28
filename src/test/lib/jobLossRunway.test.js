import { describe, it, expect } from "vitest";
import { resolvePrimaryRunwayDays, sumBillsDueSince, computeJobLossRunway } from "../../lib/jobLossRunway.js";

// resolvePrimaryRunwayDays is the shared selector introduced to close
// drift-app-warden §21's F24 quarantine — it must mirror the exact
// `hasBenefits && includeBenefits` ternary JobLossHomePanel.jsx/
// JobLossBudgetPanel.jsx each use inline for their headline runway tile, so
// any other consumer (Coach) quoting "the" runway number can't disagree.
describe("resolvePrimaryRunwayDays", () => {
  it("returns null when there's no dash (not in Job Loss Mode)", () => {
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

// Timeline-aware cash on hand (TODO §15.H17) — jobLossCashOnHand is a
// point-in-time snapshot; essential bills whose due date passes since it was
// last confirmed (jobLossCashOnHandAsOf) get subtracted automatically.
const RENT = {
  id: "exp_rent", category: "Needs", label: "Rent", jobLossStatus: "active",
  dueDateAnchor: "2026-06-10",
  billingMeta: { amount: 1000, cycle: "every30days", effectiveFrom: "2026-01-01" },
};
const GYM = {
  id: "exp_gym", category: "Lifestyle", label: "Gym", jobLossStatus: "active",
  dueDateAnchor: "2026-06-05",
  billingMeta: { amount: 50, cycle: "weekly", effectiveFrom: "2026-01-01" },
};
const LOAN = {
  id: "exp_loan", type: "loan", category: "Loans", label: "Car Note", jobLossStatus: "active",
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
    expect(sumBillsDueSince([{ ...RENT, jobLossStatus: "paused" }], "2026-06-01", "2026-06-15")).toBe(0);
  });

  it("excludes untracked bills", () => {
    expect(sumBillsDueSince([{ ...RENT, trackDuringJobLoss: false }], "2026-06-01", "2026-06-15")).toBe(0);
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

describe("computeJobLossRunway — timeline-aware cash on hand (§15.H17)", () => {
  const baseConfig = {
    jobLossMode: true,
    jobLossDate: "2026-06-01",
    jobLossCashOnHand: 2000,
    jobLossCashOnHandAsOf: "2026-06-01",
  };

  it("subtracts essential bills due since cashAsOf from the raw figure", () => {
    const dash = computeJobLossRunway({ config: baseConfig, expenses: [RENT], effectiveToday: "2026-06-15" });
    expect(dash.rawCashOnHand).toBe(2000);
    expect(dash.billsDueSinceAsOf).toBe(1000);
    expect(dash.effectiveCashOnHand).toBe(1000);
  });

  it("floors effectiveCashOnHand at 0 rather than going negative", () => {
    const dash = computeJobLossRunway({
      config: { ...baseConfig, jobLossCashOnHand: 500 }, expenses: [RENT], effectiveToday: "2026-06-15",
    });
    expect(dash.effectiveCashOnHand).toBe(0);
  });

  it("falls back to jobLossDate as the decay anchor when jobLossCashOnHandAsOf is unset (pre-§15.H17 accounts)", () => {
    const legacyConfig = { jobLossMode: true, jobLossDate: "2026-06-01", jobLossCashOnHand: 2000 };
    const dash = computeJobLossRunway({ config: legacyConfig, expenses: [RENT], effectiveToday: "2026-06-15" });
    expect(dash.cashAsOf).toBe("2026-06-01");
    expect(dash.billsDueSinceAsOf).toBe(1000);
  });

  it("does not decay when no essential bills have come due since asOf", () => {
    const dash = computeJobLossRunway({ config: baseConfig, expenses: [GYM], effectiveToday: "2026-06-15" });
    expect(dash.billsDueSinceAsOf).toBe(0);
    expect(dash.effectiveCashOnHand).toBe(2000);
  });

  it("feeds effectiveCashOnHand, not the raw figure, into withoutBenefits.cash — extraCash still adds on top", () => {
    const dash = computeJobLossRunway({
      config: baseConfig, expenses: [RENT], effectiveToday: "2026-06-15", extraCash: 100,
    });
    expect(dash.withoutBenefits.cash).toBe(1100); // (2000 - 1000) + 100
  });
});
