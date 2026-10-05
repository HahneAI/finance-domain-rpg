import { describe, it, expect } from "vitest";
import { buildResourceSnapshotPayload } from "../../lib/resourceSnapshot.js";

// TODO §22.F — the payload only re-shapes values computeCashOnHand() and
// computeClaimDates() already produced; it never derives a figure of its own.
const TODAY = "2026-10-05";
const cash = {
  cashOnHand: 1234.567, pendingCount: 1, status: "orange", gap: -150.004, setAside: 1384.57,
  weeklyNeeds: 692.285, weeklyLifestyle: 120.004, asOf: "2026-09-15", nextPaydayIso: "2026-10-05", nextPaycheckEstimate: 1199.999,
  atRiskBill: null,
};

describe("buildResourceSnapshotPayload (TODO §22.F)", () => {
  it("copies Cash on Hand, the next paycheck and the next Claim Date, rounded to cents", () => {
    const p = buildResourceSnapshotPayload({
      cashOnHand: cash,
      nextClaim: { goal: { label: "Emergency fund" }, info: { finishDate: new Date(2027, 2, 14) } },
      today: TODAY,
    });
    expect(p.mode).toBe("employed");
    expect(p.cash).toEqual({
      cashOnHand: 1234.57, pendingCount: 1, status: "orange", gap: -150, setAside: 1384.57,
      weeklyNeeds: 692.29, weeklyLifestyle: 120, anchorAsOf: "2026-09-15", atRiskBill: null,
    });
    expect(p.nextPaycheck).toEqual({ dateIso: "2026-10-05", amount: 1200 });
    expect(p.nextClaim).toEqual({ label: "Emergency fund", dateIso: "2027-03-14" });
  });

  it("names the at-risk bill without its internal id", () => {
    const p = buildResourceSnapshotPayload({
      cashOnHand: { ...cash, status: "red", atRiskBill: { id: "x1", label: "Rent", dueIso: "2026-10-03", amount: 900 } },
      nextClaim: null,
      today: TODAY,
    });
    expect(p.cash.atRiskBill).toEqual({ label: "Rent", dueIso: "2026-10-03", amount: 900 });
  });

  it("uses null, never a placeholder number, when this app has no value", () => {
    // no starting balance yet / New Job Season (computeCashOnHand → null); no dated goal
    expect(buildResourceSnapshotPayload({ cashOnHand: null, nextClaim: null, today: TODAY }))
      .toEqual({ mode: null, cash: null, nextPaycheck: null, nextClaim: null });
    // a stalemated goal has no finishDate — it never becomes a Claim Date
    expect(buildResourceSnapshotPayload({ cashOnHand: null, nextClaim: { goal: { label: "G" }, info: { finishDate: null } }, today: TODAY }).nextClaim)
      .toBeNull();
  });

  it("never publishes a Claim Date that is already in the past", () => {
    const past = { goal: { label: "Car repair" }, info: { finishDate: new Date(2026, 8, 1) } }; // Sep 1
    expect(buildResourceSnapshotPayload({ cashOnHand: cash, nextClaim: past, today: TODAY }).nextClaim).toBeNull();
    const today = { goal: { label: "G" }, info: { finishDate: new Date(2026, 9, 5) } };
    expect(buildResourceSnapshotPayload({ cashOnHand: cash, nextClaim: today, today: TODAY }).nextClaim).toEqual({ label: "G", dateIso: "2026-10-05" });
  });

  describe("New Job Season (the NJS runway engine stands in for Cash on Hand)", () => {
    const njsDash = {
      effectiveCashOnHand: 134, weeklyBurn: 700, lifestyleWeeklySpend: 85.5, cashAsOf: "2026-10-01",
      pendingCheck: { amount: 735, date: "2026-10-09", daysOut: 4 },
    };
    const claim = { goal: { label: "Car repair" }, info: { finishDate: new Date(2026, 8, 1) } };

    it("publishes NJS cash, essential burn, lifestyle and the pending check — no status light", () => {
      const p = buildResourceSnapshotPayload({ cashOnHand: null, njsDash, nextClaim: claim, today: TODAY });
      expect(p.mode).toBe("new_job_season");
      expect(p.cash).toEqual({
        cashOnHand: 134, pendingCount: null, status: null, gap: null, setAside: null,
        weeklyNeeds: 700, weeklyLifestyle: 85.5, anchorAsOf: "2026-10-01", atRiskBill: null,
      });
      expect(p.nextPaycheck).toEqual({ dateIso: "2026-10-09", amount: 735 });
    });

    it("publishes no Claim Date at all, even a future one", () => {
      const future = { goal: { label: "G" }, info: { finishDate: new Date(2027, 0, 1) } };
      expect(buildResourceSnapshotPayload({ cashOnHand: null, njsDash, nextClaim: future, today: TODAY }).nextClaim).toBeNull();
    });

    it("drops a pending check whose date has lapsed, and prefers Cash on Hand when both exist", () => {
      const lapsed = { ...njsDash, pendingCheck: { amount: 735, date: "2026-10-01", daysOut: 0 } };
      expect(buildResourceSnapshotPayload({ cashOnHand: null, njsDash: lapsed, nextClaim: null, today: TODAY }).nextPaycheck).toBeNull();
      expect(buildResourceSnapshotPayload({ cashOnHand: cash, njsDash, nextClaim: null, today: TODAY }).mode).toBe("employed");
    });
  });
});
