import { describe, it, expect } from "vitest";
import {
  COACH_TOOLS,
  COACH_TOOL_NAMES,
  ASK_COACH_TOOLS,
  JOB_HUNT_TOOLS,
  executeCoachTool,
} from "../../lib/coachTools.js";
import { computeNet, computeNetBreakdown, fmtFullDate } from "../../lib/finance.js";

// Week fixtures shaped the way buildYear() emits them — the tools read real
// week objects, so anything thinner would test a shape the app never produces.
function mkWeek(idx, over = {}) {
  const weekStart = new Date(2026, 0, 5 + idx * 7);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
  const grossPay = over.grossPay ?? 1200;
  const benefits = over.benefits ?? 50;
  const k401Employee = over.k401Employee ?? 60;
  return {
    idx, weekStart, weekEnd, payPeriodEndDate: weekEnd, isPayWeek: true,
    active: true, taxedBySchedule: true, isHighWeek: false,
    grossPay,
    taxableGross: grossPay - benefits - k401Employee,
    totalHours: 40, regularHours: 40, overtimeHours: 0, weekendHours: 0,
    workedDayNames: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    rotation: "Standard", rotationLabel: "Standard",
    benefitsDeduction: benefits, benefitsActive: true, has401k: true,
    k401kEmployee: k401Employee, k401kEmployer: 30,
    payrollDeductions: { benefits, k401Employee, total: benefits + k401Employee },
    unemploymentIncome: 0,
    ...over,
  };
}

const cfg = (over = {}) => ({
  userPaySchedule: "weekly",
  ficaRate: 0.0765,
  fedRateLow: 0.10, fedRateHigh: 0.12,
  stateRateLow: 0.04, stateRateHigh: 0.05,
  k401Rate: 0.05, k401MatchRate: 0.03,
  employerPreset: null, shiftHours: 8, baseRate: 30,
  // diffRate/otThreshold are present on every real config (DEFAULT_CONFIG,
  // constants/config.js:63). Omitting them makes calcEventImpact's weekend
  // terms multiply by undefined and quietly return NaN, so a thinner fixture
  // would test a config shape the app never actually produces.
  diffRate: 1.75, nightDiffRate: 1.5, otThreshold: 40,
  otMultiplier: 1.5, maxWeeklyHours: 40,
  otherDeductions: [],
  ...over,
});

const allWeeks = Array.from({ length: 52 }, (_, i) => mkWeek(i));

const baseData = (over = {}) => ({
  config: cfg(),
  goals: [
    { id: "g1", label: "Emergency Fund", target: 3000, completed: false },
    { id: "g2", label: "Trip", target: 1500, completed: false },
    { id: "g3", label: "Done", target: 200, completed: true },
  ],
  expenses: [
    {
      label: "Rent", category: "Needs", newJobSeasonStatus: "active",
      billingMeta: { amount: 1200, cycle: "every30days", effectiveFrom: "2026-01-01" },
      history: [{ effectiveFrom: "2026-01-01", weekly: [277, 277, 277, 277] }],
    },
    {
      label: "Gym", category: "Lifestyle", newJobSeasonStatus: "active",
      billingMeta: { amount: 40, cycle: "every30days", effectiveFrom: "2026-01-01" },
      history: [{ effectiveFrom: "2026-01-01", weekly: [9, 9, 9, 9] }],
      monthlyOverrides: { "2026-07": { perPaycheck: 20, amount: 87, cycle: "every30days" } },
    },
    {
      label: "Paused Thing", category: "Lifestyle", newJobSeasonStatus: "paused",
      billingMeta: { amount: 15, cycle: "every30days", effectiveFrom: "2026-01-01" },
      history: [{ effectiveFrom: "2026-01-01", weekly: [3, 3, 3, 3] }],
    },
  ],
  logs: [
    { type: "bonus", weekIdx: 25, weekEnd: "2026-06-27", amount: 500, note: "Q2 bonus" },
    { type: "missed_unpaid", weekIdx: 26, weekEnd: "2026-07-04", shiftsLost: 1 },
  ],
  currentWeek: allWeeks[27],
  today: "2026-07-07",
  allWeeks,
  futureWeeks: allWeeks.slice(27),
  timelineWeekNets: allWeeks.slice(27).map(() => 900),
  logNetLost: 0, logNetGained: 0, futureEventDeductions: {},
  ...over,
});

