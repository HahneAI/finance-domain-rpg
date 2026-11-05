// TODO §32 D1 — the "Needs you" ranking on Home.
import { describe, it, expect } from "vitest";
import { rankNeedsYou } from "../../lib/commandCenter.js";

describe("rankNeedsYou", () => {
  it("is empty when nothing is asking anything", () => {
    expect(rankNeedsYou()).toEqual([]);
    expect(rankNeedsYou({ netWorthTier: null, dueTodayCount: 0, claimSlipCount: 0 })).toEqual([]);
  });

  it("puts a Net Worth Red/Amber first, then bills due today, then Claim Date slips", () => {
    for (const tier of ["red", "amber"]) {
      expect(rankNeedsYou({ netWorthTier: tier, dueTodayCount: 2, claimSlipCount: 1 }))
        .toEqual(["netWorthAlert", "dueToday", "claimSlips"]);
    }
  });

  it("puts a Green recovery note last", () => {
    expect(rankNeedsYou({ netWorthTier: "green", dueTodayCount: 1, claimSlipCount: 3 }))
      .toEqual(["dueToday", "claimSlips", "netWorthRecovery"]);
    expect(rankNeedsYou({ netWorthTier: "green" })).toEqual(["netWorthRecovery"]);
  });

  it("only lists items that have something to show", () => {
    expect(rankNeedsYou({ claimSlipCount: 1 })).toEqual(["claimSlips"]);
    expect(rankNeedsYou({ dueTodayCount: 1 })).toEqual(["dueToday"]);
  });
});
