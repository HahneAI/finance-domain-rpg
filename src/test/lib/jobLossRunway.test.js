import { describe, it, expect } from "vitest";
import { resolvePrimaryRunwayDays } from "../../lib/jobLossRunway.js";

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
