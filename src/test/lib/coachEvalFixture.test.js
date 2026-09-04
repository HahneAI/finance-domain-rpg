import { describe, it, expect } from "vitest";
import {
  buildTestContext,
  buildTestAccountArgs,
  buildWeeklyBriefingContext,
  buildToolTestAccount,
  buildToolTestContext,
} from "../../../scripts/coach-eval/fixtures/testAccount.js";
import { executeCoachTool, COACH_TOOL_NAMES } from "../../lib/coachTools.js";
import { buildCoachContext } from "../../lib/aiContext.js";
import { TOTAL_FISCAL_WEEKS } from "../../constants/config.js";

// This file deliberately reaches into scripts/coach-eval — that coupling is
// the point. The prompt-eval harness and Coach's drill-down tools are meant to
// exercise the SAME account, and the only way that stays true is if a change
// to either side fails a test here.

describe("eval fixture — the harness's own contract", () => {
  // The Phase 4/5 findings in coach-personality-rubric.md rest on runs being
  // word-for-word identical across repeats. If these lines move, every score
  // recorded against this fixture is measuring a different account than the
  // one it was locked on — re-run the affected phases before updating them.
  it("still renders the exact baseline the recorded phases were run against", () => {
    const block = buildTestContext();
    expect(block).toContain("Weekly net income: $845");
    expect(block).toContain("Weekly spend: $520");
    expect(block).toContain("Weekly surplus: $325");
    expect(block).toContain("Runway Health (Home tile): 62% spend ratio (healthy range)");
    expect(block).toContain("Expense breakdown: Rent (Needs): ~$400/wk");
    expect(block).toContain("Today: March 9th, 2026");
  });

  it("holds Phase 4's severity variants apart", () => {
    expect(buildTestContext({ weeklyIncome: 900, avgWeeklySpend: 880 }))
      .toContain("98% spend ratio (watch spend)");
    expect(buildTestContext({ weeklyIncome: 900, avgWeeklySpend: 200 }))
      .toContain("22% spend ratio (well-managed)");
  });

  it("emits Phase 5's Red-tier trigger condition", () => {
    expect(buildTestContext({ newJobSeasonMode: true, runwayDays: 21 }))
      .toContain("New Job Season: active, ~21 days of runway");
  });

  // buildTestContext() is a one-liner over buildTestAccountArgs(), so the two
  // cannot diverge — this asserts that wiring rather than re-checking text.
  it("derives the context string from the extracted argument bag", () => {
    for (const c of [{}, { weeklyIncome: 700, avgWeeklySpend: 690 }, { newJobSeasonMode: true, runwayDays: 9 }]) {
      expect(buildCoachContext(buildTestAccountArgs(c))).toBe(buildTestContext(c));
    }
  });

  it("keeps the weekly-briefing fixture's funded-goal timeline real", () => {
    // The whole reason that fixture uses real Date objects: computeGoalTimeline
    // calls getPhaseIndex(week.weekEnd), which needs .getFullYear().
    expect(buildWeeklyBriefingContext()).toMatch(/Goal 1 of 1: \$2,000 target, ~\$\d+\/wk projected/);
  });

  // Regression (2026-09-02, found reviewing the sister branch's F167/F168
  // period-label fix): allWeeks used to be label-shaped ({ idx, weekEnd:
  // "2026-03-01" }, a date STRING with no weekStart/isPayWeek/
  // payPeriodEndDate) — insufficient for getPayPeriodBounds(), so
  // formatPeriodWithDate() silently fell back from "the week of March 9th,
  // 2026 (week 11)" to a bare "week 11" on every single call. Every fixture
  // in this file now shares REAL_ALL_WEEKS (a real buildYear() calendar,
  // same one buildToolTestAccount() already used), so this can't regress
  // back to the degraded fallback without failing here first.
  it("gives Ask Coach and Weekly Briefing the full date-paired period label, not the bare fallback", () => {
    expect(buildTestContext()).toContain("Current period: the week of March 9th, 2026 (week 11)");
    expect(buildTestContext()).not.toMatch(/Current period: week \d+,/);
    expect(buildWeeklyBriefingContext()).toContain("Current period: the week of March 9th, 2026 (week 11)");
    expect(buildWeeklyBriefingContext()).toMatch(/on track for the week of \w+ \d+\w{2}, 2026 \(week \d+\)/);
  });
});

