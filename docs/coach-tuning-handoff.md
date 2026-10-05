# Coach Tuning & Training — Session Handoff

**Purpose:** let a brand-new chat pick up the Coach personality-calibration / model-selection work
exactly where it stopped. Written 2026-10-05. This is the *tuning workflow* handoff; for what Coach
is and where it appears in the app, read `docs/coach-session-handoff.md` and
`docs/coach-entry-points.md`. Source of truth for phase status is `docs/TODO.md` §2.L; source of
truth for scoring is `docs/coach-personality-rubric.md`. This file is the shortcut, not a replacement.

**Branch:** `claude/coach-ai-personality-bmopcx` (in sync with `Version-control`/`master` as of
2026-10-05, commit `5dc51f6`; 1956 tests pass). Pipeline: `claude/*` → `Version-control` → `master`.
Before adding any TODO section / migration / warden F-entry, run the numbering-collision check in
`.claude/CLAUDE.md` (Git PR Flow) — twice (before push, and right after merging Version-control).

---

## 0. THE BLOCKER (read first)

Live testing is **paused on a dead API key.** `AI_ADMIN_COACH_TEST_KEY` returned **HTTP 401 "API key
is invalid"** on 2026-10-05 (it worked 2026-09-06). Nothing was spent — every request failed at auth.
The user is updating the cloud env variable. Env changes only apply to a **new** session/container,
so a resumed session can still hold the old value.

**First action in the new chat — free check, no spend:**
```bash
echo "len=${#AI_ADMIN_COACH_TEST_KEY} prefix=${AI_ADMIN_COACH_TEST_KEY:0:7}"
curl -s -o /dev/null -w "http %{http_code}\n" https://api.anthropic.com/v1/models \
  -H "x-api-key: $AI_ADMIN_COACH_TEST_KEY" -H "anthropic-version: 2023-06-01"
```
`200` = good, go to §4. `401` = still bad (revoked, trailing space/newline in the value, or its
workspace hit a spend limit) — stop and tell the user; do **not** try other keys.

**Key rules (non-negotiable):**
- Only `AI_ADMIN_COACH_TEST_KEY`. **Never** `ANTHROPIC_API_KEY` / `ANTHROPIC_API_KEY_TEST` — those are
  the app's own keys (`api/coach.js`); the harness bypasses the app's rate limiter, so the only spend
  control is a separate scoped key + a small planned call set.
- **promptfoo ignores `apiKeyEnvar` for Anthropic providers** (confirmed on 0.122.2 *and* 0.123.1: its
  provider only reads `ANTHROPIC_API_KEY`). Every `promptfooconfig.*.yaml` therefore fails with
  "Missing AI_ADMIN_COACH_TEST_KEY" unless you map the key **inline, per command, never persisted:**
  ```bash
  cd scripts/coach-eval
  ANTHROPIC_API_KEY="$AI_ADMIN_COACH_TEST_KEY" npx promptfoo eval -c <config>.yaml [--repeat N] --no-cache -o results/<name>.json
  ```
  (`results/*` is gitignored. Don't edit the configs' `apiKeyEnvar` lines — they document intent.)
- Budget discipline (`scripts/coach-eval/README.md`): a small fixed set of cases decided *before*
  running, no retry-on-a-hunch, no `assert:`/`llm-rubric` blocks (each is an extra model call), no
  `repeat:` until a target is being locked. Adding a provider or test multiplies the call count.
