// Phase 5 (docs/TODO.md §2.L), second slice — Résumé Review
// (RESUME_REVIEW_SYSTEM_PROMPT, src/lib/coachPrompts.js). Imports the real
// export, never a copied string.
//
// Matches ResumeReviewCard.jsx's actual call shape exactly: this mode's
// contextBlock isn't buildCoachContext() output at all — just
// `Résumé text:\n${resumeText}\n\nTarget role: ${roleForPrompt}` — and a
// fixed trigger message ("Please review my resume against the target
// role."), same idea as Net Worth Trigger's card speaking up on its own
// rather than answering a real question. Sonnet, this mode's own model
// choice from §18.E1.
//
// No variant knob — unlike Job Hunt/Net Worth Trigger, this mode has no
// severity/tier concept to flex against; the useful first check is simply
// whether the shipped default (rubric anchor Metaphor Intensity 3, scored
// 2026-07-25 but never live-verified) holds on real pasted résumé text.
import { RESUME_REVIEW_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";
import { RESUME_REVIEW_TEXT, RESUME_REVIEW_TARGET_ROLE } from "../fixtures/testAccount.js";

// vars.calibrationInstruction is OPTIONAL — added 2026-09-03 for Axis 3
// (Sentence Economy) extremes-discovery, same pattern as
// askCoachComposed.js. Omitting it samples natural behavior (already done,
// 3/3 repeat-verified in the Résumé Review prompt-tuning pass); passing it
// forces a deliberate length extreme for this one response — note this
// mode's own addendum already grants an exception to the shared
// two-to-three-sentence default ("a real review can run several short
// paragraphs"), so a score-1 override has to explicitly suspend that
// exception too, not just the shared rule.
export default function ({ vars } = {}) {
  const contextBlock = `Résumé text:\n${RESUME_REVIEW_TEXT}\n\nTarget role: ${RESUME_REVIEW_TARGET_ROLE}`;
  const calibrationBlock = vars?.calibrationInstruction ? `\n\n${vars.calibrationInstruction}` : "";
  return [
    { role: "system", content: `${RESUME_REVIEW_SYSTEM_PROMPT}\n\n${contextBlock}${calibrationBlock}` },
    { role: "user", content: "Please review my resume against the target role." },
  ];
}
