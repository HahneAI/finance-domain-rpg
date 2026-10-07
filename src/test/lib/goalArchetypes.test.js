import { describe, it, expect } from "vitest";
import { ARCHETYPES, getArchetype } from "../../constants/goalArchetypes.js";
import { resolveTargetRule, resolveTemplateGoals, applyArchetype, isStretchDate, pendingBillSuggestions, markSuggestion } from "../../lib/goalArchetypes.js";
import { normalizeCycle } from "../../lib/expense.js";
import { buildGoal, GOAL_SYSTEM_COLOR } from "../../lib/goalFunding.js";

describe("archetype catalog", () => {
  it("ships the six agreed archetypes with unique ids", () => {
    expect(ARCHETYPES.map((a) => a.name)).toEqual([
      "The Prepper", "The Heartbeat", "The Builder", "The Polished", "The Family Man", "The Explorer",
    ]);
    expect(new Set(ARCHETYPES.map((a) => a.id)).size).toBe(6);
  });

  it("gives every archetype 3–5 goals with unique keys and legal rules", () => {
    for (const a of ARCHETYPES) {
      expect(a.goals.length).toBeGreaterThanOrEqual(3);
      expect(a.goals.length).toBeLessThanOrEqual(5);
      expect(new Set(a.goals.map((g) => g.key)).size).toBe(a.goals.length);
      for (const g of a.goals) {
        expect(["fixed", "weeksOfSpend"]).toContain(g.targetRule.kind);
        const t = resolveTargetRule(g.targetRule, { avgWeeklySpend: 0 });
        expect(t).toBeGreaterThan(0);
      }
    }
  });
});

describe("resolveTargetRule", () => {
  it("applies the floor on a fresh account with tiny spend", () => {
    expect(resolveTargetRule({ kind: "weeksOfSpend", weeks: 4, floor: 1000 }, { avgWeeklySpend: 40 })).toBe(1000);
  });
  it("scales with real weekly spend, rounded to $50", () => {
    expect(resolveTargetRule({ kind: "weeksOfSpend", weeks: 4, floor: 1000 }, { avgWeeklySpend: 523 })).toBe(2100);
  });
  it("treats missing/NaN spend as zero and still honors the floor", () => {
    expect(resolveTargetRule({ kind: "weeksOfSpend", weeks: 4, floor: 1000 }, { avgWeeklySpend: NaN })).toBe(1000);
  });
});

describe("resolveTemplateGoals", () => {
  it("returns templateKey-stamped goals for an archetype", () => {
    const goals = resolveTemplateGoals("prepper", { avgWeeklySpend: 600 });
    expect(goals[0]).toMatchObject({ templateKey: "prepper.emergency_fund", target: 2400 });
    expect(goals.every((g) => g.templateKey.startsWith("prepper."))).toBe(true);
  });
  it("skips templates already held, by templateKey or by label", () => {
    const goals = resolveTemplateGoals("prepper", {
      existingGoals: [{ templateKey: "prepper.cash_stash", label: "x" }, { label: "  emergency FUND " }],
    });
    expect(goals.map((g) => g.templateKey)).toEqual(["prepper.food_water", "prepper.home_readiness"]);
  });
  it("returns [] for an unknown archetype", () => {
    expect(resolveTemplateGoals("nope")).toEqual([]);
  });
});