- Workload Identity Federation (the Console's new keyless auth) was evaluated and **parked**: the
  harness runs from this sandbox, which has no identity provider; it would need a custom promptfoo
  provider and a rewrite of `api/coach.js` auth for no new capability at solo-dev scale. Cheap
  alternative worth doing: issue the eval key inside a dedicated "Coach Eval" workspace with a monthly
  spend cap. Revisit if a second dev/CI needs access or a key leaks.

---

## 1. What the work is

Coach has one persona (`COACH_PERSONA_PROMPT` in `src/lib/coachPrompts.js`) plus per-mode addenda.
The harness (`scripts/coach-eval/`, promptfoo) measures how tightly each **mode × model** holds a
target on each **axis**, so we can (a) lock a target number per mode/axis and (b) pick the cheapest
model that hits it. Four Coach modes actually exist: **Ask Coach** (`ASK_COACH_SYSTEM_PROMPT`),
**Net Worth Trigger** (`buildNetWorthSystemPrompt`, tiers amber/red/green), **Job Hunt Chat**
(`JOB_HUNT_SYSTEM_PROMPT`), **Résumé Review** (`RESUME_REVIEW_SYSTEM_PROMPT`). Everything else in the
rubric's Interaction Modes table is unbuilt (`UNSCORED`).

**Calibration methodology:** elicit real 1/5 examples per model → compare to the hand-written
definitions → pick a target → verify it holds under repeat calls. Always check **Axis 2 alongside
Axis 1** (standing instruction, Phase 4 finding).

**Axes** (full definitions + anchors in `docs/coach-personality-rubric.md`):
- **Axis 1 — Metaphor Intensity** (1–5; 3 = "light seasoning", one corner-man phrase max).
- **Axis 2 — Urgency Escalation** (does tone/length flex with severity? Designed in Net Worth Red;
  accidental in Ask Coach).
- **Axis 3 — Sentence Economy**, **RESCALED 2026-09-03** (the rigid one-sentence floor is retired):
  1 Concise (2–3 short sentences) · **2 Standard (anchor, = persona default)** · 3 Elaborated ·
  4 Expansive · 5 Exhaustive (itemized audit). All older Axis 3 findings used the OLD numbering — the
  rubric has a translation note (old 2→new 1, old 3→2, old 4→3, old 5→4, new 5 = itemized).
- **Directness/bluntness** and **Warmth/formality** — still **undefined**, no anchor data.

**Model decisions so far:** Ask Coach → `claude-haiku-4-5` (**kept**, revisited not reversed);
special-handling moments (Burnout Sentinel, Heirloom Letters, major goal completion) → `claude-opus-5`
(policy lock, nothing routes there yet); Job Hunt Chat and Résumé Review ship on `claude-sonnet-5`;
Net Worth Trigger card is hardcoded Haiku. **Direction (recorded, not built):** per-*message* model
routing inside one Ask Coach session (Haiku routine, Sonnet when range is needed), tuned at the very
end of all feature testing. Speculative paid "Coach Upgrade" tier (~$5–10/mo) recorded in
`docs/TODO.md` §2.G. Measured cost: Haiku ≈ $0.004/call vs Sonnet ≈ $0.0145–0.0175 (~3.6–4.5×).

---

## 2. Phase status (TODO §2.L)

**Phase 5 — axis coverage across the 4 built modes → batch decision.** *In progress, near done.*
Done: Metaphor + Urgency across all four modes; Net Worth tiers live-verified; Job Hunt/Résumé first
pass; Résumé Review metaphor gap fixed (closing-line "corner" sentence now in
`RESUME_REVIEW_ADDENDUM`); fixture fidelity fix (all fixtures share one real `buildYear()` calendar);
Axis 3 defined + rescaled + extremes sampled on all four modes; tool-available Ask Coach rerun
(directional, 2 samples); **Net Worth Amber stacked-touch bug FIXED 2026-09-06** (addendum now
restates one-touch cap + one-lever; live-verified 3/3 identical; regression test in
`coachPrompts.test.js`).
**Still open:**
1. Directness/bluntness + Warmth/formality axes — define, then sample.
2. Repeat-verify **Job Hunt Chat** (3 calls so far, no repeat).
3. Repeat-verify the **Ask Coach tool-available rerun** (2 samples, one Axis 2 shift unconfirmed).
4. **Fresh Résumé Review score-1 run** under the rescaled target (old result is stale).
5. **The batch decision:** lock one target number per mode/axis pair across all four modes.

**Phase 6 — unbuilt modes** (Goal ETA Drift Alert, Weekly Pre-Game Briefing, Raise-Negotiation Prep,
Statement Summary, Burnout Sentinel, Heirloom Letters, Council of Future Selves): **blocked on the
features shipping**, not on the harness. Weekly-Briefing fixture is pre-built. Burnout Sentinel
deliberately not faked (no streak/OT data source exists).

**Phase 7 — model selection close-out:** Ask Coach/Haiku and special-handling/Opus locked; everything
else undecided until Phase 5's batch decision lands.

---

## 3. Findings to carry in your head (don't over-generalize)

- **Haiku's Axis 3 range is scenario-dependent, not a fixed ceiling.** Ask Coach: can't reach true
  score-1, its score-5 barely beats its natural default, and its natural default already overshoots the
  persona's own length rule. Net Worth Green: genuinely elaborate 4-paragraph score-5. Sonnet/Opus show
  clean range on every mode.
- **Résumé Review's floor may not be score 1** — `RESUME_REVIEW_ADDENDUM` mandates weak lines + gaps +
  strengths + one fix, which resists even a 2–3 sentence answer. Open question for the batch decision.
- **Net Worth Red** complies with the letter ("drop corner-man phrasing") but reaches for a different
  flourish ("flying blind") and runs the *longest* tier despite "never catastrophize" — a compliance
  gap, not yet fixed (its addendum names the wrong target: boxing phrasing vs. all color).
- **Job Hunt Chat target 2 ("trace") held** at 70-day and 9-day runway; urgency shows up as content
  (which application, how bluntly), not length.
- **DW-19 (from the sister tool-loop work):** the broad-question ~10-number citation habit is *not* a
  context-size or tool-availability problem; the only untried lever is a few-shot worked example.
  Don't retry via context/tool changes.
- promptfoo namespaces its cache per `repeatIndex`, so `--repeat N` runs are independent draws; still
  pass `--no-cache` on verification runs. Earlier "N/N identical" results came from Haiku/Sonnet being
  near-deterministic at default temperature on these short prompts — plausible, but if a *stability*
  claim ever drives a locked decision, re-run it once with `--no-cache`.

---

## 4. Next steps, in order (once the key returns 200) — ~10 calls, a few cents

| # | Pass | Command / file | Calls |
|---|---|---|---|
| A | Job Hunt Chat repeat-verify | `promptfooconfig.phase5b.yaml --repeat 3` (healthy ~70d + tight ~9d runway, Sonnet) | 6 |
| B | Résumé Review, rescaled score-1 | `promptfooconfig.phase5d-resume.yaml` (config already carries the new 2–3-sentence override) | 2 |
| C | Ask Coach tool-available repeat | `node scripts/coach-eval/personalityToolLoopLiveTest.mjs` (Haiku, `detailAvailableViaTools: true`, same "How's my week looking?" question, near-limit 845/830 override) — check its header for the key/env handling first | ~2 |

(`results/phase5b-repeat.json` on disk is the *errored* 401 run — ignore it, it holds no data.)

After A–C: read outputs against the rubric yourself (full text, not the truncated table), record
findings in `coach-personality-rubric.md` (Known Limitations) + `docs/TODO.md` §2.L + the Phase status
block in `scripts/coach-eval/README.md` (all three are kept in sync every time), then define
Directness/Warmth (no API needed — can be done any time, including now), sample them, and run the
batch decision. Net Worth Red's addendum fix is the next real prompt bug after Amber.

## 5. Where things live

| Thing | Path |
|---|---|
| Prompts under test | `src/lib/coachPrompts.js` (+ `coachFeatureGuide.js` for Ask Coach) |
| Context builders | `src/lib/aiContext.js` (`buildCoachContext`, `buildJobHuntContext`) — grounding rule: `docs/active-systems.md` §6/§24 |
| Harness | `scripts/coach-eval/` — `promptfooconfig.*.yaml`, `prompts/*.js` loaders (accept `vars.calibrationInstruction`), `fixtures/testAccount.js` |
| Rubric / scoring | `docs/coach-personality-rubric.md` |
| Phase tracker | `docs/TODO.md` §2.L · harness mirror: `scripts/coach-eval/README.md` |
| Live Coach testing (Ask Coach UI path, separate from this harness) | skill `authority-finance-coach-live-test` |
| Staged-plugin note | the blind-comparator/grader idea (skill-creator) was removed from the repo 2026-10; Phase 5 judging stays manual |

Commit style: end commits with the `Co-Authored-By` / `Claude-Session` trailers; push to
`claude/coach-ai-personality-bmopcx`; no PR unless asked.
