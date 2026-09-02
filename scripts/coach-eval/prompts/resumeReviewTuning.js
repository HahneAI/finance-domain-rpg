// Prompt-tuning harness for Résumé Review's Phase 5 finding (docs/TODO.md
// §2.L): the shipped addendum's Metaphor Intensity target (3, "light
// seasoning", matches default — no override) did NOT hold live — natural
// output used zero figurative language. This file tests CANDIDATE addendum
// wordings against the same fixture, side by side with the CURRENT shipped
// text, to find what actually elicits score-3 behavior before touching
// coachPrompts.js for real.
//
// Why this landed at 0 in the first place: COACH_PERSONA_PROMPT's own
// corner-man clause is a CAP ("no more than one such phrase per message"),
// never a floor — nothing anywhere tells the model to actually include a
// touch, only limits it if one appears. Ask Coach/Net Worth Trigger's
// natural score-3 touches happen because those are personal, conversational
// messages where a color word fits without being asked for. A résumé review
// is a technical, evaluative task — with nothing pulling the model toward
// one, it defaults to plain technical language.
//
// Each variant's BASE compliance instructions (exception to 2-3 sentences,
// no-Markdown, end on the one fix) are already verified working — held
// constant across all variants so any difference in metaphor use is
// attributable to the appended sentence alone, not a rewritten base.
import { COACH_PERSONA_PROMPT } from "../../../src/lib/coachPrompts.js";
import { RESUME_REVIEW_TEXT, RESUME_REVIEW_TARGET_ROLE } from "../fixtures/testAccount.js";

const RESUME_REVIEW_BASE = `This is Résumé Review mode: the user has pasted their résumé text and wants a skill-gap review against a target role, both provided below. Read the résumé, compare it against what the target role typically expects, and give a direct, specific review — call out weak or vague lines and say what would read stronger, name real gaps against the target role, and note real strengths worth keeping. Ground every point in the actual résumé text given, never a generic "add more action verbs" list that could apply to anyone's résumé. You are not a legal or HR advisor and this isn't a guarantee of interview success — if asked to draft the résumé from scratch, that's outside this mode's scope; say so and stick to reviewing what's there.\n\nThis mode is an exception to the two-to-three-sentence rule — a real review can run several short paragraphs, each grounded in one specific line from the résumé. The no-Markdown rule above still applies here: separate points with plain line breaks or short paragraphs, never asterisks or dash-bullets. End with the single most important thing to fix first, not a summary of everything already said.`;

const VARIANTS = {
  // The shipped addendum, verbatim — the baseline this is measured against.
  current: RESUME_REVIEW_BASE,

  // Soft nudge: names the gap in general terms (voice "disappearing"),
  // states the cap (one touch) and reason (more reads as forced), but
  // doesn't say WHERE the touch should land.
  soft: `${RESUME_REVIEW_BASE}\n\nEven on a technical review like this one, don't let your usual voice disappear entirely — work in one light corner-man touch somewhere across the review (a single word or short phrase, from your usual vocabulary, never explained, never a whole sentence). One touch is plenty on a document this technical; more would read as forced.`,

  // Firm: same cap, but names the natural placement (the closing "fix this
  // first" line, which every response so far has ended on regardless) and
  // gives one worked example to anchor the register.
  firm: `${RESUME_REVIEW_BASE}\n\nEven on a technical review like this one, keep exactly one light corner-man touch in the review — most naturally in the closing line where you name the one thing to fix first ("get this into your corner before anything else," for instance). A single word or short phrase only, worked in naturally, never explained, and never more than the one touch.`,
};

export default function ({ vars }) {
  const addendum = VARIANTS[vars.variant ?? "current"];
  const contextBlock = `Résumé text:\n${RESUME_REVIEW_TEXT}\n\nTarget role: ${RESUME_REVIEW_TARGET_ROLE}`;
  return [
    { role: "system", content: `${COACH_PERSONA_PROMPT}\n\n${addendum}\n\n${contextBlock}` },
    { role: "user", content: "Please review my resume against the target role." },
  ];
}
