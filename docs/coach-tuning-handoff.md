# Coach Tuning & Training — Workflow Handoff

**Scope:** how Coach is *calibrated and tested* — the eval harness, the rubric, the live-test
skills, and the open findings. Not what Coach *is*; that's `docs/coach-entry-points.md` (the
live map, read it first if you're new to Coach at all).

**Written 2026-10-06** to hand this workstream to a fresh session once
`AI_ADMIN_COACH_TEST_KEY` is updated in the cloud environment. Everything below was verified
against the repo on the date written, not recalled.

> ⚠️ **`docs/coach-session-handoff.md` is stale — do not trust it.** It is dated 2026-07-25 and
> lists Job Hunt Assistant and Résumé Review as "not started"; both shipped
> (`JobHuntChatPanel.jsx`, `ResumeReviewCard.jsx`), and it predates the entire tool layer and
> the whole eval harness. Useful only for the entitlement/caching background in its middle
> section. This file supersedes it for anything tuning-related.

---

## 0. The one thing that is actually blocked on the key

Everything in this workstream that costs money calls Anthropic **directly**, bypassing
`api/coach.js` and therefore bypassing its server-side rate limiter. The only thing standing
between a test pass and an unbounded bill is the budget discipline written into each script.
That is why the key is separate and scoped.

**Three different keys — do not confuse them:**

| Variable | Used by | Lives in |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/coach.js`, serving real users | Vercel **Production** |
| `ANTHROPIC_API_KEY_TEST` | same route on preview builds (falls back to the above) | Vercel **Preview** |
| `AI_ADMIN_COACH_TEST_KEY` | **this workstream only** — eval harness + both live-test skills | the cloud session env. **Never Vercel, never app code.** |

The variable being updated for this handoff is **`AI_ADMIN_COACH_TEST_KEY`**. It was already
present in the session env as of writing, but unverified — treat a fresh key as unproven.

**First action in the new session — a 1-call smoke test before spending a real run:**

```bash
cd /home/user/finance-domain-rpg
node -e '
const k = process.env.AI_ADMIN_COACH_TEST_KEY;
if (!k) { console.error("NOT SET"); process.exit(1); }
fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 8, messages: [{ role: "user", content: "hi" }] }),
}).then(r => r.json()).then(j => console.log(j.error ? "FAIL: " + j.error.message : "OK — key is live"));'
```

A `credit balance is too low` or `authentication_error` here is the whole answer; do not start
a run and discover it 20 calls in.

---

## 1. What this workstream is, in two layers

The two layers test **different axes** and must not be conflated. Both share
`scripts/coach-eval/fixtures/testAccount.js`, deliberately — one account, two kinds of test.

**Layer A — personality / register (promptfoo).** Does Coach *sound* right? Driven by
`scripts/coach-eval/promptfooconfig*.yaml`, governed by `docs/coach-personality-rubric.md`,
planned in `docs/TODO.md` §2.L. One config file per phase/slice on purpose, so call count stays
auditable.

**Layer B — tool selection (standalone scripts).** Does Coach *reach for the right tool* with
sensible arguments? promptfoo has no hook for a tool loop (emit `tool_use` → execute → feed the
result back → real answer), so two hand-rolled runners exist:

- `scripts/coach-eval/toolLoopLiveTest.mjs` — tool selection, with a hard `MAX_CALLS = 26`
  budget stop. Filterable by id group (`adversarial` / `simulation` / `navigate`).
- `scripts/coach-eval/personalityToolLoopLiveTest.mjs` — Layer A's question re-run under the
  real production call shape (`detailAvailableViaTools: true` + `COACH_TOOLS`), to check whether
  adding tools shifted tone.

`scripts/coach-eval/README.md` is the authoritative reference for both and is current — read it
before running anything. This file does not repeat it.

---

## 2. Token-budget discipline — the rule that matters most

The same rule everywhere, because it's the same underlying risk: **a small, fixed, planned set
of cases decided before you run anything, one call per case, no retry-on-a-hunch.**

- Adding a model to `providers:` or a case to `tests:` **multiplies** the run's total. Know the
  new total before running.
- Every `llm-rubric` assertion is its own extra judge call — it silently doubles spend.
- No `repeat:` until a target score is actually being locked (Phase 3).
- `results/` is gitignored and ephemeral. The durable artifact is the *finding*, written into
  `coach-personality-rubric.md` — not the JSON dump.
- 529 overloads are **not billed**; the runner backs off (5/10/20/40/60s). Don't treat a 529 as
  a spent call.

---

## 3. Where the work actually stands

**Shipped and verified — 10 Coach tools** (`src/lib/coachTools.js`), executed client-side
because `api/` is at the 12/12 Vercel Hobby function cap with zero headroom:

`get_goal_detail` · `get_expense_detail` · `get_week_breakdown` · `list_log_entries` ·
`navigate_to` · `propose_goal` · `simulate_expense_change` · `simulate_new_goal` ·
`simulate_overtime_hours` · `simulate_without_logged_event`

Tool selection measured correct 4/4, then 5/5 as the count grew. UI: `CoachToolUI.jsx`
(activity line, `CoachNavChip`, `CoachGoalCard`).

**Calibration state** (`coach-personality-rubric.md`): Axis 1 Metaphor Intensity and Axis 2
Urgency Escalation have real anchor data; Axis 3 Sentence Economy had its extremes-discovery
pass across all four built modes. Ask Coach is **locked to `claude-haiku-4-5`** (§2.L Phase 7).
Directness/bluntness and Warmth/formality are still undefined — no anchor data at all.

---

## 4. The two open findings — read these before designing a new pass

**DW-19 — the broad-question number cap does not hold.** Asking the rubric's canonical trigger
("Give me a full breakdown of my whole dashboard — everything.") cites **7 numbers** against a
cap of 3 — both before *and* after the instruction was rewritten as an explicit, self-checkable
hard limit. Three other symptoms in the same round (paragraph length, stacked figurative
touches, missing follow-up invitation) all resolved with that same prompt edit. This one didn't.

Ruled out across three levers: tools present vs absent, halving the numbers in context, and
removing data outright (Coach fetched *more*). **It is not a data-volume problem.** The only
untried remedy is a **few-shot worked example** rather than another prose rewrite of the same
instruction — that is the next experiment, and it is the one thing this workstream most needs.
See `drift-app-warden.md` F160 and `BUG_FIX_TODO.md` DW-19.

**Fabricated counterfactuals — found three times, still open.** Coach invents a
plausible-sounding hypothetical impact instead of calling the simulation tool that would compute
it for real. Critically, the third occurrence was **after** `simulate_expense_change` shipped:
**tool availability does not prevent fabrication; only tool use does.** Any fix has to make
Coach *call* the tool, not merely have it. See `drift-app-warden.md` §21 F168–F174.

---

## 5. Not yet built (the backlog for this workstream)

1. **`draft_log_entry`** — design already chosen by the user: prefill and hand off to the Log
   panel (not a direct write). Nothing built.
2. **Simulation result strip** — a UI treatment for simulation output. Proposed, not selected.
3. **Goal-setting / identity prompt addendum** — the prompt half of `propose_goal`, teaching
   Coach to draw out who someone wants to be before proposing. Explicitly deferred by the user
   ("tool + chip only — prompt work separate"). The tool now exists to land on.
4. **Job Hunt tools** — `JOB_HUNT_TOOLS` still exposes only `get_expense_detail`; widening it
   needs props threaded through `NewJobSeasonHomePanel`.
5. Noted, unactioned: `api/coach.js` has no per-surface gate, and there is no per-user rate
   limit on tool rounds.

---

## 6. Hard-won gotchas — each of these cost a real debugging cycle

- **Grounding rule is absolute** (`active-systems.md` §6): every figure resolves through the
  same authoritative function the UI uses. A parallel formula that merely agrees today is a bug.
- **A zeroed-forward deleted bill is still in the array.** `isNjsBillActive()` alone matches it;
  pair with `!isExpenseRemoved()`. Coach tools go through `visibleExpenses()` (warden F180).
- **`npm run test:run` cannot catch React Compiler bugs** — `vitest.config.js` omits
  `@rolldown/plugin-babel`. Only `npm run build` + a real browser render does (warden §12.4).
  There is no top-level error boundary, so one bad render blanks the whole app.
- **Read the test FILE count, not the test count.** Import-time failures still report every
  loaded test as passing.
- **A failed Playwright action does not mean no write happened.** Click-retry succeeded then
  reported a timeout and created 6 duplicate goals on the shared test account. Self-clean every
  driver, and verify the account after.
- **`REAL_ALL_WEEKS`:** fixtures must share one real `buildYear()` calendar. Label-shaped weeks
  silently degraded every date Coach cited to a bare "week 11".
- Coach is reachable in the live app only via the **mobile bottom nav**, and `WeekConfirmModal`
  **queues** — loop "Skip for now", never "Confirm Week", or you mutate the test account.

---

## 7. Commands

```bash
# Layer A — personality (promptfoo). One config at a time; know the call count first.
cd scripts/coach-eval
npx promptfoo eval -c promptfooconfig.phase5d.yaml -o results/latest.json
npx promptfoo view                      # side-by-side diff

