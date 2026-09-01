// Phase 1 component test (docs/TODO.md §2.L) — the COMPOSED mode prompt
// (shared persona + Ask Coach's own addendum + the feature guide), exactly
// as api/coach.js actually assembles it. Imports the real export, never a
// copied string.
//
// The context block comes from fixtures/testAccount.js — real
// buildCoachContext() output over a fabricated account, not a hand-typed
// text block. Replaces this file's earlier hand-typed SYNTHETIC_CONTEXT
// (harmless for a style-only test, but redundant with a real, shared
// fixture now that one exists — see fixtures/testAccount.js's own header).
import { ASK_COACH_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";
import { buildTestContext } from "../fixtures/testAccount.js";

const TEST_CONTEXT = buildTestContext();

export default function ({ vars }) {
  return [
    { role: "system", content: `${ASK_COACH_SYSTEM_PROMPT}\n\n${TEST_CONTEXT}\n\n${vars.calibrationInstruction}` },
    { role: "user", content: vars.userMessage },
  ];
}
