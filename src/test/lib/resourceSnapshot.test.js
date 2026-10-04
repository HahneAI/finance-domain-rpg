import { describe, it, expect } from "vitest";
import { buildResourceSnapshotPayload } from "../../lib/resourceSnapshot.js";

// TODO §22.F — the payload only re-shapes values computeCashOnHand() and
// computeClaimDates() already produced; it never derives a figure of its own.
const cash = {
  cashOnHand: 1234.567, pendingCount: 1, status: "orange", gap: -150.004, setAside: 1384.57,
  weeklyNeeds: 692.285, asOf: "2026-09-15", nextPaydayIso: "2026-10-05", nextPaycheckEstimate: 1199.999,
  atRiskBill: null,
};

describe("buildResourceSnapshotPayload (TODO §22.F)", () => {
  it("copies Cash on Hand, the next paycheck and the next Claim Date, rounded to cents", () => {
    const p = buildResourceSnapshotPayload({
      cashOnHand: cash,
      nextClaim: { goal: { label: "Emergency fund" }, info: { finishDate: new Date(2027, 2, 14) } },
    });
    expect(p.cash).toEqual({
      cashOnHand: 1234.57, pendingCount: 1, status: "orange", gap: -150, setAside: 1384.57,
      weeklyNeeds: 692.29, anchorAsOf: "2026-09-15", atRiskBill: null,
    });
    expect(p.nextPaycheck).toEqual({ dateIso: "2026-10-05", amount: 1200 });
    expect(p.nextClaim).toEqual({ label: "Emergency fund", dateIso: "2027-03-14" });
  });

  it("names the at-risk bill without its internal id", () => {
    const p = buildResourceSnapshotPayload({
      cashOnHand: { ...cash, status: "red", atRiskBill: { id: "x1", label: "Rent", dueIso: "2026-10-03", amount: 900 } },
      nextClaim: null,
    });
    expect(p.cash.atRiskBill).toEqual({ label: "Rent", dueIso: "2026-10-03", amount: 900 });
  });

  it("uses null, never a placeholder number, when this app has no value", () => {
    // no starting balance yet / New Job Season (computeCashOnHand → null); no dated goal
    expect(buildResourceSnapshotPayload({ cashOnHand: null, nextClaim: null }))
      .toEqual({ cash: null, nextPaycheck: null, nextClaim: null });
    // a stalemated goal has no finishDate — it never becomes a Claim Date
    expect(buildResourceSnapshotPayload({ cashOnHand: null, nextClaim: { goal: { label: "G" }, info: { finishDate: null } } }).nextClaim)
      .toBeNull();
  });
});
