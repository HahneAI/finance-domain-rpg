// Prompt-tuning harness for Résumé Review's Phase 5 finding (docs/TODO.md
// §2.L). HISTORICAL NOTE (2026-09-02): this is how the "firm" variant below
// was found and repeat-verified before it got applied to coachPrompts.js's
// real RESUME_REVIEW_ADDENDUM — "firm" IS the shipped text now, sourced live
// from RESUME_REVIEW_SYSTEM_PROMPT rather than duplicated, so this file can
// never silently drift from what's actually live. "pre-fix" and "soft" stay
// hardcoded on purpose — they never shipped, so there's nothing live to
// import them from; kept here as a record of what was tried and rejected.
//
// Why the original shipped text landed at Metaphor Intensity 0, not the
// target 3: COACH_PERSONA_PROMPT's own corner-man clause is a CAP ("no more
// than one such phrase per message"), never a floor — nothing told the model
// to actually include a touch, only limited it if one appeared. Ask
// Coach/Net Worth Trigger's natural score-3 touches happen because those are
// personal, conversational messages where a color word fits without being
// asked for. A résumé review is a technical, evaluative task — with nothing
// pulling the model toward one, it defaulted to plain technical language.
import { COACH_PERSONA_PROMPT, RESUME_REVIEW_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";
import { RESUME_REVIEW_TEXT, RESUME_REVIEW_TARGET_ROLE } from "../fixtures/testAccount.js";

const RESUME_REVIEW_BASE = `This is Résumé Review mode: the user has pasted their résumé text and wants a skill-gap review against a target role, both provided below. Read the résumé, compare it against what the target role typically expects, and give a direct, specific review — call out weak or vague lines and say what would read stronger, name real gaps against the target role, and note real strengths worth keeping. Ground every point in the actual résumé text given, never a generic "add more action verbs" list that could apply to anyone's résumé. You are not a legal or HR advisor and this isn't a guarantee of interview success — if asked to draft the résumé from scratch, that's outside this mode's scope; say so and stick to reviewing what's there.\n\nThis mode is an exception to the two-to-three-sentence rule — a real review can run several short paragraphs, each grounded in one specific line from the résumé. The no-Markdown rule above still applies here: separate points with plain line breaks or short paragraphs, never asterisks or dash-bullets. End with the single most important thing to fix first, not a summary of everything already said.`;

const contextBlock = `Résumé text:\n${RESUME_REVIEW_TEXT}\n\nTarget role: ${RESUME_REVIEW_TARGET_ROLE}`;

const VARIANTS = {
  // What shipped before 2026-09-02, hardcoded — no longer live anywhere, so
  // nothing to import. This is the sample that came back with zero
  // figurative language, the finding that started this file.
  "pre-fix": `${COACH_PERSONA_PROMPT}\n\n${RESUME_REVIEW_BASE}\n\n${contextBlock}`,

  // Rejected: names the gap in general terms (voice "disappearing"), states
  // the cap (one touch) and reason (more reads as forced), but doesn't say
  // WHERE the touch should land. Got one touch, but an off-vocabulary,
  // self-invented one ("in the corner of a hiring manager's yes pile") —
  // never shipped.
  soft: `${COACH_PERSONA_PROMPT}\n\n${RESUME_REVIEW_BASE}\n\nEven on a technical review like this one, don't let your usual voice disappear entirely — work in one light corner-man touch somewhere across the review (a single word or short phrase, from your usual vocabulary, never explained, never a whole sentence). One touch is plenty on a document this technical; more would read as forced.\n\n${contextBlock}`,

  // Shipped 2026-09-02 — same cap, but names the natural placement (the
  // closing "fix this first" line, which every response so far has ended on
  // regardless) and gives one worked example to anchor the register. 3/3
  // repeat-verified clean before being applied to coachPrompts.js; sourced
  // live from the real export now, not a duplicate string.
  firm: `${RESUME_REVIEW_SYSTEM_PROMPT}\n\n${contextBlock}`,
};

export default function ({ vars }) {
  const systemContent = VARIANTS[vars.variant ?? "firm"];
  return [
    { role: "system", content: systemContent },
    { role: "user", content: "Please review my resume against the target role." },
  ];
}