# Layer B — tool selection. Hard budget stop at MAX_CALLS = 26.
node scripts/coach-eval/toolLoopLiveTest.mjs            # all planned prompts
node scripts/coach-eval/toolLoopLiveTest.mjs adversarial # one id group only
node scripts/coach-eval/personalityToolLoopLiveTest.mjs

# Never pipe a live run through `| head` — SIGPIPE killed a paid run mid-flight.
```

`promptfoo` is pinned at `^0.123.1`. Seven dev-only advisories in its dependency chain have **no
upstream fix** (node-forge's range is `*`; basic-ftp is blocked by a `get-uri` pin).
`npm audit` offers promptfoo `0.116.7` as the "fix" — that is a **downgrade of seven minor
versions**, which `npm audit fix --force` would apply silently. Do not run it.

---

## 8. Reading order for the new session

1. `docs/coach-entry-points.md` — the live map of every Coach surface.
2. `scripts/coach-eval/README.md` — the harness, in full. Current and authoritative.
3. `docs/coach-personality-rubric.md` — the axes, the locked targets, Known Limitations.
4. `docs/TODO.md` §2.L — the phase plan and the design constraints already decided.
5. `docs/drift-app-warden.md` §21 — Spine D, the AI-layer drift map (F160, F168–F176, F180).

Then run the §0 smoke test, confirm the key is live, and pick the DW-19 few-shot experiment
unless the user says otherwise — it is the only untried remedy and it blocks two findings.
