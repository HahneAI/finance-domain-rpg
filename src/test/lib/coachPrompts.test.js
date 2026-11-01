import { describe, it, expect } from "vitest";
import { COACH_PERSONA_PROMPT, ASK_COACH_SYSTEM_PROMPT, buildNetWorthSystemPrompt, RESUME_REVIEW_SYSTEM_PROMPT, JOB_HUNT_SYSTEM_PROMPT } from "../../lib/coachPrompts.js";

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
  it("Haiku 5.5 tuning (2026-10-29): one write after a write tool, no claimed action, real panel names, three figures", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/call the tool first and write your message once, after its result/);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/Never say you've drafted, proposed, logged or saved anything unless you called that tool in this same turn/);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/There is no Goals panel and no Expenses panel/);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/The current week's date is not one of the numbers a status check needs/);
  });

  it("includes the shared persona and the feature guide", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toContain(COACH_PERSONA_PROMPT);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/FEATURE REFERENCE/);
  });

  // 2026-10-29 (shotgun, §2.L): prose rules alone never stopped the fabricated counterfactual
  // (3 live occurrences), the ~10-number broad answer (DW-19), the weak closing action, or a
  // mid-sentence navigate_to call. Worked examples are the lever the rubric called for.
  it("carries worked examples for status, expense, what-if and tool-timing turns, marked illustrative", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/WORKED EXAMPLES/);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/illustrative only; never reuse them/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/must come from a simulate_ tool called in this same turn/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/never stopping mid-sentence to call a tool/i);
    // live 2026-10-29: the first draft's "from <date> to <date>" example made Coach invent a second
    // date when the simulation showed none — the same-date case is now spelled out.
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/never write a second date that isn't in the result/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/before you write any of your answer/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/Exactly three numbers, one takeaway/i);
    // live 2026-10-29: "call every tool first" made a broad answer fan out to 8 tools.
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/A status check or a broad question needs no lookup tools at all/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/quote the tool's differenceInWords exactly/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/never reply with only a link/i);
    // the examples sit before the feature guide, which stays last
    expect(ASK_COACH_SYSTEM_PROMPT.indexOf("WORKED EXAMPLES")).toBeLessThan(ASK_COACH_SYSTEM_PROMPT.indexOf("FEATURE REFERENCE"));
  });

  // 2026-10-29 (shotgun, §2.L / handoff §6 item 3): goal-setting as an identity conversation —
  // one question when the purpose is missing, never when it's already given.
  it("asks one identity question before proposing an open-ended goal, but not when the user gave what and how much", () => {
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/GOAL-SETTING/);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/ask one short question about what reaching it would make possible/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/never ask a question they've already answered/i);
    // live 2026-10-29: Coach guessed "week 34" / "week 29" while the tool returned week 49 — twice,
    // even when told to call first. The card already shows the real date, so the text states none.
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/your message must not state a finish date or say what it does to their other goals/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/Always make the proposal yourself with propose_goal/i);
    expect(ASK_COACH_SYSTEM_PROMPT).toMatch(/If the snapshot shows a chosen identity/i);
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

  // 2026-10-08: Red complied with "drop the corner-man phrasing" by swapping in other color
  // ("flying blind", "stop drifting") and ran the longest of the three tiers. The addendum now
  // bans all figurative language and restates the length rule, the same restate-it-locally
  // pattern that fixed Amber's stacked touches.
  it("bans every figure of speech on the red tier (not just boxing) and restates the length rule", () => {
    const prompt = buildNetWorthSystemPrompt("red");
    expect(prompt).toMatch(/every other figure of speech with it/i);
    expect(prompt).toMatch(/flying blind/i);
    expect(prompt).toMatch(/usual two to three sentences/i);
  });

  // 2026-10-22 (shotgun, Phase 5 lock): Red directness locked at 4 — natural draws opened on the
  // runway figure but softened it ("that's real, but…"). Verdict first, cause named, no softener.
  it("leads the red tier with the runway figure and its biggest driver, no reassurance first", () => {
    expect(buildNetWorthSystemPrompt("red")).toMatch(/lead with the runway figure and the single biggest thing driving it/i);
  });

  // 2026-10-22: production's Green context (CoachNetWorthCard → buildCoachContext) carries only the
  // current numbers — no earlier figure — yet the old addendum asked Coach to "name the specific
  // improvement", so it invented deltas ("a real shift from where you were").
  // 2026-10-22: Green stacked two touches ("the corner work paid off" + "765 left to roll with") and
  // both Amber and Green invented panel names ("Expenses panel", "Goals panel").
  it.each(["amber", "green"])("caps tier %s at one corner-man touch and ends on a real, on-screen panel name", (tier) => {
    const prompt = buildNetWorthSystemPrompt(tier);
    expect(prompt).toMatch(/at most one light corner-man phrase/i);
    expect(prompt).toMatch(/Home \(where goals and Claim Dates live\), Income, Upkeep \(expenses and loans\), or Log/);
    expect(prompt).not.toMatch(/Budget panel|Expenses panel|Goals panel/i);
  });

  it("tells the green tier it has no 'before' figure and must not size the change", () => {
    const prompt = buildNetWorthSystemPrompt("green");
    expect(prompt).toMatch(/shows only where things stand now, not where they were/i);
    expect(prompt).toMatch(/never quote a "before" figure or size the change/i);
  });

  it("gives Green a grounded comparison only when the card has a persisted 'before' (2026-10-29)", () => {
    const withHistory = buildNetWorthSystemPrompt("green", { hasEarlierCheckIn: true });
    expect(withHistory).toMatch(/"Earlier check-in" line in the data below holds the real figures/);
    expect(withHistory).toMatch(/never compute a percentage change, a difference or any figure that isn't written in the data/);
    expect(withHistory).not.toMatch(/never quote a "before" figure/);
    // Without history the prompt is the plain, live-verified Green addendum, byte for byte.
    expect(buildNetWorthSystemPrompt("green", { hasEarlierCheckIn: false })).toBe(buildNetWorthSystemPrompt("green"));
    expect(buildNetWorthSystemPrompt("green")).not.toMatch(/Earlier check-in/);
    // The flag only ever changes Green.
    expect(buildNetWorthSystemPrompt("amber", { hasEarlierCheckIn: true })).toBe(buildNetWorthSystemPrompt("amber"));
  });

  it("never catastrophizes per its own instruction on the red tier", () => {
    expect(buildNetWorthSystemPrompt("red")).toMatch(/never catastrophize/i);
  });

  // Regression (2026-09-06, docs/TODO.md §2.L Phase 5): live-verified 3/3
  // identical that the amber tier stacked at least two figurative touches
  // ("eating," "next round," "breathing room") in one message and named
  // multiple issues, violating COACH_PERSONA_PROMPT's own "at most one...
  // never stacked" rule — the shared rule alone wasn't holding for this
  // tier. Amber's addendum now reinforces the one-touch cap and the
  // single-lever instruction explicitly, the same way the red tier already
  // reinforces "drop the corner-man phrasing" rather than relying on the
  // persona clause alone.
  it("caps the amber tier at exactly one figurative touch and one named lever", () => {
    const prompt = buildNetWorthSystemPrompt("amber");
    expect(prompt).toMatch(/exactly one specific lever/i);
    expect(prompt).toMatch(/at most one light corner-man phrase/i);
  });
});

