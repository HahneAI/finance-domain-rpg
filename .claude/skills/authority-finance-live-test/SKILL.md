---
name: authority-finance-live-test
description: Drives a live, headless-browser testing pass against the Authority Finance app (finance-domain-rpg repo — personal finance dashboard, income/budget/goals/log panels) using its shared test account, working through docs/live-testing-checklist.md item by item to find, root-cause, fix, test, and document real bugs. Use this whenever the user asks to "live test" Authority Finance, run a testing pass, work through the live-testing checklist, verify a recent fix actually works in the running app (not just in unit tests), or investigate whether some Authority Finance feature behaves correctly end-to-end. Also use it proactively when asked to test any non-Coach Authority Finance feature live — Setup Wizard, Home/Income/Budget/Log panels, Bulk Edit, PWA/offline behavior, weekly check-ins, goals/expenses. For anything touching the Ask Coach AI feature specifically, use the authority-finance-coach-live-test skill instead — it has its own token-budget and API-key handling this skill doesn't cover.
---

# Authority Finance — Live Testing Pass

This skill encodes a working process, not a one-off script: drive the real running app the way a
user would, notice when something looks wrong, chase it to a root cause in the code, fix it,
prove the fix with both a live re-test and a regression test, then leave a paper trail so the
next session doesn't have to rediscover it. Unit tests alone won't catch what this skill is for —
the app's own docs note real production bugs (masked writes, gate bypasses, a React-Compiler
miscompilation) that had 100% green test suites the whole time. Live-driving the app is the only
way to see what a real user sees.

## Before you start

Read `.claude/CLAUDE.md` in the repo root first if you haven't already this session — it's the
project's own instruction file and takes precedence over anything below if the two conflict
(this skill can drift out of date; CLAUDE.md is maintained in the same PRs as the code).

Then confirm your environment:

- `TEST_ACCOUNT_EMAIL` / `TEST_ACCOUNT_PASSWORD` env vars are set (Claude Code on the web's
  session-start hook reports this at session start — check for
  "[session-start] test account credentials present"). Without these, headless login isn't
  possible and this skill can't run. Tell the user rather than guessing at credentials.
- `npm run dev` boots the app at `http://localhost:5173`. **`/api/*` routes never work here** —
  they're Vercel serverless functions with no local dev proxy. Any feature that depends on one
  (Stripe checkout, the admin changelog/beta-hub routes, Coach) is out of scope for *this* skill;
  Coach has its own workaround skill, the others generally aren't live-testable in this sandbox
  at all — note that rather than treating a 404 there as an app bug.
- Outbound network is allowlisted, not open — don't assume you can `WebFetch` a Vercel preview
  URL or any other arbitrary domain from inside a driver script or from your own tools; if you
  need to reach something not already reachable, say so rather than quietly failing.

## Setup

1. Use your session's scratchpad directory for everything — driver scripts, `auth-state.json`,
   screenshots. Never write these into the repo itself.
2. Playwright's `chromium` binary is preinstalled at `/opt/pw-browsers`; the `playwright` npm
   package itself may not be — check with `npm ls playwright` from the repo root and
   `npm install --no-save playwright` if missing (`--no-save` on purpose: this is a testing
   convenience for this session, not a project dependency to commit).
3. Copy `scripts/_scratch_base.cjs` and `scripts/dismiss_helpers.cjs` into your scratchpad
   directory. Every driver script should `require('./_scratch_base.cjs')` for its `launch()`
   helper rather than reinventing the Playwright launch args — this sandbox's proxy needs
   specific `--proxy-server`/`--proxy-bypass-list`/`--ssl-version-max` args, and a script missing
   them tends to hang with no useful error rather than fail fast.
4. Run `scripts/login.cjs` once per session to sign in and save `auth-state.json`. Every later
   script gets a logged-in session for free via `launch()`'s default `useAuth: true`.
5. Nearly every page load can surface an unprompted modal (the daily tips/commission check-in
   card, occasionally a PWA install dialog) that will eat your next click if you don't clear it.
   Call `dismissCheckin(page)` and `dismissPwaDialog(page)` from `dismiss_helpers.cjs` right
   after any navigation, before interacting with the page.

## The loop

1. **Pick the next item** from `docs/live-testing-checklist.md` (⬜ = not started). Read the
   item's own notes — some are explicitly restricted (e.g. one item is scoped out for the shared
   `isAiAdmin` test account's no-write policy on certain admin tools; don't attempt it, note why
   it's skipped and move to the next one instead).
2. **Drive the real feature.** Log in, navigate to it, exercise the golden path and at least one
   edge case a real user would hit — not just "does it render." Screenshot at meaningful steps;
   they're cheap and the fastest way to show your work later.
3. **When something looks wrong, don't paper over it.** Cross-check what the UI shows against
   the app's own authoritative source of truth — read the relevant `src/lib/finance.js` function
   or equivalent rather than guessing whether a number is right. A live pass earns its keep
   precisely by catching drift between what a UI surface displays and what the data actually is.
4. **Root-cause before you patch.** Read the actual code path, not just the symptom. This app has
   a documented recurring failure class worth knowing before you touch anything (see
   *Domain landmines* below): a fix that "looks right" in the UI can still be silently wrong
   underneath if it writes to the wrong layer.
5. **Fix it, then prove the fix twice**: once live (re-drive the exact scenario that showed the
   bug, ideally with a deliberately distinctive test value so a coincidental match can't fool
   you), and once as a regression test (`npm run test:run` must stay green, and the new test
   should fail against the pre-fix code if you check that by temporarily reverting).
