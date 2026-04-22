import { describe, it, expect } from "vitest";
import {
  buildCascadedWeekly,
  latestPastEntry,
  getBaseEntryAt,
  nextMonthIso,
} from "../../lib/expense.js";

// ─────────────────────────────────────────────────────────────────────────────
// buildCascadedWeekly
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCascadedWeekly", () => {
  it("cascades the new amount from phaseIdx through Q4 when no byPhase overrides exist", () => {
    const base = [50, 50, 50, 50];
    expect(buildCascadedWeekly(0, 100, base, {})).toEqual([100, 100, 100, 100]);
    expect(buildCascadedWeekly(1, 100, base, {})).toEqual([50, 100, 100, 100]);
    expect(buildCascadedWeekly(2, 100, base, {})).toEqual([50, 50, 100, 100]);
    expect(buildCascadedWeekly(3, 100, base, {})).toEqual([50, 50, 50, 100]);
  });

  it("preserves phases before phaseIdx unchanged", () => {
    const base = [10, 20, 30, 40];
    const result = buildCascadedWeekly(2, 99, base, {});
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(20);
    expect(result[2]).toBe(99);
  });

  it("stops cascading at future phases that already have an explicit byPhase override", () => {
    const base = [50, 50, 50, 50];
    // Q3 (index 2) has an override — cascade from Q1 (index 0) should not overwrite Q3
    const byPhase = { 2: { amount: 75, cycle: "every30days" } };
    const result = buildCascadedWeekly(0, 100, base, byPhase);
    expect(result[0]).toBe(100); // phaseIdx
    expect(result[1]).toBe(100); // no override → cascades
    expect(result[2]).toBe(50);  // has override → keeps base value
    expect(result[3]).toBe(100); // no override → cascades
  });

  it("does not cascade past a byPhase override when editing an earlier phase", () => {
    const base = [25, 25, 75, 75];
    // Q3 and Q4 both have overrides; editing Q1 should not touch them
    const byPhase = { 2: { amount: 75 }, 3: { amount: 75 } };
    const result = buildCascadedWeekly(1, 50, base, byPhase);
    expect(result[0]).toBe(25);  // before phaseIdx
    expect(result[1]).toBe(50);  // phaseIdx
    expect(result[2]).toBe(75);  // byPhase override → keep base[2]
    expect(result[3]).toBe(75);  // byPhase override → keep base[3]
  });

  it("handles null/undefined existingByPhase gracefully", () => {
    const base = [30, 30, 30, 30];
    expect(buildCascadedWeekly(1, 60, base, null)).toEqual([30, 60, 60, 60]);
    expect(buildCascadedWeekly(1, 60, base, undefined)).toEqual([30, 60, 60, 60]);
  });

  it("uses 0 as fallback when baseWeekly entries are missing", () => {
    const base = [50];
    const result = buildCascadedWeekly(2, 100, base, {});
    expect(result[0]).toBe(50);
    expect(result[1]).toBe(0);  // base[1] is undefined → 0
    expect(result[2]).toBe(100);
    expect(result[3]).toBe(100);
  });

  it("sets all phases from phaseIdx=0 when editing the first quarter", () => {
    const base = [0, 0, 0, 0];
    expect(buildCascadedWeekly(0, 50, base, {})).toEqual([50, 50, 50, 50]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// latestPastEntry
// ─────────────────────────────────────────────────────────────────────────────

describe("latestPastEntry", () => {
  it("returns the entry with the highest effectiveFrom that is <= todayIso", () => {
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
      { effectiveFrom: "2026-02-01", weekly: [60, 60, 60, 60] },
      { effectiveFrom: "2026-04-01", weekly: [70, 70, 70, 70] },
    ];
    const result = latestPastEntry(history, "2026-03-15");
    expect(result.effectiveFrom).toBe("2026-02-01");
  });

  it("includes an entry whose effectiveFrom equals todayIso", () => {
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
      { effectiveFrom: "2026-04-22", weekly: [80, 80, 80, 80] },
    ];
    expect(latestPastEntry(history, "2026-04-22").effectiveFrom).toBe("2026-04-22");
  });

  it("excludes future ADV.EDIT entries so they cannot be overwritten by regular edits", () => {
    // A June override created in April should not be picked as 'latest'
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
      { effectiveFrom: "2026-06-01", weekly: [999, 999, 999, 999] }, // future
    ];
    const result = latestPastEntry(history, "2026-04-22");
    expect(result.effectiveFrom).toBe("2026-01-05");
    expect(result.weekly[0]).toBe(50);
  });

  it("falls back to the oldest entry when every entry is in the future (new expense set to today)", () => {
    const history = [
      { effectiveFrom: "2026-05-01", weekly: [100, 100, 100, 100] },
    ];
    const result = latestPastEntry(history, "2026-04-22");
    expect(result.effectiveFrom).toBe("2026-05-01");
  });

  it("returns a single entry that is exactly on today", () => {
    const history = [{ effectiveFrom: "2026-04-22", weekly: [40, 40, 40, 40] }];
    expect(latestPastEntry(history, "2026-04-22").weekly[0]).toBe(40);
  });

  it("handles a large history correctly, always picking the max past entry", () => {
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [10, 10, 10, 10] },
      { effectiveFrom: "2026-02-01", weekly: [20, 20, 20, 20] },
      { effectiveFrom: "2026-03-01", weekly: [30, 30, 30, 30] },
      { effectiveFrom: "2026-04-01", weekly: [40, 40, 40, 40] },
      { effectiveFrom: "2026-05-01", weekly: [50, 50, 50, 50] }, // future
    ];
    const result = latestPastEntry(history, "2026-04-15");
    expect(result.effectiveFrom).toBe("2026-04-01");
    expect(result.weekly[0]).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getBaseEntryAt
// ─────────────────────────────────────────────────────────────────────────────

describe("getBaseEntryAt", () => {
  it("returns the most recent history entry on or before the given ISO date", () => {
    const exp = {
      history: [
        { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
        { effectiveFrom: "2026-04-01", weekly: [75, 75, 75, 75] },
      ],
    };
    expect(getBaseEntryAt(exp, "2026-02-15").effectiveFrom).toBe("2026-01-05");
    expect(getBaseEntryAt(exp, "2026-04-01").effectiveFrom).toBe("2026-04-01");
    expect(getBaseEntryAt(exp, "2026-06-01").effectiveFrom).toBe("2026-04-01");
  });

  it("falls back to the first history entry when iso is before all entries", () => {
    const exp = {
      history: [
        { effectiveFrom: "2026-04-01", weekly: [100, 100, 100, 100] },
      ],
    };
    const result = getBaseEntryAt(exp, "2026-01-01");
    expect(result.effectiveFrom).toBe("2026-04-01");
  });

  it("synthesizes a history entry from the legacy weekly field when history is absent", () => {
    const exp = { weekly: [25, 50, 75, 100] };
    const result = getBaseEntryAt(exp, "2026-06-01");
    expect(result.weekly).toEqual([25, 50, 75, 100]);
  });

  it("defaults to all-zeros when neither history nor weekly is present", () => {
    const exp = {};
    const result = getBaseEntryAt(exp, "2026-06-01");
    expect(result.weekly).toEqual([0, 0, 0, 0]);
  });

  it("returns the entry exactly matching the iso date, not a later one", () => {
    const exp = {
      history: [
        { effectiveFrom: "2026-04-01", weekly: [40, 40, 40, 40] },
        { effectiveFrom: "2026-05-01", weekly: [50, 50, 50, 50] },
      ],
    };
    const result = getBaseEntryAt(exp, "2026-04-15");
    expect(result.effectiveFrom).toBe("2026-04-01");
    expect(result.weekly[0]).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nextMonthIso
// ─────────────────────────────────────────────────────────────────────────────

describe("nextMonthIso", () => {
  it("advances the month by one within the same year", () => {
    expect(nextMonthIso("2026-01-01")).toBe("2026-02-01");
    expect(nextMonthIso("2026-04-01")).toBe("2026-05-01");
    expect(nextMonthIso("2026-11-01")).toBe("2026-12-01");
  });

  it("wraps December to January of the next year", () => {
    expect(nextMonthIso("2026-12-01")).toBe("2027-01-01");
  });

  it("zero-pads single-digit months", () => {
    const result = nextMonthIso("2026-01-01");
    expect(result).toBe("2026-02-01");
    const result2 = nextMonthIso("2026-08-01");
    expect(result2).toBe("2026-09-01");
  });

  it("handles year boundaries correctly across multiple steps", () => {
    let iso = "2026-10-01";
    expect(nextMonthIso(iso)).toBe("2026-11-01");
    expect(nextMonthIso("2026-11-01")).toBe("2026-12-01");
    expect(nextMonthIso("2026-12-01")).toBe("2027-01-01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction: 3-day override logic (saveEditExp / deleteExp behaviour)
//
// These tests exercise the business rules directly without React, mirroring
// the logic that lives in BudgetPanel's saveEditExp and deleteExp functions.
// They verify that regular card edits:
//   a) overwrite the latest PAST entry when it is <= 3 days old
//   b) append a new entry when the latest PAST entry is older than 3 days
//   c) never touch future ADV.EDIT entries regardless of their date
// ─────────────────────────────────────────────────────────────────────────────

function applyEditLogic(existing, todayIso, newWeekly) {
  const latest = latestPastEntry(existing, todayIso);
  const daysDiff = (new Date(todayIso) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 3) {
    return existing.map(en =>
      en.effectiveFrom === latest.effectiveFrom ? { effectiveFrom: todayIso, weekly: newWeekly } : en
    );
  }
  return [...existing, { effectiveFrom: todayIso, weekly: newWeekly }];
}

describe("3-day override logic (saveEditExp / deleteExp)", () => {
  it("overwrites the latest past entry when it is within 3 days", () => {
    const history = [
      { effectiveFrom: "2026-04-20", weekly: [50, 50, 50, 50] },
    ];
    const result = applyEditLogic(history, "2026-04-22", [60, 60, 60, 60]);
    expect(result).toHaveLength(1);
    expect(result[0].weekly[0]).toBe(60);
    expect(result[0].effectiveFrom).toBe("2026-04-22");
  });

  it("overwrites when the latest entry effectiveFrom === todayIso (0 days diff)", () => {
    const history = [{ effectiveFrom: "2026-04-22", weekly: [50, 50, 50, 50] }];
    const result = applyEditLogic(history, "2026-04-22", [70, 70, 70, 70]);
    expect(result).toHaveLength(1);
    expect(result[0].weekly[0]).toBe(70);
  });

  it("appends a new entry when the latest past entry is more than 3 days old", () => {
    const history = [
      { effectiveFrom: "2026-04-01", weekly: [50, 50, 50, 50] },
    ];
    const result = applyEditLogic(history, "2026-04-22", [80, 80, 80, 80]);
    expect(result).toHaveLength(2);
    expect(result[1].effectiveFrom).toBe("2026-04-22");
    expect(result[1].weekly[0]).toBe(80);
    expect(result[0].weekly[0]).toBe(50); // original preserved
  });

  it("never touches a future ADV.EDIT entry, even if its effectiveFrom is mathematically close", () => {
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] }, // past
      { effectiveFrom: "2026-06-01", weekly: [999, 999, 999, 999] }, // future
    ];
    const todayIso = "2026-04-22";
    const result = applyEditLogic(history, todayIso, [60, 60, 60, 60]);
    const futureEntry = result.find(en => en.effectiveFrom === "2026-06-01");
    // The future entry must be completely untouched
    expect(futureEntry).toBeDefined();
    expect(futureEntry.weekly[0]).toBe(999);
  });

  it("3-day boundary: exactly 3 days still overwrites", () => {
    const history = [{ effectiveFrom: "2026-04-19", weekly: [50, 50, 50, 50] }];
    const result = applyEditLogic(history, "2026-04-22", [65, 65, 65, 65]);
    expect(result).toHaveLength(1);
    expect(result[0].weekly[0]).toBe(65);
  });

  it("3-day boundary: 4 days appends a new entry", () => {
    const history = [{ effectiveFrom: "2026-04-18", weekly: [50, 50, 50, 50] }];
    const result = applyEditLogic(history, "2026-04-22", [65, 65, 65, 65]);
    expect(result).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction: quarter-scoped delete logic
//
// deleteExp zeroes weekly[ap..3] while preserving weekly[0..ap-1].
// ─────────────────────────────────────────────────────────────────────────────

function applyDeleteLogic(existing, todayIso, ap) {
  const latest = latestPastEntry(existing, todayIso);
  const baseWeekly = latest.weekly ?? [0, 0, 0, 0];
  const newWeekly = [0, 1, 2, 3].map(q => q < ap ? (baseWeekly[q] ?? 0) : 0);
  const daysDiff = (new Date(todayIso) - new Date(latest.effectiveFrom)) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 3) {
    return existing.map(en =>
      en.effectiveFrom === latest.effectiveFrom ? { effectiveFrom: todayIso, weekly: newWeekly } : en
    );
  }
  return [...existing, { effectiveFrom: todayIso, weekly: newWeekly }];
}

describe("quarter-scoped delete logic (deleteExp)", () => {
  it("zeroes the active phase and all future phases when deleting in Q1 (ap=0)", () => {
    const history = [{ effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] }];
    const result = applyDeleteLogic(history, "2026-04-22", 0);
    const entry = result.find(en => en.effectiveFrom === "2026-04-22") ?? result[result.length - 1];
    expect(entry.weekly).toEqual([0, 0, 0, 0]);
  });

  it("preserves past phases and zeroes active+future phases when deleting in Q2 (ap=1)", () => {
    const history = [{ effectiveFrom: "2026-01-05", weekly: [50, 60, 70, 80] }];
    const result = applyDeleteLogic(history, "2026-04-22", 1);
    const newEntry = result[result.length - 1];
    expect(newEntry.weekly[0]).toBe(50); // Q1 preserved
    expect(newEntry.weekly[1]).toBe(0);  // Q2 zeroed
    expect(newEntry.weekly[2]).toBe(0);  // Q3 zeroed
    expect(newEntry.weekly[3]).toBe(0);  // Q4 zeroed
  });

  it("preserves Q1-Q3 when deleting in Q4 (ap=3)", () => {
    const history = [{ effectiveFrom: "2026-01-05", weekly: [50, 60, 70, 80] }];
    const result = applyDeleteLogic(history, "2026-04-22", 3);
    const newEntry = result[result.length - 1];
    expect(newEntry.weekly[0]).toBe(50);
    expect(newEntry.weekly[1]).toBe(60);
    expect(newEntry.weekly[2]).toBe(70);
    expect(newEntry.weekly[3]).toBe(0); // only Q4 zeroed
  });

  it("does not touch a future ADV.EDIT entry when performing a delete", () => {
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
      { effectiveFrom: "2026-06-01", weekly: [999, 999, 999, 999] }, // future
    ];
    const result = applyDeleteLogic(history, "2026-04-22", 1);
    const future = result.find(en => en.effectiveFrom === "2026-06-01");
    expect(future.weekly[0]).toBe(999); // untouched
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction: saveAdvancedEdit patch application
//
// Mirrors the patchMap loop in BudgetPanel.saveAdvancedEdit — exact effectiveFrom
// match updates in place; new effectiveFrom appends.
// ─────────────────────────────────────────────────────────────────────────────

function applyPatches(history, patches) {
  let result = [...history];
  for (const { effectiveFrom, newWeekly } of patches) {
    const exactMatch = result.find(en => en.effectiveFrom === effectiveFrom);
    if (exactMatch) {
      result = result.map(en =>
        en.effectiveFrom === effectiveFrom ? { effectiveFrom, weekly: newWeekly } : en
      );
    } else {
      result = [...result, { effectiveFrom, weekly: newWeekly }];
    }
  }
  return result;
}

describe("saveAdvancedEdit patch application", () => {
  it("updates an existing history entry in place when effectiveFrom matches exactly", () => {
    const history = [
      { effectiveFrom: "2026-04-01", weekly: [50, 50, 50, 50] },
    ];
    const patches = [{ effectiveFrom: "2026-04-01", newWeekly: [75, 75, 75, 75] }];
    const result = applyPatches(history, patches);
    expect(result).toHaveLength(1);
    expect(result[0].weekly[0]).toBe(75);
  });

  it("appends a new entry when effectiveFrom does not match any existing entry", () => {
    const history = [
      { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
    ];
    const patches = [{ effectiveFrom: "2026-05-01", newWeekly: [80, 80, 80, 80] }];
    const result = applyPatches(history, patches);
    expect(result).toHaveLength(2);
    expect(result[1].effectiveFrom).toBe("2026-05-01");
    expect(result[1].weekly[0]).toBe(80);
    expect(result[0].weekly[0]).toBe(50); // original untouched
  });

  it("month-only scope produces two patches: set amount then restore base next month", () => {
    // Simulate handleSave with scope='month-only' for phaseIdx=1 (Q2), May
    const baseWeekly = [50, 50, 50, 50];
    const phaseIdx = 1;
    const perPaycheck = 75;
    const selectedMonthIso = "2026-05-01";
    const restoreIso = nextMonthIso(selectedMonthIso); // "2026-06-01"

    const thisMonthWeekly = baseWeekly.map((w, q) => q === phaseIdx ? perPaycheck : w);
    const patches = [
      { effectiveFrom: selectedMonthIso, newWeekly: thisMonthWeekly },
      { effectiveFrom: restoreIso, newWeekly: [...baseWeekly] },
    ];

    expect(patches).toHaveLength(2);
    expect(patches[0].newWeekly[1]).toBe(75); // Q2 gets new amount
    expect(patches[0].newWeekly[0]).toBe(50); // Q1 unchanged
    expect(patches[1].effectiveFrom).toBe("2026-06-01"); // restore point
    expect(patches[1].newWeekly[1]).toBe(50); // Q2 reverts to base
  });

  it("forward scope produces one patch that cascades from the selected month", () => {
    const baseWeekly = [50, 50, 50, 50];
    const phaseIdx = 1;
    const perPaycheck = 75;
    const selectedMonthIso = "2026-05-01";

    const newWeekly = buildCascadedWeekly(phaseIdx, perPaycheck, baseWeekly, {});
    const patches = [{ effectiveFrom: selectedMonthIso, newWeekly }];

    expect(patches).toHaveLength(1);
    expect(patches[0].newWeekly).toEqual([50, 75, 75, 75]);
  });

  it("month-only scope applied to history yields correct state at each month", () => {
    // April: base=50. May edit to 75 (month-only). June should revert to 50.
    const history = [{ effectiveFrom: "2026-04-01", weekly: [50, 50, 50, 50] }];
    const baseWeekly = [50, 50, 50, 50];
    const patches = [
      { effectiveFrom: "2026-05-01", newWeekly: [50, 75, 50, 50] }, // May: Q2 bumped
      { effectiveFrom: "2026-06-01", newWeekly: [...baseWeekly] },   // June: restore
    ];
    const result = applyPatches(history, patches);
    expect(result).toHaveLength(3);

    // Simulate getBaseEntryAt for May
    const mayEntry = getBaseEntryAt({ history: result }, "2026-05-15");
    expect(mayEntry.weekly[1]).toBe(75);

    // Simulate getBaseEntryAt for June
    const juneEntry = getBaseEntryAt({ history: result }, "2026-06-15");
    expect(juneEntry.weekly[1]).toBe(50);
  });

  it("applying multiple patches in sequence correctly updates the history", () => {
    const history = [{ effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] }];
    const patches = [
      { effectiveFrom: "2026-04-01", newWeekly: [50, 75, 75, 75] },
      { effectiveFrom: "2026-07-01", newWeekly: [50, 75, 100, 100] },
    ];
    const result = applyPatches(history, patches);
    expect(result).toHaveLength(3);
    expect(result[1].weekly[1]).toBe(75);
    expect(result[2].weekly[2]).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Interaction: getBaseEntryAt + latestPastEntry work correctly together
// (month-aware display vs. today-anchored edits use different lookup points)
// ─────────────────────────────────────────────────────────────────────────────

describe("month-aware vs today-anchored lookup semantics", () => {
  const history = [
    { effectiveFrom: "2026-01-05", weekly: [50, 50, 50, 50] },
    { effectiveFrom: "2026-05-01", weekly: [75, 75, 75, 75] }, // ADV.EDIT for May
    { effectiveFrom: "2026-06-01", weekly: [50, 50, 50, 50] }, // restore point
  ];
  const exp = { history };
  const TODAY = "2026-04-22";

  it("getBaseEntryAt returns May amount when viewing the May month in ADV.EDIT modal", () => {
    expect(getBaseEntryAt(exp, "2026-05-01").weekly[1]).toBe(75);
  });

  it("latestPastEntry returns the Jan entry when today is in April (May is future)", () => {
    expect(latestPastEntry(history, TODAY).effectiveFrom).toBe("2026-01-05");
  });

  it("regular card edit in April reads from Jan entry, never from May or June entries", () => {
    const latest = latestPastEntry(history, TODAY);
    expect(latest.effectiveFrom).toBe("2026-01-05");
    expect(latest.weekly[1]).toBe(50);
  });

  it("after May arrives, latestPastEntry picks up the May entry automatically", () => {
    expect(latestPastEntry(history, "2026-05-15").effectiveFrom).toBe("2026-05-01");
    expect(latestPastEntry(history, "2026-05-15").weekly[1]).toBe(75);
  });

  it("after June arrives, latestPastEntry picks up the restore entry", () => {
    expect(latestPastEntry(history, "2026-06-10").effectiveFrom).toBe("2026-06-01");
    expect(latestPastEntry(history, "2026-06-10").weekly[1]).toBe(50);
  });
});
