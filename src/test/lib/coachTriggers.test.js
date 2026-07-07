import { describe, it, expect } from "vitest";
import { estimateRunwayDays, resolveNetWorthSignalTier, shouldFireForTier } from "../../lib/coachTriggers.js";

describe("estimateRunwayDays", () => {
  it("returns null when not in Job Loss Mode", () => {
    expect(estimateRunwayDays({ jobLossMode: false }, [], "2026-07-07")).toBeNull();
  });

  it("returns null when there's no essential active burn to divide against", () => {
    const config = { jobLossMode: true, jobLossDate: "2026-06-01" };
    expect(estimateRunwayDays(config, [], "2026-07-07")).toBeNull();
  });

  it("computes runway from unemployment benefits over essential weekly burn", () => {
    const config = {
      jobLossMode: true,
      jobLossDate: "2026-06-01",
      unemploymentEnabled: true,
      unemploymentWeekly: 300,
      unemploymentDurationWeeks: 10,
      unemploymentWaitingWeek: false,
    };
    const expenses = [
      { category: "Needs", jobLossStatus: "active", weekly: [100, 100, 100, 100] },
    ];
    const days = estimateRunwayDays(config, expenses, "2026-06-08");
    expect(days).toBeGreaterThan(0);
  });

  it("excludes Lifestyle and paused/cancelled expenses from the burn rate", () => {
    const config = {
      jobLossMode: true,
      jobLossDate: "2026-06-01",
      unemploymentEnabled: true,
      unemploymentWeekly: 300,
      unemploymentDurationWeeks: 10,
    };
    const expenses = [
      { category: "Lifestyle", jobLossStatus: "active", weekly: [500, 500, 500, 500] },
      { category: "Needs", jobLossStatus: "cancelled", weekly: [500, 500, 500, 500] },
    ];
    // Both excluded → zero burn → null (no essential burn to divide against)
    expect(estimateRunwayDays(config, expenses, "2026-06-08")).toBeNull();
  });
});

describe("resolveNetWorthSignalTier", () => {
  it("returns red when runway is under 30 days, regardless of savings health", () => {
    const tier = resolveNetWorthSignalTier({
      netWorthHealth: { belowThreshold: false },
      runwayDays: 12,
      previousTier: null,
    });
    expect(tier).toBe("red");
  });

  it("returns amber on a thin savings cushion with healthy runway", () => {
    const tier = resolveNetWorthSignalTier({
      netWorthHealth: { belowThreshold: true },
      runwayDays: null,
      previousTier: null,
    });
    expect(tier).toBe("amber");
  });

  it("returns green when a prior amber/red is no longer active", () => {
    const tier = resolveNetWorthSignalTier({
      netWorthHealth: { belowThreshold: false },
      runwayDays: null,
      previousTier: "amber",
    });
    expect(tier).toBe("green");
  });

  it("returns null when nothing is flagged and there's no prior tier to recover from", () => {
    const tier = resolveNetWorthSignalTier({
      netWorthHealth: { belowThreshold: false },
      runwayDays: null,
      previousTier: null,
    });
    expect(tier).toBeNull();
  });

  it("prioritizes red over amber when both conditions are true", () => {
    const tier = resolveNetWorthSignalTier({
      netWorthHealth: { belowThreshold: true },
      runwayDays: 5,
      previousTier: null,
    });
    expect(tier).toBe("red");
  });
});

describe("shouldFireForTier", () => {
  it("does not fire with no tier", () => {
    expect(shouldFireForTier({ tier: null, lastFiredTier: null, lastFiredWeekIdx: null, currentWeekIdx: 10 })).toBe(false);
  });

  it("fires the first time a tier appears", () => {
    expect(shouldFireForTier({ tier: "amber", lastFiredTier: null, lastFiredWeekIdx: null, currentWeekIdx: 10 })).toBe(true);
  });

  it("does not re-fire the same tier within the same fiscal week", () => {
    expect(shouldFireForTier({ tier: "amber", lastFiredTier: "amber", lastFiredWeekIdx: 10, currentWeekIdx: 10 })).toBe(false);
  });

  it("fires again once the fiscal week advances, even for the same tier", () => {
    expect(shouldFireForTier({ tier: "amber", lastFiredTier: "amber", lastFiredWeekIdx: 10, currentWeekIdx: 11 })).toBe(true);
  });

  it("fires immediately on a tier change within the same week", () => {
    expect(shouldFireForTier({ tier: "red", lastFiredTier: "amber", lastFiredWeekIdx: 10, currentWeekIdx: 10 })).toBe(true);
  });
});
