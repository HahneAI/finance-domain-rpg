// Regression: asked "tell me about job loss mode," Coach fabricated an
// automatic trigger ("activates automatically when your Income panel shows
// zero or negative income for a pay period") that doesn't exist anywhere in
// the app — Job Loss Mode only ever turns on when the user deliberately picks
// "Lost My Job" from Life Events (JobLossEntry.jsx). The feature guide had no
// Job Loss Mode content at all, so Coach had nothing grounded to answer from
// and invented a plausible-sounding mechanism instead. These assertions pin
// the corrected, concise content in place.
import { describe, it, expect } from "vitest";
import { COACH_FEATURE_GUIDE } from "../../lib/coachFeatureGuide.js";

describe("COACH_FEATURE_GUIDE — Job Loss Mode", () => {
  it("states the mode is switched on deliberately via Life Events / Lost My Job", () => {
    expect(COACH_FEATURE_GUIDE).toMatch(/Life Events/);
    expect(COACH_FEATURE_GUIDE).toMatch(/Lost My Job/);
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
