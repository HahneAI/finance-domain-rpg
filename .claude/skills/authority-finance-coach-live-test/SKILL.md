---
name: authority-finance-coach-live-test
description: Live-tests the Ask Coach AI feature in the Authority Finance app (finance-domain-rpg repo) for data accuracy and personality/brand-voice adherence, using a workaround that intercepts the app's real Coach request and replays it directly against the Anthropic API with a separate scoped test key — because /api/coach isn't reachable from a local dev server. Use this specifically when asked to live-test Coach, verify a Coach prompt change actually changed its behavior, check Coach's personality/tone against docs/coach-personality-rubric.md, or confirm Coach cites accurate numbers after a data/finance-logic fix. This is a narrower, higher-cost, higher-risk sibling of the authority-finance-live-test skill (which covers every OTHER Authority Finance feature) — use that one instead for anything not about Coach, since this skill spends real API money and should not be reached for by accident.
---

# Authority Finance — Ask Coach Live Testing

Ask Coach is an AI feature (`src/components/AskCoachPanel.jsx`, `src/lib/coachPrompts.js`,
`api/coach.js`) that can't be live-tested the normal way: `npm run dev` never proxies `/api/*`
(those are Vercel serverless functions), and there's usually no `ANTHROPIC_API_KEY` wired into a
local dev sandbox anyway. This skill exists because "just skip testing Coach" was the wrong
answer the one time it mattered — Coach is downstream of every other finance calculation in the
app, and a prompt or context-building change that looks fine in a unit test can still produce
wrong or off-brand output from the real model. **Read this whole skill before running anything —
the token-budget section isn't a footnote, it's the reason this workaround is allowed to exist
instead of just being "don't test Coach live."**

## The workaround, and why it's faithful

1. Intercept the app's own `/api/coach` POST body via Playwright's `page.route()` — this captures
   the *exact* `systemPrompt`/`contextBlock`/`model` the running app built for a real question,
   with real account data. `scripts/capture_coach_context.cjs` does this.
2. Replay that captured payload via a direct `fetch()` to `https://api.anthropic.com/v1/messages`,
   matching `api/coach.js`'s request shape field-for-field (model, `max_tokens`, the two-block
   `system` array with `cache_control` breakpoints). `scripts/coach_live_test.mjs` does this.
3. This is a stand-in for the real route, not an approximation of it — the prompt and context are
   the real ones the app generated, not hand-written guesses. The only thing that differs from
   production is which key pays for the call and that it skips `api/coach.js`'s own rate-limit
   bookkeeping (see below).

Before step 1, sign in and reach Coach the same way `authority-finance-live-test`'s setup
describes — reuse its `_scratch_base.cjs`/`dismiss_helpers.cjs`/`login.cjs` if you've already set
those up this session rather than duplicating them. One thing specific to Coach: its nav trigger
only exists in the mobile bottom nav (`.mobile-bottom-nav`) — there is no desktop entry point
anywhere in the codebase — so set a mobile viewport (`page.setViewportSize({width: 390,
height: 844})`) before trying to open it, or you'll find nothing to click.

## Getting the test key

This workaround needs a **separate, scoped** Anthropic API key — never the app's real
`ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY_TEST`, and it must never be wired into the app's own
code or into Vercel's environment variables. It's a human-funded credential used only to make
these direct test calls.

- Env var name: **`AI_ADMIN_COACH_TEST_KEY`**. Use this exact name — it's already the established
  convention for this purpose, so a script that reads it will just work if the user has already
  set it up, and a user who's done this before will recognize the name instantly.
- If it's not set, tell the user plainly what's needed and why (a scoped Anthropic key, added as
  an environment variable on this Claude Code environment, named exactly
  `AI_ADMIN_COACH_TEST_KEY`) rather than trying alternate names or silently skipping the test.
- Never echo the raw key value anywhere in your output, logs, or committed files — treat it like
  any other secret even though it's scoped and low-stakes by design.
- `api.anthropic.com` needs to actually be reachable from wherever this runs — it has been in
  past sessions' sandboxes, but don't assume; confirm with a cheap check before planning a whole
  test round around it.

## Token budget discipline — the actual point of this skill

