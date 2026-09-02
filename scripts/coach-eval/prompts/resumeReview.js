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

export default function () {
  const contextBlock = `Résumé text:\n${RESUME_REVIEW_TEXT}\n\nTarget role: ${RESUME_REVIEW_TARGET_ROLE}`;
  return [
    { role: "system", content: `${RESUME_REVIEW_SYSTEM_PROMPT}\n\n${contextBlock}` },
    { role: "user", content: "Please review my resume against the target role." },
  ];
}