describe("RESUME_REVIEW_SYSTEM_PROMPT", () => {
  it("includes the shared persona", () => {
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toContain(COACH_PERSONA_PROMPT);
  });

  // Live-verified 2026-09-02 (docs/TODO.md §2.L Phase 5) that the shipped
  // Metaphor Intensity 3 target didn't hold on its own — COACH_PERSONA_PROMPT's
  // corner-man clause is a cap, not a floor, and this mode's technical/
  // evaluative task gave the model nothing else to reach for one. This
  // instruction is a prompt-tuning finding (scripts/coach-eval/prompts/
  // resumeReviewTuning.js's "firm" variant, 3/3 repeat-verified), not a guess
  // — it names both the placement (the closing line) and gives one worked
  // example, which is what made the touch land on real vocabulary-bank
  // language instead of the model inventing its own.
  it("names the closing line as where its one allowed corner-man touch belongs, with a worked example", () => {
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/keep exactly one light corner-man touch/i);
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/most naturally in the closing line/i);
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/never explained, and never more than the one touch/i);
  });

  // 2026-10-06 repeat-verify: 2 of 3 natural draws restated the leadership gap
  // in the closing line; 2 of 3 called "2021 to 2026" a typo because no date
  // was ever supplied. The prompt now bans the recap and anchors dates to Today.
  it("bans restating a named gap in the closing line and anchors date judgments to the given Today", () => {
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/don't restate a gap you already named/i);
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/only flag a date as an error if it falls after today/i);
  });

  it("still keeps the exception to the two-to-three-sentence rule and the no-Markdown rule", () => {
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/exception to the two-to-three-sentence rule/i);
    expect(RESUME_REVIEW_SYSTEM_PROMPT).toMatch(/never asterisks or dash-bullets/i);
  });
});

describe("JOB_HUNT_SYSTEM_PROMPT", () => {
  it("names only real places in the New Job Season view (2026-10-29)", () => {
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/Application Tracker in the Job Search section/);
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/never an "Applications panel"/);
  });

  it("routes runway what-ifs to simulate_runway_change instead of estimating", () => {
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/call simulate_runway_change and quote its differenceInWords/i);
  });

  // 2026-10-06 repeat-verify: the "follow up on first" pick flipped between
  // draws on identical data, and one draw invented elapsed time.
  it("commits to one pick (live conversation outranks a quiet application) and forbids estimating elapsed time", () => {
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/give one pick and commit to it/i);
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/scheduled interview or other live conversation outranks/i);
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/never estimate elapsed time yourself/i);
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/use the weeks figure given with the Cash Runway line/i);
    // 2026-10-08: ~1 in 4 draws cited Riverbend's applied date for Cascade (context lists newest first).
    expect(JOB_HUNT_SYSTEM_PROMPT).toMatch(/never one from another application's line/i);
  });
});