`api/coach.js`'s 25-calls/day rate limit is enforced **server-side, inside the route this
workaround bypasses entirely.** Calling Anthropic directly does not go through that limiter, so
nothing except your own judgment stops this from becoming an expensive, open-ended exploration.
Don't let it:

- Work from a **small, fixed, planned set of test prompts** decided *before* you start calling
  the API — not prompts you think up mid-session as you go. A good set covers: one broad
  "what's my overall picture" question (data-accuracy + brevity check), one narrow specific-number
  question (data-accuracy), and — only if testing a personality/tone change — the rubric's own
  canonical broad-scope trigger phrase, since that's what `docs/coach-personality-rubric.md`
  anchors its scoring to.
- **One call per planned prompt**, not a retry loop. If a response looks off, that's a finding to
  write down, not a reason to re-ask hoping for a different answer — Coach's output is
  nondeterministic, so re-rolling until you get a good-looking answer would just be lying to
  yourself about whether a prompt fix actually works.
- A **2-turn follow-up test** (asking a narrower question after Coach's first reply) is fine and
  useful for checking conversational consistency — but that's still one deliberate pair of calls,
  planned in advance, not a rolling chat you improvise.
- If you're re-testing after a prompt-tuning fix, re-run only the *specific* prompt(s) whose
  output the fix targets — not the whole planned set again — unless you have a real reason to
  suspect the fix affected something else too.
- Model is fixed at `claude-haiku-4-5` (matching `api/coach.js`'s production mapping) — cheap, and
  changing it would mean you're no longer testing what production actually runs.

If you find yourself wanting "just one more" call outside the planned set, stop and either ask
the user or write down the open question instead — this discipline is what keeps this workaround
trustworthy to use at all.

## What to check

**Data accuracy.** Cross-check every number Coach cites against the same authoritative function
the UI itself reads (`buildYear`, `computeNet`, `computeGoalTimeline`,
`getEffectiveAmountForMonth`, etc. in `src/lib/finance.js`) — never approve a Coach answer as
"looks about right." `docs/active-systems.md` §6 documents this grounding pattern and is worth
rereading before this pass: every context field Coach receives is supposed to resolve through the
same function the UI uses, never a parallel approximation, and that's exactly the kind of drift a
recent finance-logic fix could reintroduce without anyone noticing in a unit test.

**Personality / brand voice.** Score against `docs/coach-personality-rubric.md`'s defined axes
(read it fully first — it's short and defines what "good" means concretely, including anchored
examples). Check its "Known Limitations" section too, if present, before reporting something as a
new finding — it may already be a documented, open issue rather than something worth re-filing.

## When you find something

- **Data-accuracy bug**: root-cause it in `src/lib/aiContext.js` (`buildCoachContext()`) or
  wherever the mismatched context field is built — this is a real code bug, treat it with the
  same rigor as any other finding (see `authority-finance-live-test`'s "Doc conventions" and
  "Domain landmines" sections — same drift-app-warden.md/BUG_FIX_TODO.md process applies here).
- **Personality/tone issue**: the fix lives in `src/lib/coachPrompts.js`
  (`ASK_COACH_SYSTEM_PROMPT`). After editing it, check `src/test/lib/coachPrompts.test.js` for any
  regex/string assertion your wording change might have broken — update the test to match the new
  wording (don't weaken what it's actually checking) rather than deleting it.
- **Prompt rewrite didn't fix a rubric violation on retest**: this happens — a hard, explicit,
  self-checkable rewrite doesn't guarantee compliant output from a live model every time. Don't
  loop indefinitely rewriting the same instruction hoping the next phrasing sticks (burns budget
  for uncertain payoff). One rewrite-and-retest per issue is reasonable; if it's still not fixed,
  document it as a known limitation (in the rubric doc itself, and as a 🔶-status open finding in
  `BUG_FIX_TODO.md`) rather than continuing to spend calls on it — note whether a structural
  approach (like a few-shot worked example baked into the prompt) looks more promising than
  another prose rewrite, for whoever picks it up next.

Same commit/push discipline as `authority-finance-live-test`: document, test, commit, push at the
end of the pass, without waiting for approval at each step — unless what you found is genuinely
ambiguous (is this actually wrong, or is the rubric itself under-specified for this case?), in
which case that's worth asking about before spending more budget chasing it.
