# Coach Personality Eval Harness

Build-side scaffolding for `docs/TODO.md` §2.L, implementing the process in
`docs/coach-personality-rubric.md`'s "The End Goal" and "Calibration
Methodology" sections. Read both before touching this folder — this README
doesn't repeat their reasoning.

## What's here

- `promptfooconfig.yaml` — the test definition. Read its own `description`
  field first; it states this phase's scope and what's deliberately NOT
  included (no automated grading yet, no `repeat`, one model only).
- `prompts/*.js` — prompt loaders. Each one `import`s a real, live export
  from `src/lib/coachPrompts.js` — never a hand-copied prompt string — so
  this harness can never silently test a stale prompt. One file per
  addressable prompt *component* (the shared persona alone, a specific
  mode's full composition), not one file per mode — this mirrors how
  `coachPrompts.js` itself is actually built (persona + swappable addendum),
  so a regression in the shared base shows up once instead of once per mode.
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
- [ ] Phase 2 — extremes discovery across multiple candidate models. Now has
  a concrete question to answer, not just phasing: is the score-5 ceiling
  found in Phase 1 specific to `claude-haiku-4-5`, or does no candidate
  model reach it?
- [ ] Phase 3 — lock + verify one real target under repeated calls.
- [ ] Phase 4 — the within-mode severity-flexing rows (budget near-limit /
  healthy, seeded in the rubric table).
- [ ] Phase 5 — widen to remaining modes/axes.
- [ ] Phase 6 — model-per-mode decision.