describe("computeNetBreakdown", () => {
  // The whole reason this function exists: an itemized breakdown that cannot
  // drift from the app's authoritative net. computeNet() delegates to it, so
  // this is a structural guarantee, not a coincidence worth re-checking by eye.
  it("sums to exactly what computeNet returns, across week shapes", () => {
    const c = cfg({ otherDeductions: [{ perCheckAmount: 25 }] });
    const cases = [
      mkWeek(0),
      mkWeek(1, { isHighWeek: true }),
      mkWeek(2, { taxedBySchedule: false }),
      mkWeek(3, { active: false, unemploymentIncome: 400 }),
      mkWeek(4, { grossPay: 0 }),
    ];
    for (const w of cases) {
      const b = computeNetBreakdown(w, c, 0, false);
      expect(b.net).toBeCloseTo(computeNet(w, c, 0, false), 10);
      const recomposed = b.grossPay - b.federalTax - b.stateTax - b.fica
        - b.benefits - b.k401Employee - b.otherPostTax + b.unemploymentIncome;
      expect(recomposed).toBeCloseTo(b.net, 10);
    }
  });

  it("reports zero federal and state withholding on a tax-exempt week", () => {
    const b = computeNetBreakdown(mkWeek(2, { taxedBySchedule: false }), cfg(), 0, false);
    expect(b.federalTax).toBe(0);
    expect(b.stateTax).toBe(0);
    expect(b.fica).toBeGreaterThan(0);
  });
});

describe("COACH_TOOLS schemas", () => {
  it("declares exactly the four drill-down tools", () => {
    expect(COACH_TOOL_NAMES).toEqual([
      "get_goal_detail", "get_expense_detail", "get_week_breakdown", "list_log_entries",
    ]);
  });

  it("gives every tool a description and a valid object input_schema", () => {
    for (const t of COACH_TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.input_schema.type).toBe("object");
      for (const req of t.input_schema.required ?? []) {
        expect(t.input_schema.properties).toHaveProperty(req);
      }
    }
  });

  // The array is serialized into the cached prefix, so a per-render rebuild
  // would keep invalidating the cache behind it.
  it("exposes stable module-level per-surface sets", () => {
    expect(ASK_COACH_TOOLS).toBe(COACH_TOOLS);
    expect(JOB_HUNT_TOOLS.map((t) => t.name)).toEqual(["get_expense_detail"]);
  });
});

describe("executeCoachTool — get_goal_detail", () => {
  it("returns rank-scoped timeline detail and withholds the goal's name", () => {
    const r = executeCoachTool("get_goal_detail", { rank: 1 }, baseData());
    expect(r.rank).toBe(1);
    expect(r.ofTotalActiveGoals).toBe(2);
    expect(r.targetAmount).toBe(3000);
    expect(r.payPeriodUnit).toBe("week");
    expect(r.fundingPosition).toContain("first in line");
    // Privacy rule (coachFeatureGuide.js): Coach never learns a goal's label.
    expect(JSON.stringify(r)).not.toContain("Emergency Fund");
  });

  it("describes a lower-ranked goal as funding behind the ones above it", () => {
    const r = executeCoachTool("get_goal_detail", { rank: 2 }, baseData());
    expect(r.rank).toBe(2);
    expect(r.fundingPosition).toContain("Goals ranked 1 through 1");
  });

  it("counts only active goals, excluding completed ones", () => {
    const r = executeCoachTool("get_goal_detail", { rank: 3 }, baseData());
    expect(r.error).toContain("between 1 and 2");
  });

  it("reports the unfunded remainder when a goal can't finish this fiscal year", () => {
    const data = baseData({
      goals: [{ id: "g1", target: 900000, completed: false }],
      timelineWeekNets: allWeeks.slice(27).map(() => 300),
    });
    const r = executeCoachTool("get_goal_detail", { rank: 1 }, data);
    expect(r.onTrackThisFiscalYear).toBe(false);
    expect(r.stillUnfundedAtFiscalYearEnd).toBeGreaterThan(0);
    expect(r.projectedFinishDate).toBeNull();
  });

  it("explains itself when no active goals exist", () => {
    const r = executeCoachTool("get_goal_detail", { rank: 1 }, baseData({ goals: [] }));
    expect(r.error).toContain("No active goals");
  });
});

