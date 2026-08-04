# Bug Fix To-Do

**Repurposed 2026-07-19:** this file is now the standing **bug intake for Drift App
Warden passes** (`docs/drift-app-warden.md` — see its "Findings offload" section).
Every open code defect a drift pass surfaces gets one entry here; the warden doc keeps
the full analysis, this file is the work queue. Entries link back to their warden
section rather than duplicating the write-up.

> Status legend: ✅ confirmed by code reading · 🔶 suspect, needs live-data confirmation

---

## Open — Drift Warden findings

DW-1 through DW-9 are all fixed — see the Fixed table below. Nothing is
currently open; new findings get filed here as DW-10+.

---

## Fixed — Drift Warden findings

| # | Finding | Where | Severity / blast radius | Fix |
|---|---------|-------|------------------------|-----|
| DW-1 | **Quick Rate Update didn't eager-save the live rate.** `onActivate` set `config.baseRate` via bare `setConfig` — no `savePersistedStateNow` — so the live rate rode the 800ms debounce. The `account_history` row + optimistic `baseRateHistory` append were already safe, so week math survived a lost write after reload, but live `config.baseRate` (ProfilePanel display, wizard previews) could silently revert. | `App.jsx` — `RateUpdateModal.onActivate` | Soft-D3 · any user running Quick Rate Update on mobile | Mirrors `NewJobSeasonEntry.onActivate`'s compute-then-eager-save shape immediately above it: computes `nextConfig` synchronously, calls `setConfig(nextConfig)` then `savePersistedStateNow({ config: nextConfig })` in the same handler. `drift-app-warden.md` §7.4 finding 1 (T1 pass) |
| DW-2 | **`taxDerived` memo had a stale dep under admin Lock Date, plus an inconsistent real-clock read.** The memo used `effectiveToday` (past/future split for tax-status override remediation) but its dep array listed only `today`, so the withholding-gap numbers didn't recompute when Lock Date changed until an unrelated dependency moved. Separately, `remainingTaxedChecks` (the denominator of `extraPerCheck`) used real `today` outright regardless of Lock Date — an internal contradiction within the same ratio, and out of step with F118's own rule that only entitlement/billing gets a real-clock carve-out. `extraPerCheck` isn't cosmetic — it feeds `computeNet` everywhere (`projectedAnnualNet`, every per-week net lookup), so this weakened the Lock Date tool's core promise across the whole app, not just the Tax Plan card. | `App.jsx` — `taxDerived` useMemo | Admin-only · weakened the Lock Date tool's simulation promise app-wide | `remainingTaxedChecks` now filters on `effectiveToday`; the dep array lists `effectiveToday` in place of `today` (which the body no longer reads). Verified via the `react-hooks/exhaustive-deps` lint rule, which previously flagged the missing dependency and now reports none. Not unit-tested directly — `taxDerived` is inline in `App.jsx` with no extraction to a testable pure function, same limitation as DW-1/DW-3. `drift-app-warden.md` §9.1 F28, §9.4 finding 1 (T3 pass) |
| DW-4 | **Dead-code cleanup (owner-scheduled).** `BenefitsPanel.jsx` (553 lines) was confirmed dead: imported by no module, no nav entry, orphaned for the repo's entire visible history — yet it still received blanket-sweep edits and even gained coverage tests in the July test pass (`12f5441`), so it actively cost maintenance and could mislead a future change into "fixing" unshipped code. | `src/components/BenefitsPanel.jsx` (+ tests) | Dead code · no runtime impact, real maintenance/drift cost | Deleted the file and its coverage tests (`panels.test.jsx`'s `describe('BenefitsPanel', ...)` block + now-unused imports). Re-ran the import-graph sweep the finding called for across all of `src/components/` (35 files) and `src/lib/` (18 files) — confirmed `BenefitsPanel.jsx` was the only orphaned module, no other file only referenced by its own test. Updated CLAUDE.md's file-structure map and Known Cleanup list. `drift-app-warden.md` §11.3, CLAUDE.md Known Cleanup |
| DW-3 | **Reopen Last Check-In didn't eager-save its deletes.** Dropping the confirmation record + its spawned log entry used bare functional `setState`s — the one Delete-shaped action on the Income surface violating the CLAUDE.md eager-save rule. Worst case was mild (admin-only; a lost delete resurrects a valid confirmation). | `App.jsx` — `handleReopenLastCheckIn` | Soft-D3 · admin-only | `handleReopenLastCheckIn` now computes `nextLogs`/`nextWeekConfirmations` synchronously and calls `savePersistedStateNow({ weekConfirmations: nextWeekConfirmations, logs: nextLogs })` alongside the `setState`s. `drift-app-warden.md` §9.4 finding 2 (T3 pass) |
| DW-5 | **Log Effect Summary re-derived adjusted take-home in parallel with App, weekMeta-less.** `LogPanel.jsx`'s local `logs.reduce` called `calcEventImpact(e, config)` **without `weekMeta`** (fell back to rotation-string matching + `projectedGross` approximation) and counted events App's `totalNetAdjustment` excluded (non-finite `weekIdx`), while Income/Home displayed App's weekMeta-aware `logTotals.adjustedTakeHome` — the Log tab and Income Year Summary could disagree on the same account. A third, previously-undocumented divergence found while fixing this: Log's "Adjusted Take-Home" never subtracted `fundedGoalSpend` at all, even though Income's does and LogPanel already receives that prop. The admin per-entry breakdown and the Week Inspector's per-week log filter shared a sharper sibling bug: `Number("")` and `Number(null)` both evaluate to `0`, so an event with no real `weekIdx` was silently misattributed to week 0 (borrowing its real tax status/grossPay) instead of being excluded. | `LogPanel.jsx` (`tot` reduce, per-entry breakdown), `App.jsx` (`eventImpact` memo, Week Inspector `weekLogs`), `finance.js` (`calcEventImpact`'s internal tax lookup), `DemoAccountTree.jsx` (mirrored `eventImpact`) | D1 · any account with logged events, worse on week-0 edge cases | Added `resolveEventWeekMeta(event, allWeeks)` to `finance.js` — the one place "does this event have a real week" is answered (`""`/`null` → `null`, never coerced to `0`); every `calcEventImpact` caller now goes through it. Threaded `logNetLost`/`logNetGained`/`adjustedTakeHome` from App's `logTotals` down to `LogPanel` (same pattern as the existing `logK401kLost` props) so those tiles read the authoritative value directly instead of recomputing it. Fixed the same `Number(weekIdx)` coercion inside `calcEventImpact`'s own tax-status lookup and in the Week Inspector's log filter. Regression-tested in `finance.test.js` (`resolveEventWeekMeta` suite + `calcEventImpact` weekIdx-coercion suite) and `LogPanel.test.jsx` ("Log Effect Summary — reads authoritative props," "Total Gross Lost — resolves the real week"); all verified to fail on the pre-fix code. `drift-app-warden.md` §13.1 F54/F57/F62, §13.4 (T6 pass) |
| DW-6 | **`ptoGoal` Save/Clear lacked eager save.** `saveForm` (`LogPanel.jsx`) and Clear were discrete Save/Clear actions but App passed bare `setPtoGoal` — no eager-save wrapper existed for `ptoGoal` anywhere (the CLAUDE.md eager-save table had no `ptoGoal` row; gap in the `764da5b` audit). | `LogPanel.jsx` `saveForm`/Clear · `App.jsx` | D3 · any PTO-tracking user on mobile | Added `onSavePtoGoalNow(next)` prop in App (`savePersistedStateNow({ ptoGoal: next })`), threaded to `LogPanel`, called in both `saveForm` and Clear alongside `setPtoGoal`. CLAUDE.md's eager-save table now has a `ptoGoal` row. Regression-tested in `LogPanel.test.jsx` ("PTO Goal — eager save"; verified it fails on the pre-fix code). `drift-app-warden.md` §13.4 finding 2 (T6 pass) |
| DW-7 | **Lifecycle cron never fetched `is_tester` — tester exemption was dead in production.** `decideLifecycleAction`'s bypass gate (`api/_lifecycleEngine.js:44`) checks `row.is_admin \|\| row.is_investor \|\| row.is_tester`, but the cron's SELECT (`api/cron-subscription-lifecycle.js:135–137`) fetched only `is_admin, is_investor` — `row.is_tester` was always `undefined`, so a beta tester whose 6-month window lapsed unrenewed would be dunned on the real cadence and, at window+7d, **archived and deleted** by `archiveAndDeleteAccount` — the exact outcome §23/§20 say must never happen. Unit tests passed because they build rows with `is_tester` set directly; the select list sat outside the pure engine's test seam. | `api/cron-subscription-lifecycle.js:135–137` vs `api/_lifecycleEngine.js:44` | **D4 · HIGH** — silent auto-deletion of beta tester accounts ~6 months after flag flip | Added `is_tester` to the SELECT. Added `src/test/api/cronLifecycleSelectColumns.test.js` — a structural regression test that reads the actual string passed to Supabase's `.select()` at runtime and asserts it's a superset of every `row.*` field `_lifecycleEngine.js` reads (verified by reverting the fix locally: the new test fails with `expected ['is_tester'] to deeply equal []`). Kills the whole class (any future field the engine reads but the cron doesn't select), not just this instance. `drift-app-warden.md` §16.1 F86 / §16.4 / §20.1 F112 |
| DW-8 | **`CoachNetWorthCard` (Red tier trigger) could never render during New Job Season.** `App.jsx`'s Home-view branch fully swaps `HomePanel` for `NewJobSeasonHomePanel` whenever `config.newJobSeasonMode` is true, and `NewJobSeasonHomePanel` never mounted `CoachNetWorthCard` — the Red tier's entire premise (New Job Season + runway under 30 days) was structurally unreachable. | `App.jsx` Home-view branch; `HomePanel.jsx` / `NewJobSeasonHomePanel.jsx` | **D4** — gate drift, mode-switch silently dropped the surface instead of carrying it forward | Mounted `CoachNetWorthCard` inside `NewJobSeasonHomePanel` too, behind the same `canAccessAiFeatures({isAdmin, isTester})` gate as `HomePanel`'s mount (`App.jsx` now threads `currentWeek`/`isAdmin`/`isTester` to `NewJobSeasonHomePanel`). Added a real `includeBenefits` prop to `CoachNetWorthCard` (was hardcoded `true` — dead code until this mount existed) so the New Job Season panels' live benefit-scenario toggle reaches the card instead of a stale default. Amber/Green tiers still won't fire from this mount (they need `netWorthHealth`, a normal-mode-only concept not threaded through) — only Red is reachable here, which matches what Red actually means. Regression-tested in `newJobSeasonFlow.test.jsx` ("Coach presence (DW-8 fix)": gated for non-admin/non-tester, renders Red tier for admin when runway < 30 days). |
| DW-9 | **Coach's rate limiter and cost guardrails weren't durable, and neither multi-turn conversations nor the frozen system prompt had a full caching story.** `shouldFireForTier()`'s fire-history was keyed to `localStorage`, not a per-account column, so it reset on a new device/cleared cache/PWA reinstall. `api/coach.js`'s token-usage logging skipped production entirely (`if (VERCEL_ENV === "production") continue`) — the one environment where real cost would show up was the one that suppressed it. A third gap found during the same cost-analysis pass: the `messages` array carried no `cache_control` breakpoint at all, so every turn of a multi-turn Ask Coach chat resent and re-priced its entire prior history at full input rate, uncached, forever. | `src/lib/coachTriggers.js`/`CoachNetWorthCard.jsx` (rate limiter) · `api/coach.js` (telemetry + history caching) | **D4** — gate drift: guardrails sized to the current isAdmin/isTester population, not to a real rollout | Rate limiter: moved `signalState` to `config.coachSignalState`, eager-saved via the same `setConfig`/`saveConfigNow` channel every other config field uses — durable per-account, no new schema (`CoachNetWorthCard.test.jsx`). Telemetry: removed the production skip and collapsed the two-line log into one structured `[coach:usage]` line per call with a computed `est_cost_usd` (published per-MTok rates), readable directly from Vercel's log viewer. History caching: added a `cache_control` breakpoint to the last message in every request (the newest turn), per Anthropic's multi-turn placement guidance, so a follow-up turn reads the prior exchange from cache instead of re-pricing it in full. Regression-tested in `coach.test.js`. **Deliberately not fixed**: the combined system+context prefix (~3,000 est. tokens) may sit under Haiku 4.5's 4,096-token minimum cacheable-prefix floor, meaning the frozen system prompt itself might not be caching at all — see DW-W4. Not padded on purpose; the prompt is expected to grow with upcoming features, which may clear the floor on its own. |