describe("applyArchetype", () => {
  const picked = [
    { templateKey: "builder.starter_emergency", label: "Starter Emergency Fund", note: "n", target: 1200 },
    { templateKey: "builder.first_invested", label: "First $1,000 Invested", note: "n", target: 0 },
    { templateKey: "builder.debt_crusher", label: "Debt Crusher Payment", note: "n", target: 900 },
  ];
  const existing = [{ id: "g_old", label: "Old", target: 50, completed: false }];

  it("appends goals LAST, drops non-positive targets, and stamps config.identity", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    const r = applyArchetype({ archetypeId: "builder", selected: picked, goals: existing, config: { a: 1 }, now });
    expect(r.addedCount).toBe(2);
    expect(r.goals.map((g) => g.label)).toEqual(["Old", "Starter Emergency Fund", "Debt Crusher Payment"]);
    expect(r.goals[1]).toMatchObject({ target: 1200, completed: false, templateKey: "builder.starter_emergency", color: GOAL_SYSTEM_COLOR });
    expect(r.config).toEqual({ a: 1, identity: { archetypeId: "builder", chosenAt: now.toISOString() } });
  });
  it("gives every seeded goal a unique id even within one millisecond", () => {
    const r = applyArchetype({ archetypeId: "builder", selected: picked, goals: [], config: {} });
    const ids = r.goals.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("does not mutate its inputs", () => {
    const goals = [...existing]; const config = { a: 1 };
    applyArchetype({ archetypeId: "builder", selected: picked, goals, config });
    expect(goals).toEqual(existing); expect(config).toEqual({ a: 1 });
  });
});

describe("buildGoal — the single goal shape (warden F181)", () => {
  it("matches the legacy hand-made goal shape and adds no templateKey when absent", () => {
    const g = buildGoal({ label: "Trip", target: "250.5", note: "hi" });
    expect(Object.keys(g).sort()).toEqual(["color", "completed", "id", "label", "note", "target"]);
    expect(g).toMatchObject({ label: "Trip", target: 250.5, note: "hi", completed: false, color: GOAL_SYSTEM_COLOR });
    expect(g.id).toMatch(/^g_\d+$/);
  });
  it("defaults note to empty string and coerces a bad target to 0", () => {
    expect(buildGoal({ label: "x", target: "abc" })).toMatchObject({ target: 0, note: "" });
  });
});

describe("isStretchDate", () => {
  it("flags dates beyond 12 months and ignores non-dates", () => {
    expect(isStretchDate(new Date("2027-12-01T00:00:00"), "2026-10-06")).toBe(true);
    expect(isStretchDate(new Date("2027-06-01T00:00:00"), "2026-10-06")).toBe(false);
    expect(isStretchDate(null, "2026-10-06")).toBe(false);
  });
});

it("getArchetype resolves by id", () => {
  expect(getArchetype("family_man").name).toBe("The Family Man");
  expect(getArchetype("zzz")).toBeNull();
});

describe("suggested Lifestyle bills (Phase 2)", () => {
  it("every archetype offers 1–3 bills with a legal cycle and a positive amount", () => {
    for (const a of ARCHETYPES) {
      expect(a.suggestedBills.length).toBeGreaterThanOrEqual(1);
      expect(a.suggestedBills.length).toBeLessThanOrEqual(3);
      expect(new Set(a.suggestedBills.map((b) => b.key)).size).toBe(a.suggestedBills.length);
      for (const b of a.suggestedBills) {
        expect(normalizeCycle(b.cycle)).toBe(b.cycle);
        expect(b.amount).toBeGreaterThan(0);
      }
    }
  });
  const cfg = (extra = {}) => ({ identity: { archetypeId: "heartbeat", ...extra } });
  it("offers the current identity's bills as Lifestyle, templateKey-stamped", () => {
    const p = pendingBillSuggestions({ config: cfg(), expenses: [] });
    expect(p.map((x) => x.templateKey)).toEqual(["heartbeat.gym", "heartbeat.supplements"]);
    expect(p.every((x) => x.category === "Lifestyle")).toBe(true);
  });
  it("offers nothing without an identity", () => {
    expect(pendingBillSuggestions({ config: {}, expenses: [] })).toEqual([]);
    expect(pendingBillSuggestions({})).toEqual([]);
  });
  it("withholds resolved suggestions and any whose label already exists as a bill", () => {
    const p = pendingBillSuggestions({
      config: cfg({ suggestions: { "heartbeat.gym": "dismissed" } }),
      expenses: [{ id: "e1", label: " supplements & NUTRITION " }],
    });
    expect(p).toEqual([]);
  });
  it("never touches the expenses array (pure read)", () => {
    const expenses = Object.freeze([Object.freeze({ id: "e1", label: "Rent" })]);
    expect(() => pendingBillSuggestions({ config: cfg(), expenses })).not.toThrow();
  });
  it("markSuggestion is pure and keeps earlier decisions", () => {
    const c = cfg({ suggestions: { a: "dismissed" } });
    const n = markSuggestion(c, "heartbeat.gym", "accepted");
    expect(n.identity.suggestions).toEqual({ a: "dismissed", "heartbeat.gym": "accepted" });
    expect(c.identity.suggestions).toEqual({ a: "dismissed" });
  });
  it("applyArchetype carries decided suggestions across an identity switch", () => {
    const r = applyArchetype({ archetypeId: "explorer", selected: [{ templateKey: "explorer.passport", label: "Passport", note: "", target: 165 }], goals: [], config: cfg({ suggestions: { "heartbeat.gym": "accepted" } }) });
    expect(r.config.identity.archetypeId).toBe("explorer");
    expect(r.config.identity.suggestions).toEqual({ "heartbeat.gym": "accepted" });
  });
});