describe("executeCoachTool — get_expense_detail", () => {
  it("resolves the real effective cost, not the amount typed on the form", () => {
    // Gym bills $40/mo but July carries an override — the summary line and a
    // naive billingMeta read would both under-report it. This is the live
    // incident aiContext.js's resolveWeeklyCost comment records.
    const r = executeCoachTool("get_expense_detail", { label: "Gym" }, baseData());
    expect(r.label).toBe("Gym");
    expect(r.billedAmount).toBe(40);
    expect(r.effectiveWeeklyCost).toBeGreaterThan(9);
    expect(r.monthSpecificOverrides.map((o) => o.month)).toContain("2026-07");
  });

  it("matches case-insensitively and reports the cycle", () => {
    const r = executeCoachTool("get_expense_detail", { label: "rent" }, baseData());
    expect(r.label).toBe("Rent");
    expect(r.category).toBe("Needs");
    expect(r.billingCycle).toBe("every30days");
  });

  it("ignores paused expenses and lists what is available instead", () => {
    const r = executeCoachTool("get_expense_detail", { label: "Paused Thing" }, baseData());
    expect(r.error).toContain("No active expense");
    expect(r.availableLabels).toEqual(["Rent", "Gym"]);
  });

  it("returns payoff detail for a loan", () => {
    const loan = {
      label: "Car Loan", type: "loan", category: "Loan", newJobSeasonStatus: "active",
      loanMeta: { totalAmount: 12000, paymentAmount: 400, paymentFrequency: "monthly", firstPaymentDate: "2026-01-15" },
      history: [{ effectiveFrom: "2026-01-01", weekly: [92, 92, 92, 92] }],
    };
    const r = executeCoachTool("get_expense_detail", { label: "Car Loan" }, baseData({ expenses: [loan] }));
    expect(r.kind).toBe("loan");
    expect(r.loan.paymentAmount).toBe(400);
    expect(r.loan.paymentFrequency).toBe("monthly");
    expect(r.loan.paymentsRemaining).toEqual(expect.any(Number));
    // Asserted against a real formatted date, not toBeTruthy() — the earlier
    // truthiness check passed happily on the string "undefined NaNth, NaN",
    // which is what a wrong argument to computeLoanPayoffDate actually yields.
    expect(r.loan.projectedPayoffDate).toMatch(/^[A-Z][a-z]+ \d+(st|nd|rd|th), \d{4}$/);
  });
});

describe("executeCoachTool — get_week_breakdown", () => {
  it("itemizes the current period and agrees with computeNet", () => {
    const data = baseData();
    const r = executeCoachTool("get_week_breakdown", { weekOffset: 0 }, data);
    expect(r.periodNumber).toBe(28);
    expect(r.date).toBe(`the week of ${fmtFullDate(allWeeks[27].weekStart)}`);
    expect(r.payPeriodUnit).toBe("week");
    expect(r.grossPay).toBe(1200);
    expect(r.deductions.federalTax).toBeCloseTo(1090 * 0.10, 6);
    expect(r.deductions.fica).toBeCloseTo(1200 * 0.0765, 6);
    expect(r.deductions.benefits).toBe(50);
    expect(r.deductions.k401Employee).toBe(60);
    expect(r.takeHomeBeforeLoggedEvents)
      .toBeCloseTo(computeNet(allWeeks[27], data.config, 0, false), 6);
  });

  it("resolves a negative offset to an earlier period", () => {
    const r = executeCoachTool("get_week_breakdown", { weekOffset: -1 }, baseData());
    expect(r.periodNumber).toBe(27);
  });

  it("defaults to the current period when no offset is given", () => {
    expect(executeCoachTool("get_week_breakdown", {}, baseData()).periodNumber).toBe(28);
  });

  it("folds that period's logged events into take-home", () => {
    const data = baseData({ currentWeek: allWeeks[25] });
    const r = executeCoachTool("get_week_breakdown", { weekOffset: 0 }, data);
    expect(r.loggedEventsThisPeriod).toEqual(["Bonus / Extra Pay"]);
    expect(r.loggedEventAdjustment).toBeGreaterThan(0);
    expect(r.takeHome).toBeCloseTo(r.takeHomeBeforeLoggedEvents + r.loggedEventAdjustment, 6);
  });

  it("scales to per-paycheck amounts on a biweekly schedule, matching IncomePanel", () => {
    const data = baseData({ config: cfg({ userPaySchedule: "biweekly" }) });
    const r = executeCoachTool("get_week_breakdown", { weekOffset: 0 }, data);
    expect(r.payPeriodUnit).toBe("paycheck");
    expect(r.grossPay).toBe(2400);
  });

  it("flags a tax-exempt period rather than silently showing zero tax", () => {
    const weeks = allWeeks.map((w) => (w.idx === 27 ? { ...w, taxedBySchedule: false } : w));
    const r = executeCoachTool("get_week_breakdown", { weekOffset: 0 },
      baseData({ allWeeks: weeks, currentWeek: weeks[27] }));
    expect(r.taxedOnSchedule).toBe(false);
    expect(r.note).toContain("exempt from the tax schedule");
  });

  it("errors cleanly for an out-of-range offset", () => {
    const r = executeCoachTool("get_week_breakdown", { weekOffset: 999 }, baseData());
    expect(r.error).toContain("No pay week exists");
  });
});