---

## ⚠️ Not bugs — but could use attention

Watch items from Drift Warden passes: nothing here is a live defect, and nothing here
should be "fixed" casually — each one is either designed-in debt with an owned roadmap
entry, or a hardening opportunity whose risk is currently fenced. Filed so they're
visible in the work queue, not just the ledger. `DW-W` numbering keeps them distinct
from the defect rows above.

| # | Item | Where | Why it's not a bug / what would change that | Warden entry |
|---|------|-------|---------------------------------------------|--------------|
| DW-W1 | **Loans D2 zone — history regenerated retroactively.** Every loan edit rebuilds the loan's entire `history` from `loanMeta` (`history: buildLoanHistory(meta)`), so editing terms rewrites past weeks' spend — same root cause as the income engine's flat-config gap. | `BudgetPanel.jsx:1272–1293` · `finance.js:1129` | Designed-in known gap with an owned roadmap entry (`TODO.md` §19's loan follow-up — the plan is an expense-style point-in-time `history[]`). Becomes a defect only if someone adds a consumer that treats regenerated history as past-week truth before §19 ships. | `drift-app-warden.md` §10 F41 + §10.4 |
| DW-W2 | **`investorcodes` sub-view lacks a route-level gate.** ProfilePanel's `taxplan` route re-checks its gate at the route (`activeSection === "taxplan" && canSeeTaxPlan`); `investorcodes` gates only the admin ListRow — the route itself trusts that `activeSection` can only be set by tapping. | `ProfilePanel.jsx:1944–1946` vs `:1941` | Unexploitable today: `activeSection` is tap-only component state, and InvestorAdminPanel's data calls are RLS-gated server-side. Becomes real the day sub-view state gains any external setter (deep link, restored nav state, URL param) — F45's IF/THEN is the tripwire. Cheap hardening: add `&& isAdmin` to the route for symmetry. | `drift-app-warden.md` §12 F45 + §12.4 |
| DW-W3 | **`dateToWeekIdx` formula duplicated in `db.js`.** The `startDate`→`firstActiveIdx` load-time sync (`db.js:313–316`) inlines the exact formula of SetupWizard's file-private `dateToWeekIdx` (§7 F1): `ceil((date − FISCAL_YEAR_START)/7)` clamped to `[0,51]`. Two copies of the app's most nuclear derivation. | `db.js:313–316` vs `SetupWizard.jsx:703` | Identical today — becomes D1 the day either copy changes alone. Fix shape: extract one shared helper into `fiscalWeek.js`, import in both. | `drift-app-warden.md` §14 F67 + §14.4 finding 1 (T7 pass) |
| DW-W4 | **Ask Coach's system+context prefix may sit under Haiku 4.5's cache-write floor.** `ASK_COACH_SYSTEM_PROMPT` measures ~11,067 chars (~2,770 est. tokens); combined with a typical `buildCoachContext()` block (~200–400 est. tokens) the cacheable prefix lands around ~3,000–3,200 est. tokens — below Anthropic's documented 4,096-token minimum cacheable prefix for Haiku 4.5. If so, the `cache_control` markers already on both blocks (`api/coach.js`) silently never engage: no error, `cache_read_input_tokens` just stays 0 forever, and every Ask Coach call pays full input price for the frozen system prompt on every single turn. | `src/lib/coachPrompts.js`/`coachFeatureGuide.js` (prompt size) vs `api/coach.js` (cache_control placement) | Deliberately not fixed by padding — the prompt is expected to keep growing as more Coach features/context fields land, which may clear the floor on its own. Becomes worth a real fix (or a deliberate pad) once the DW-9 production telemetry (`[coach:usage]` line, now live) shows `cache_read=0` across repeat calls with an otherwise-unchanged prefix, confirming the floor is the actual blocker rather than something else. | Found during the DW-9 cost-analysis pass, 2026-07-24 — not yet covered by a formal warden pass |

