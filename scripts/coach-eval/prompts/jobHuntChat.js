// Phase 5 (docs/TODO.md §2.L), second slice — Job Hunt Assistant
// (JOB_HUNT_SYSTEM_PROMPT, src/lib/coachPrompts.js). Imports the real
// export, never a copied string.
//
// Matches JobHuntChatPanel.jsx's actual call shape: a real free-form user
// message (not a fixed trigger like Net Worth Trigger's card), Sonnet (not
// Haiku — this mode's own model choice from §18.E, unrelated to this
// calibration effort), buildJobHuntContext()'s own narrower bag (config/
// expenses/effectiveToday/includeBenefits, not buildCoachContext()'s
// goals/logs/futureWeeks shape).
//
// vars.variant picks fixtures/testAccount.js's buildJobHuntTestContext()
// runway variant ("healthy" ~70 days, "tight" ~9 days) — same identity,
// same applications, differing only in cash on hand, so a finding is
// attributable to runway pressure alone. This mode's own rubric anchor
// (JOB_HUNT_ADDENDUM, scored 2026-07-25) already calls for LESS metaphor
// than the default ("roughly one every several messages") — first live
// check of whether that holds, and whether Axis 2 (Urgency Escalation)
// moves the way it did for Ask Coach in Phase 4.
import { JOB_HUNT_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";
import { buildJobHuntTestContext } from "../fixtures/testAccount.js";

// vars.calibrationInstruction is OPTIONAL — added 2026-09-03 for Axis 3
// (Sentence Economy) extremes-discovery, same pattern as
// askCoachComposed.js. Omitting it samples natural behavior (already done
// for both runway variants, Phase 5's second slice); passing it forces a
// deliberate length extreme for this one response.
export default function ({ vars }) {
  const context = buildJobHuntTestContext({ variant: vars.variant ?? "healthy" });
  const calibrationBlock = vars.calibrationInstruction ? `\n\n${vars.calibrationInstruction}` : "";
  return [
    { role: "system", content: `${JOB_HUNT_SYSTEM_PROMPT}\n\n${context}${calibrationBlock}` },
    { role: "user", content: vars.userMessage },
  ];
}
