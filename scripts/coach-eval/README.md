# Coach Personality Eval Harness

Build-side scaffolding for `docs/TODO.md` §2.L, implementing the process in
`docs/coach-personality-rubric.md`'s "The End Goal" and "Calibration
Methodology" sections. Read both before touching this folder — this README
doesn't repeat their reasoning.

## What's here

- `promptfooconfig.yaml` — Phases 1-3 (extremes discovery + repeat-verify
  of the two locked models). Read its own `description` field first.
- `promptfooconfig.phase4.yaml` — Phase 4 (within-mode severity flexing).
- `promptfooconfig.phase5.yaml` — Phase 5, first slice (Net Worth Trigger's
  three tiers). `promptfooconfig.phase5b.yaml` — Phase 5, second slice (Job
  Hunt Chat). `promptfooconfig.phase5c.yaml` — Phase 5, third slice (Résumé
  Review), kept separate from Job Hunt rather than one shared file: with two
  prompts and no per-test prompt scoping, promptfoo runs every `tests:`
  entry against every `prompts:` entry, so one file would silently multiply
  call count (2 Job Hunt tests × 2 prompts = 4 calls instead of 2, plus the
  Résumé Review test running against Job Hunt's prompt too) instead of the 2
  + 1 = 3 actually spent. Each phase/slice's config stays a separate file on
  purpose — keeps scope and call-count independently auditable rather than
  growing one monolithic config; follow the same `promptfooconfig.phaseNx.yaml`
  naming pattern for the next slice/phase, `-c <file>` to run one.
  `promptfooconfig.phase5c-tuning.yaml`/`.phase5c-verify.yaml` — not a phase
  slice, a prompt-TUNING pass once Phase 5c found Résumé Review's shipped
  target didn't hold: tests candidate addendum wordings
  (`prompts/resumeReviewTuning.js`) against the same fixture to find what
  actually reaches the target, before touching `coachPrompts.js`. Same
  separate-file-per-pass reasoning as above.
  `promptfooconfig.phase5d.yaml` — Axis 3 (Sentence Economy)'s first
  extremes-discovery pass: `askCoachComposed.js`, 3 models × {elicit-1,
  natural-3, elicit-5}, same account/question as every other Ask Coach
  calibration pass in this harness. `promptfooconfig.phase5d-networth.yaml`/
  `-jobhunt.yaml`/`-resume.yaml` — the same axis extended to the other three
  built modes, each on its own shipped model, elicit-1/elicit-5 only (each
  mode's score-3 natural default already existed from earlier Phase 5
  slices, not re-spent). `netWorthTrigger.js`/`jobHuntChat.js`/
  `resumeReview.js` all gained an optional `vars.calibrationInstruction`
  for this pass, same pattern `askCoachComposed.js` already had.
- `prompts/*.js` — prompt loaders. Each one `import`s a real, live export
  from `src/lib/coachPrompts.js` — never a hand-copied prompt string — so
  this harness can never silently test a stale prompt. One file per
  addressable prompt *component* (the shared persona alone, a specific
  mode's full composition), not one file per mode — this mirrors how
  `coachPrompts.js` itself is actually built (persona + swappable addendum),
  so a regression in the shared base shows up once instead of once per mode.
  `askCoachComposed.js` takes an optional `vars.severity` to pick a real
  account-data variant (Phase 4); `netWorthTrigger.js` takes `vars.tier`
  (`amber`/`red`/`green`) and matches `CoachNetWorthCard.jsx`'s real call
  shape (fixed trigger message, narrower `buildCoachContext()` params).
  `jobHuntChat.js` takes `vars.variant` (`healthy`/`tight`) and matches
  `JobHuntChatPanel.jsx`'s real call shape (a real free-form user message,
  `claude-sonnet-5`, `buildJobHuntContext()`'s own narrower bag).
  `resumeReview.js` takes no vars — matches `ResumeReviewCard.jsx`'s real
  call shape exactly: a plain `Résumé text:\n...\n\nTarget role: ...` string,
  not `buildCoachContext()` output at all, and a fixed trigger message.
  `resumeReviewTuning.js` is the tuning-only sibling of `resumeReview.js` —
  same fixture/call shape, but `vars.variant` (`current`/`soft`/`firm`)
  swaps in a candidate addendum sentence instead of always importing the
  shipped `RESUME_REVIEW_ADDENDUM`, so alternate wordings can be tested
  without editing `coachPrompts.js`.
- `fixtures/testAccount.js` — a fabricated-but-structurally-real test
  account run through the real `buildCoachContext()`, not hand-typed text.
  `buildTestContext({ weeklyIncome, avgWeeklySpend, newJobSeasonMode,
  runwayDays })` — vary these to get a different real scenario (spend
  ratio for Phase 4's severity rows, New Job Season/runway for Red's real
  trigger condition in Phase 5) — reusable the same way for any future
  scenario test. `buildWeeklyBriefingContext({ weeklyIncome, avgWeeklySpend,
  goalTarget })` — a second fixture built ahead of the feature it's for
  (Weekly Pre-Game Briefing, `docs/TODO.md` §8.A — not built yet). Unlike
  `buildTestContext()`, this one funds a real goal against a real 8-week
  `futureWeeks`/`timelineWeekNets` series (real `Date` objects, not date
  strings — `computeGoalTimeline()` calls `getPhaseIndex(week.weekEnd)`,
  which needs `.getFullYear()`), so `computeGoalTimeline()` has something
  genuine to project instead of the goal-free shortcut the other fixture
  takes. Ready to plug into a real prompt loader the moment that feature
  exists.
  `buildToolTestAccount()` / `buildToolTestContext()` (2026-09-02) — a third
  fixture, for Coach's drill-down tools (`src/lib/coachTools.js`), which take
  the prop bag `AskCoachPanel` assembles rather than a rendered context
  string. It needs richer weeks than a label alone (`grossPay`/`taxableGross`/
  `payrollDeductions`, which `get_week_breakdown` reads), so it runs the real
  `buildYear()` over a real config and derives income, spend and log impacts
  through real `computeNet()`/`computeRemainingSpend()`/`calcEventImpact()` —
  the same "fake inputs, real functions" principle, one layer deeper. It is a
  SIBLING account, deliberately tuned to the same identity (~$845/wk net,
  $520/wk baseline spend, $400/wk rent, 2026-03-09, fiscal week 10) rather
  than the same object: adding goals/logs/expenses to `buildTestContext()`
  would change its prompt text and invalidate Phase 4/5's word-for-word
  repeat comparisons. Its bag is a superset of `buildCoachContext()`'s
  params, so `buildToolTestContext()` renders a context string for that same
  account — a prompt test and a tool test can run against one account.
  Locked by `src/test/lib/coachEvalFixture.test.js`.
  **`REAL_ALL_WEEKS` (2026-09-02, found reviewing the sister branch's F167/
  F168 period-label fix)** — every fixture in this file, not just this one,
  now shares one real `buildYear()` calendar. `allWeeks` used to be
  label-shaped (`{ idx, weekEnd: "2026-03-01" }` — a date string) for
  `buildTestContext()`/`buildWeeklyBriefingContext()`, which was sufficient
  for `buildCoachContext()` to run without erroring but NOT sufficient for
  `formatPeriodWithDate()` to produce its real "the week of March 9th, 2026
  (week 11)" text — `getPayPeriodBounds()` needs real `weekStart`/
  `isPayWeek`/`payPeriodEndDate` fields it never had, so it silently fell
  back to a bare "week 11" on every call. Every Phase 1-5 finding that
  quoted Coach citing a date was elicited against that degraded fallback;
  none of the recorded findings turned out to hinge on it, but every fixture
  produces the real, fuller text now. See `docs/TODO.md` §2.L for the full
  writeup of why this matters (a live example of exactly the "vague guessed
  date" failure shape the sister branch's own regression test targets).
  `buildTestAccountArgs()` / `buildWeeklyBriefingAccountArgs()` — the raw
  argument bags the two original fixtures feed `buildCoachContext()`. Both
  `build*Context()` functions are now one-line wrappers over them, so their
  output is unchanged by construction rather than by inspection. Need a bag
  instead of a string? Take it from these; don't rebuild one.
  No fixture was built for Burnout Sentinel's "work-pattern half"
  in the same pass — `buildCoachContext()` has no `weekConfirmations` param,
  `logs` only ever surfaces the single most-recent entry (never a streak),
  and `EVENT_TYPES` has no overtime/extra-shift category — faking that
  signal would mean dressing up fabricated data to look real, not building
  a fixture from a real code path.
  `buildJobHuntTestAccount()`/`buildJobHuntTestContext({ variant })`
  (2026-09-02) — a fifth fixture, for Phase 5's Job Hunt Chat slice.
  `buildJobHuntContext()` (`aiContext.js`) takes a different bag entirely
  (`{ config, expenses, effectiveToday, includeBenefits }`, not the
  goals/logs/futureWeeks shape above), so this isn't a variant of the
  existing fixtures. Two variants — `"healthy"` (~70-day runway) and
  `"tight"` (~9-day runway) — sharing the same applications list, differing
  only in `newJobSeasonCashOnHand`, so a finding is attributable to runway
  pressure alone. `RESUME_REVIEW_TEXT`/`RESUME_REVIEW_TARGET_ROLE` — for
  Résumé Review, whose real `contextBlock` isn't `buildCoachContext()`
  output at all, just a plain string (`ResumeReviewCard.jsx`), so the
  fixture IS the literal résumé text — deliberately not spotless, so a real
  review has something concrete to engage with.
- `results/` — gitignored. Raw run output is an ephemeral working file;
  once you've read a run's output and decided what it means, write the
  *finding* into `coach-personality-rubric.md` (filling in a `TODO` cell,
  adding a "Known Limitations" entry, etc.) — that's the durable artifact,
  not the JSON dump.
- `toolLoopLiveTest.mjs` — NOT part of this promptfoo harness; a separate,
  standalone script from the sister `coach-mcp-tools` branch (merged into
  Version-control 2026-09-02) testing a different axis: does Coach select
  the right drill-down/simulation tool with sensible arguments, not
  personality/register. promptfoo has no hook for running a tool loop (emit
  tool_use → execute → feed result back → real answer), so this drives it
  directly against the real live exports (`ASK_COACH_SYSTEM_PROMPT`,
  `COACH_TOOLS`, `buildCoachContext()`, `executeCoachTool()`), sharing this
  same `fixtures/testAccount.js` (specifically `buildToolTestAccount()`) and
  the same `AI_ADMIN_COACH_TEST_KEY`/no-retry budget discipline this README
  documents below. Findings so far: tool selection correct 4/4 then 5/5 as
  the tool count grew; a real period-label bug found and fixed (see
  `REAL_ALL_WEEKS` above); a "fabricated counterfactual" pattern found three
  times (Coach inventing a plausible-sounding hypothetical impact instead of
  calling the simulation tool that would answer it for real) — tool
  *availability* doesn't prevent this, only tool *use* does, still open.
  Full writeup: `docs/coach-entry-points.md` §1, `drift-app-warden.md` §21
  F168-F174.
- `personalityToolLoopLiveTest.mjs` (2026-09-03) — this harness's own tool-loop-capable
  sibling, same reason as `toolLoopLiveTest.mjs` above (promptfoo can't drive a tool round). A
  DIRECTIONAL rerun of the Phase 1-4 Ask Coach baseline under `AskCoachPanel.jsx`'s real
  production call shape (`detailAvailableViaTools: true` + `COACH_TOOLS`), not a new phase or a
  fresh calibration — reuses `buildTestAccountArgs()` (Phase 2/3's default fixture and Phase 4's
  exact near-limit override) and the exact same question, changing only the trim flag + tools, to
  check whether introducing them shifted Metaphor Intensity/tone. Finding: Metaphor Intensity held
  exactly (same phrase, same count, both samples); Axis 2 shifted on one sample (near-limit ran
  shorter, closed with a follow-up invitation instead of naming the pattern outright) — not
  repeat-verified, flagged rather than treated as stable. Full writeup:
  `coach-personality-rubric.md`'s Known Limitations.

## Running it

Requires `AI_ADMIN_COACH_TEST_KEY` — a **separate, scoped** Anthropic key,
never the app's real `ANTHROPIC_API_KEY`/`ANTHROPIC_API_KEY_TEST`, and never
wired into app code or Vercel. Same convention the
`authority-finance-coach-live-test` skill uses for the same reason: this
harness calls Anthropic directly, bypassing `api/coach.js`'s server-side
rate limiter entirely, so nothing except deliberate scoping in this config
file controls spend.

```bash
cd scripts/coach-eval
npx promptfoo eval -o results/latest.json
npx promptfoo view   # side-by-side diff of every case
```

## Token-budget discipline — read before adding cases

Same rule as the coach live-testing skill, because it's the same underlying
risk (this bypasses the server-side rate limiter): **a small, fixed, planned
set of test cases decided before you run anything, one call per case, no
retry-on-a-hunch.** Concretely for this file:

- No `repeat:` in a config until a target score is actually being locked
  (Phase 3) — Phase 1/2 are about gathering real examples and comparing
  models, not verifying stability yet.
- No `assert:`/`llm-rubric` blocks until grading is a deliberate decision,
  not a default — every `llm-rubric` assertion is its own extra model call
  (a judge call per candidate-model call), which silently doubles spend if
  added without thinking about it.
- Adding a new model to `providers:` or a new case to `tests:` multiplies
  the run's total call count by that factor — know the new total before
  running, the same way the skill's own script logs usage per call.

## Phase status (docs/TODO.md §2.L)

- [x] Phase 1 — one axis (Metaphor Intensity), one mode's two components
  (persona-only, Ask Coach composed), 6 live calls total (4 initial + 2
  after fixing `personaOnly.js`'s missing-data deflection with
  `fixtures/testAccount.js`), no grading. Findings written into
  `coach-personality-rubric.md`: both components hold score-1 cleanly;
  neither reaches score-5 even under an explicit override — see "Known
  Limitations" there for what that means for Phase 2.
- [x] Phase 2 — done, 3 models compared (Haiku, Sonnet, Opus — 8 more live
  calls total, `--filter-providers` scoped so each model's run only spent
  on its own 4 new combinations). All three hold score-1 cleanly.
  Score-5 does NOT converge across models the way score-1 does: Haiku ~2
  mild touches, Sonnet ~1 (less than Haiku, not more), Opus genuinely
  dense/extended boxing imagery through nearly every clause — real
  Signature (4), arguably brushing Immersive (5). Score-5 compliance is
  not a smooth function of model tier (the middle model did worst); it's
  specifically Opus that unlocks real range on this axis. Full writeup in
  `coach-personality-rubric.md`'s "Known Limitations".
- [x] Phase 7 (pulled forward — renumbered 2026-09-03, was Phase 6) — two
  model locks made (2026-09-01), ahead of the rest of Phase 7's scope: Ask
  Coach (§2.B) → `claude-haiku-4-5` (confirms the existing default with
  real evidence); "special handling" high-significance moments (Burnout
  Sentinel, Heirloom Letter Delivery, major goal completion — none built
  yet) → `claude-opus-5`, a policy for when they ship, not a code change
  today. Full scope note (what's still undecided): `docs/TODO.md` §2.L
  Phase 7.
- [x] Phase 3 — lock + verify, done for both locked targets (2026-09-01).
  `--repeat 3` on each: Haiku's score-1 came back 3/3 near-identical.
  Opus's score-5 first attempt exposed a real harness bug (extended
  thinking eating the `max_tokens` budget, truncating a response — fixed
  by raising `max_tokens` to 3072 for that provider, not a personality
  finding), then 3/3 consistently dense once fixed. What's NOT verified
  yet: the mode's actual natural-default (no-override) output at score-3
  — this phase only confirmed the floor/ceiling extremes reliably reach
  their target on their locked models.
- [x] Phase 4 — done, found a different axis than planned (2026-09-01).
  `promptfooconfig.phase4.yaml`, real account-data variants via
  `askCoachComposed.js`'s new `vars.severity` (no calibration override),
  `--repeat 3`, both variants word-for-word identical across all repeats.
  Metaphor Intensity barely moved between near-limit and healthy — but
  length/directness did, reliably, even though `ASK_COACH_SYSTEM_PROMPT`
  doesn't authorize that for a non-mechanics question. Real finding, not
  yet a scored rubric row — see `coach-personality-rubric.md`'s Known
  Limitations for the open "formalize or suppress" decision this raises.
  **Promoted to Axis 2 (Urgency Escalation)** in the rubric (2026-09-01)
  rather than left as a side note — real anchor data (score 3) from this
  exact pair, own 1-5 table, own still-open calibration TODO.
- [~] Phase 5 — RESCOPED 2026-09-03: complete axis coverage across the four
  Coach modes that actually exist (Ask Coach — default + tool-available,
  Net Worth Trigger, Job Hunt Chat, Résumé Review), then lock target
  numbers. Split off from the original Phase 5 (see Phase 6 below), which
  bundled this with "widen to still-unbuilt modes" — two jobs with two
  different blockers. Confirmed 2026-09-03 via a full grep of
  `coachPrompts.js`/`aiContext.js`/`src/components/`: no other Coach mode
  exists in the codebase at all. Per the user's own sequencing (2026-09-01):
  find real 1s/5s for the other Interaction Modes table rows first,
  batch-decide every mode's default "3" together at the end — that batch
  decision (**attaching a locked number to each mode/axis pair**) is this
  phase's finish line. **Standing instruction from here on: sample both
  Axis 1 (Metaphor Intensity) and Axis 2 (Urgency Escalation) for every
  mode/scenario**, not Axis 1 alone.
  - [x] First slice — `promptfooconfig.phase5.yaml`, Net Worth Trigger's
    three shipped tiers (Amber/Red/Green), `prompts/netWorthTrigger.js`
    (real `buildNetWorthSystemPrompt`, matches `CoachNetWorthCard.jsx`'s
    actual call shape — fixed trigger message, narrower context params).
    `fixtures/testAccount.js` gained `newJobSeasonMode`/`runwayDays` for
    Red's real trigger condition. `--repeat 3`, all 9 runs identical.
    Green clean; Amber stacks multiple figurative touches (real rule
    violation, not just a judgment call); Red complies with the letter
    but not fully the spirit, and runs longest of the three despite being
    the one tier told to stay calm. Full writeup in
    `coach-personality-rubric.md`'s Known Limitations.
  - [x] Second slice (2026-09-02) — `promptfooconfig.phase5b.yaml` (Job
    Hunt Chat) + `promptfooconfig.phase5c.yaml` (Résumé Review),
    `prompts/jobHuntChat.js`/`prompts/resumeReview.js`, `claude-sonnet-5`
    (both modes' own shipped model), no calibration override. 3 calls, no
    repeat yet. Job Hunt Chat's existing target (2, "trace") held cleanly
    at both a healthy and a tight runway — no boxing vocabulary either
    time, urgency showed up as content (which application, how bluntly)
    rather than length, a third shape distinct from Ask Coach's and Net
    Worth Trigger's Axis 2 findings. Résumé Review's existing target (3,
    matches default) did NOT hold — natural output used zero figurative
    language, a fully literal review; structurally compliant with
    everything else in its addendum. Neither target changed — both held
    for the batch decision. Found and fixed a real bug along the way:
    `buildJobHuntContext()` silently dropped logged gig income from the
    runway it quotes (drift-app-warden.md F167). Full writeup in
    `coach-personality-rubric.md`'s Known Limitations and the Job
    Hunt/Résumé Review table rows.
  - [x] **Résumé Review prompt-tuning pass (2026-09-02)** —
    `promptfooconfig.phase5c-tuning.yaml` + `.phase5c-verify.yaml`,
    `prompts/resumeReviewTuning.js`, 4 calls total (soft + firm, then
    `--repeat 2` on firm). Found the root cause: `COACH_PERSONA_PROMPT`'s
    corner-man clause is a CAP, never a floor, so a technical/evaluative
    mode with no addendum nudge just defaults to fully literal. "soft"
    (names the gap, caps at one touch, no placement) got one touch but an
    off-vocabulary, self-invented one. "firm" (also names the closing-line
    placement + one worked example) got exactly one clean,
    vocabulary-bank-matching touch **3/3 times**, always "corner," always
    at the close, never explained, never stacked. **Applied to
    `coachPrompts.js` 2026-09-02, on explicit instruction** — "firm"'s
    closing sentence is now the live `RESUME_REVIEW_ADDENDUM`'s last
    paragraph; `resumeReviewTuning.js`'s `firm` variant now imports the
    real `RESUME_REVIEW_SYSTEM_PROMPT` export instead of duplicating the
    string, so it can't silently drift from what's shipped.
    `coachPrompts.test.js` gained regression coverage. Full writeup in
    `coach-personality-rubric.md`'s Known Limitations.
  - [x] Fixture fidelity fix (2026-09-02) — found reviewing the sister
    `coach-mcp-tools` branch's period-label fix (drift-app-warden §21
    F167/F168): `formatPeriodWithDate()` silently falls back to a bare
    "week 11" whenever `allWeeks` lacks real `weekStart`/`isPayWeek`/
    `payPeriodEndDate` fields — which our label-shaped fixtures never
    carried. Every fixture in `testAccount.js` now shares one real
    `buildYear()` calendar (`REAL_ALL_WEEKS`, see "What's here" above).
    None of the recorded findings hinged on it; every fixture produces the
    real, fuller date-paired text now. Regression test in
    `coachEvalFixture.test.js`.
  - [x] DW-19 update inherited from the sister branch (2026-09-02) —
    their live-testing found the broad-question number-cap is not a
    data-volume or tool-surface problem (tool availability, halving the
    context block, and removing data outright all left the ~10-number
    citation unchanged or made Coach spend tool round-trips to reconstruct
    it). Doubly motivates the few-shot-example approach already flagged
    for Sentence economy — do not re-attempt via context/tool changes.
  - [x] Tool-available rerun (2026-09-03) — `personalityToolLoopLiveTest.mjs`,
    a directional check ("a thumb on the tool introduction"), not a new
    calibration: reused the exact Phase 2/3 default fixture and Phase 4's
    near-limit override with the identical question, only adding
    `detailAvailableViaTools: true` + `COACH_TOOLS`. Metaphor Intensity
    held exactly (same phrase, "breathing room," both samples); one Axis 2
    difference on the near-limit sample (shorter, follow-up-invitation
    close instead of naming the pattern outright) — not repeat-verified,
    flagged rather than treated as stable.
  - [~] Axis 3 (Sentence Economy) defined + extremes sampled across all four
    built modes (2026-09-03). Ask Coach (`promptfooconfig.phase5d.yaml`, 3
    models): **Sonnet/Opus show clean 1-to-5 range (a true one-sentence
    fragment up to a genuine multi-paragraph report); Haiku has the
    narrowest range of the three — can't reach true score-1, its score-5
    barely differs from its own natural score-3, and that natural default
    already overshoots `COACH_PERSONA_PROMPT`'s own instructed length
    unprompted.** Weighed against measured cost (~3.6-4.5x/call for Sonnet)
    — **decision: Ask Coach stays on Haiku for now, but the finding is real
    enough to set a future direction: per-MESSAGE model routing within a
    session (Haiku for routine turns, Sonnet reached for when a turn needs
    more range), tuned once every mode/axis has been through this phase at
    least once, not decided per-finding.** A speculative paid tier ("Coach
    Upgrade") is also recorded in `docs/TODO.md` §2.G as a cost-contingency
    direction, not a roadmap item.

    Extended to the other three (`promptfooconfig.phase5d-networth.yaml`/
    `-jobhunt.yaml`/`-resume.yaml`, each mode's own shipped model) —
    **refined, not overturned:** Haiku's low-end compression replicated on
    Net Worth Trigger, but its high-end compression did NOT — a richer
    scenario (Green tier's favorable numbers + its own "name the turnaround"
    addendum) produced a genuinely elaborate 4-paragraph score-5, unlike Ask
    Coach's compressed attempt — Haiku's range looks tied to available
    material, not a fixed ceiling. Job Hunt Chat (Sonnet) replicated Ask
    Coach's clean range exactly. **New finding: Résumé Review's score-1 may
    be structurally unreachable** — even overriding both the shared length
    rule and this mode's own paragraph exception, its attempt came back as 4
    full paragraphs, likely because `RESUME_REVIEW_ADDENDUM`'s own required
    elements (weak lines, gaps, strengths, one fix) don't fit a true
    one-sentence answer regardless of what's asked; score-5 worked as
    intended. Remaining: pick + repeat-verify a target per mode. Full
    writeup: `coach-personality-rubric.md`'s Axis 3 section.
  - [ ] Remaining before Phase 5 can conclude: Directness/bluntness and
    Warmth/formality (still undefined), fixing Net Worth Trigger Amber's
    stacked-touch rule violation (a real, already-identified bug, not just
    a finding), repeat-verify passes on
    Job Hunt Chat and the tool-available rerun — then the batch decision:
    lock one target number per mode/axis pair across all four modes.
- [~] Phase 6 — RENUMBERED 2026-09-03 (was Phase 5's original "widen to
  remaining flat-default modes" scope). Widen live testing to Coach modes
  beyond the four that exist today, once each is actually built — blocked
  on the feature shipping, not on this harness. Confirmed 2026-09-03: none
  of Goal ETA Drift Alert, Weekly Pre-Game Briefing, Raise-Negotiation
  Prep, Statement Summary, Burnout Sentinel, Heirloom Letter Delivery, or
  Council of Future Selves exist in the codebase yet.
  - [x] Fixture prep for Weekly Pre-Game Briefing (2026-09-02) — per the
    user's "build the data frames now so we can plug and play later"
    request. `fixtures/testAccount.js` gained `buildWeeklyBriefingContext()`
    — real funded-goal timeline, ready for a real prompt loader whenever
    that feature ships; still blocked on the feature, not the fixture.
  - [x] Burnout Sentinel's work-pattern half assessed and explicitly NOT
    built (2026-09-02) — the engine has no data path for it today (no
    `weekConfirmations` in `buildCoachContext()`, `logs` never carries a
    streak, no overtime event type) — building it would fake a signal the
    app can't actually see, not prepare a fixture. Needs engine work
    first, not a fixture.
  - [ ] Everything else stays blocked until its mode ships.
- [x] Phase 7 (pulled forward, partial — renumbered 2026-09-03, was Phase
  6) — Ask Coach → Haiku, special-handling moments → Opus, both locked and
  Phase-3-verified. Everything else in the table (Job Hunt Assistant,
  Résumé Review, Statement Summary, Net Worth Trigger's tiers, the rest)
  is still undecided.