---

## ARCHIVED — Expense add/edit defects (2026-06-15/16) — shipped

Everything below is the historical June pass on `monthlyOverrides`/`history`
reconciliation. **Verified 2026-07-19: the fix shipped** — the pure helpers it
introduced (`onwardStartMonthKey`, `applyQuarterForward`, `applyAllQuarters`) are live
in `src/lib/expense.js` with their tests, and the display-anchor fix is in
`BudgetPanel.jsx`. The only item never formally closed was the optional live-data
verification on Anthony's account (step 5's `lastEditedAt` cleanup also remains
vestigial, non-blocking). Kept for the decision record (Decisions 1–3 still govern
expense-save semantics — do not re-litigate without sign-off).

Tracking expense add/edit defects that surface when acting on the **current**
fiscal timeline (today = 2026-06-15, Q2). Both reports trace back to how the
budget panel reconciles two storage layers — `monthlyOverrides` and `history` —
and how the save/add helpers write to them.

---

## ⚙️ How resolution actually works (ground truth)

There is **one** resolver, `getEffectiveAmountForMonth(exp, monthKey, phaseIdx)`
(`src/lib/finance.js` ~651):

1. If `monthlyOverrides[monthKey]` exists → **use it** (always wins).
2. Else → fall back to `history` (latest entry with `effectiveFrom ≤ the 15th of
   the month`, via `getEffectiveAmount`).