describe("eval fixture — tool-ready sibling account", () => {
  const bag = buildToolTestAccount();

  it("keeps the same account identity as the harness fixture", () => {
    // Same person, same scale — a finding on one is comparable to the other.
    expect(bag.weeklyIncome).toBeGreaterThan(830);
    expect(bag.weeklyIncome).toBeLessThan(860);
    expect(buildToolTestContext()).toContain("62% spend ratio (healthy range)");
    expect(bag.today).toBe("2026-03-09");
  });

  it("builds engine-shaped weeks, not label-shaped ones", () => {
    // The gap that made the original fixture unusable for get_week_breakdown.
    const w = bag.currentWeek;
    expect(w.weekEnd).toBeInstanceOf(Date);
    expect(w.weekStart).toBeInstanceOf(Date);
    expect(w.grossPay).toBeGreaterThan(0);
    expect(w.taxableGross).toBeGreaterThan(0);
    expect(w.active).toBe(true);
    expect(w.payrollDeductions.total).toBeGreaterThan(0);
    expect(bag.allWeeks).toHaveLength(TOTAL_FISCAL_WEEKS);
    // Every week taxed — an untaxed tail would inflate net on the last week.
    expect(bag.allWeeks.every((w) => w.taxedBySchedule)).toBe(true);
  });

  it("gives every tool real data — no empty or error results", () => {
    const calls = {
      get_goal_detail: { rank: 1 },
      get_expense_detail: { label: "Groceries" },
      get_week_breakdown: { weekOffset: 0 },
      list_log_entries: {},
      navigate_to: { panel: "Runway", focus: "Groceries" },
      propose_goal: { label: "Six months of runway", target: 800 },
      simulate_expense_change: { label: "Groceries", newWeeklyCost: 0 },
      simulate_new_goal: { target: 3000, insertAtRank: 1 },
      simulate_overtime_hours: { hours: 8 },
      simulate_without_logged_event: { type: "missed_unpaid" },
    };
    // Guards against a tool being added without fixture data behind it.
    expect(Object.keys(calls).sort()).toEqual([...COACH_TOOL_NAMES].sort());
    for (const [name, input] of Object.entries(calls)) {
      const r = executeCoachTool(name, input, bag);
      expect(r.error, `${name} errored`).toBeUndefined();
    }
    expect(executeCoachTool("list_log_entries", {}, bag).totalMatching).toBe(3);
    // The focus target must resolve against this fixture's real expenses, not
    // just return ok — a chip that scrolls to nothing is the failure mode.
    expect(executeCoachTool("navigate_to", { panel: "Runway", focus: "Groceries" }, bag).focusRef)
      .toBe("expense:Groceries");
  });

  // The payoff of a shared fixture: a tool and the prompt's context block are
  // provably describing the same numbers, not merely the same account.
  it("agrees with the context block built from the same bag", () => {
    const block = buildToolTestContext();
    const goal = executeCoachTool("get_goal_detail", { rank: 1 }, bag);
    expect(goal.onTrackThisFiscalYear).toBe(true);
    expect(block).toContain(`Goal 1 of 2: $2,000 target, ~$${Math.round(goal.projectedPerPeriodFunding).toLocaleString("en-US")}/wk projected`);
    expect(block).toContain(`on track for ${goal.projectedFinishDate} (week ${goal.projectedFinishPeriodNumber})`);

    const week = executeCoachTool("get_week_breakdown", { weekOffset: 0 }, bag);
    expect(block).toContain(`Current period: ${week.date} (week ${week.periodNumber})`);

    const groceries = executeCoachTool("get_expense_detail", { label: "Groceries" }, bag);
    expect(block).toContain(`Groceries (Needs): ~$${groceries.effectiveWeeklyCost}/wk`);
  });

  it("surfaces the month override the summary line hides", () => {
    const r = executeCoachTool("get_expense_detail", { label: "Groceries" }, bag);
    // What the user typed on the form vs. what March actually costs — the
    // distinction get_expense_detail exists to make.
    expect(r.billedAmount).toBe(60);
    expect(r.effectiveWeeklyCost).toBe(90);
    expect(r.monthSpecificOverrides).toEqual([{ month: "2026-03", weeklyCost: 90 }]);
  });

  it("returns a real loan payoff date, not a malformed one", () => {
    const r = executeCoachTool("get_expense_detail", { label: "Car Loan" }, bag);
    expect(r.loan.projectedPayoffDate).toMatch(/^[A-Z][a-z]+ \d+(st|nd|rd|th), \d{4}$/);
    expect(r.loan.paymentsRemaining).toEqual(expect.any(Number));
  });

  it("never leaks a goal label, even though the fixture has real ones", () => {
    // The fixture carries real labels precisely so this is testable.
    expect(bag.goals.map((g) => g.label)).toContain("Emergency Fund");
    for (const rank of [1, 2]) {
      const out = JSON.stringify(executeCoachTool("get_goal_detail", { rank }, bag));
      for (const g of bag.goals) expect(out).not.toContain(g.label);
    }
    expect(buildToolTestContext()).not.toContain("Emergency Fund");
  });

  it("computes log impacts as real numbers, not NaN", () => {
    // Regression: calcEventImpact reads the legacy w1/w2 rate fields with no
    // fallback to fedRateLow/stateRateLow. A config carrying only the newer
    // names yields NaN impacts, which propagate into computeGoalTimeline's
    // surplus and silently report every goal as "not on track".
    expect(Number.isFinite(bag.logNetLost)).toBe(true);
    expect(Number.isFinite(bag.logNetGained)).toBe(true);
    expect(bag.logNetGained).toBeGreaterThan(0);
    for (const e of executeCoachTool("list_log_entries", {}, bag).entries) {
      expect(Number.isFinite(e.netImpact), `${e.type} impact`).toBe(true);
    }
  });
});
