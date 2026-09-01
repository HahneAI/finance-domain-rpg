// Phase 1 component test (docs/TODO.md §2.L) — the SHARED base component,
// isolated from any mode-specific addendum. Imports the real export, never a
// copied string, so this can never silently drift from what ships.
import { COACH_PERSONA_PROMPT } from "../../../src/lib/coachPrompts.js";

export default function ({ vars }) {
  return [
    { role: "system", content: `${COACH_PERSONA_PROMPT}\n\n${vars.calibrationInstruction}` },
    { role: "user", content: vars.userMessage },
  ];
}
