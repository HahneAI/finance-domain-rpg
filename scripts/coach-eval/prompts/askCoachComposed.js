// Composed mode prompt (shared persona + Ask Coach's own addendum + the
// feature guide), exactly as api/coach.js actually assembles it. Imports
// the real export, never a copied string.
//
// vars.severity picks which real account variant to run against, via
// fixtures/testAccount.js's buildTestContext() — never cached/hand-typed
// text, so a variant can't go stale relative to what buildCoachContext()
// actually produces. "near-limit"/"healthy" are chosen to land cleanly on
// buildCoachContext's own spendRatio thresholds (>=0.75 "watch spend",
// <0.5 "well-managed"), not arbitrary numbers — see docs/TODO.md §2.L
// Phase 4. Omitting vars.severity uses the same default account Phase 1-3
// tested against, so those configs still work unchanged.
//
// vars.calibrationInstruction is OPTIONAL — Phase 1-3 used it to force an
// extreme; Phase 4 deliberately omits it to sample natural behavior driven
// only by the real data difference between severity variants.
import { ASK_COACH_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";
import { buildTestContext } from "../fixtures/testAccount.js";

const CONTEXT_VARIANTS = {
  default: () => buildTestContext(),
  "near-limit": () => buildTestContext({ weeklyIncome: 845, avgWeeklySpend: 830 }),
  healthy: () => buildTestContext({ weeklyIncome: 845, avgWeeklySpend: 85 }),
};

export default function ({ vars }) {
  const buildContext = CONTEXT_VARIANTS[vars.severity ?? "default"] ?? CONTEXT_VARIANTS.default;
  const context = buildContext();
  const calibrationBlock = vars.calibrationInstruction ? `\n\n${vars.calibrationInstruction}` : "";
  return [
    { role: "system", content: `${ASK_COACH_SYSTEM_PROMPT}\n\n${context}${calibrationBlock}` },
    { role: "user", content: vars.userMessage },
  ];
}