So **`monthlyOverrides` unconditionally shadow `history`**, regardless of which was
edited more recently. That is the root tension with the intended behavior:

> **Intended model:** the most recent save/override from any create/update change
> should take priority **precisely** within the timeframe the user selected via the
> save-button choice.

### What each Save button writes today

| Button (scope) | Writes `monthlyOverrides`? | Writes `history`? | Precise + most-recent-wins? |
|---|---|---|---|
| `[Month] Only` (`saveThisMonth`) | ✅ that month | — | ✅ |
| `This Qtr` (`saveThisQuarterOnly`) | ✅ the 3 quarter months | — | ✅ |
| `[Month]+ Onward` (`saveFromMonthForward`) | ✅ month→Dec | ✅ (redundant) | ✅ |
| **`Q[n]+ Onward`** (`saveAllQuarters`) | ❌ **none** | ✅ only | ❌ shadowed by any in-range override |
| **`All Qtrs`** (`saveAllQuartersFull`) | ❌ **none** | ✅ only | ❌ shadowed by any in-range override |

**Core defect:** the two quarter-scoped saves write *only* `history`, but the
resolver reads `monthlyOverrides` first. If any month in the selected range already
has an override — from a prior month-level edit, or seeded data (e.g. **Angel**
carries `2026-04`/`2026-05` overrides) — the new quarter save is silently ignored
there.

