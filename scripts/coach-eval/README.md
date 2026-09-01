# Coach Personality Eval Harness

Build-side scaffolding for `docs/TODO.md` §2.L, implementing the process in
`docs/coach-personality-rubric.md`'s "The End Goal" and "Calibration
Methodology" sections. Read both before touching this folder — this README
doesn't repeat their reasoning.

## What's here

- `promptfooconfig.yaml` — Phases 1-3 (extremes discovery + repeat-verify
  of the two locked models). Read its own `description` field first.
- `promptfooconfig.phase4.yaml` — Phase 4 (within-mode severity flexing).
  Separate file from the one above on purpose — keeps each phase's scope
  and call-count independently auditable rather than growing one
  monolithic config; a later phase's config should follow the same
  `promptfooconfig.phaseN.yaml` naming pattern, `-c <file>` to run one.
- `prompts/*.js` — prompt loaders. Each one `import`s a real, live export
  from `src/lib/coachPrompts.js` — never a hand-copied prompt string — so
  this harness can never silently test a stale prompt. One file per
  addressable prompt *component* (the shared persona alone, a specific
  mode's full composition), not one file per mode — this mirrors how
  `coachPrompts.js` itself is actually built (persona + swappable addendum),
  so a regression in the shared base shows up once instead of once per mode.
  `askCoachComposed.js` also takes an optional `vars.severity` to pick a
  real account-data variant (see `fixtures/`) — used by Phase 4, ignored
  (defaults to the original Phase 1-3 account) by anything that doesn't set it.
- `fixtures/testAccount.js` — a fabricated-but-structurally-real test
  account run through the real `buildCoachContext()`, not hand-typed text.
  `buildTestContext({ weeklyIncome, avgWeeklySpend })` — vary those two to
  get a different real spend-ratio scenario; reused by Phase 4's severity
  variants, reusable the same way for any future severity/scenario test.
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
- [ ] Phase 5 — widen to remaining modes/axes. Per the user's own
  sequencing (2026-09-01): find real 1s/5s for the other Interaction
  Modes table rows first, batch-decide every mode's default "3" together
  at the end, rather than resolving each mode's default one at a time.
- [x] Phase 6 (pulled forward, partial) — Ask Coach → Haiku, special-
  handling moments → Opus, both locked and Phase-3-verified. Everything
  else in the table (Job Hunt Assistant, Résumé Review, Statement
  Summary, Net Worth Trigger's tiers, the rest) is still undecided.
