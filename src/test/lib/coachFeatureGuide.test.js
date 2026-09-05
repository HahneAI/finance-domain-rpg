// Regression: asked "tell me about my new job season," Coach fabricated an
// automatic trigger ("activates automatically when your Income panel shows
// zero or negative income for a pay period") that doesn't exist anywhere in
// the app — New Job Season only ever turns on when the user deliberately picks
// "Quit My Job" from Life Events (NewJobSeasonEntry.jsx). The feature guide had no
// New Job Season content at all, so Coach had nothing grounded to answer from
// and invented a plausible-sounding mechanism instead. These assertions pin
// the corrected, concise content in place.
import { describe, it, expect } from "vitest";
import { COACH_FEATURE_GUIDE } from "../../lib/coachFeatureGuide.js";

// Regression (2026-09-05): the Budget panel was renamed to "Upkeep" in all
// user-visible text (drift-app-warden §8 F178/DW-25, 2026-09-04), moving
// NAV_ITEMS, BOTTOM_NAV, HomePanel's tile, and navigate_to's panel enum —
// but this file's own hand-authored panel-by-panel prose still called it
// "Budget" in six places (the panel list, the "## Budget" heading, both
// paragraphs describing it, and two "Home, Income, and Budget" cross-refs).
// Live-verified against a production build only checked what renders on
// screen; this file is Coach's own words about the app, never rendered
// directly, so no live sweep could have caught it — only a targeted read.
it("names the panel Upkeep, not Budget, everywhere in the panel-by-panel guide", () => {
  expect(COACH_FEATURE_GUIDE).toMatch(/Home, Income, Upkeep, Log, and Account/);
  expect(COACH_FEATURE_GUIDE).toMatch(/## Upkeep/);
  expect(COACH_FEATURE_GUIDE).not.toMatch(/\bBudget\b/);
});

describe("COACH_FEATURE_GUIDE — New Job Season", () => {
  it("states the mode is switched on deliberately via Life Events / Quit My Job", () => {
    expect(COACH_FEATURE_GUIDE).toMatch(/Life Events/);
    expect(COACH_FEATURE_GUIDE).toMatch(/Quit My Job/);
  });

  it("explicitly rules out the fabricated auto-trigger from a zero/low paycheck", () => {
    expect(COACH_FEATURE_GUIDE).toMatch(/never turns on by itself off a low or zero paycheck/i);
  });

  it("names the runway-countdown mechanism instead of paycheck projections", () => {
    expect(COACH_FEATURE_GUIDE).toMatch(/runway countdown/i);
  });

  it("names the Back to Work exit path", () => {
    expect(COACH_FEATURE_GUIDE).toMatch(/Back to Work/);
  });

  it("instructs a short answer for this topic specifically, unlike the five main panels", () => {
    expect(COACH_FEATURE_GUIDE).toMatch(/answer in a couple of plain sentences/i);
  });
});