### ⚠️ Correction to a prior finding
An earlier draft claimed `latestPastEntry` was called without its `todayIso`
argument. **That was wrong.** `BudgetPanel.jsx:574` defines a local closure
`const latestPastEntry = (existing) => latestPastEntryPure(existing, TODAY_ISO)`
that binds the date correctly. Not a bug — disregard.

---

## ✅ Decisions locked (2026-06-16)

These three product/architecture decisions are settled and govern the
implementation. Do not re-litigate without explicit sign-off.

### Decision 1 — In-range conflict: **overwrite finer overrides in range**
When a broader save (`Q+ Onward`, `All Qtrs`) covers months that already have a
per-month override, the broad save **replaces** those overrides across its scope.
- **Why:** this is what "the most recent save wins **precisely** in the selected
  timeframe" requires — the newest, broadest edit is authoritative across the whole
  window the user picked.
- **Trade-off accepted:** prior month-specific customizations inside the range are
  intentionally discarded. The user chose a broad scope; that is the signal to flatten.
- **Approach note:** with Option A this is automatic — writing an override for each
  month in scope overwrites whatever was there. No separate "clear" pass needed.

### Decision 2 — "Onward" in the current period: **today's month forward only**
For the current period, an `Onward` save covers the **current month → December**.
Already-elapsed months in the current quarter are **left untouched**.
- **Example (today 2026-06-15):** `Q2+ Onward` and `June+ Onward` both write
  **June → Dec**. April and May are not modified.