6. **Document it** — see *Doc conventions* below. This step is not optional even for a fix that
   feels small: the whole reason this project maintains a drift ledger is that undocumented fixes
   get silently re-broken by a later unrelated change.
7. **Update the checklist item** itself (⬜ → ✅) with a short writeup of what was tested and
   found, in the same style as the existing entries — read a couple of the existing ✅ entries
   in `docs/live-testing-checklist.md` first so yours matches their level of detail.
8. **Test, commit, push.** Run the full `npm run test:run` suite before every commit — it should
   already be green from step 5, this is the final gate. Commit with a message that explains why,
   not what (the diff already shows what). Push to whatever branch this session is already on
   (`git push -u origin <branch-name>`) — don't create a new branch unless asked. Do this at the
   end of each checklist item, not batched at the end of a whole session; a session can be
   interrupted, and undocumented/unpushed work is invisible to whoever picks this up next.

Do all of this without stopping for approval between steps — investigate, fix, test, document,
commit, and push in one continuous pass per checklist item, the same way a human engineer would
work through their own punch list. Only stop and ask if you're genuinely blocked: credentials
aren't available, a checklist item's scope is ambiguous, or you're not confident a "bug" you
found is actually wrong behavior rather than intended design (check `docs/active-systems.md` and
`docs/drift-app-warden.md` before assuming — a lot of subtle-looking behavior here is deliberate
and already explained there).

## Domain landmines

These aren't obscure — they're the exact shape of bug this kind of live pass has caught before.
Know them going in so you don't mistake a real defect for expected behavior, or vice versa.

- **`monthlyOverrides` is authoritative, not `history`.** `getEffectiveAmountForMonth`
  (`src/lib/finance.js`) checks `monthlyOverrides` *first* and returns immediately if a value
  exists there — `history`/`billingMeta.byPhase` is only the fallback baseline. Any write path
  that updates `history` but not `monthlyOverrides` for an expense that already has an override
  will silently do nothing visible anywhere in the UI, while still round-tripping cleanly through
  Supabase. This has bitten more than one feature (see `drift-app-warden.md` F37, F161). If you're
  testing anything that edits an expense's amount, check `monthlyOverrides` directly (the DB Row
  Viewer admin tool, or a direct Supabase fetch) after the edit — don't trust the UI alone.
- **Eager save vs. the debounce.** Any Save/Confirm/Add/Delete-shaped action is supposed to call
  a synchronous eager-save (`saveConfigNow`, `onSaveGoalsNow`, `onSaveExpensesNow`,
  `onSaveLogsNow`, `onSavePtoGoalNow` — see CLAUDE.md's Persistence section) rather than relying
  solely on the 800ms background debounce. If you background the tab or reload immediately after
  such an action and the change is gone, that's a real bug (data loss), not a fluke — this exact
  class of bug caused real production data loss before.
- **The service worker never activates under `npm run dev`.** PWA/offline testing requires a real
  production build: `npm run build` then `npm run preview -- --port 4173`, and drive that URL
  instead of 5173. Testing offline behavior against the dev server will just look broken for the
  wrong reason.
- **Coach's nav trigger only exists on mobile.** There is no desktop entry point into Ask Coach
  anywhere in the codebase — you must set a mobile viewport (`page.setViewportSize({width: 390,
  height: 844})`) before it's reachable at all. (You shouldn't be testing Coach with this skill
  anyway — see the header note — but this is worth knowing if you stumble into it.)
- **A green `npm run test:run` is not sufficient evidence a UI change is correct.** This app's own
  CLAUDE.md documents two real blind spots in the test setup: a React Compiler miscompilation
  that crashed 3 admin panels with zero test failures, and invalid-HTML-nesting warnings that
  never fail the suite. A real build + a real render is the only way to catch either — which is
  exactly what this skill's live-driving approach is for.

## Doc conventions

Three files, three jobs — don't blend them:

- **`docs/drift-app-warden.md`** — the full technical write-up. Each finding gets a numbered
  entry (`**F<N> · <one-line title>**`), tagged `[L]` (LEDGER — computes/stores truth; drift =
  silently wrong numbers) or `[G]` (GATEWAY — routes/gates/presents; drift = wrong surface for
  the wrong tier/mode), placed in the section matching the area it touches (read that section's
  existing entries to match format — an `> **IF** ... **THEN** ...` trigger-map line at the end
  is standard, naming what a *future* change should re-check). Read §5 ("How Drift-Map Entries
  Are Written") in that file before writing your first entry from scratch.
- **`docs/BUG_FIX_TODO.md`** — the work queue. One row per finding in either the Open or Fixed
  table, numbered `DW-<N>` sequentially (check the file for the highest existing number — don't
  guess). Link back to the warden-doc entry rather than duplicating its analysis. Update the
  "DW-1 through DW-N are all fixed" summary line when you close one out.
- **`docs/live-testing-checklist.md`** — the punch list this skill works through. One entry per
  numbered item, ⬜ until done, ✅ with a short results writeup after.

Numbers in all three files are sequential and shared context across sessions — always check the
current highest number in each file rather than assuming where a previous session left off; this
file itself may be stale by the time you read it.

## Reference scripts

- `scripts/_scratch_base.cjs` — Playwright launch helper (proxy args, optional auth-state reuse).
- `scripts/login.cjs` — one-time session login, saves `auth-state.json`.
- `scripts/dismiss_helpers.cjs` — `dismissCheckin`/`dismissPwaDialog`, call both after navigation.

These are starting points, not a rigid API — write new one-off driver scripts per feature you're
testing, following the same `launch()`/dismiss-helpers pattern, rather than trying to force one
generic script to cover every panel.