describe("executeCoachTool — list_log_entries", () => {
  it("returns entries newest-first with their real dollar impact", () => {
    const r = executeCoachTool("list_log_entries", {}, baseData());
    expect(r.totalMatching).toBe(2);
    expect(r.entries[0].type).toBe("Missed Shift (Unpaid/Approved)");
    expect(r.entries[1].type).toBe("Bonus / Extra Pay");
    expect(r.entries[1].netImpact).toBeGreaterThan(0);
    expect(r.entries[0].netImpact).toBeLessThan(0);
    expect(r.entries[1].note).toBe("Q2 bonus");
    expect(r.entries[0].date).toMatch(/^the week of /);
  });

  it("labels an entry's week the same way every other period reference does", () => {
    // Same regression as aiContext's: this returned `weekEnding`, an END date,
    // while get_week_breakdown/get_goal_detail label a period by its START.
    // Week 10 ends on the day week 11 begins, so both rendered "March 9th" and
    // Coach attributed the week-10 event to week 11 despite having the right
    // periodNumber in the payload.
    const data = baseData();
    const entry = executeCoachTool("list_log_entries", { type: "missed_unpaid" }, data).entries[0];
    const week = executeCoachTool("get_week_breakdown", { weekOffset: 0 }, data);
    expect(entry.periodNumber).toBe(27);
    expect(entry.date).toBe(`the week of ${fmtFullDate(allWeeks[26].weekStart)}`);
    // The raw end date stays available, but is no longer the only date field.
    expect(entry.weekEndingDate).toBe(fmtFullDate("2026-07-04"));
    // The entry's period is genuinely distinct from the current one.
    expect(week.periodNumber).toBe(28);
    expect(entry.date).not.toBe(week.date);
  });

  it("filters by event type", () => {
    const r = executeCoachTool("list_log_entries", { type: "bonus" }, baseData());
    expect(r.totalMatching).toBe(1);
    expect(r.entries[0].type).toBe("Bonus / Extra Pay");
  });

  it("rejects an unknown type and names the valid ones", () => {
    const r = executeCoachTool("list_log_entries", { type: "nope" }, baseData());
    expect(r.error).toContain("Unknown event type");
    expect(r.validTypes).toContain("bonus");
  });

  it("caps the returned entries at 25 however large a limit is asked for", () => {
    const logs = Array.from({ length: 40 }, (_, i) => ({
      type: "bonus", weekIdx: i, weekEnd: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, amount: 10,
    }));
    const r = executeCoachTool("list_log_entries", { limit: 500 }, baseData({ logs }));
    expect(r.totalMatching).toBe(40);
    expect(r.shown).toBe(25);
  });

  it("reports an empty log without erroring", () => {
    const r = executeCoachTool("list_log_entries", {}, baseData({ logs: [] }));
    expect(r.entries).toEqual([]);
    expect(r.note).toContain("Nothing logged");
  });
});

describe("executeCoachTool — failure handling", () => {
  it("returns an error object for an unknown tool rather than throwing", () => {
    expect(executeCoachTool("nope", {}, baseData()).error).toContain("Unknown tool");
  });

  // A throw here would abort the whole chat turn mid-stream; the model can at
  // least explain an error field to the user.
  it("converts an unexpected internal throw into an error result", () => {
    const r = executeCoachTool("get_week_breakdown", { weekOffset: 0 }, {
      allWeeks: [{ get idx() { throw new Error("boom"); } }],
      currentWeek: { idx: 0 },
    });
    expect(r.error).toContain("boom");
  });

  it("never throws on a totally empty data bag", () => {
    for (const name of COACH_TOOL_NAMES) {
      expect(() => executeCoachTool(name, {}, {})).not.toThrow();
    }
  });
});
