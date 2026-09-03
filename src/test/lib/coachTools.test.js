import { describe, it, expect } from "vitest";
import {
  COACH_TOOLS,
  COACH_TOOL_NAMES,
  ASK_COACH_TOOLS,
  JOB_HUNT_TOOLS,
  executeCoachTool,
} from "../../lib/coachTools.js";
import { computeNet, computeNetBreakdown, calcEventImpact, fmtFullDate } from "../../lib/finance.js";

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
  it("declares the drill-down, action and simulation tools", () => {
    expect(COACH_TOOL_NAMES).toEqual([
      "get_goal_detail", "get_expense_detail", "get_week_breakdown", "list_log_entries",
      "navigate_to", "propose_goal",
      "simulate_expense_change", "simulate_new_goal", "simulate_overtime_hours",
      "simulate_without_logged_event",
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

describe("executeCoachTool — navigate_to", () => {
  it("maps each user-facing panel name to App.jsx's own view key", () => {
    const d = baseData();
    const key = (panel) => executeCoachTool("navigate_to", { panel }, d).viewKey;
    expect(key("Home")).toBe("home");
    expect(key("Income")).toBe("income");
    expect(key("Budget")).toBe("budget");
    expect(key("Log")).toBe("log");
    // The one that differs: the panel users call "Account" is keyed "profile".
    expect(key("Account")).toBe("profile");
  });

  it("accepts the panel name case-insensitively", () => {
    expect(executeCoachTool("navigate_to", { panel: "budget" }, baseData()).viewKey).toBe("budget");
  });

  it("rejects a panel that doesn't exist rather than inventing a route", () => {
    const r = executeCoachTool("navigate_to", { panel: "Dashboard" }, baseData());
    expect(r.error).toContain("Unknown panel");
    expect(r.viewKey).toBeUndefined();
    expect(r.validPanels).toContain("budget");
  });

  it("resolves an expense focus against real data, by label", () => {
    const r = executeCoachTool("navigate_to", { panel: "Budget", focus: "gym" }, baseData());
    expect(r.focusRef).toBe("expense:Gym");
    expect(r.linkLabel).toBe("Budget · Gym");
  });

  it("resolves a goal focus by rank", () => {
    const r = executeCoachTool("navigate_to", { panel: "Home", focus: "goal 2" }, baseData());
    expect(r.focusRef).toBe("goal:2");
    expect(r.linkLabel).toBe("Home · Goal 2");
  });

  it("degrades to panel-only when the focus can't be resolved, and says so", () => {
    // A chip that scrolls to nothing is worse than one that just opens the
    // panel — and the model needs to know so it doesn't promise the highlight.
    const r = executeCoachTool("navigate_to", { panel: "Budget", focus: "Netflix" }, baseData());
    expect(r.ok).toBe(true);
    expect(r.viewKey).toBe("budget");
    expect(r.focusRef).toBeNull();
    expect(r.linkLabel).toBe("Open Budget");
    expect(r.note).toContain("No expense matches");
  });

  it("degrades the same way for a goal rank that doesn't exist", () => {
    const r = executeCoachTool("navigate_to", { panel: "Home", focus: "goal 9" }, baseData());
    expect(r.focusRef).toBeNull();
    expect(r.note).toContain("no goal 9");
  });

  it("won't focus a paused expense that isn't on screen", () => {
    const r = executeCoachTool("navigate_to", { panel: "Budget", focus: "Paused Thing" }, baseData());
    expect(r.focusRef).toBeNull();
  });
});

describe("executeCoachTool — propose_goal", () => {
  it("returns an editable proposal with a real projected finish", () => {
    const r = executeCoachTool("propose_goal", { label: "Six months of runway", target: 800, note: "so a bad month stops being a crisis" }, baseData());
    expect(r.ok).toBe(true);
    expect(r.label).toBe("Six months of runway");
    expect(r.target).toBe(800);
    expect(r.note).toBe("so a bad month stops being a crisis");
    // Appended last: that is the rank a confirmed goal actually lands at.
    expect(r.insertAtRank).toBe(3);
    expect(r.onTrackThisFiscalYear).toBe(true);
    expect(r.projectedFinishDate).toMatch(/^the week of /);
  });

  it("agrees with simulate_new_goal, because it IS simulate_new_goal", () => {
    // The card's date must come from the same engine the goal cards use — not
    // a second projection that happens to look similar.
    const d = baseData();
    const proposed = executeCoachTool("propose_goal", { label: "X", target: 800 }, d);
    const simulated = executeCoachTool("simulate_new_goal", { target: 800 }, d).newGoal;
    expect(proposed.projectedFinishDate).toBe(simulated.finishDate);
    expect(proposed.projectedFinishPeriodNumber).toBe(simulated.finishPeriodNumber);
  });

  it("reports no date, and says so, when the goal can't finish this fiscal year", () => {
    // Regression: this branched on the projection OBJECT existing rather than
    // on a date existing, so an unreachable goal told the model "the projected
    // finish date is already on the card" when the card had none.
    const r = executeCoachTool("propose_goal", { label: "Huge", target: 900000 }, baseData());
    expect(r.onTrackThisFiscalYear).toBe(false);
    expect(r.projectedFinishDate).toBeNull();
    expect(r.note_to_model).toContain("does NOT finish inside the fiscal year");
    expect(r.note_to_model).not.toContain("already on the card");
  });

  it("flags a duplicate name without ever naming the existing goals", () => {
    // F114 withholds goal names from Coach. Proposing one is the opposite
    // direction and is fine, but the reply must not leak what it compared to.
    const d = baseData();
    const r = executeCoachTool("propose_goal", { label: "emergency fund", target: 500 }, d);
    expect(r.alreadyHaveOneNamedThis).toBe(true);
    const out = JSON.stringify(r);
    for (const g of d.goals) if (g.label) expect(out).not.toContain(g.label);
  });

  it("does not flag a name the user doesn't already have", () => {
    expect(executeCoachTool("propose_goal", { label: "Something new", target: 500 }, baseData())
      .alreadyHaveOneNamedThis).toBe(false);
  });

  it("always tells the model the card is unsaved", () => {
    const r = executeCoachTool("propose_goal", { label: "X", target: 500 }, baseData());
    expect(r.note_to_model).toContain("do not tell the user it has been added");
  });

  it("rejects proposals that could not become a real goal", () => {
    const d = baseData();
    expect(executeCoachTool("propose_goal", { label: "  ", target: 500 }, d).error).toContain("needs a name");
    expect(executeCoachTool("propose_goal", { label: "X", target: 0 }, d).error).toContain("positive");
    expect(executeCoachTool("propose_goal", { label: "X", target: "abc" }, d).error).toContain("positive");
    expect(executeCoachTool("propose_goal", { label: "y".repeat(61), target: 5 }, d).error).toContain("too long");
  });
});

describe("executeCoachTool — simulations", () => {
  // Every simulation re-runs the REAL computeGoalTimeline with one input
  // changed and diffs it. These assert direction and arithmetic, not snapshots
  // — a snapshot would pass just as happily with the diff inverted.

  // baseData() carries logs but leaves logNetLost/logNetGained at 0. The real
  // app derives those from the same calcEventImpact call, so the counterfactual
  // tests derive them too rather than hand-picking numbers that happen to work.
  const logTotals = (d) => d.logs.reduce((acc, e) => {
    const i = calcEventImpact(e, d.config, d.allWeeks.find((w) => w.idx === e.weekIdx) ?? null);
    return { netLost: acc.netLost + i.netLost, netGained: acc.netGained + i.netGained };
  }, { netLost: 0, netGained: 0 });
  const withLogTotals = (over = {}) => {
    const d = baseData(over);
    const t = logTotals(d);
    return { ...d, logNetLost: t.netLost, logNetGained: t.netGained };
  };

  it("simulate_expense_change: cutting a bill pulls every goal forward", () => {
    const r = executeCoachTool("simulate_expense_change", { label: "Gym", newWeeklyCost: 0 }, baseData());
    expect(r.expenseLabel).toBe("Gym");
    expect(r.simulatedWeeklyCost).toBe(0);
    expect(r.weeklyDifference).toBe(r.currentWeeklyCost);
    for (const g of r.goals) {
      expect(g.periodsSooner).toBeGreaterThan(0);
      expect(g.simulated.periodsToFund).toBeLessThan(g.current.periodsToFund);
    }
    // The later goal gains more in absolute terms — it funds for longer.
    expect(r.goals[1].periodsSooner).toBeGreaterThan(r.goals[0].periodsSooner);
  });

  it("simulate_expense_change: raising a bill pushes goals back", () => {
    const r = executeCoachTool("simulate_expense_change", { label: "Gym", newWeeklyCost: 200 }, baseData());
    expect(r.goals.every((g) => g.periodsSooner < 0)).toBe(true);
  });

  it("simulate_new_goal: a goal inserted first pushes the existing ones back", () => {
    const r = executeCoachTool("simulate_new_goal", { target: 3000, insertAtRank: 1 }, baseData());
    expect(r.newGoal.insertedAtRank).toBe(1);
    expect(r.newGoal.targetAmount).toBe(3000);
    expect(r.existingGoals).toHaveLength(2);
    expect(r.existingGoals.every((g) => g.periodsSooner < 0)).toBe(true);
    expect(r.existingGoals[0].simulated.periodsToFund)
      .toBeGreaterThan(r.existingGoals[0].current.periodsToFund);
  });

  it("simulate_new_goal: a goal inserted last leaves the others alone", () => {
    const r = executeCoachTool("simulate_new_goal", { target: 3000 }, baseData());
    expect(r.newGoal.insertedAtRank).toBe(3);
    for (const g of r.existingGoals) expect(g.periodsSooner).toBeCloseTo(0, 6);
  });

  it("simulate_overtime_hours: take-home is the gross minus each real deduction", () => {
    const r = executeCoachTool("simulate_overtime_hours", { hours: 8 }, baseData());
    // baseRate 30 x 1.5 OT multiplier, no night differential on this fixture.
    expect(r.overtimeRatePerHour).toBeCloseTo(45, 6);
    expect(r.addedGrossPay).toBeCloseTo(360, 6);
    const taken = Object.values(r.takenBy).reduce((a, b) => a + b, 0);
    expect(r.addedTakeHome).toBeCloseTo(r.addedGrossPay - taken, 1);
    // The headline guard: gross is never presented as spendable.
    expect(r.addedTakeHome).toBeLessThan(r.addedGrossPay);
    expect(r.effectiveTakeHomePerHour).toBeCloseTo(r.addedTakeHome / 8, 1);
    expect(r.keptShareOfGross).toBeGreaterThan(50);
    expect(r.keptShareOfGross).toBeLessThan(100);
  });

  it("simulate_overtime_hours: returns the real goal effect rather than leaving it to be guessed", () => {
    // Live testing caught Coach answering "is it worth it?" with a goal
    // acceleration figure off a payload that carried no goal data at all.
    const r = executeCoachTool("simulate_overtime_hours", { hours: 8 }, baseData());
    expect(r.goals).toHaveLength(2);
    for (const g of r.goals) expect(g.periodsSooner).toBeGreaterThan(0);
    expect(r.note).toContain("do not estimate it yourself");
  });

  it("simulate_overtime_hours: says so when no goal timeline covers that period", () => {
    const r = executeCoachTool("simulate_overtime_hours", { hours: 8 }, baseData({ goals: [] }));
    expect(r.goals).toBeNull();
    expect(r.addedTakeHome).toBeGreaterThan(0);
    expect(r.note).toContain("do not estimate one");
  });

  it("simulate_overtime_hours: scales to per-paycheck on a biweekly schedule", () => {
    const weekly = executeCoachTool("simulate_overtime_hours", { hours: 8 }, baseData());
    const biweekly = executeCoachTool("simulate_overtime_hours", { hours: 8 },
      baseData({ config: cfg({ userPaySchedule: "biweekly" }) }));
    expect(biweekly.addedGrossPay).toBeCloseTo(weekly.addedGrossPay * 2, 6);
  });

  it("simulate_without_logged_event: removing a loss pulls goals forward", () => {
    // The counterfactual no read-only tool can produce: computeGoalTimeline
    // already folds logNetLost in, so every date elsewhere is the WITH-event one.
    const r = executeCoachTool("simulate_without_logged_event", { type: "missed_unpaid" }, withLogTotals());
    expect(r.event.netImpact).toBeLessThan(0);
    expect(r.event.periodNumber).toBe(27);
    for (const g of r.goals) {
      expect(g.periodsSooner).toBeGreaterThan(0);
      expect(g.simulated.periodsToFund).toBeLessThan(g.current.periodsToFund);
    }
    expect(r.note).toContain("already includes this event");
  });

  it("simulate_without_logged_event: removing a gain pushes goals back", () => {
    const r = executeCoachTool("simulate_without_logged_event", { type: "bonus" }, withLogTotals());
    expect(r.event.netImpact).toBeGreaterThan(0);
    expect(r.goals.every((g) => g.periodsSooner < 0)).toBe(true);
  });

  it("simulate_without_logged_event: refuses when the totals don't contain the event", () => {
    // Clamping the subtraction at 0 instead would return an identical timeline
    // and report "this event cost you nothing" — a confident wrong answer.
    const r = executeCoachTool("simulate_without_logged_event", { type: "bonus" },
      baseData({ logNetLost: 0, logNetGained: 0 }));
    expect(r.error).toContain("isn't reflected in the account's logged totals");
    expect(r.goals).toBeUndefined();
  });

  it("never leaks a goal label from any simulation", () => {
    const data = withLogTotals();
    const calls = [
      ["simulate_expense_change", { label: "Gym", newWeeklyCost: 0 }],
      ["simulate_new_goal", { target: 1000 }],
      ["simulate_without_logged_event", { type: "bonus" }],
    ];
    for (const [name, input] of calls) {
      const out = JSON.stringify(executeCoachTool(name, input, data));
      for (const g of data.goals) expect(out, name).not.toContain(g.label);
    }
  });

  it("rejects nonsense arguments instead of returning a confident wrong answer", () => {
    const d = baseData();
    expect(executeCoachTool("simulate_expense_change", { label: "Nope", newWeeklyCost: 5 }, d).error).toContain("No active expense");
    expect(executeCoachTool("simulate_expense_change", { label: "Rent", newWeeklyCost: -5 }, d).error).toContain("0 or more");
    expect(executeCoachTool("simulate_new_goal", { target: 0 }, d).error).toContain("positive");
    expect(executeCoachTool("simulate_overtime_hours", { hours: 0 }, d).error).toContain("positive");
    expect(executeCoachTool("simulate_without_logged_event", { type: "pto" }, d).error).toContain("Nothing of type");
    expect(executeCoachTool("simulate_without_logged_event", { type: "zzz" }, d).error).toContain("Unknown event type");
  });

  it("says so when there are no goals to measure a change against", () => {
    const d = baseData({ goals: [] });
    expect(executeCoachTool("simulate_expense_change", { label: "Rent", newWeeklyCost: 0 }, d).error).toContain("No active goals");
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