- **Why:** "onward" reads as future-facing from now; rewriting elapsed months would
  retroactively change periods the user has already lived/spent through.
- **Fixes in scope:** `saveAllQuarters` currently back-dates its `history` entry to
  the quarter's first month (April 1) and can create a **duplicate `effectiveFrom`**.
  Under Decision 2 the write window starts at the current month, eliminating both the
  back-dating and the duplicate-`effectiveFrom` fragility.

### Decision 3 — Storage approach: **Option A — unify on `monthlyOverrides`**
Every scoped save writes an override for exactly the months in its scope (quarter
saves included). `monthlyOverrides` stays the authoritative layer; `history` is the
baseline for untouched/future months and brand-new expenses.
- **Why over timestamp-based resolution (Option B):**
  - Smallest, most contained change — **no rewrite of the resolver**, which feeds
    display, projections, budget health, and goal timelines (highest-risk surface).
  - Decisions 1 & 2 map directly onto it: "precise scope" = the exact set of month
    keys written; "today-forward" = write `currentMonth…Dec`; "overwrite in range"
    is automatic.
  - Deterministic — one value per month, no tie-breaking, no clock dependence, easy
    to unit-test.
  - Option B doesn't remove the work: a timestamp alone doesn't encode which months
    a save covered, so per-month scope must still be stored — Option A's granularity
    plus a resolver rewrite and a clock dependency on top.
- **The one real cost (must handle):** a few display surfaces read `history`
  **directly** and ignore overrides — `currentEffective`/`quarterEffective`
  (`BudgetPanel.jsx` ~197 / ~230, used by the quarter cards and swipeable stacks at
  ~439/472/501/534, and the restore sheet at ~2217). When overrides become
  authoritative, these must either keep `history` in sync on every save **or** be
  pointed at `getEffectiveAmountForMonth`, so the same expense never shows two
  different numbers across surfaces.

---

## Bug 1 — Editing an existing expense "onward" in the current timeline does nothing

**Reported:** Editing **Gas** ($100/wk → $70/wk) in the Q2 / June review; tapping
`June+ Onward` or `Q2+ Onward` and saving drops back to the sheet with no change.
The same buttons work in a **future** quarter/month.

**Root cause** ✅ — the quarter-scoped saves (`saveAllQuarters`, `saveAllQuartersFull`)
write only `history`, which the resolver treats as lower-priority than any
`monthlyOverrides` already present in the range (see "Core defect" above). Works in a
future view because future months typically have no overrides, so `history` wins
cleanly. Secondary contributors — back-dated `effectiveFrom` and duplicate entries in
`saveAllQuarters`, and the current-quarter display anchor (see Bug 2) — are resolved
by Decisions 2 and 3.

