// TODO §32 A3/A4 — Coach panel notes (fixed templates) and panel-aware starters.
import { describe, it, expect } from "vitest";
import { homeCoachNote, upkeepCoachNote, logCoachNote } from "../../lib/coachNotes.js";
import { spendRatioOf, upkeepHealthBand } from "../../lib/upkeepHealth.js";
import { PANEL_STARTERS, panelStartersFor } from "../../lib/coachPanelStarters.js";

describe("upkeepHealth — one formula for the tile, Coach's context and the notes", () => {
  it("is spend over take-home, 0 with no income, banded at 50% / 75%", () => {
    expect(spendRatioOf(520, 845)).toBeCloseTo(0.615, 3);
    expect(spendRatioOf(520, 0)).toBe(0);
    expect([0.49, 0.5, 0.74, 0.75].map(upkeepHealthBand)).toEqual(["well-managed", "healthy range", "healthy range", "watch spend"]);
  });
});

describe("homeCoachNote", () => {
  const base = { leftThisCheck: 330, avgCheck: 845, unit: "week", spendRatio: 0.62 };
  it("leads with a shortfall when the week runs negative", () => {
    expect(homeCoachNote({ ...base, leftThisCheck: -40 })).toBe("This week runs $40 short of your average spend. Upkeep is where that gets fixed.");
  });
  it("flags spend at 75%+ before anything else positive", () => {
    expect(homeCoachNote({ ...base, spendRatio: 0.82 })).toMatch(/^Bills are taking 82% of your take-home/);
  });
  it("names an above-average next check with the tile's own figures", () => {
    expect(homeCoachNote({ ...base, nextCheck: 900 })).toBe("$330 free this week, and your next check runs $55 above average. A good round to point extra at your first goal.");
  });
  it("warns on a light next check and otherwise says it's on pace", () => {
    expect(homeCoachNote({ ...base, nextCheck: 780 })).toMatch(/comes in \$65 under average/);
    expect(homeCoachNote({ ...base, nextCheck: 850 })).toBe("$330 free this week, and your next check is on pace. Steady round.");
    expect(homeCoachNote({ ...base, unit: "check", nextCheck: null })).toMatch(/free this check/);
  });
  it("renders nothing without income", () => {
    expect(homeCoachNote({ ...base, avgCheck: 0 })).toBeNull();
  });
});

describe("upkeepCoachNote", () => {
  it("speaks per band, from the same ratio and band Home uses", () => {
    const r = spendRatioOf(520, 845);
    expect(upkeepCoachNote({ spendRatio: r, band: upkeepHealthBand(r) })).toBe("Upkeep is taking 62% of your take-home, a healthy range. Any bill you trim goes straight to your goals.");
    expect(upkeepCoachNote({ spendRatio: 0.8, band: "watch spend" })).toMatch(/largest Needs line/);
    expect(upkeepCoachNote({ spendRatio: 0.2, band: "well-managed" })).toMatch(/^Upkeep is taking 20%/);
    expect(upkeepCoachNote({ spendRatio: 0, band: "well-managed", hasExpenses: false })).toMatch(/^No bills tracked yet/);
  });
});

describe("logCoachNote", () => {
  it("nudges an empty log, then nets gains against losses", () => {
    expect(logCoachNote({ entryCount: 0 })).toMatch(/^Nothing logged yet/);
    expect(logCoachNote({ entryCount: 3, netLost: 183.03, netGained: 391.75 })).toBe("Your 3 logged entries add $209 to take-home this year.");
    expect(logCoachNote({ entryCount: 1, netLost: 183.03, netGained: 0 })).toBe("Your 1 logged entry costs $183 in take-home this year. Missed shifts are the bigger side.");
  });
});

describe("panel starters (A3)", () => {
  it("covers every panel with an intro and three starters, and falls back to null elsewhere", () => {
    for (const key of ["home", "income", "budget", "log", "profile"]) {
      expect(panelStartersFor(key).intro).toBeTruthy();
      expect(panelStartersFor(key).starters).toHaveLength(3);
    }
    expect(panelStartersFor("betaHomebase")).toBeNull();
    // Upkeep is the name users see — never the internal "budget" key (F178).
    expect(JSON.stringify(PANEL_STARTERS)).not.toMatch(/\bBudget\b/);
  });
});
