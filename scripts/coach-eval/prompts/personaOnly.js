// Phase 1 component test (docs/TODO.md §2.L) — the SHARED base component,
// isolated from any mode-specific addendum. Imports the real export, never a
// copied string, so this can never silently drift from what ships.
//
// Now carries the same shared test-account context as askCoachComposed.js
// (fixtures/testAccount.js) — the first run of this file had NO data at
// all, and the model deflected in both directions rather than demonstrating
// style, even overriding an explicit calibration instruction, because its
// own grounding rule ("ground every message in the real data... never
// generic affirmations") outranks a bare style directive when there's
// nothing to ground in. That result was correct behavior from the persona,
// not a usable calibration sample — this fixture fixes the test, not the
// prompt.
import { COACH_PERSONA_PROMPT } from "../../../src/lib/coachPrompts.js";
import { buildTestContext } from "../fixtures/testAccount.js";

const TEST_CONTEXT = buildTestContext();

export default function ({ vars }) {
  return [
    { role: "system", content: `${COACH_PERSONA_PROMPT}\n\n${TEST_CONTEXT}\n\n${vars.calibrationInstruction}` },
    { role: "user", content: vars.userMessage },
  ];
}
