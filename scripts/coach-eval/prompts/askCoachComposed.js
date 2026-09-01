// Phase 1 component test (docs/TODO.md §2.L) — the COMPOSED mode prompt
// (shared persona + Ask Coach's own addendum + the feature guide), exactly
// as api/coach.js actually assembles it. Imports the real export, never a
// copied string.
//
// A small synthetic context block stands in for buildCoachContext()'s real
// per-user snapshot — this harness is probing STYLE (Metaphor Intensity),
// not data accuracy, so fabricated-but-clearly-labeled test figures are
// appropriate here in a way they would never be in production output. If a
// later phase needs to test data-grounding through this same harness, build
// that fixture from the real buildCoachContext() shape instead of hand-rolling
// another one.
import { ASK_COACH_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";

const SYNTHETIC_CONTEXT = `[TEST FIXTURE — not a real account]
Weekly net: $845. Net worth trend: +2.1% this month. Budget health: 62% of Needs+Lifestyle used, 9 days left in the pay period. Active goals: 2 (funding on track). Current fiscal week: the week of March 9th (week 10).`;

export default function ({ vars }) {
  return [
    { role: "system", content: `${ASK_COACH_SYSTEM_PROMPT}\n\n${SYNTHETIC_CONTEXT}\n\n${vars.calibrationInstruction}` },
    { role: "user", content: vars.userMessage },
  ];
}
