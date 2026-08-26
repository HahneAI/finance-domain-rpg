import { describe, it, expect } from "vitest";
import { COACH_PERSONA_PROMPT, ASK_COACH_SYSTEM_PROMPT, buildNetWorthSystemPrompt } from "../../lib/coachPrompts.js";

describe("COACH_PERSONA_PROMPT", () => {
  it("explicitly instructs against combative language, per docs/coach-personality-rubric.md", () => {
    // The prompt necessarily *names* what's banned to instruct against it —
    // assert the prohibition exists, not that the words are literally absent.
    expect(COACH_PERSONA_PROMPT).toMatch(/never anything about opponents, knockouts, or winning\/losing/i);
  });

  it("caps metaphor to one phrase per message (rubric anchor: 3/5, light seasoning)", () => {
    expect(COACH_PERSONA_PROMPT).toMatch(/no more than one such phrase per message/i);
  });

  it("instructs a one-action close and a tax/legal/investment advice guardrail", () => {
    expect(COACH_PERSONA_PROMPT).toMatch(/one concrete action/i);
    expect(COACH_PERSONA_PROMPT).toMatch(/tax, legal, or investment advice/i);
  });

  it("forbids Markdown formatting — every chat surface renders raw text, not HTML/Markdown", () => {
    expect(COACH_PERSONA_PROMPT).toMatch(/never Markdown/i);
    expect(COACH_PERSONA_PROMPT).toMatch(/do not use asterisks/i);
  });

  it("instructs neutral, non-judgmental handling of named expenses", () => {
    expect(COACH_PERSONA_PROMPT).toMatch(/never call an individual cost wasteful, excessive, or embarrassing/i);
  });
});

describe("ASK_COACH_SYSTEM_PROMPT", () => {
  it("includes the shared persona and the feature guide", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toContain(COACH_PERSONA_PROMPT);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/FEATURE REFERENCE/);
  });

  it("instructs leading with real personal data over restating the guide, across all panels", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/applies across all five panels/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/not a script to repeat near-verbatim/i);
  });

  // Regression: a live test showed Coach stacking two non-boxing idioms
  // ("leaving room to breathe," then "crowding you or staying in its lane")
  // to restate the same point twice — the old cap only named boxing-specific
  // vocabulary, leaving general figurative language an open loophole.
  it("extends the one-figurative-touch cap to any idiom, not just boxing-flavored phrasing", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/isn't limited to corner-man phrasing specifically/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/don't restate it a second time in different colorful language/i);
  });

  // Per explicit instruction: any week/pay-period/date mention Coach generates
  // itself must pair a real, non-abbreviated date with the period number, and
  // use "week" only for weekly-pay accounts — everything else mirrors the
  // context data's own "paycheck"/"month" terminology.
  it("instructs pairing dates with period numbers, full month names, and schedule-correct terminology", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/full month name, never abbreviated/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/mirror it exactly rather than defaulting to "week" out of habit/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/"paycheck n" or "month n" instead/i);
  });

  // Regression: "Give me a full rundown of my Home panel" produced a
  // two-screen wall of text — Coach explained what every tile meant *in
  // addition to* stating it, and that explanatory clause compounded across
  // seven-plus tiles. Narrow single-metric questions earned that depth in
  // earlier tests; a broad "everything" question shouldn't repeat it seven
  // times over.
  it("instructs compressed treatment for broad multi-topic questions, with narrow questions still getting full explanations", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/do not explain what each metric means or walk every tile in turn/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/inviting a follow-up for whatever you didn't cover/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/only a narrow \*scope\* \(one number, one panel\) earns the fuller per-item explanation/i);
  });

  // Regression: re-tested as "Break down my home panel please" — still a
  // two-screen wall, because the trigger condition was written as a list of
  // example phrases ("everything," "full rundown," "how am I doing overall")
  // that didn't literally include this rephrasing. The condition now keys off
  // scope (touches most/all tiles) rather than exact wording, and explicitly
  // overrides the user's own verb ("break down," "explain") when the scope
  // is still broad.
  it("keys the broad-question trigger off scope, not exact phrasing, and overrides the user's own verb", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/break down my Home panel/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/this holds even when the user's own wording says "break down," "explain," or "walk me through"/i);
  });

  // Regression: re-tested "Break down my home panel please" after the
  // compression fix landed — length was fixed, but the goal timeline mentions
  // regressed to vague relative phrasing ("in about a week," "around late
  // December") instead of the paired date/period format required elsewhere.
  // The compression instruction was silent on precision, so the model traded
  // it away along with length. Clarify that compression trims tile coverage
  // and per-item explanation, not date-pairing precision.
  it("clarifies that broad-answer compression doesn't loosen date-pairing precision", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/not loosening precision on the dates you do state/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/still gets the same full date-pairing treatment as a narrow one/i);
  });

  // Regression: asked for the most expensive line item, Coach stated Gas
  // ($85) as the biggest, then mid-message: "Food is actually your highest,
  // my mistake" — a real comparison slip, made worse by narrating it aloud.
  it("instructs silent self-correction instead of narrating a caught mistake", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/never narrate the correction to the user/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/"my mistake," "actually, wait"/);
  });
});

describe("buildNetWorthSystemPrompt", () => {
  it("throws on an unknown tier rather than silently returning a bad prompt", () => {
    expect(() => buildNetWorthSystemPrompt("purple")).toThrow(/Unknown net worth signal tier/);
  });

  it.each(["amber", "red", "green"])("includes the shared persona for tier %s", (tier) => {
    expect(buildNetWorthSystemPrompt(tier)).toContain(COACH_PERSONA_PROMPT);
  });

  it("explicitly drops corner-man phrasing for the red tier", () => {
    expect(buildNetWorthSystemPrompt("red")).toMatch(/drop the corner-man phrasing/i);
  });

  it("names the three allowed deep-link actions for the red tier", () => {
    const prompt = buildNetWorthSystemPrompt("red");
    expect(prompt).toMatch(/Triage Expenses/);
    expect(prompt).toMatch(/Review Goals/);
    expect(prompt).toMatch(/Life Events/);
  });

  it("never catastrophizes per its own instruction on the red tier", () => {
    expect(buildNetWorthSystemPrompt("red")).toMatch(/never catastrophize/i);
  });
});
