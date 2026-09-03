import { describe, it, expect } from "vitest";
import { resolveWithholdingRates, calcEventImpact, computeNet } from "../../lib/finance.js";

// Two rate field families exist: the generalized fedRateLow/fedRateHigh/
// stateRateLow/stateRateHigh, and the legacy w1/w2 pair they replaced.
const GENERALIZED = { fedRateLow: 0.10, fedRateHigh: 0.12, stateRateLow: 0.04, stateRateHigh: 0.05 };
const LEGACY = { w1FedRate: 0.10, w2FedRate: 0.12, w1StateRate: 0.04, w2StateRate: 0.05 };

const cfg = (rates) => ({
  employerPreset: null, userPaySchedule: "weekly",
  ficaRate: 0.0765, k401Rate: 0.05, k401MatchRate: 0.03,
  baseRate: 29.20, shiftHours: 8, maxWeeklyHours: 40, standardWeeklyHours: 40,
  otThreshold: 40, otMultiplier: 1.5, diffRate: 1.75,
  nightDiffEnabled: false, nightDiffRate: 0,
  otherDeductions: [], taxedWeeks: [9],
  ...rates,
});

const week = { idx: 9, isHighWeek: false, grossPay: 1168, taxableGross: 1090, active: true, taxedBySchedule: true };
const EVENT = { type: "missed_unpaid", weekIdx: 9, weekEnd: "2026-03-09", shiftsLost: 1 };

describe("resolveWithholdingRates", () => {
  it("prefers the generalized fields", () => {
    expect(resolveWithholdingRates(cfg({ ...GENERALIZED, ...LEGACY }), false)).toEqual({ fed: 0.10, state: 0.04 });
    expect(resolveWithholdingRates(cfg({ ...GENERALIZED, ...LEGACY }), true)).toEqual({ fed: 0.12, state: 0.05 });
  });

  it("falls back to the legacy w1/w2 fields when only those are present", () => {
    expect(resolveWithholdingRates(cfg(LEGACY), false)).toEqual({ fed: 0.10, state: 0.04 });
    expect(resolveWithholdingRates(cfg(LEGACY), true)).toEqual({ fed: 0.12, state: 0.05 });
  });

  it("selects the high-week pair only when the week is a high week", () => {
    const c = cfg(GENERALIZED);
    expect(resolveWithholdingRates(c, false).fed).toBe(0.10);
    expect(resolveWithholdingRates(c, true).fed).toBe(0.12);
  });
});

describe("calcEventImpact — withholding rate resolution", () => {
  // Regression: calcEventImpact read ONLY the legacy w1/w2 names, the one rate
  // consumer without the fallback its siblings have. A config carrying just the
  // generalized family made netLost/netGained NaN, which propagated through
  // computeGoalTimeline's per-week surplus and silently reported every goal as
  // "not on track" — a plausible wrong answer, not a crash.
  it("produces finite impacts from a generalized-only config", () => {
    const impact = calcEventImpact(EVENT, cfg(GENERALIZED), week);
    expect(Number.isFinite(impact.netLost)).toBe(true);
    expect(Number.isFinite(impact.netGained)).toBe(true);
    expect(impact.netLost).toBeGreaterThan(0);
  });

  it("gives identical results whichever family the config carries", () => {
    const g = calcEventImpact(EVENT, cfg(GENERALIZED), week);
    const l = calcEventImpact(EVENT, cfg(LEGACY), week);
    expect(g.netLost).toBeCloseTo(l.netLost, 10);
    expect(g.grossLost).toBeCloseTo(l.grossLost, 10);
  });

  it("withholds nothing on a week outside the tax schedule", () => {
    const c = cfg({ ...GENERALIZED, taxedWeeks: [] });
    const impact = calcEventImpact(EVENT, c, week);
    // FICA still applies; only fed/state withholding drops out.
    expect(impact.netLost).toBeCloseTo(impact.grossLost * (1 - 0.0765), 10);
  });

  it("applies the high-week pair to a high week", () => {
    const high = { ...week, isHighWeek: true };
    const impact = calcEventImpact(EVENT, cfg(GENERALIZED), high);
    expect(impact.netLost).toBeCloseTo(impact.grossLost * (1 - (0.0765 + 0.12 + 0.05)), 10);
  });
});

describe("computeNet — unchanged by the shared resolver", () => {
  it("agrees across both field families", () => {
    expect(computeNet(week, cfg(GENERALIZED), 0, false))
      .toBeCloseTo(computeNet(week, cfg(LEGACY), 0, false), 10);
  });

  it("still applies the high-week rates to a high week", () => {
    const c = cfg(GENERALIZED);
    const low = computeNet(week, c, 0, false);
    const high = computeNet({ ...week, isHighWeek: true }, c, 0, false);
    expect(high).toBeLessThan(low);
    expect(low - high).toBeCloseTo(1090 * (0.12 - 0.10) + 1090 * (0.05 - 0.04), 6);
  });
});