**Verification (optional, to confirm on live data):** Config dump of the live **Gas**
object to check for current/forward `monthlyOverrides`; DB Row → Fetch for `expenses`
drift + `updated_at` right after a failed onward save.

---

## Bug 2 — New expense added "[Month]+ Onward" on a fresh account saves as $0/check

**Reported:** On a new account in quarter view, adding an expense and tapping the
green `June+ Onward` creates the card but shows **$0/check** and doesn't factor in.

**Root cause** ✅ — a fresh account opens in quarter mode with `ap` = current quarter
(Q2). The quarter card reads `displayMonthKey = QUARTER_FIRST_MONTHS[ap]` =
`"2026-04"` (April). But `addExpFromMonthForward` anchors to the actual current month
(June), writing overrides/history only from June forward. April has neither an
override nor an in-effect history entry, so `getEffectiveAmountForMonth(exp, "2026-04")`
returns **0** → the card and the headline `ts` total (both read off April) show $0,
even though June-onward weeks are actually funded by `computeRemainingSpend`.
`addExpAllQuarters` is unaffected (its history starts at April 1).

**Fix (under Decision 3):** clamp the current quarter's representative month so the
quarter card reflects what's in effect **now** (current month) rather than an elapsed
month — `displayMonthKey` for the current quarter → `max(QUARTER_FIRST_MONTHS[ap],
currentMonthKey)`. This also resolves Bug 1's display-anchor contribution.

---

## 🔧 Implementation plan

Build order, all under the locked decisions above:

1. ✅ **Make quarter-scoped saves authoritative.** `saveAllQuarters` and
   `saveAllQuartersFull` now write `monthlyOverrides` across their exact scope
   (current-month → Dec for the onward case per Decision 2; all 12 for All Qtrs),
   overwriting in range (Decision 1), and keep one `history` baseline entry. The
   back-dated/duplicate `effectiveFrom` write is gone. Override construction is
   extracted to pure helpers in `src/lib/expense.js` (`onwardStartMonthKey`,
   `applyQuarterForward`, `applyAllQuarters`) alongside the month-level helpers.
2. ✅ **Fix the current-quarter display/add anchor** (Bug 2). `displayMonthKey` now
   anchors the current quarter to the current month (`ap === currentPhaseIdx
   ? currentMonthKey : QUARTER_FIRST_MONTHS[ap]`), so June-onward adds/edits no
   longer read $0 off elapsed April. All display totals flow through
   `displayEffective`, so the headline `ts` and cards are fixed too.
3. ✅ **Reconcile history-only readers.** The restore sheet now resolves via
   `getEffectiveAmountForMonth` at the displayed month; the debug-trace readers
   (`currentEffective`/`quarterEffective`) were re-pointed at the override-aware
   resolver so console output matches the panel. The now-unused `getEffectiveAmount`
   import was dropped from `BudgetPanel`.
4. ✅ **Tests** (`src/test/lib/expense.test.js`): each save scope writes the precise
   month set; broad save overwrites an in-range override; elapsed months are
   preserved; a brand-new expense is non-zero after All Qtrs; a save→reload
   (JSON round-trip) is stable. 16 new cases, all green; full suite unchanged
   apart from the pre-existing unrelated failures.
5. 🔶 **`lastEditedAt` — left vestigial (deliberate).** Under Option A, resolution is
   purely override-presence; no timestamp tie-break is needed, so the new quarter
   helpers intentionally do **not** stamp `lastEditedAt`. The field is still written
   by the month-level helpers and read nowhere — a candidate for a later cleanup
   pass, not blocking this fix.

> **Status:** steps 1–4 implemented, committed, and pushed to
> `claude/expense-editing-current-timeline-qitm8h`. Step 5 is a non-blocking
> follow-up. Remaining: live-data verification on Anthony's account (Gas edit +
> fresh-account add) before closing out.
