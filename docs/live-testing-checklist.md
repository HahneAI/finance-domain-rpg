# Live Testing Checklist — Math/Time + Headless UI

Standing punch list for the live-testing pass started 2026-08-24 (math-engine audit →
admin-tools sweep → adversarial-input pass). Each item names what to verify and how,
split by *kind* of check rather than by feature, since the two need different rigor:

- **Math/Time** items get verified by running the real production function (`buildYear`,
  `computeNet`, `computeNewJobSeasonRunway`, etc.) against real or representative config —
  script-level, no browser needed — then, where the number is user-visible, cross-checked
  against what the live UI actually displays for the same account/scenario.
- **Headless UI** items get verified by driving the real app with Playwright (see
  `_scratch_base.cjs` pattern below) — clicking through the actual flow, not just asserting
  the underlying function returns the right number.

A "found" item gets a real fix + a `drift-app-warden.md` F-entry + a `BUG_FIX_TODO.md` DW
entry, same as every other finding this session — this file is the intake queue, not the
permanent record (see `BUG_FIX_TODO.md`'s own header for that distinction).

> Status legend: ⬜ not started · 🔶 in progress · ✅ done (see linked DW-entry) · 🚫 blocked

---

## Playwright harness (for every Headless UI item below)

Use the `authority-finance-live-test` skill ("live test the app" / "run a testing pass" /
work through this checklist) — it bundles the launch helper, login script, and modal-dismiss
helpers this session settled on, plus the process for driving each item end to end (investigate
→ fix → test → document → commit → push) and the doc-conventions this file feeds into
(`drift-app-warden.md` F-entries, `BUG_FIX_TODO.md` DW-entries). Anything touching Ask Coach
specifically goes through the `authority-finance-coach-live-test` skill instead — it has its own
token-budget/API-key handling this one doesn't cover.

Notes learned the hard way this session (worth knowing beyond what the skill already covers):
- Use `waitUntil: "domcontentloaded"` + an explicit `waitForTimeout(8000-9000)`, not
  `networkidle` — the app's own polling keeps `networkidle` from ever firing.
- Button `textContent` is literal JSX text, not CSS-transformed — a button styled
  `text-transform: uppercase` still matches lowercase in `page.textContent('body')`.
- `input[type=number].fill()` silently clamps/empties out-of-range or non-numeric values in
  some cases — cross-check the real `.inputValue()` after filling, don't trust a body-text
  string search alone for adversarial-input tests.
- MetricCard's countup animation (~1200ms) means a number read immediately after a view
  switch can be mid-count — wait ~2s before comparing two panels' figures for an exact match.
- The shared test account is real, persistent state across the whole session — anything that
  flips a big mode switch (New Job Season, Investor, etc.) needs a clear revert path
  confirmed *before* activating it, not after.

---

## Math / Time Calculations

### 1. New Job Season — live UI walkthrough ✅ (DW-16, DW-17 — 2026-08-26)
Script-level math already verified (`computeNewJobSeasonRunway`'s burn/cash-decay/benefits/
pending-check piecewise formula all matched hand-calculation exactly, incl. both branches of
the "check arrives before vs. after dry-out" edge case — see chat history 2026-08-25). Full
live click-through completed 2026-08-26 on the real shared test account (DHL Warehouse):
- Snapshotted `config`/`expenses` via the DB Row Viewer first, per this file's own guidance.
  Walked the full "Quit My Job" wizard (`NewJobSeasonEntry.jsx`) end to end, both with and
  without a pending final paycheck (all 4 real steps, including the days-worked/arrival-day
  pending-check sub-flow). Found and fixed two real bugs along the way: bill labels hardcoded
  "/mo" regardless of the expense's real billing cycle (DW-16), and the step-count header read
  "Step 4 of 3" whenever the due-dates step existed (also DW-16).
- `NewJobSeasonHomePanel`/`NewJobSeasonBudgetPanel` rendered runway numbers that were
  cross-checked against the real persisted config/expenses (cash on hand, pending-check
  amount/date, weekly burn, cash runway end date) — all consistent with each other and with
  `computeNewJobSeasonRunway`'s inputs.
- **Revert path** (this file's own stated prerequisite): "Back to Work" was confirmed to cleanly
  restore normal mode (nav tabs, Home panel) — but only via the 800ms debounce; the button itself
  had no eager save at all, a real CLAUDE.md Persistence-pattern gap (DW-17), now fixed and
  live-verified (DB row confirmed `newJobSeasonMode: false` within 1.5s of the click). Re-entered
  and exited New Job Season a second time post-fix to confirm both fixes together and leave the
  shared account in a clean, fully-reverted, `setupComplete: true` state.
- Coach's New Job Season context line was not separately re-tested this pass — still tracked as
  Headless UI item 5 below.

### 2. Loans tab math ✅ (script-verified 2026-08-26, no defect found)
Flagged as DW-W1 (`drift-app-warden.md` §10 F41) — loan `history` is regenerated retroactively
on every edit (`buildLoanHistory(meta)`), a known designed-in gap. Script-level check (real
`computeLoanPayoffDate`/`buildLoanHistory`/`loanPaymentsRemaining`/`loanWeeklyAmount` against two
representative loans — a $1,000/$100-weekly loan and a $2,000/$150-biweekly loan):
- `computeLoanPayoffDate` matched a hand calculation exactly for both combos (weekly: 10 payments
  → 2026-03-16; biweekly: 14 payments → 2026-12-14), including the quarter-safe zero-out date
  (`buildLoanHistory`'s second entry starts the day after the payoff's containing quarter ends).
- `loanPaymentsRemaining` matched a hand-calculated elapsed-payments count exactly for a loan
  actively mid-payoff (7 of 14 biweekly payments remaining as of today).
- Edited loan terms mid-quarter (`paymentAmount` $150→$200) and confirmed the DW-W1 risk is real
  and exactly as documented: `buildLoanHistory` regenerates the **entire** `weekly[4]` array from
  the new terms, including the `effectiveFrom` anchor that predates today — past weeks' spend
  *does* silently change. Not a new bug; matches F41's documented, accepted design debt exactly —
  no action taken, no new F-entry needed.
- `weeklyAmountForBurn` (`newJobSeasonRunway.js`) calls `loanWeeklyAmount(exp.loanMeta)` directly
  for `exp.type === "loan"`, bypassing `getEffectiveAmount`/`history` entirely — confirmed via
  code read + the same $150-biweekly loan numerically (`loanWeeklyAmount` → $75/wk, matches
  `weeklyAmountForBurn`'s only consumer path for loans). Correct and independent of the DW-W1
  regeneration gap, as F41 already documents.

### 3. Résumé Review / job-hunt tracking math ✅ (script-verified 2026-08-26, no defect found)
`ReemploymentTracker.jsx` — target income derivation (`baseRate × hours`), job application log.
- `defaultTargetAnnual = rate * hours * 52` (fallback placeholder shown only until the user sets
  `targetIncomeAnnual` explicitly — the stored value always wins via `config?.targetIncomeAnnual ??
  defaultTargetAnnual`) matched a hand calculation exactly against the real test account's rate
  ($25/hr × 40hr × 52 = $52,000).
- Noted, not a bug: the jobless-onboarding wizard pages (`SetupWizard.jsx`/`SetupWizardAdlib.jsx`,
  "My prior rate was $X an hour") write `targetIncomeAnnual` directly using a *hardcoded* 40-hour
  assumption (`rate * 40 * 52`), a different formula from this component's own `hours` (which
  prefers the account's real `maxWeeklyHours`/`standardWeeklyHours`). Not drift — the two serve
  different purposes (an explicit answer once a prior rate is known, vs. a same-job-hours
  placeholder guess before one is), and once the wizard's value is stored this component just
  displays it rather than recomputing — confirmed by reading `applyConfigUpdate`'s call sites.
- `targetWeeklyNet`'s flat-rate net estimate is self-documented in its own comment as a rough
  sketch (same simplification class as DW-W6/F142's `estimateGoalNextYear`), not the authoritative
  `computeNet` path — no live defect, matches its stated intent.
- `applyConfigUpdate` (target income, return-to-work date, application CRUD/status) already
  follows the CLAUDE.md eager-save pattern correctly — synchronous compute + `setConfig` +
  `saveConfigNow`, no debounce-only gap like DW-17's `handleBackToWork` had.
- Not covered this pass: a live UI click-through of the application log CRUD itself (add/edit/
  delete/status-change) — the math above was checked by reading + a script-level formula
  cross-check, not by driving the actual panel in a browser.

### 4. Life Events — full save-through flows ✅ (DW-18 — 2026-08-26)
This session only tested adversarial *input* on the wizard page (negative/huge/decimal
values, now fixed — DW-14/F156). Never finished watching a save propagate all the way to
Home/Income's displayed numbers.
- **"Rate Update" (`RateUpdateModal`)** — full save-through walked live on the real test account
  (baseRate $25→$27, confirmed, then $27→$28, then reverted back to $25). Home's "next week vs.
  this" delta and Income's rolling window both reflected the new rate consistently, no stale
  figures. Found and fixed a serious real bug in the process (**DW-18**): the very first rate
  change an account ever makes has no `baseRateHistory` entry old enough to anchor the OLD rate,
  so every already-elapsed "ACTUAL" week before the change silently starts tracking whatever the
  CURRENT live rate is instead — directly contradicting the modal's own "only forward-looking
  projections use the new rate" promise. Confirmed live via a direct `account_history` fetch +
  `buildYear` re-run against the real account's data (not just a synthetic case), fixed with a
  one-time `FISCAL_YEAR_START`-anchor backfill in `App.jsx`'s config-history watcher, and
  re-verified live with a second rate change that this time correctly left earlier weeks pinned
  to their historical rate instead of drifting again.
- **"Pay Structure Changed"** — full 5-page wizard (Intake → Schedule → Deductions → Tax Rates →
  Wrap Up) walked live in `structure_change` re-entry mode: confirmed every page pre-fills
  correctly from the real account config, changed a real field (weekend differential $1.75→$2.00),
  confirmed the Wrap Up diff card correctly showed "Weekend diff $1.75/hr → $2.00/hr" and a live
  net-pay preview, clicked Finish Setup, and confirmed the new value persisted to the DB
  (`diffRate: 2`) with `baseRate` and everything else untouched — no stale figures, no unintended
  side effects. Reverted back to $1.75 the same way afterward. No new defect found on this path
  beyond the DW-18 gap already covered above (which applies to any `baseRate` edit regardless of
  which of the two entry points makes it).
- Account left in a clean, fully-reverted state (`baseRate: 25`, `diffRate: 1.75`) after both
  flows; full `npm run test:run` (1683 tests) green throughout.

---

## Headless Browser UI Testing

### 5. Ask Coach ✅ (data pull verified live; personality tightened, DW-19 partial — 2026-08-26)
This sandbox has no `/api/coach` route (plain `vite`, not `vercel dev`) and no Anthropic key by
default — confirmed blocked with a zero-cost probe (`/api/coach` 404'd before reaching Anthropic
at all) before spending anything. Unblocked mid-session via a scoped `AI_ADMIN_COACH_TEST_KEY`
env var, called directly against the real `claude-haiku-4-5` endpoint with the exact
`systemPrompt`/`contextBlock` captured live from the running app (a `page.route` interceptor on
the outgoing `/api/coach` POST, not a hand-reconstruction) — faithful to the real request shape,
just bypassing the serverless hop itself.
- **Data pull:** every figure Coach cited across 8 live calls (4 messages × 2 rounds) matched the
  captured context exactly — Left This Week, Next Week Takehome, Net Worth Trend, Budget Health,
  and the Food/Phone Bill weekly-cost breakdown all agreed with what Home/Budget display directly.
  Confirms DW-15's `avgWeeklySpend` unification reaches Coach with zero drift.
- **Personality:** live-tested against the real model (previously impossible to verify — only the
  prompt *text* could be read, never actual output) and found real, reproducible deviations from
  the system prompt's own rules: 3 of 4 messages ran well past the "two to three sentences" target
  even on non-mechanics questions, the canonical broad-question trigger ("give me everything")
  cited 7 numbers instead of ≤3 and skipped the required follow-up invite, and one message stacked
  two figurative touches in violation of the explicit "never stacked" rule. Tightened
  `coachPrompts.js`'s wording (scoped the paragraph-length exception to genuine mechanics
  questions only; rewrote the broad-question cap as a hard, self-checkable rule) and re-ran the
  identical 4 messages: length and the stacked-metaphor issue resolved cleanly, the follow-up
  invite now fires, but the broad-question number cap still didn't hold even after the rewrite —
  filed open as **DW-19** (prompt-tuning gap, not a code defect; `drift-app-warden.md` F160).
- Full `npm run test:run` (1683 tests) green after the prompt edit. Total live-call cost across
  both rounds: ~25K input / ~1.2K output tokens, ≈$0.03.
- Not covered this pass: the adversarial chat-input angle (very long message, rapid-fire sends)
  and DW-9's rate-limiter/cost-guardrail behavior — deliberately out of scope to keep the live-call
  count lean per the explicit rate-limiting instruction for this pass.

### 6. Bulk Edit — second pass now that it's reachable ✅ (DW-20 — 2026-08-26)
F155/DW-13 shipped last session (double-tap trigger + standalone button, full-page
`BulkEditPage.jsx`). This pass drove a full multi-change session live for the first time: staged
an edit (Food $130→$135, forward scope) + a deletion (Phone Bill, forward) + a new $8/wk addition
in one Bulk Edit visit, confirmed the change-count badge tracked correctly at every step (1 → 2 →
3), and saved. Found and fixed a real bug in the process (**DW-20**): the edit and deletion
patches never wrote `monthlyOverrides` — a live regression of the original F37 "editing does
nothing" defect, this time on the Bulk Edit save path specifically. The staged-edit UI and the
save itself both looked correct; only Budget's own totals (reading the authoritative
`monthlyOverrides` layer) revealed the change hadn't actually taken effect. Confirmed via direct
DB fetch with a distinctive test value (not just eyeballing a screenshot), fixed by reusing the
exact same override-writing helpers the single-expense Save-scope buttons already use, and
re-verified live post-fix with the same distinctive-value test. 4 new unit tests added. Full test
suite (1687 tests) green. Test account left clean — Food back to $130, throwaway test expenses
zeroed out. Documented in `drift-app-warden.md` F161 / `BUG_FIX_TODO.md` DW-20.

### 7. Reopen Last Check-In / Force Sync Push (isAdmin-only, not isAiAdmin) ⬜
Deliberately not exercised this session (out of scope for the `isAiAdmin` test account per
its own documented restriction — no-write policy). If a full-`isAdmin` session is ever
available, worth a pass: these were the DW-3 fix (eager-save on reopen) from an earlier
session — confirm they still work post this session's `isDiagnosticAdmin` gate changes
(F153) without having actually re-tested them live this time.

### 8. PWA install / offline behavior ✅
Tested against a real production build (`npm run build` + `npm run preview`) since the SW never
activates under plain `npm run dev`. Found and fixed **DW-21**: `vite.config.js`'s VitePWA
`manifest` object was auto-generating `dist/manifest.webmanifest` *and* auto-injecting a second
`<link rel="manifest">` tag alongside the pre-existing hand-authored `public/manifest.json` — and
the two had already drifted apart (missing apple-touch-icon entry, mismatched `lang` field),
directly contradicting `index.html`'s own comment assuming they'd match. Fixed by setting
`manifest: false` in `vite.config.js`, leaving `public/manifest.json` as the single canonical
manifest; verified `dist/index.html` now ships exactly one manifest link and the service worker
still registers/activates normally post-fix. Offline behavior separately verified live via
Playwright (`context.setOffline(true)` + reload): the cached app shell (full login screen, not an
error page) rendered correctly with zero network access, confirming workbox's `navigateFallback`
+ precache setup works as configured. Full test suite (1687 tests) green throughout — no test
exercises the manifest file directly. Documented in `drift-app-warden.md` F162 /
`BUG_FIX_TODO.md` DW-21.
