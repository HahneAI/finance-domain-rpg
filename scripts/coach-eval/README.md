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
  string. The two fixtures above can't serve them: their `allWeeks` are
  label-shaped (`{ idx, weekEnd: "2026-03-01" }` — a date string, no
  `weekStart`/`grossPay`/`taxableGross`/`payrollDeductions`), which is all
  `buildCoachContext()`'s period labels need and nowhere near what
  `get_week_breakdown` reads. This one runs the real `buildYear()` over a real
  config and derives income, spend and log impacts through real
  `computeNet()`/`computeRemainingSpend()`/`calcEventImpact()` — the same
  "fake inputs, real functions" principle, one layer deeper. It is a SIBLING
  account, deliberately tuned to the same identity (~$845/wk net, $520/wk
  baseline spend, $400/wk rent, 2026-03-09, fiscal week 10) rather than the
  same object: adding goals/logs/expenses to `buildTestContext()` would change
  its prompt text and invalidate Phase 4/5's word-for-word repeat comparisons.
  Its bag is a superset of `buildCoachContext()`'s params, so
  `buildToolTestContext()` renders a context string for that same account — a
  prompt test and a tool test can run against one account. Locked by
  `src/test/lib/coachEvalFixture.test.js`.
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
- [x] Phase 6 (pulled forward) — two model locks made (2026-09-01),
  ahead of the rest of Phase 6's scope: Ask Coach (§2.B) → `claude-haiku-
  4-5` (confirms the existing default with real evidence); "special
  handling" high-significance moments (Burnout Sentinel, Heirloom Letter
  Delivery, major goal completion — none built yet) → `claude-opus-5`,
  a policy for when they ship, not a code change today. Full scope note
  (what's still undecided): `docs/TODO.md` §2.L Phase 6.
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
- [~] Phase 5 — widen to remaining modes/axes, in progress. Per the
  user's own sequencing (2026-09-01): find real 1s/5s for the other
  Interaction Modes table rows first, batch-decide every mode's default
  "3" together at the end. **Standing instruction from here on: sample
  both Axis 1 (Metaphor Intensity) and Axis 2 (Urgency Escalation) for
  every mode/scenario**, not Axis 1 alone.
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
  - [x] Fixture prep for unbuilt modes (2026-09-02) — per the user's
    "build the data frames now so we can plug and play later" request.
    `fixtures/testAccount.js` gained `buildWeeklyBriefingContext()` for
    Weekly Pre-Game Briefing (§8.A) — real funded-goal timeline, ready
    for a real prompt loader whenever that feature ships. Burnout
    Sentinel's work-pattern half was assessed and explicitly NOT built —
    the engine has no data path for it today (no `weekConfirmations` in
    `buildCoachContext()`, `logs` never carries a streak, no overtime
    event type) — building it would fake a signal the app can't actually
    see, not prepare a fixture. Building Burnout Sentinel for real needs
    engine work first (a streak/OT-tracking data source), not a fixture.
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
  - [ ] Not yet run: the still-unbuilt flat rows, the remaining undefined
    axes, and a repeat-verify pass on this slice if either result is worth
    locking in before the batch decision.
- [x] Phase 6 (pulled forward, partial) — Ask Coach → Haiku, special-
  handling moments → Opus, both locked and Phase-3-verified. Everything
  else in the table (Job Hunt Assistant, Résumé Review, Statement
  Summary, Net Worth Trigger's tiers, the rest) is still undecided.
