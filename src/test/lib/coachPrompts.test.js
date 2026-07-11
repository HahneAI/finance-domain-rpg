import { describe, it, expect } from "vitest";
import { COACH_PERSONA_PROMPT, buildNetWorthSystemPrompt } from "../../lib/coachPrompts.js";

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
