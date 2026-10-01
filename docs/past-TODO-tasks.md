# Past TODO — Authority Finance (Completed Work Log)

*Extracted from `docs/TODO.md`. Each entry is a sprint or feature group shipped and closed.
One-liner per item — see git history for full implementation detail.*

---

## Archived from TODO.md — 2026-10-01 cleanup

*Fully-closed subsections moved verbatim from `docs/TODO.md` (original headings, section numbers, and checkboxes untouched). Still-open siblings (§1.H12, §1.H14, §3.F3–F4, §19.1) stayed in TODO.md.*

### ARCHIVED: §1.A–D (Entry Point, Structure Wizard, New Job Season, Quick Rate Update)

### A–C. Entry Point, Structure Overwrite Wizard, New Job Season — LIVE, see `active-systems.md` §10

- **§A Entry Point** — `LifeEventMenu.jsx` (3-tile modal: Pay Structure Changed / Quit My Job /
  Quick Rate Update). Wired in `App.jsx`; also reachable from `ProfilePanel`'s "Life Events" row.
- **§B Structure Overwrite Wizard** — `SetupWizard.jsx`'s `lifeEvent="structure_change"` path:
  brief re-entry overview at Step 0, every field pre-fills from `originalConfig`, `StructureChangeDiff`
  renders on Wrap Up, DHL↔base preset switching reuses the normal Step 1 fields.
  `newJobSeasonFlow.test.jsx` covers the flow.
- **§C New Job Season (C1–C6, all live)** — `NewJobSeasonEntry.jsx` → `NewJobSeasonDashboard.jsx`
  (unemployment benefits gate/amount/duration/waiting-week, runway calculator, bill countdowns,
  with/without-unemployment scenario toggle), `ExpenseTriage.jsx` (`newJobSeasonStatus:
  active|paused|cancelled` per expense, auto-reactivate on Back to Work), `ReemploymentTracker.jsx`
  (target income, return date, application log w/ 6 status states). `config.newJobSeasonMode` /
  `newJobSeasonDate` zero earned income forward in `buildYear()` (`finance.js`). Persistent amber banner
  in `App.jsx` while active; "Back to Work" clears job-loss fields and re-enters the wizard as
  `structure_change`. `newJobSeasonFlow.test.jsx` (20 tests) + `buildYearNewJobSeason.test.js` cover it.
- **Don't re-spec this from scratch** — any future work here (tweaks, bugfixes, extensions) should
  read the actual files above first, not this doc.

---

### D. Quick Rate Update (non-structural raise) — BUILT 2026-07-17

*For when the pay structure stays the same but the rate changed — shouldn't require a full wizard.*

- [x] **Rate update modal** — `src/components/RateUpdateModal.jsx`: single screen, new hourly
  rate + effective date. **Dropped the "optional note" field** — there's no schema field or any
  other place for free-text notes to go on a rate change, so a note input with no destination
  would've been dead UI; cut rather than half-built.
- [x] **Effective-date handling** — **not** `firstActiveIdx` (that's the account-wide "when did
  this account start" scalar, unrelated to a single field edit). Instead uses the account_history
  mechanism §3 already shipped: the modal's date travels as `effectiveFrom` into
  `configHistoryMetaRef` exactly like `NewJobSeasonEntry`'s `newJobSeasonDate` does, tagging the automatic
  config-history snapshot with `source: "life_event:rate_update"`. `baseRate` was already on the
  §3 historically-sensitive whitelist, so no new plumbing was needed there.
- [x] **Confirmation diff** — shows old rate → new rate + an estimated weekly net delta, computed
  via a new shared `estimateWeeklyNet()` (`src/lib/finance.js`) extracted from `SetupWizard.jsx`'s
  `StepWrapUp` live-preview formula (was duplicated logic in the wizard alone; now both callers
  read the same formula rather than risking drift).
- [x] **Wired live** — `LifeEventMenu.jsx`'s tile flipped from `comingSoon: true` to
  `route: "rate_update"`; `App.jsx` opens the modal and applies `{ baseRate }` to config on confirm.
  7 new tests in `newJobSeasonFlow.test.jsx` (prefill, validation gate, confirm payload, cancel, Escape,
  menu routing). 1032 tests passing; lint diff-clean vs. baseline; production build green.
- **Not yet verified live** — same sandbox limitation as everything else in this repo (no
  Supabase credentials here): unit tests + build only. Needs a real click-through on a deployed
  preview to confirm the modal opens from the Life Events menu and the account_history snapshot
  actually lands with the right `effectiveFrom`.
- [x] **Point-in-time correctness fix (2026-07-17) — the effective date now actually gates the
  math.** Live-QA caught that the original ship of this feature had the effective date do nothing
  but tag the audit-trail snapshot — `buildYear()` applied the new `baseRate` uniformly to every
  week including already-elapsed ones the moment Confirm was hit, silently rewriting past months'
  reported income and every annual total (Tax Plan, goal timeline) that sums across the whole
  year. Fixed as a deliberately narrow slice of §3's deferred Master Timeline read-path — **just
  `baseRate`**, not a general point-in-time config resolver:
  - `resolveBaseRateForWeek(rateHistory, weekEnd, liveBaseRate)` (`lib/finance.js`) — mirrors
    `getEffectiveAmount`'s exact algorithm (latest entry with `effectiveFrom <= weekEnd`, else
    fall back to the live rate). `buildYear(cfg, baseRateHistory = null)` takes an optional new
    param; omitted (every call site except App.jsx's live one — SetupWizard, DemoAccountTree, the
    math-audit trace helper) behaves byte-identical to before.
  - `db.js`'s `loadUserData()` fetches `account_history` rows filtered to `baseRate` changes as an
    isolated query (same missing-table tolerance pattern as `week_confirmations`) and maps them to
    `{ effectiveFrom, baseRate }` via new `extractBaseRateHistory()`.
  - `App.jsx` threads `baseRateHistory` state through `applyLoadedData`/`handleForcePull`, passes
    it into the one live `buildYear(config, baseRateHistory)` call, and optimistically appends a
    local entry the instant a `baseRate` edit's `saveConfigSnapshot` fires — closes the gap where,
    without it, a **future-dated** effective date would misapply the new rate too early to weeks
    between today and that date, since the just-inserted DB row hasn't round-tripped into memory yet.
  - **Deliberately out of scope**: every other historically-sensitive field (schedule, tax rates,
    benefits, ...) still applies uniformly to every week as before — this is not §3's read path
    being "done," just the one field this feature surfaced. `calcEventImpact`'s own `cfg.baseRate`
    reads (Log panel per-event math) and the bucket-payout-rate fallback are untouched — those
    price a specific already-logged event against *current* config by design, not an annual grid.
  - 13 new tests (`resolveBaseRateForWeek` + `buildYear` point-in-time cases in `finance.test.js`;
    `loadUserData` baseRate-history mapping/fallback cases in `db.test.js`). 1063 tests passing;
    lint diff-clean; production build green.

---


### ARCHIVED: §1.H + H1–H11 (Jobless Onboarding Path)

### H. Jobless Onboarding Path — BUILT 2026-07-18 *(seeded 2026-05-15)*

*A new first-run wizard question — "Are you currently unemployed?" — was planted in Step 0.
Today both Yes and No route through the standard pay-structure steps (DHL question next),
and the answer is stored on `config.startedUnemployed`. The plan below builds that seed into
a true branched onboarding so jobless users land in a usable app from day one.*

#### H1. Branched Step 0 routing — DONE

- [x] **Persist `startedUnemployed` to Supabase** — no new plumbing needed; it was already a
  plain `DEFAULT_CONFIG` field, round-trips via the normal `config` JSONB merge same as every
  other scalar config value.
- [x] **Wizard routing** — `SetupWizard.jsx`'s `STEP_DEFS` gained a shared `isFirstRunJobless(d,
  ev) = ev === null && d.startedUnemployed === true` predicate. Steps 1–4 and the normal Wrap Up
  all now `showIf: (d, ev) => !isFirstRunJobless(d, ev)` — genuinely skipped from `activeSteps`,
  not just hidden — and three new steps (ids 10–12) show only when `isFirstRunJobless` is true.
- [x] **Re-entry guard** — `isFirstRunJobless` requires `ev === null`; any life-event re-entry
  (including `structure_change`) always gets the full normal step set regardless of
  `startedUnemployed`, confirmed by a dedicated test.

#### H2. Jobless Setup mini-flow — DONE, consolidated to 3 screens

*Built as 3 actual wizard steps rather than 5 separate screens — 0a+0b share one screen (same
fields as the already-existing `NewJobSeasonEntry.jsx` modal for the same data), 0c+0d share one
screen, 0e is its own confirm screen. Fewer taps for a "quick" onboarding without dropping any
required field.*

- [x] **Screen 1 — `StepJoblessBenefits`** (0a+0b): unemployment Y/N gate; if Yes, weekly amount,
  duration in weeks, waiting-week toggle. `isValid` requires an explicit answer (mirrors
  `NewJobSeasonEntry`'s `canActivate`).
- [x] **Screen 2 — `StepJoblessDetails`** (0c+0d): job-loss effective date, defaulted to today
  the moment "Yes" is answered at Step 0 (overridable here) — **not** deferred to this screen,
  since `firstActiveIdx`/`startDate` also need a same-instant default and there's no other step
  left to set them. Optional prior hourly rate, assumed a 40hr week, computed straight into
  `targetIncomeAnnual` (the exact field `ReemploymentTracker` already reads with priority) —
  **dropped "prior employer name"** from the original spec: there's no schema field or any
  consumer for free-text employer identity anywhere in the app (confirmed against §3's own
  parked "future fields" list), so it would've been a UI input with nowhere to go. Same
  no-dead-inputs call as Quick Rate Update's dropped "note" field.
- [x] **Screen 3 — `StepJoblessWrapUp`** (0e): plain confirm/finish summary (job loss date,
  benefits, target income if set) — no live net preview, since there's no pay structure to
  preview yet.

#### H3. Wizard completion path for jobless users — DONE

- [x] **`onComplete` payload** — no special-casing needed in `handleComplete()`: every jobless
  step writes directly into `formData` via the wizard's normal `onChange`, so `newJobSeasonMode`,
  `newJobSeasonDate`, and the four unemployment fields are already present by the time the generic
  `{...finalData, taxedWeeks, accountCreatedIdx, setupComplete: true}` spread runs.
  Test-verified via the full payload from a completed run.
- [x] **Land on New Job Season Dashboard** — turned out to already be free: `App.jsx` renders
  `NewJobSeasonDashboard` unconditionally whenever `config.newJobSeasonMode` is true, above the normal
  panel switch, regardless of which nav tab is active — first paint after any jobless
  completion already shows it with zero new code.
- [x] **Skip default Food expense seeding** — `App.jsx`'s `handleWizardComplete` now sets
  `expenses: []` (passed directly into the eager-save overrides, not a separate `setExpenses`
  call, to avoid racing React's not-yet-flushed state) when `wizardEntry === false &&
  finalConfig.newJobSeasonMode === true`.

#### H4. "Back to Work" exit for users who started jobless — DONE

- [x] **First-time pay-structure wizard** — the existing "Back to Work" button already routed
  into `structure_change`, which already walks steps 1–4 + Wrap Up in full — this bullet turned
  out to already be satisfied by reusing that flow rather than needing a separate one.
- [x] **Diff view degrades gracefully** — `StructureChangeDiff` now checks
  `originalConfig?.startedUnemployed === true` first and renders a dedicated "filling in a real
  pay structure for the first time" message instead of the field-by-field diff. Necessary
  because `DEFAULT_CONFIG`'s pay fields are real-looking non-null placeholders (e.g.
  `baseRate: 19.65`, not `null`) — without this, the diff would have shown a fabricated "before:
  $19.65/hr" as if it were the user's actual old job.
- [x] **Clear `startedUnemployed` on success** — `App.jsx`'s `handleWizardComplete` clears it to
  `false` specifically when `wizardEntry === "structure_change" && mergedConfig.startedUnemployed
  === true`, so a later real job loss doesn't incorrectly trigger the H5 "no prior pay history"
  copy once the user actually has pay history.

#### H5. App shell signals — DONE

- [x] **Banner copy** — the New Job Season banner in `App.jsx` now branches on
  `config.startedUnemployed === true` to show "Started in New Job Season — no prior pay history"
  instead of the normal "$0 earned income from [date] forward" copy.
- [x] **"Set up essential expenses" prompt** — new tile in `NewJobSeasonDashboard.jsx`, shown whenever
  `expenses` is empty (the exact state H3's Food-seed skip leaves a fresh jobless account in),
  routing via a new `onOpenTriage` prop `App.jsx` wires to `setExpenseTriageOpen(true)`.

**Verification:** 14 new tests (11 in `SetupWizard.test.jsx` covering step routing/collapse,
validation gates, full payload contents, and the diff empty-state; 3 in `newJobSeasonFlow.test.jsx`
for the new dashboard prompt). 1084 tests total passing; lint diff-clean vs. baseline; production
build green. **Not covered by tests:** `App.jsx`'s `handleWizardComplete` conditionals
(Food-seed skip, `startedUnemployed` clear) — same "no component test harness" gap already noted
for the SIGNED_IN short-circuit in §1.I's parked live-verification bullet; needs a real
click-through (start signup → answer Yes → finish → confirm empty expenses + New Job Season Dashboard
→ Back to Work → confirm diff empty-state + `startedUnemployed` cleared) on a deployed preview.

#### H6. New Job Season nav & panel scoping — SUPERSEDED by H7 (see below), 2026-07-18

*Live click-through of H1–H5 surfaced two real gaps not in the original spec: (1) Back to Work
left the account with zero expenses permanently — H3's Food-seed skip has no counterpart restore;
(2) the full 5-tab nav (Home/Income/Budget/Log/Account) stayed up throughout New Job Season, so
Income and Log — both built entirely around an active pay structure — sat there showing
meaningless or stale figures.*

*Original fix (shipped, then explicitly rejected by the user the same day): hide the "Financial
Health" tiles inside the normal `HomePanel` and pin `NewJobSeasonDashboard` above it as a standalone
card, with expense triage in a separate `ExpenseTriage` modal. User feedback: "I believe we are
coding this in a direction away from my vision... job loss mode is seeming to be a singular
'pinned to top' component. We need to think of this as an entirely different mode the app enters."
The nav-reduction bullet (bottom nav/sidebar → Home/Budget/Account) and the Food re-seed fix were
correct and are unaffected — both carried forward as-is. The Home/Budget-panel approach itself
was replaced; see H7.*

- [x] **Back to Work restores the mandatory Food expense** — still current; see H7 for the file
  this now lives next to.
- [x] **Bottom nav (mobile) + sidebar (desktop) drop to Home/Budget/Account while `newJobSeasonMode`
  is true** — still current, unchanged by H7.
- ~~HomePanel tile-hiding~~ / ~~ExpenseTriage modal~~ / ~~pinned NewJobSeasonDashboard card~~ — all
  **removed** in H7 in favor of dedicated mode components.

---

#### H7. New Job Season as a genuinely distinct app mode (Home + Budget rebuild) — DONE 2026-07-18

*Direct response to the course-correction quoted in H6. The ask: New Job Season is not the normal
Home/Budget panels with things hidden or a card slapped on top — it's a different mode the app
enters, with its own Home view and its own Budget view (savings/unemployment numbers + inline
expense triage), plus a small "log extra income" widget on the new Home feeding the runway's
savings figure. Explicitly framed by the user as phase 1 of an iterative process, not a final
design.*

- [x] **`lib/newJobSeasonRunway.js` (new)** — pure shared calc extracted from the old
  `NewJobSeasonDashboard`'s internal logic, so Home and Budget can't drift from each other:
  `firstUnemploymentPaymentDate(cfg)`, `sumJobHuntIncome(cfg)`, and
  `computeNewJobSeasonRunway({ config, expenses, effectiveToday, savings })` →
  `{ weeklyBurn, essentialCount, benefitsRemainingWeeks, projectedUnemploymentTotal, withBenefits,
  withoutBenefits }`. Takes `savings` as a plain argument rather than owning input state, since
  both panels need to read the same number without one owning the other's UI.
- [x] **`components/NewJobSeasonHomePanel.jsx` (new)** — the mode's actual Home view, rendered by
  `App.jsx` **instead of** `HomePanel` (not layered on top of it) whenever `config.newJobSeasonMode`.
  Runway/weekly-burn/extra-income metric cards, a "Log Extra Income" widget (amount + note,
  disabled until a positive amount is entered, recent-entries list with per-entry delete), and the
  existing `ReemploymentTracker` embedded at the bottom.
- [x] **`components/NewJobSeasonBudgetPanel.jsx` (new)** — the mode's actual Budget view, rendered
  instead of `BudgetPanel`. Savings input + benefit-scenario toggle (the numbers this mode is
  actually about), an upcoming-bills countdown, and the full expense triage list — active/paused/
  cancelled, essential/flexible, needs-coverage flag, auto-reactivate, delete, plus a bulk "Pause
  all Flexible" — all inline, no modal. Add-expense form is deliberately simpler than normal
  `BudgetPanel`'s (label/category/flat monthly amount, no quarter-scoping or history editing) —
  **scope decision:** job-loss expense management is "what do I actually owe every week right now,"
  not fine-grained budget planning, so a flat weekly-forward amount is the honest fit for this mode
  rather than a lesser version of the normal flow.
- [x] **New config field `jobHuntIncomeLog: []`** (`constants/config.js`) — `{ id, amount, note,
  loggedAt }` entries logged from the Home widget, summed by `sumJobHuntIncome` into the runway's
  savings side. Chosen over reusing the existing `logs`/event-log mechanism because that mechanism
  carries payroll-tax semantics (gross/net, 401k, fiscal-week indexing) that don't fit informal gig
  cash — a dedicated field is more honest than forcing a fit.
- [x] **Deleted `components/NewJobSeasonDashboard.jsx` and `components/ExpenseTriage.jsx`** — logic
  fully absorbed into the two new panels and the shared runway lib above; confirmed via grep no
  other file referenced either before removing.
- [x] **`App.jsx` rewiring** — new imports; `jobLossSavingsDraft`/`newJobSeasonIncludeBenefits` state
  lifted here (session-only, matches the original "not saved to your account" behavior) so both
  new panels agree without either owning the other's state; Home/Budget render blocks now branch
  `config.newJobSeasonMode ? <NewJobSeason*Panel .../> : <*Panel .../>`; the standalone pinned dashboard
  render and the `ExpenseTriage` modal render are both gone; the banner's action button is now
  "Go to Budget" (`navigateDirect("budget")`) since triage lives on the Budget panel itself, not a
  modal the banner needs to open.
- [x] **`HomePanel.jsx` tile-hiding conditional reverted** — no longer needed or accurate:
  `HomePanel` doesn't render at all during New Job Season anymore (App.jsx routes to
  `NewJobSeasonHomePanel` instead), so a dead `!config?.newJobSeasonMode` guard around the Financial Health
  tiles would misdescribe the actual control flow.
- **Not changed this round (flagged, not decided):** `ProfilePanel`'s New Job Season handling (H6's
  "Job Search" group + Back to Work row) stays as a conditional branch inside the normal
  `ProfilePanel` rather than a fully separate component — the user's correction named Home and
  Budget specifically, not Account; left as-is pending confirmation this should also split out.
- **Verification:** `newJobSeasonFlow.test.jsx` rewritten — old `NewJobSeasonDashboard`/`ExpenseTriage`
  describe blocks replaced with `NewJobSeasonHomePanel` (6 tests) and `NewJobSeasonBudgetPanel` (6 tests)
  blocks; `HomePanel.test.jsx` trimmed back to its original 2 tests (the tile-hiding tests removed
  along with the reverted conditional). Full suite: 1091 tests passing (including the
  `DEFAULT_CONFIG` snapshot updated for `jobHuntIncomeLog`). Lint diff-clean vs. session baseline
  (one pre-existing "memoization could not be preserved" line simply moved from the deleted
  `NewJobSeasonDashboard.jsx` to `NewJobSeasonBudgetPanel.jsx`, same underlying pattern, not a new problem).
  Production build green. **Not covered by tests:** no live click-through yet on a deployed
  preview — same category of gap noted throughout this file for `App.jsx`-level wiring that has no
  component test harness.

---

#### H8. Expense review + payment-date steps, and a real due-date bug fix — DONE 2026-07-18

*User feedback on H7: entering New Job Season should walk the user through which bills to keep
tracking (not silently track everything from normal mode), and each kept bill needs a real payment
date — "when you create an expense in job loss budget mode it auto assumes it's due that creation
date." Root cause: `getNextDueDate` anchored on `billingMeta.effectiveFrom`, which normal
`BudgetPanel` stamps to today on every amount edit — it's an "amount last edited" timestamp, not a
bill due date, so any recently-touched or newly-created bill always showed due "today." (The
"can't put in an amount" half of the report turned out to already be fixed — `NewJobSeasonBudgetPanel`'s
add-expense form already had a working amount field before this pass.)*

- [x] **New `dueDateAnchor` field on expenses** (`lib/expense.js`) — a dedicated due-date anchor,
  separate from `billingMeta.effectiveFrom`. `getNextDueDate` now prefers it, falling back to
  `billingMeta.effectiveFrom` for expenses that predate it so old data keeps working unchanged.
- [x] **New `trackDuringNewJobSeason` field on expenses** (default `true` when absent) — set by the new
  review step below. `computeNewJobSeasonRunway` (`lib/newJobSeasonRunway.js`) and `NewJobSeasonBudgetPanel`'s
  expense list/upcoming-bills/needs-coverage logic all filter on it. Untracked expenses vanish
  from New Job Season Home/Budget entirely — normal-mode `BudgetPanel` ignores the flag completely, so
  nothing is deleted, edited, or otherwise disturbed for when the user goes Back to Work.
  **Scope decision (not re-confirmed with the user after a tool-permission timeout):** went with
  the simpler of two options — untracked bills disappear outright rather than staying listed in a
  muted "re-enable inline" state. Flagging this in case the muted/re-enable version is actually
  wanted; it's a straightforward follow-up if so.
- [x] **`WEEK_OF_MONTH_OPTIONS` + `resolveWeekOfMonthAnchor` + `resolveDueDateAnchor`**
  (`lib/expense.js`) — "1st/2nd/3rd/4th week of month" quick-picks (days 1/8/15/22, clamped for
  short months) plus a manual date fallback, resolved to a concrete ISO anchor.
- [x] **New shared `DueDatePicker` component** (`components/DueDatePicker.jsx`) — the week pills +
  custom-date input, used by both new surfaces below so they can't drift.
- [x] **`NewJobSeasonEntry` (the "Lost My Job" modal — this app's closest thing to a job-loss setup
  wizard) extended into a 3-step flow:** Step 0 is the original date/benefits form, unchanged.
  Step 1 is a new expense-review checklist — every current expense listed, all checked by default,
  unchecking sets `trackDuringNewJobSeason: false` without touching anything else about the expense.
  Step 2 is a new payment-date step — one `DueDatePicker` per bill that's still checked, required
  before the final Activate. **Steps 1–2 are skipped entirely when there are no expenses to
  review**, so the original single-step "Activate" flow (and every existing test for it) is
  unchanged for that case. `onActivate(configPatch, updatedExpenses?)` now takes an optional second
  argument — only passed when there were expenses to review — that `App.jsx` uses to replace
  `expenses` alongside the existing config merge.
- [x] **`NewJobSeasonBudgetPanel`'s add-expense form fixed** — now includes a required `DueDatePicker`
  instead of silently anchoring to today; new expenses get `trackDuringNewJobSeason: true` and a real
  `dueDateAnchor` from the picker.
- **Verification:** `newJobSeasonFlow.test.jsx` — 2 new `NewJobSeasonEntry` tests (full checklist → due-date
  → activate walkthrough asserting `trackDuringNewJobSeason`/`dueDateAnchor` on the result; Back
  navigation preserves Step 0 answers) plus the existing single-step tests all still pass
  unmodified per the skip-when-empty design; `NewJobSeasonBudgetPanel`'s add-expense test split into
  "blocked without a due date" + "adds with a real anchor, not today." `expenseCycles.test.js` —
  7 new tests for `dueDateAnchor` precedence/fallback, `resolveWeekOfMonthAnchor` (including short-
  month clamping), and `resolveDueDateAnchor`. Full suite: 1102 tests passing. Lint diff-clean vs.
  session baseline (caught and fixed a genuine rules-of-hooks violation — a `useMemo` placed after
  `NewJobSeasonEntry`'s early `return null` — during this pass, simplified away rather than hoisted,
  since the memoized array is cheap and small). Production build green. **Not covered by tests:**
  no live click-through on a deployed preview, same gap as H7; the review step's copy/UX (labels,
  scroll behavior with many bills) hasn't been eyeballed in a real browser either.

---

#### H9. Loans weren't grabbed into the H8 flow at all — DONE 2026-07-18

*User caught a real gap in H8: loans live in the same `expenses` array as regular bills
(`type: "loan"`, `category: "Loans"`, a `loanMeta: { totalAmount, paymentAmount, paymentFrequency,
firstPaymentDate }` object instead of `billingMeta`) — the checklist step already listed them (it
iterates `expenses` with no type filter), but `getNextDueDate` required `billingMeta` to exist at
all, so it silently returned `null` for every loan. Loans never showed up in Upcoming Bills, never
got a "Needs Coverage" flag, and displayed no amount in the NewJobSeasonBudgetPanel card list.*

- [x] **`getNextDueDate` (`lib/expense.js`) now has a loan branch** — for `type === "loan"`,
  anchors on `loanMeta.firstPaymentDate` (or a Job-Loss-attached `dueDateAnchor` if present) and
  advances using `paymentFrequency` mapped to the same day-counts as `EXPENSE_CYCLE_OPTIONS`
  (weekly=7, biweekly=14, monthly=30). The date-advancing math itself was extracted into a shared
  `advanceAnchorToNextDue` helper so the regular-expense and loan branches can't drift.
- [x] **New `getExpenseDisplayAmount(expense)` helper** — `loanMeta.paymentAmount` for loans,
  `billingMeta.amount` otherwise. Used everywhere `NewJobSeasonBudgetPanel` and `NewJobSeasonEntry` show a
  dollar figure so loans stop rendering as "$0" or blank.
- [x] **`NewJobSeasonEntry`'s Step 2 (payment date) skips loans entirely** — a loan already has a real
  payment date on file, so re-asking would be redundant. On confirm, tracked loans get
  `dueDateAnchor: loanMeta.firstPaymentDate` attached automatically (the "date that's already been
  selected" carried forward, per the request) instead of going through the `DueDatePicker`. A new
  `keptPickableExpenses` (kept, non-loan) list drives Step 2's UI/validation/skip-logic separately
  from `keptExpenses` (kept, everything) — so a loan-only selection skips Step 2 outright, same as
  an empty one.
- [x] **"Loan" badge added** in both the Step 1 checklist row and the `NewJobSeasonBudgetPanel` expense
  card list — small teal badge matching the existing "Essential"/"Flexible"/"Needs Coverage" badge
  language already in that list. Amount display for loans shows `$X/<frequency>` (e.g. `$200/
  monthly`) instead of the regular bills' `$X/mo`, since a loan's cadence is meaningful (matches
  what normal `BudgetPanel` already does for its own loan rows).
- **Not changed:** loan burn/runway math itself — `computeNewJobSeasonRunway` already included loans
  correctly before this fix, since it sums via `getEffectiveAmount(exp, ...)` which reads
  `exp.history` (populated by `buildLoanHistory` regardless of expense type), not `billingMeta`.
  Only the due-date/display-amount layer was blind to loans.
- **Verification:** `expenseCycles.test.js` — 4 new tests for the loan branch of `getNextDueDate`
  (monthly + weekly cadence, an attached `dueDateAnchor` taking precedence over
  `loanMeta.firstPaymentDate`, and the null cases). `newJobSeasonFlow.test.jsx` — 1 new `NewJobSeasonEntry`
  test (loan shows the badge in Step 1, is absent from Step 2's picker list with an explanatory
  line, and lands with `dueDateAnchor` set to its own `firstPaymentDate` on activate) and 1 new
  `NewJobSeasonBudgetPanel` test (badge + `$200/monthly` display). Full suite: 1108 tests passing. Lint
  diff-clean vs. session baseline. Production build green. **Not covered:** a live click-through
  with a real loan on a deployed preview, same category of gap as H7/H8.

---

#### H10. New Job Season components weren't eager-saving — DONE 2026-07-19

*Caught during a discussion of the Persistence — Eager Save Pattern (CLAUDE.md, documented on
Version-control the same day). Every mutation in `NewJobSeasonHomePanel`/`NewJobSeasonBudgetPanel`/
`ReemploymentTracker`/`NewJobSeasonEntry` built across §1.H7–H9 called raw `setConfig`/`setExpenses`
with no eager-save callback — none of it would survive a backgrounded/reclaimed tab before the
800ms debounce fired, the exact production data-loss bug the pattern exists to prevent. `App.jsx`
already threads `saveConfigNow`/`onSaveExpensesNow`/`savePersistedStateNow` to every normal-mode
panel; the New Job Season rebuild in H7 never picked them up.*

- [x] **`NewJobSeasonEntry`'s activation (`App.jsx`)** — the single highest-stakes gap, since
  activating New Job Season is a one-shot action carrying the whole review/due-date flow's config +
  expenses patch. Now computes `nextConfig` synchronously and calls
  `savePersistedStateNow({ config: nextConfig, expenses: updatedExpenses })` (single atomic write
  covering both fields) right alongside the existing `setConfig`/`setExpenses` calls.
- [x] **`NewJobSeasonHomePanel`** — new `saveConfigNow`/`readOnly` props, `noop`-shadowed when
  read-only (same pattern as `HomePanel`/`BudgetPanel` from archived Stripe Monetization). `logIncome`/`removeEntry` compute
  the next config synchronously and eager-save it.
- [x] **`ReemploymentTracker`** (embedded in `NewJobSeasonHomePanel`, predates this session's rebuild)
  — new `applyConfigUpdate(updater)` wrapper, same shape as `BudgetPanel.jsx`'s
  `applyExpenseUpdate`; all 6 mutation sites (target income set/reset, return-to-work
  date set/clear, application add/edit/delete, status change) renamed to it, no logic
  hand-transcribed.
- [x] **`NewJobSeasonBudgetPanel`** — new `onSaveExpensesNow`/`readOnly` props; new
  `applyExpenseUpdate(updater)` wrapper (identical shape to `BudgetPanel.jsx`'s); triage status,
  auto-reactivate toggle, pause-all-flexible, remove, and add-expense all renamed to it. `readOnly`
  also hides the Add Expense form, Pause-all button, and per-row status/delete controls (matching
  normal `BudgetPanel`'s `!readOnly &&` convention) rather than just silently no-op'ing them.
- **Verification:** `newJobSeasonFlow.test.jsx` — new tests asserting `saveConfigNow`/
  `onSaveExpensesNow` are called with the correct computed value for: removing a logged income
  entry, changing an expense's triage status, removing an expense, and setting target income on
  `ReemploymentTracker`; plus 2 new `readOnly` tests (`NewJobSeasonHomePanel` shadows both callbacks;
  `NewJobSeasonBudgetPanel` shadows both callbacks *and* hides its mutation controls). Full suite: 1111
  tests passing. Lint diff-clean vs. session baseline. Production build green. **Not covered:** a
  live click-through simulating an actual backgrounded-tab reload, same category of gap as
  everything else in this file requiring a deployed preview to verify by hand.
- **Known adjacent gap, not fixed here (flagged, out of scope for this pass):**
  `RateUpdateModal`'s `onActivate` handler (`App.jsx`) has the identical missing-eager-save
  pattern — same "Life Event" one-shot-activation shape as `NewJobSeasonEntry`'s `onActivate`, just for
  Quick Rate Update instead of New Job Season. Worth a follow-up pass.

---

#### H11. "This Week's Check" showing a fraction of a real paycheck after Back to Work — DONE 2026-07-19

*User report: fresh live-tested account, Back to Work into a $22/hr weekly job, 40hr/wk — Income
panel and the Budget breakdown modal both correctly showed ~$714 net for the current week, but
BudgetPanel's "This Week's Check" / "Left This Week" tiles showed $293 / $75. Diagnosed live
against the user's actual Supabase `user_data.config` + `account_history` rows (no admin-tool
access on the test account, so raw table rows were pulled instead — same data Config Raw View and
the account_history baseRate ledger would show). Root cause was NOT a stale job-loss rate leaking
forward (the first hypothesis, ruled out by the actual `account_history` rows) — it's a plain unit
mismatch that hits any account that hasn't been active all 52 weeks of the fiscal year, which is
nearly every real account.*

- [x] **Root cause #1 — `prevWeekNet`'s empty-history fallback.** `App.jsx`'s `prevWeekNet` (read by
  "This Week's Check"/"Left This Week" in both `HomePanel.jsx` and `BudgetPanel.jsx`, and by
  `aiContext.js`'s "Left this week"/Coach line) is supposed to show last week's real, finalized
  paycheck. When there's no prior active week yet — day one after Back to Work, or any brand-new
  account — it fell back to `weeklyIncome`, which is `projectedAnnualNet / 52`. For an account
  active only 24 of 52 weeks, that's the year's real income diluted by 28 weeks of $0 that haven't
  happened yet, not a paycheck. Fixed by falling back to the **current** active week's real
  computed net (already-correct math, just not what the fallback read) instead, only falling back
  to `weeklyIncome` when there's no active week to read at all (e.g. indefinite New Job Season).
  New shared `resolvePrevWeekNet()` (`lib/finance.js`) replaces the duplicated inline version in
  `App.jsx` **and** `DemoAccountTree.jsx` (same bug, same copy-pasted logic, would've hit demo/
  investor accounts too).
- [x] **Root cause #2 — `weeklyIncome` itself divides by a flat 52.** Broader and more serious than
  the tile bug: `weeklyIncome = projectedAnnualNet / 52 - freedomAllowancePerWeek` assumes the account was
  active the whole fiscal year. `HomePanel.jsx`'s "Net Worth Trend" tile already tried to correct
  for this on the *annual savings* side — `annualSavings = avgWeeklySurplus * activeWeeksThisYear`
  — but `avgWeeklySurplus` is built from the still-diluted `weeklyIncome`, so the two didn't agree:
  for a 24-active-week account, `annualSavings` came out roughly diluted by another 24/52 on top of
  itself (confirmed: a synthetic 24-active-week case priced `annualSavings` at $12,000 vs. the
  mathematically correct answer — the old formula gave a materially different, wrong number, not a
  rounding difference). Separately, `aiContext.js`'s own `annualSavings`/`netWorthHealth` used a
  **hardcoded** `* 52` (not `activeWeeksThisYear` at all) — a straight-up drift from the Home tile
  it's labeled as matching, the exact anti-pattern `docs/active-systems.md` §6's grounding
  discipline exists to prevent. Fixed by scaling `weeklyIncome` by the real active-week count
  instead of a flat 52 in `App.jsx` and `DemoAccountTree.jsx` (byte-identical output for any
  `firstActiveIdx: 0` account — i.e. every existing test fixture — since 52 active weeks ÷ 52 is
  unchanged), and by giving `aiContext.js` the same `activeWeeksThisYear` derivation so the Coach
  can't state a "Home tile" figure the Home tile doesn't actually show.
- [x] **New shared `resolveActiveWeeksThisYear(firstActiveIdx)`** (`lib/fiscalWeek.js`) — one
  formula (`FISCAL_WEEKS_PER_YEAR - firstActiveIdx`, clamped to 0) now backs `App.jsx`'s
  `weeklyIncome`, `DemoAccountTree.jsx`'s `weeklyIncome`, `aiContext.js`'s `annualSavings`, and
  `HomePanel.jsx`'s own `annualSavings` (swapped from its local inline copy to the same helper) —
  four previously-independent copies of the same expression down to one, so this can't re-drift.
  `traceExpenseCalculationSteps`'s own diagnostic `weeklyIncome` mirror (`lib/finance.js`) also
  switched from `/52` to its own already-computed `activeWeeks.length`, so the audit trace explains
  the real formula instead of the one it replaced.
- [x] **Dead fallback purged, not just left inert.** `HomePanel.jsx`'s `monthlyTakehome` used to
  read `adjustedTakeHome ?? (weeklyIncome * FISCAL_WEEKS_PER_YEAR)` — the same flat-52 shape as the
  bug just fixed, confirmed dead (both live callers, `App.jsx` and `DemoAccountTree.jsx`, always
  pass a real `adjustedTakeHome`) but left in place initially. Removed outright rather than left as
  inert-but-present: dead code shaped exactly like a bug that was JUST fixed elsewhere reads as a
  pattern to copy to a future session with no memory of this investigation. Now
  `(adjustedTakeHome ?? 0) / 12`, with a comment on the `adjustedTakeHome` prop itself
  (`HomePanel.jsx` ~line 38) spelling out why re-adding that fallback would reintroduce the bug.
  Re-verified: 1128 tests passing, lint diff-clean, build green.
- **Not fixed here — real scope, deliberately deferred, not urgent (flagged 2026-07-19):** see
  §1.H12 below for the full write-up. Short version: none of H11's fix accounts for mid-year gaps
  *within* an otherwise-active year (New Job Season weeks sitting inside the active range) — only
  for an account that started the year late.
- **Verification:** 9 new tests — 4 in `finance.test.js` (`resolvePrevWeekNet`: current-week
  fallback vs. the old diluted average, real-past-week case unchanged, indefinite-Job-Loss-Mode
  fallback to `weeklyIncome`, log-adjustment applied on the new fallback path too), 4 in
  `fiscalWeek.test.js` (`resolveActiveWeeksThisYear` full-year/partial-year/null/clamp cases), 1 in
  `aiContext.test.js` (Coach's `annualSavings` now scales by `activeWeeksThisYear` from
  `config.firstActiveIdx`, not a flat 52 — asserts the old drifted $26,000 does NOT appear). Full
  suite: 1128 tests passing. Lint diff-clean vs. a true `git stash`-verified baseline (not just the
  session-start snapshot — re-ran eslint against unstashed HEAD to confirm the diff is only line-
  number shifts from added code, zero new problems). Production build green. **Not covered:** no
  live click-through on a deployed preview — same category of gap as everything else in this file;
  the original report came from a real device, but confirming the *fix* still needs a redeploy.

---


### ARCHIVED: §1.H13 (Cash on hand)

#### H13. Cash on hand — from session-only draft to a persisted, mandatory field — DONE 2026-07-19

*User framing: the runway calc's "accessible cash on hand" figure needed to actually stick —
persisted and eager-saved, not a draft that evaporates on reload — and needed to be *the* input
that kicks off New Job Season's runway math, not an easy-to-miss optional field discovered only on
Budget. Explicitly the first of a two-part ask: get the number to persist and be prominent first;
richer uses of it (the "more interesting and useful things") are a deliberate follow-up, not
attempted here.*

- [x] **New persisted config field `newJobSeasonCashOnHand`** (`constants/config.js`) — `null` = never
  set (pre-existing accounts only; the wizard makes it mandatory going forward), any number
  including `0` = a real answer. Replaces the old `jobLossSavingsDraft` React state that lived in
  `App.jsx` and was explicitly documented as "not saved to your account."
- [x] **Mandatory in `NewJobSeasonEntry.jsx`'s Step 0** — new "Cash on hand right now" field between the
  date and the unemployment Y/N gate. Validation (`cashOnHandValid`) accepts any finite number ≥ 0
  including 0, rejects empty — folded into `step0Valid` alongside the existing date/unemployment
  checks. Ghost placeholder is `"e.g. 1,023"` (deliberately specific, not a round number, so it
  reads as an example rather than a suggested default).
- [x] **Real red-border feedback, not just a blocked button — required fixing a click-through bug
  along the way.** The Next/Activate button already visually greys out when a step is invalid
  (`nextDisabled`), and was *also* passed as the literal `disabled` prop on the underlying
  `<button>`. A native disabled button never dispatches `onClick` at all — so the existing
  `attempted`/red-border mechanism (used for the Step 2 due-date picker too) could never actually
  fire from a click on that button; tapping it while invalid did visibly nothing, no red border, no
  message, just silence. Confirmed by writing the intended test first and watching it fail for the
  right reason. Fixed by splitting the single `nextDisabled` variable into two: `nextDisabled`
  (unchanged, still drives the grey/teal styling) and a new `nextNativeDisabled` that's `false` for
  Step 0 specifically — the button now stays genuinely clickable there, so a tap while empty
  reaches `goNext()`'s `setAttempted(true)` branch and the red border/`"↑ Required — 0 is a fine
  answer, just not empty"` message actually shows. Steps 1–2 keep the prior native-disabled
  behavior unchanged (same latent gap likely exists there too — e.g. Step 2's due-date picker error
  state — but that's pre-existing, untouched, and out of scope here; flagged, not fixed).
- [x] **Editable from both `NewJobSeasonHomePanel.jsx` (new) and `NewJobSeasonBudgetPanel.jsx` (existing input
  repointed)** — neither "owns" the field; both hold a local string draft (Numeric Input Standard:
  never coerce on `onChange`, only `parseFloat` at commit) and commit via `onBlur`, not per
  keystroke. Draft re-sync from the persisted value (e.g. edited on the other panel, then navigated
  back) uses React's documented "adjust state during render" pattern — comparing against a
  `lastSyncedCash` ref-like state and calling `setCashDraft` directly in the render body — instead
  of a `useEffect`, which would have tripped `react-hooks/set-state-in-effect` (caught by the lint
  diff check, not guessed at). `NewJobSeasonHomePanel`'s placement is directly below the Runway/Weekly
  Burn/Extra Income metric row, above Log Extra Income — the most prominent surface on the mode's
  own Home view, per the ask to make this "more present and more important than it currently is."
- [x] **Eager-saved on blur** (docs/TODO.md "Persistence — Eager Save Pattern") — both panels
  compute the parsed number synchronously and call `setConfig`/`saveConfigNow` together, skip the
  write entirely when the blurred value matches what's already persisted (no-op saves avoided).
  `NewJobSeasonBudgetPanel` didn't receive `setConfig`/`saveConfigNow` props before this pass (it only
  ever touched expenses) — threaded in from `App.jsx` for the first time, with the same `readOnly`
  no-op shadow `NewJobSeasonHomePanel` already had from §1.H10, plus `disabled={readOnly}` on the input
  itself so a paywall-expired account can't edit even though the write path is already a no-op
  (defense in depth, matching the existing convention documented in CLAUDE.md's eager-save section).
- [x] **`App.jsx` simplified** — the lifted `jobLossSavingsDraft`/`setJobLossSavingsDraft` session
  state is gone entirely; both panels independently derive their own draft from the same
  `config.newJobSeasonCashOnHand` prop they already receive, with no cross-panel state to keep in sync
  (they're never mounted simultaneously — Home and Budget are mutually exclusive tab renders).
  `newJobSeasonIncludeBenefits` (the benefit-scenario toggle) is untouched, still session-only by design.
- **Not attempted here (explicitly deferred by the user's own framing):** no new runway/display
  logic built on top of the persisted number beyond what already reads `manualSavings` — the ask
  was to get it to stick and be prominent *first*. Also unaddressed: Step 1/2's own pre-existing
  native-disabled click-through gap (see above), and pre-existing accounts that entered New Job Season
  Mode before this field existed will read `newJobSeasonCashOnHand: null` → `manualSavings` treats that
  as `0`, same as an explicit zero — quietly correct behavior, not a migration, but worth knowing
  if a real account's runway looks off after this ships.
- **Verification:** 15 new/updated tests in `newJobSeasonFlow.test.jsx` — 6 for `NewJobSeasonEntry`'s Step 0
  gate (blocks Next while empty with no red border before the first attempt, shows the red border/
  required message after a failed attempt, clears it once a valid value is entered, accepts `0`,
  persists across Back navigation, included in every existing activation test's expected payload)
  plus 4 existing tests updated to fill the now-mandatory field; 4 for `NewJobSeasonHomePanel`'s Cash On
  Hand input (pre-fills from config, eager-saves on blur only — not on every keystroke — skips the
  save when unchanged, disabled when `readOnly`); 3 equivalent for `NewJobSeasonBudgetPanel`'s existing
  input repointed to the persisted field. `DEFAULT_CONFIG` snapshot updated for the new field. Full
  suite: 1138 tests passing. Lint diff-clean vs. a true `git stash` baseline (caught and fixed two
  real new issues before landing: a `react-hooks/set-state-in-effect` error from the first draft's
  `useEffect`-based re-sync, and a `react-hooks/preserve-manual-memoization` error the render-time-
  sync rewrite exposed on `NewJobSeasonHomePanel`'s pre-existing `entries` memo — an inconsistent
  `config?.jobHuntIncomeLog` optional-chain that didn't match the rest of the file's non-optional
  `config.jobHuntIncomeLog` access; normalized to match). Production build green. **Not covered:**
  no live click-through on a deployed preview — same category of gap as everything else in this
  file; the red-border fix in particular deserves an eyeball on a real device given how it was found.

---


### ARCHIVED: §1.H15–H17 + §1.I (Pending paycheck, Lifestyle caption, Cash On Hand card, Admin Toolkit updates)

#### H15. Pending/final paycheck — the first H14 gap, built, 2026-07-22 — DONE

*User asked directly for this one (not the "wiring-only items first" ordering H14 recommended):
mimic the weekly check-in's day-picker UX to ask "what days did you work in the last pay period,"
derive the lost job's pay-period-end date from existing pay-schedule config, ask a separate
day-of-week question for "when do checks normally arrive," and feed the result into the runway
formula as both an amount and an arrival date — plus a small UI line counting down to it.*

- [x] **`lib/newJobSeasonRunway.js`** — three new pure functions, `computeNewJobSeasonRunway` extended:
  - `resolveLastPayPeriodEnd(newJobSeasonDateIso, payPeriodEndDay, userPaySchedule)` — first
    occurrence of `payPeriodEndDay` on/after the job-loss date (schedule-length-agnostic: weekly
    and biweekly both just repeat the same weekday, so no separate biweekly branch); `monthly`
    falls back to the calendar month's last day, since there's no day-of-week concept.
  - `resolvePendingCheckArrivalDate(periodEndDate, arrivalDow)` — first occurrence of the
    user's answered arrival weekday strictly after the period end (payroll always lands at least
    a day after the period it covers).
  - `estimatePendingCheckAmount(workedDaysCount, cfg)` — same flat-rate sketch
    `ReemploymentTracker.jsx`'s `targetWeeklyNet` uses (gross minus fed/state/FICA/401k rates
    already on file); not a full `computeNet` pass, since this covers a check `buildYear` never
    actually computes (job-loss week is zeroed, not prorated — H14's other bullet, still open).
  - `computeNewJobSeasonRunway`'s `daysFromCash` rewritten piecewise: the pending amount only enters
    the cash pool once its arrival day is reached, not lump-summed into today's cash — if cash
    dries up before the check lands, the cliff hits at the dry-out point same as if the check
    didn't exist, exactly as the user asked ("what day to add check to the runway cash on hand
    bucket"). Returns a new `pendingCheck: {amount, date, daysOut} | null` field.
- [x] **`constants/config.js`** — `newJobSeasonPendingCheckAmount`/`newJobSeasonPendingCheckDate` added to
  `DEFAULT_CONFIG` (both `null` by default); snapshot updated (`npx vitest run -u`).
- [x] **`components/NewJobSeasonEntry.jsx`** — new Step 1 inserted between the existing Step 0
  (date/cash/unemployment) and the expense-review steps. Skippable Y/N gate ("Any paycheck still
  coming from that job?"); Yes reveals a Mon–Sun worked-days toggle grid (0 days is a valid,
  non-blocking answer) and a single-select arrival-day grid (required once Yes is chosen — red
  border + inline error on a blocked Next, matching the existing cash-on-hand pattern) plus a
  live preview line once an arrival day is picked. Resolved once at Activate time into concrete
  `newJobSeasonPendingCheckAmount`/`newJobSeasonPendingCheckDate` values — raw day picks aren't stored,
  same pattern as `DueDatePicker`'s `resolveDueDateAnchor`. Reused the native-disabled-button-
  blocks-onClick fix from §1.H13 (`nextNativeDisabled` split from `nextDisabled`) so the new
  step's required-field error can still fire on a "visually disabled but genuinely clickable"
  Next/Activate button. **Deliberately scoped to a single 7-day picker regardless of pay
  schedule** — for biweekly/salary users this covers only the final week worked, not the full
  period; a full 14-day grid would overcomplicate the input for a one-time estimate, so this is a
  known, flagged limit, not silently wrong. `App.jsx` threads `config` into `NewJobSeasonEntry` so the
  new step can read `payPeriodEndDay`/`userPaySchedule`.
- [x] **UI countdown line** — `NewJobSeasonHomePanel.jsx` and `NewJobSeasonBudgetPanel.jsx` both render a
  small line under the Cash On Hand input when `dash.pendingCheck` is set: "Pending check: $X
  arriving in N days (Mon DD)" (or "arriving today" at `daysOut === 0`). Reads straight off the
  same `computeNewJobSeasonRunway` output the headline runway numbers already use — no parallel calc.
- [x] Tests — `src/test/components/newJobSeasonFlow.test.jsx`: 6 existing `NewJobSeasonEntry` tests fixed
  for the new step (button-label/navigation changes from inserting Step 1); 6 new tests added
  under `describe('Pending/final paycheck (§1.H15)')` covering skippability, blocked-Next
  validation, 0-worked-days validity, exact amount/date computation (cross-checked directly
  against the three new lib functions), live preview rendering, and toggle-off behavior. Full
  suite: 1144 tests, 1 pre-existing unrelated flake in `LoginScreen.test.jsx` confirmed via
  `git stash` baseline (fails identically with or without this change — full-suite ordering
  issue, passes standalone). Lint diffed against a `git stash` baseline: zero new
  errors/warnings. Production build green.
- **Still open from H14, not touched by this pass:** the Lifestyle-spend invisibility caption,
  the `estimateRunwayDays`/Coach drift items — explicitly out of scope per the user ("runway bugs
  are already being worked on").

#### H16. Lifestyle spend caption — the second H14 gap, built, 2026-07-22 — DONE

*Closes the second bullet from §1.H14's birdseye review: `weeklyBurn` deliberately excludes
Lifestyle-category expenses (survival-spend focus), but nothing told a user who keeps those bills
tracked that their real burn is higher than the headline number — a "stubborn" user's runway was
silently shorter than what Home displayed. Pure transparency fix, no calc change to the existing
runway math itself.*

- [x] **`lib/newJobSeasonRunway.js`** — `computeNewJobSeasonRunway` now also computes `lifestyleActive`
  (same active+tracked gating as `essentialActive`, just `flexible === true` instead of excluded)
  and returns `lifestyleWeeklySpend` alongside the existing `weeklyBurn`. No change to `weeklyBurn`
  itself or to the runway/cliff math — this is a separate, additive figure for display only.
- [x] **`components/NewJobSeasonHomePanel.jsx`** — a one-line caption ("+ $X/wk Lifestyle spend still
  tracked (not counted in runway above)") renders under the metric-tile grid whenever
  `dash.lifestyleWeeklySpend > 0`, right where the Weekly Burn tile lives. `NewJobSeasonBudgetPanel.jsx`
  has no equivalent Weekly Burn tile (it already badges/sorts Lifestyle rows in its own expense
  list via the pre-existing `isFlexibleCategory` helper), so no change was needed there — the gap
  H14 flagged was specifically about the headline number on Home.
- [x] Tests — `src/test/components/newJobSeasonFlow.test.jsx`, new `describe('Lifestyle spend caption
  (§1.H16)')` under `NewJobSeasonHomePanel`: caption appears for a tracked active Lifestyle expense
  with the correct weekly amount, does not appear with no Lifestyle expenses, does not appear when
  the Lifestyle expense is untracked (`trackDuringNewJobSeason: false`). Full suite: 1147 tests, all
  green (including the H15 write-up's flagged `LoginScreen.test.jsx` flake — passed clean this
  run, confirming it's pure full-suite ordering, not a real regression). Lint diffed against a
  `git stash` baseline: zero new errors/warnings. Production build green.
- **Still open from H14:** the `estimateRunwayDays`/Coach drift items and the AI-gating/résumé
  scoping bullets — all explicitly out of scope per the user ("runway bugs are already being
  worked on").

#### H17. Cash On Hand card + timeline-aware decay, 2026-07-22 — DONE

*User ask, not from the H14 list: the plain Cash On Hand input "looks lame and crappy" — wanted
its own prominent card above the Cash Runway tile, a visible pencil icon signaling it's editable, a
bottom-sheet editor matching the expense editor's up-from-bottom/slide-down animation, and —
separately — for the displayed figure to decrease automatically as Needs bills come due, feeding
that decay into the runway instead of the number silently going stale between manual updates.*

- [x] **`components/CashOnHandSheet.jsx`** (new) — single-line bottom-sheet editor shared by both
  panels. Uses the existing `useFoldTransition` hook + a new `.fold-sheet` CSS class (index.css)
  rather than BudgetPanel's own expense-detail sheet, which only ever had an entrance animation
  (`expSheetSlideUp`) and unmounted instantly on close — no matching exit. `.fold-sheet` gives this
  the first bottom sheet in the app with a real symmetric enter (up-from-bottom, matching that
  sheet's existing curve) / exit (slide back down, `--ease-fold-exit`, no bounce) pair.
- [x] **`components/NewJobSeasonHomePanel.jsx`** — the plain input + `SectionHeader` replaced with a
  full-width pressable card *above* the Cash Runway/Weekly Burn/Extra Income grid: big tabular-nums
  dollar figure, a visible circular pencil badge (top-right, same edit-icon glyph as
  `ReemploymentTracker`'s Edit button), tap-anywhere-on-card to open the sheet (`scale(0.97)` press
  feedback, `disabled` when `readOnly` — native `disabled` blocks the click entirely, no separate
  guard needed). The pending-check line moved here from the old input's helper box (its natural
  home now).
- [x] **`components/NewJobSeasonBudgetPanel.jsx`** — same sheet, compact pressable row (value + pencil
  badge) inside the existing "Savings & Benefits" card instead of the plain input — kept visually
  smaller since Budget has no Runway-card layout context to match, but functionally identical
  (same sheet, same fields, same decay-reset-on-save behavior). Removed the old
  `cashDraft`/`lastSyncedCash` render-time resync entirely — no longer needed once cash is only
  ever committed through the sheet's explicit Save.
- [x] **`lib/newJobSeasonRunway.js`** — timeline-aware decay, kept centralized (single source of truth,
  not duplicated per-panel per drift-app-warden D1). New `newJobSeasonCashOnHandAsOf` config field
  (stamped by `NewJobSeasonEntry`'s Activate and both panels' `CashOnHandSheet` saves) anchors
  `sumBillsDueSince(expenses, fromExclusive, throughInclusive)` — walks each essential bill's real
  due-date occurrences one at a time via `getNextDueDate` (the underlying cycle math only exposes
  "next due on/after a date," not a closed-form occurrence count) and sums their actual payment
  amounts (`getExpenseDisplayAmount`), floored at 0 against `newJobSeasonCashOnHand` to produce
  `effectiveCashOnHand` — the figure both cards display and the number that now feeds the
  runway/cliff math (`withBenefits`/`withoutBenefits.cash`). Falls back to `newJobSeasonDate` as the
  decay anchor for pre-§1.H17 accounts that never got a real `newJobSeasonCashOnHandAsOf` stamp.
  `computeNewJobSeasonRunway`'s `savings` param renamed to `extraCash` (now just gig income —
  `sumJobHuntIncome()` — since raw cash is read from `config` internally instead of pre-summed by
  the caller) — forced every call site to be touched deliberately rather than silently
  reinterpreting the same param name. Also de-duplicated three copy-pasted
  active+tracked+category filters (`essentialActive`, `lifestyleActive`, and the new bills-due
  filter) into two shared predicates, `isTrackedActiveEssential`/`isTrackedActiveLifestyle`.
- [x] **External consumers updated for the `extraCash` rename** (drift-app-warden Spine A / D1
  check — `computeNewJobSeasonRunway` is a mapped LEDGER item, cross-checked against every call site,
  not just the two panels): `components/CoachNetWorthCard.jsx`'s Red-tier runway trigger and
  `App.jsx`'s Ask Coach `coachRunwayDays` memo (both closed drift-app-warden §8 quarantines from
  earlier work) each used to pre-sum `newJobSeasonCashOnHand + sumJobHuntIncome()` into a local
  `savings` var — both now pass `extraCash: sumJobHuntIncome(config)` only, and both automatically
  gained decay-awareness for free since `computeNewJobSeasonRunway` now reads cash internally.
- [x] **`constants/config.js`** — `newJobSeasonCashOnHandAsOf: null` added to `DEFAULT_CONFIG`
  (snapshot updated, `npx vitest run -u`).
- [x] **`docs/active-systems.md` §10** — updated in the same pass (drift-app-warden: doc/spec drift
  is its own quarantined failure class, D5) — was still describing the pre-H15/H16 3-step wizard
  and the raw-sum `savings` formula; now reflects the 4-step wizard, the pending-check/Lifestyle-
  caption features, and the card/sheet + decay architecture.
- [x] Tests — `src/test/lib/newJobSeasonRunway.test.js`: new `describe('sumBillsDueSince')` (8 cases —
  window boundaries, Lifestyle/paused/untracked exclusion, loan inclusion, multi-occurrence
  summing, missing-boundary guard) and `describe('computeNewJobSeasonRunway — timeline-aware cash on
  hand')` (5 cases — decay math, floor-at-0, `newJobSeasonDate` fallback, no-decay-when-nothing-due,
  `extraCash` still additive on top). `src/test/components/newJobSeasonFlow.test.jsx`: both panels'
  old plain-input describe blocks rewritten for the card/sheet interaction (prefill, save +
  asOf-stamp, cancel-without-saving — the cancel case needed `waitFor` since the sheet stays
  mounted through its animated exit, not an instant unmount), plus new dedicated decay describe
  blocks per panel; `NewJobSeasonEntry`'s existing Activate test extended to assert
  `newJobSeasonCashOnHandAsOf === newJobSeasonDate`. Full suite: 1175 tests, all green (including the
  previously-flagged `LoginScreen.test.jsx` full-suite-ordering flake, which also passed clean this
  run). Lint diffed against a `git stash` baseline: zero new errors/warnings (diff was pure
  line-number drift on pre-existing unrelated errors from removed lines above them). Production
  build green.
- **Scope note:** `sumBillsDueSince` only decays against essential (Needs + loan) bills, matching
  the same category gate `weeklyBurn` already uses — Lifestyle spend still isn't part of any cash
  figure, consistent with §1.H16's deliberate exclusion, not an oversight.

---

### I. Admin Toolkit updates for §1 work — BUILT 2026-07-25

- [x] **Live State Inspector — New Job Season pill**
  - [x] Amber dot on the pill (top-right corner) when `config.newJobSeasonMode === true`, visible without opening the card
  - [x] Three amber-highlighted rows in the expanded card: `New Job Season Date`, `Unemployment Wkly`, `Unemployment Wks Left` (the last reads `computeNewJobSeasonRunway()`'s `benefitsRemainingWeeks` via a shared `newJobSeasonDash` memo — same call Coach's `coachRunwayDays` uses, no second derivation, per F24)
- [x] **Week Inspector — unemployment income row**
  - [x] `w.unemploymentIncome > 0` → green "Unemployment" row in the Pay section
  - [x] New Job Season window with no benefit paid that week → "Unemployment — New Job Season — outside benefit window" (window boundary mirrors buildYear's `inNewJobSeason` check — `newJobSeasonDate`/`returnToWorkDate` — diagnostic-only, never feeds math, same pattern as `resolveBaseRateForWeek`)
- [x] **DB Row Viewer — expense triage summary**
  - [x] "Triage: X active · Y paused · Z cancelled" line (only shown when something's actually paused/cancelled/flagged)
  - [x] Flags expense count where `autoReactivateOnIncome === false`
- [x] **Config Raw View — Life Events header**
  - [x] "Life Events" header above the JSON dump, listing only §1 fields that currently carry a value
- [x] **CLAUDE.md update**
  - [x] Appended New Job Season state (§7 in Diagnostic request templates)
  - [x] Documented per-week `unemploymentIncome` annotation on `buildYear` output (Week Inspector + template §7 entries)
- All four admin surfaces are duplicated three times in `App.jsx` (desktop sidebar, mobile
  hamburger drawer, mobile bottom sheet) — pre-existing architecture, not introduced by this
  pass. Computed once via shared memos (`newJobSeasonDash`, `expenseTriageLine`,
  `lifeEventsConfigFields`) and rendered into all three so the triplication stays presentation-
  only, not a fourth parallel calculation. 1231 tests passing (no new tests — pure admin-only
  diagnostic surface, isAdmin-gated, no math path exercised); lint diff-clean vs. baseline;
  production build green.

---


### ARCHIVED: §3.F1–F2 (Write path + read-path proof-of-concept)

#### F1. Write Path — COMPLETE (2026-07-07)

*The infrastructure that makes the timeline possible: capture every config change with a timestamp.*

- [x] **Migration 020** — `database/migrations/020_add_account_history.sql` creates the table per §D2 design (full-value `snapshot` + `changed_fields TEXT[]`). RLS: append-only from client (no update/delete). Includes per-account `rollout_seed` snapshot so the resolver always has a floor entry. **Confirmed run in Supabase 2026-07-07** — seed snapshot landed for all existing accounts.
- [x] **Config-transition watcher** — `App.jsx` uses `useEffect` with `prevConfigRef` to diff config changes, filters through `diffSensitiveFields()` (`lib/configHistory.js`), and calls `saveConfigSnapshot()` (`db.js`). **Critically:** this watches the app's one canonical `config` state — no `setConfig` call or save path (immediate or debounced) can bypass capture, because the watcher fires on every render where config differs.
- [x] **Metadata tagging** — Life-event flows tag `source`/`effectiveFrom` through `configHistoryMetaRef` before mutating config:
  - `setup_wizard`: tags `source: "setup_wizard"`, passes `startDate` as explicit effective date
  - `life_event:lost_job`: tags `source: "life_event:lost_job"`, passes `newJobSeasonDate`
  - `life_event:rate_update`: tags `source: "life_event:rate_update"`, passes effective date from modal
  - `profile_edit`: tags `source: "profile_edit"`, defaults effective date to today
  - `force_pull` (admin): tags `source: "force_pull"`, so drift re-adoption isn't logged as an edit
  - Untagged changes: default to `source: "config_edit"` effective today (wall-clock real date, never admin Lock Date)
  - Investor sandbox accounts: exempt, matching archived Stripe Monetization's lifecycle email precedent
- [x] **Admin verification surface** — DB Row Viewer shows "config history: N snapshots · latest [date] ([source]) · [changed fields]" after Fetch. Live data, not stubbed — ready for live QA.
- [x] **Tests** — 26 new tests: `configHistory.test.js` (whitelist→DEFAULT_CONFIG drift guard, no dupes, noise-field exclusions, scalar/array/object diffs, undefined≡null tolerance) + `db.test.js` additions (insert shape, missing-table tolerance, meta fetch). 890 tests total passing; lint clean; prod build green.
- **Account deletion interaction:** non-payment deletion cron hard-deletes `user_data` row; `account_history` FK cascades. The `deleted_accounts` tombstone does NOT archive history rows — by design (privacy-first posture). Revived account restarts with fresh history.
- [ ] **Verify live once deployed** — make a pay-rate edit in ProfilePanel, confirm DB Row → Fetch shows "config history: 2+ snapshots" with `baseRate` in changed fields.

#### F2. Read Path Proof-of-Concept — COMPLETE (2026-07-17)

*One field working correctly shows the pattern; baseRate was chosen because Quick Rate Update live-QA caught the bug.*

The Problem: when you edit a field in June, `buildYear()` recalculates *all* weeks (past and future) using the new value. `baseRate: 22/hr` changes in week 26, but weeks 1–25 (already happened) retroactively recalculate gross pay as if you earned $22/hr there too — if you actually earned $20/hr, the damage is done.

**The Fix (baseRate only):**
- [x] **`resolveBaseRateForWeek(rateHistory, weekEnd, liveBaseRate)`** (`lib/finance.js:579–582`) — looks up the right rate for each week's end date. Mirrors `getEffectiveAmount` algorithm: latest history entry with `effectiveFrom ≤ weekEnd`, else fall back to current rate. Past April weeks keep the old rate until June change date; June forward uses the new rate.
- [x] **`buildYear(cfg, baseRateHistory = null)`** — new optional parameter. Call sites that omit it (SetupWizard, DemoAccountTree, math audit) behave byte-identical to before; only `App.jsx`'s live call passes `baseRateHistory`.
- [x] **`loadUserData()` fetch** — queries `account_history` filtered to `baseRate` changes, maps to `{ effectiveFrom, baseRate }` via `extractBaseRateHistory()` (same missing-table tolerance as `weekConfirmations`).
- [x] **`App.jsx` state threading** — `baseRateHistory` state threaded through `applyLoadedData`/`handleForcePull`, passed into live `buildYear()` call. Optimistic local append when `saveConfigSnapshot` fires, closing the gap where future-dated effective dates would misapply the new rate too early before the DB row round-trips into memory.
- [x] **Tests** — 13 new: `resolveBaseRateForWeek` point-in-time cases + `buildYear` past-week handling + `extractBaseRateHistory` fallback/null cases. 1063 tests passing; lint clean; prod build green.

**Why only baseRate:** This was implemented as a narrow slice to fix Quick Rate Update's live QA finding. The pattern works. Treating this as proof-of-concept, not "read path done" — every other historically-sensitive field is still unbuilt.


### ARCHIVED: §19.2–19.5 (Ad-Lib life-event re-entry, native jobless flow, blur-gated reveals, Schedule+Tax merge)

### 19.2 Life-Event Re-Entry Expansion — Path By Path

*Opened 2026-08-11. §19.1.B originally scoped life-event re-entry out ("ad-lib replaces
SetupWizard only for first-run... SetupWizard.jsx stays mounted, unchanged, for every life-event
string"). Anthony has now explicitly requested the opposite — every life-event path converted to
the ad-lib mad-libs style, same as first-run. This is being done in rounds, one or two paths at a
time (drift-app-warden §7.3's gate matrix is the authoritative per-path reference — read it before
touching any of this). Progress:*

- [x] **`lost_job`** (2026-08-11) — `SetupWizardAdlib` gained a `lifeEvent` prop; formData
      pre-fills from the real config instead of blanking (`BLANK_PAY_FIELDS` is first-run only
      now); the employment-status question is skipped entirely (`isIntakeValid`/`IntakePage` both
      gate that check on `lifeEvent === null`); Wrap Up is excluded from `activePages` (commits
      through `finalizeWizardConfig()` at the end of Tax Rates instead, matching real `STEP_DEFS`
      id 7's `showIf`). New re-entry intro copy ("Let's rebuild your pay for the new job.") — see
      the judgment-call note in the commit/session report; there's no real Step0 branch specific
      to `lost_job` to port verbatim, only `structure_change` gets its own Step0 copy on the real
      wizard. `App.jsx`'s `wizardEntry === "lost_job"` now mounts `SetupWizardAdlib` instead of
      `SetupWizard.jsx`; cancelable (unlike first-run).
- [x] **`commission_job`** (2026-08-11) — same shared plumbing as `lost_job`, plus the Commission
      Income field ported into `IntakePage` (mirrors real Step1's field exactly — Pill-equivalent
      toggle + Monthly Average, gated on `payStructureComplete`, applies to both DHL and base
      users). Re-entry intro copy: "Let's add your commission job to your pay structure." (same
      judgment-call caveat as `lost_job`'s copy). No new stored field — `commissionMonthly` already
      existed in `DEFAULT_CONFIG`/`HISTORY_SENSITIVE_FIELDS`/`finance.js`'s income math.
- [x] **`structure_change`** (2026-08-11, drift-app-warden §7 F140) — `App.jsx`'s
      `wizardEntry === "structure_change"` (the only real entry point — `LifeEventMenu`'s "Pay
      Structure Changed" tile) now mounts `SetupWizardAdlib`. Real Step0's bespoke intro copy
      ported verbatim into a new `LifeEventPivot` component (`IntakePage`), plus the "What
      changed?" picker beneath it — `SetupWizardAdlib` gained its own internal `curLifeEvent`
      pivot state (mirrors real `SetupWizard.jsx`'s local `lifeEvent` state) so a user can pivot
      from `structure_change` to `lost_job`/`changed_jobs`/`commission_job` from inside the same
      mount, which is also what makes those three reachable at all now (round 1's routing for
      them was correct but unreachable — nothing ever set `wizardEntry` to those values directly).
      Frozen `originalConfig` baseline captured at mount + `StructureChangeDiff`/`DIFF_FIELDS`
      (now exported from `SetupWizard.jsx`, shared not duplicated) rendered in `WrapUpPage`,
      gated on `curLifeEvent === "structure_change"`. `handleWizardComplete`'s existing
      `startedUnemployed`-clearing/Food-restoration special case needed no changes — verified it
      still fires correctly (keyed on `wizardEntry`, generic to either wizard).
- [x] **`changed_jobs`** (2026-08-11) — verified, no changes needed beyond the shared pivot/
      pre-fill plumbing. `computeActivePages`'s default branch already returns the full 5-page
      set (0→1→2→3→4→7 equivalent, Wrap Up included, no diff); confirmed via `git grep
      changed_jobs` that real `SetupWizard.jsx` has nothing else path-specific for it.
- [x] All four life-event strings are now covered by `SetupWizardAdlib`. `SetupWizard.jsx` was, at
      that point, still kept mounted for the jobless mini-flow's `initialStepId: 10` hand-off
      continuation — see §19.3 below for its removal.

### 19.3 Jobless Mini-Flow Ad-Libbed — Last Hand-Off Removed — CLOSED

*Opened and closed 2026-08-11, drift-app-warden §7 F141. The last remaining path that hopped to a
second component — first-run jobless (`lifeEvent === null && startedUnemployed === true`), which
handed off via `onHandoff(formData, 10)` into real `SetupWizard.jsx` mounted at `STEP_DEFS` id 10
for the Unemployment Benefits/New Job Season Details/Jobless Wrap Up steps — is now three native
`SetupWizardAdlib` pages.*

- [x] **Three native pages** — `JoblessBenefitsPage`/`JoblessDetailsPage`/`JoblessWrapUpPage`,
      ported line-for-line from real `StepJoblessBenefits`/`StepJoblessDetails`/`StepJoblessWrapUp`
      (`STEP_DEFS` ids 10/11/12), with `isJoblessBenefitsValid`/`isJoblessDetailsValid`/
      `isJoblessWrapUpValid` mirroring those steps' `isValid` exactly. `computeActivePages` returns
      `[PAGES[0], joblessBenefits, joblessDetails, joblessWrapUp]` for the jobless gate instead of
      the old `[PAGES[0]]` + hand-off.
- [x] **Hand-off mechanism removed** — `onHandoff` (the prop), `App.jsx`'s
      `adlibHandoff`/`adlibResumeData` state, and `wizardExiting`/`setWizardExiting` (whose only
      consumer was real `SetupWizard.jsx`'s `isExiting`-driven fade, now unreachable) are all
      deleted. `closeWizardWithAnimation()` simplified to a synchronous `setWizardEntry(null)`.
      `SetupWizard.jsx` is no longer mounted by `App.jsx` anywhere — confirmed via full-repo grep
      before deleting that nothing else called `onHandoff` with a real `initialStepId`. Kept in
      place as generically useful, not dead code: `SetupWizard.jsx` itself (source of the three
      ported page components, plus `LIFE_EVENTS`/`DIFF_FIELDS`/`StructureChangeDiff`'s shared
      export home), and `initialStepId`/`onBackBeforeStart`/`resumeFormData` (no current caller,
      but generic wizard-navigation props, still exercised by `SetupWizardAdlib.test.jsx`'s
      employed-resume case).
- [x] **Real latent bug fixed along the way** — `IntakePage`'s employment-status select never set
      `newJobSeasonMode`/`newJobSeasonDate`/`startDate`/`firstActiveIdx` when "unemployed" was
      chosen (only real `Step0`'s pill handler did, and the old hand-off jumped past `Step0`
      entirely). Writing a native full-completion test caught it; fixed by porting `Step0`'s pill
      handler verbatim into `IntakePage`.
- [x] Test coverage — full jobless-first-run completion test (Intake → all three jobless pages →
      Finish), asserting `newJobSeasonMode`/`setupComplete`/`startDate`/`firstActiveIdx` on the
      final payload and that `finalizeWizardConfig()`'s `buildYear()` call tolerates the
      no-pay-structure config shape without throwing. `HISTORY_SENSITIVE_FIELDS` already covered
      all six jobless fields (verified, not re-added).
- [x] `.claude/CLAUDE.md`'s `SetupWizardAdlib.jsx` section and `docs/drift-app-warden.md` §7 (new
      F141 entry + §7.3 gate matrix) updated in the same round.
- [x] **This closes the entire "wire ad-lib in as production" saga across all three rounds this
      session** (§19.1 field parity → §19.2 life-event re-entry → §19.3 jobless hand-off removal).
      `SetupWizardAdlib.jsx` is now the whole first-run and life-event-re-entry onboarding
      experience; `SetupWizard.jsx` is retained only as unmounted source/shared-export material.

### 19.5 `InlineNumber`-Gated Reveals Blur-Gated, Not Mid-Keystroke — CLOSED

*Opened and closed 2026-08-27, drift-app-warden §7 F162, two commits. Reported UX complaint: a
cascading clause gated on a number field's value (e.g. `maxWeeklyHours > 0`) revealed itself the
instant a partial value happened to satisfy the check — typing the "4" of "40" already revealed
the next question mid-keystroke, before the user felt done. `InlineSelect`/`InlineDate` were
unaffected — native `onChange` only fires on a genuine commit for either.*

- [x] Round 1 (`400a005`): `InlineNumber` gained an `onCommit` prop (fires on blur) +
      `useCommitTracking(seedFn)` hook, seeded from already-valid pre-filled/resumed values so
      re-entry accounts never hit an artificial blur-wait. Applied to `SchedulePage`'s
      `maxWeeklyHours` as the reference implementation.
- [x] Round 2: audited all ~23 remaining `InlineNumber` usages. Found one more genuine
      cascading-reveal case — `IntakePage`'s base-user `annualSalary`/`baseRate`/`shiftHours`,
      feeding the shared `payStructureComplete` boolean that gates OT Threshold/Commission/Tips
      clauses and `AdvancedPayRulesCard`'s mount — fixed by folding commit-tracking into
      `payStructureComplete`'s own derivation once, rather than duplicating the check at each of
      its four call sites. DHL exempt (baseRate/shiftHours come from `DHL_PRESET` defaults there).
- [x] Every other `InlineNumber` field audited and confirmed to have no downstream reveal gated on
      its own value (DHL weekend differential, custom OT threshold, commission amount,
      `AdvancedPayRulesCard`'s night-diff/weekend-diff, `DhlRotationCard`'s custom hours,
      Deductions' benefit/401k fields, Attendance/PTO card fields, Tax Rates' paystub calculator —
      a plain `<input>`, not `InlineNumber` — Wrap Up's buffer amount, both jobless-page numeric
      fields) — left untouched, no unnecessary state added.
- [x] Fixed 4 pre-existing tests that filled baseRate/shiftHours without blurring; added 2 new
      tests (annual-salary partial-keystroke/blur, resumed baseRate+shiftHours re-entry). 1683
      tests passing, `vite build --mode production` clean.
- [x] Live-verified the one DHL-reachable field (weekend differential) via Playwright — confirmed
      identical content before/after blur, consistent with "no fix needed." `DhlRotationCard`
      (Plant-only) and `AdvancedPayRulesCard` (base-user-only) are both unreachable on the shared
      test account (DHL Warehouse) regardless of this fix — relied on Vitest + code reading there,
      not a live check.
- [x] `.claude/CLAUDE.md`'s `SetupWizardAdlib.jsx` section and `docs/drift-app-warden.md` §7 (new
      F162 entry) updated in the same round.

---

### 19.4 Schedule + Tax Rates Pages Merged — Empty-Viewport Fix — CLOSED

*Opened and closed 2026-08-27, drift-app-warden §7 F161. Live Playwright screenshots against the
running dev server at 390×844 showed ~650px of empty black space below the content on both the
Schedule page and the Tax Rates page individually — a DHL Warehouse account's Schedule page is a
single start-date blank, Tax Rates is two selects plus a button reveal by default, and every other
page in this flow fills the viewport.*

- [x] `SchedulePage` and `TaxRatesPage` (both unchanged internally) composed into one new page
      component, `ScheduleTaxPage`, under one `PAGES` entry (`id: "scheduleTax"`), each section
      under its own small `cardLabelStyle` subheader.
- [x] Combined gate `isScheduleTaxValid(d) = isScheduleValid(d) && isTaxRatesValid(d)` — Next
      requires both sections' required fields, not just whichever one is visible.
- [x] Tax Rates now precedes Deductions in answer order (previously came after) — verified safe,
      since neither `isTaxRatesValid` nor the paystub calculator read any deduction field.
- [x] Deductions and Wrap Up deliberately left standalone — both already substantial; merging Tax
      Rates onto either risked reintroducing the same empty/scrolling-viewport problem.
- [x] Page-count updated for all six wizard paths: first-run employed/`structure_change`/
      `changed_jobs` 5→4; `lost_job`/`commission_job` 4→3; first-run jobless unchanged at 4 (never
      touches this page).
- [x] `SetupWizardAdlib.test.jsx` restructured — helper functions renamed to reflect the new page
      boundaries (`advanceToScheduleTax_*` lands on the merged page; `advanceToDeductions_*` now
      fills both Schedule and Tax Rates fields), field lookups moved from positional
      `selects()`/`numbers()` indices to `getByLabelText` (the merged page's select/number DOM
      order shifts as Schedule's cascading clauses reveal, so indices were fragile), and a new test
      asserts both subheaders render. All distinct behavior from the old separate-page tests is
      still covered — no coverage lost, 59 tests in the file passing.
- [x] Live-verified against the shared test account (DHL Warehouse, `structure_change` re-entry) at
      390×844 — the merged page still leaves a modest amount of empty space below the fold for this
      specific thinnest-account case (Warehouse Schedule + already-known Tax Rates), but no longer
      the ~650px gap from before, and no scrolling is required. `.claude/CLAUDE.md` and
      `docs/drift-app-warden.md` §7 (new F161 entry) updated in the same round.

---



## §19.5 — Ad-Lib Wizard `InlineNumber` reveals gated on blur, not mid-keystroke (2026-08-27)

*Reported UX complaint: a cascading clause gated on a number field's value (e.g.
`maxWeeklyHours > 0`) revealed itself the instant a partial value happened to satisfy the check —
typing the "4" of "40" already revealed the next question mid-keystroke. `InlineSelect`/
`InlineDate` were unaffected (native `onChange` only fires on a genuine commit). Two rounds, both
same day. Drift-app-warden §7 F162.*

- [x] Round 1 (commit `400a005`): `InlineNumber` gained an `onCommit` prop (fires on blur) and a
  `useCommitTracking(seedFn)` hook, seeded from already-valid pre-filled/resumed values so re-entry
  accounts never hit an artificial blur-wait. Applied to `SchedulePage`'s `maxWeeklyHours` as the
  reference implementation, with tests for partial-keystroke/blur/resumed-value.
- [x] Round 2: audited all ~23 remaining `InlineNumber` usages in the file. Found exactly one more
  genuine cascading-reveal case — `IntakePage`'s base-user `annualSalary`/`baseRate`/`shiftHours`,
  which feed the shared `payStructureComplete` boolean gating OT Threshold/Commission/Tips clauses
  and `AdvancedPayRulesCard`'s mount — fixed by folding commit-tracking into `payStructureComplete`
  itself (one hook call, one seed, all four downstream gates covered) rather than duplicating the
  check at each site. DHL exempt (its baseRate/shiftHours come from `DHL_PRESET` defaults, never
  typed here).
- [x] Every other `InlineNumber` field (DHL weekend differential, custom OT threshold, commission
  amount, `AdvancedPayRulesCard`'s night-diff/weekend-diff, `DhlRotationCard`'s custom hours,
  Deductions' benefit/401k fields, Attendance/PTO card fields, Tax Rates' paystub calculator —
  plain `<input>`, not `InlineNumber`, confirmed by reading the code — Wrap Up's buffer amount,
  both jobless-page numeric fields) audited and confirmed to have no downstream reveal gated on its
  own value; left untouched.
- [x] Fixed 4 pre-existing tests that filled baseRate/shiftHours without blurring (now required
  before the new gate opens); added 2 new tests (annual-salary partial-keystroke/blur round-trip,
  resumed baseRate+shiftHours re-entry). 1683 tests passing, `vite build --mode production` clean.
- [x] Live-verified the one DHL-reachable field (weekend differential) via Playwright against the
  shared test account — confirmed no downstream reveal changes before/after blur, consistent with
  "left alone." `DhlRotationCard` (Plant-only) and `AdvancedPayRulesCard` (base-user-only) turned
  out to be unreachable on this account (DHL Warehouse) regardless of this fix — not live-tested,
  relied on Vitest coverage + code reading instead.
- [x] `.claude/CLAUDE.md` and `docs/drift-app-warden.md` §7 (new F162 entry) updated in the same
  round.

## §17.J — User-initiated account deletion never hard-fails to the user (2026-08-30, migration 044)

*Live screenshot: a transient `auth.admin.deleteUser` failure surfaced a raw "Failed to delete
auth account" error after `user_data` had already been wiped — a user asking to leave must never
be told "no" by an infra hiccup. Drift-app-warden §12 F52.*

- [x] `user_data.deletion_requested_at` column (migration 044) — stamped first, locks the account.
- [x] `api/_accountArchive.js` — `archiveAndDeleteAccount()` factored out of the cron so
  `api/delete-account.js` and `api/cron-subscription-lifecycle.js` share one archive/tombstone
  sequence (`deletion_reason` distinguishes `"user_requested"` vs `"non_payment_dunning_expired"`).
- [x] `api/delete-account.js` now locks the row, then attempts the same archive inline
  best-effort — always returns 200 once locked, whatever the inline attempt does.
- [x] `cron-subscription-lifecycle.js`'s `sweepPendingDeletions()` retries every locked-but-
  unpurged row daily until it succeeds (no `trial_started_at` filter — covers admin/investor
  accounts too).
- [x] `src/lib/db.js`/`src/App.jsx` — `deletionRequestedAt` gates the dashboard behind a goodbye
  screen instead of the old immediate client-side sign-out racing the App.jsx render ladder.
- [x] `ProfilePanel.jsx`'s delete modal shows a goodbye state on success instead of yanking away.
- [x] Side effect (deliberate): a user-deleted email is now revivable through the existing
  revival flow, same as a cron-deleted one.

## §17.K — Fixed the actual reason auth-account deletion kept failing (2026-08-30, migrations 045/046)

*Deploying §17.J's fix stopped the failure from reaching the user, but not the failure
itself — found live the same day. Drift-app-warden §12 F52 addendum.*

- [x] Root cause: `consent_records.user_id` (every real signup has one, migration 033's
  ToS gate) referenced `auth.users(id)` with no `ON DELETE CASCADE` — Postgres blocked
  `auth.admin.deleteUser()` outright, both from the app's own service-role client and
  from deleting a row directly in Supabase Studio's Auth table.
- [x] Migration 045 — fixed that FK to `ON DELETE CASCADE`; fixed the nullable
  admin-authored-content audit columns (`changelog_entries.created_by`,
  `beta_content_items.created_by`, `beta_scores.updated_by`,
  `base_content_items.created_by`) to `ON DELETE SET NULL` instead.
- [x] Found a second, compounding bug in the process: because `user_data` gets deleted
  BEFORE the auth-row delete is attempted, a failure at that last step destroyed its own
  retry signal (`deletion_requested_at` lived on the now-gone row) — the orphan was
  permanent, not just slow to clean up. Explains the "logs back in like a first-time
  user, Stripe already charged again on resubscribe" symptom exactly.
- [x] Migration 046 — `deleted_accounts.auth_purge_pending`, set true in the tombstone
  upsert (before the failure-prone step, never itself deleted) as the durable signal;
  `api/_accountArchive.js`'s new `finishPendingAuthPurges()` retries every pending
  tombstone every cron run, treating a not-found delete as already-purged rather than an
  infinite-retry failure.

---

## §19.4 — Ad-Lib Wizard Schedule + Tax Rates pages merged, empty-viewport fix (2026-08-27)

*Live Playwright screenshots at 390×844 showed ~650px of empty space below the content on both
the Schedule and Tax Rates pages individually (thinnest case: DHL Warehouse + already-known tax
rates). Merged into one page, `ScheduleTaxPage`, under a combined gate. Drift-app-warden §7 F161.*

- [x] `SchedulePage`/`TaxRatesPage` composed into `ScheduleTaxPage` (both unchanged internally),
  each under its own subheader; `isScheduleTaxValid = isScheduleValid && isTaxRatesValid`.
- [x] Tax Rates now precedes Deductions in answer order — verified safe (no deduction-field reads).
  Deductions and Wrap Up deliberately left standalone (already substantial on their own).
- [x] Page counts updated for all six wizard paths (5→4 employed/`structure_change`/`changed_jobs`;
  4→3 `lost_job`/`commission_job`; unchanged at 4 first-run jobless).
- [x] `SetupWizardAdlib.test.jsx` restructured to match — helpers renamed to the new page
  boundaries, field lookups moved to `getByLabelText` for the merged page's shifting DOM order, new
  subheader-rendering test added; 59/59 tests in the file passing, `npm run test:run` (1680 tests)
  and `vite build --mode production` both pass.
- [x] Live-verified via Playwright against the shared test account (DHL Warehouse,
  `structure_change` re-entry) — no scrolling required, modest empty space remains for that one
  thinnest-account case but the ~650px gap is gone.
- [x] `.claude/CLAUDE.md` and `docs/drift-app-warden.md` §7 (new F161 entry) updated in the same
  round.

---

## §19.3 — Ad-Lib Wizard jobless mini-flow ad-libbed, last hand-off removed (2026-08-11)

*Closes the entire "wire ad-lib in as production" saga: §19.1 (field parity) → §19.2 (life-event
re-entry) → §19.3 (this). `SetupWizardAdlib.jsx` is now the whole first-run (employed and jobless)
and life-event-re-entry onboarding experience; `SetupWizard.jsx` is retained only as unmounted
source/shared-export material. Drift-app-warden §7 F141.*

- [x] **Three native jobless pages** — `JoblessBenefitsPage`/`JoblessDetailsPage`/
  `JoblessWrapUpPage`, ported line-for-line from real `StepJoblessBenefits`/`StepJoblessDetails`/
  `StepJoblessWrapUp` (`STEP_DEFS` ids 10/11/12), with matching `isJoblessBenefitsValid`/
  `isJoblessDetailsValid`/`isJoblessWrapUpValid` gates. `computeActivePages` returns Intake + the
  three jobless pages for the jobless gate instead of Intake-only + a hand-off.
- [x] **Hand-off mechanism fully removed** — `onHandoff` prop, `App.jsx`'s
  `adlibHandoff`/`adlibResumeData` state, and `wizardExiting`/`setWizardExiting` (dead once
  `SetupWizard.jsx` stopped being mounted) all deleted; `closeWizardWithAnimation()` simplified to
  a synchronous `setWizardEntry(null)`. `SetupWizard.jsx` is no longer mounted anywhere in
  `App.jsx`. `initialStepId`/`onBackBeforeStart`/`resumeFormData` kept as generic, still-tested
  wizard-navigation props even with no current caller.
- [x] **Real latent bug found and fixed** — `IntakePage`'s employment-status select never seeded
  `newJobSeasonMode`/`newJobSeasonDate`/`startDate`/`firstActiveIdx` (only real `Step0`'s handler
  did, which the old hand-off skipped past); ported `Step0`'s pill handler verbatim into
  `IntakePage` once a full native completion test surfaced the gap.
- [x] Full jobless-first-run completion test added (`SetupWizardAdlib.test.jsx`); `npm run
  test:run` (1599 tests) and `vite build --mode production` both pass.
- [x] `.claude/CLAUDE.md`, `docs/drift-app-warden.md` §7/§7.3, `docs/TODO.md` updated in the same
  round.

---

## §19.2 — Ad-Lib Wizard life-event re-entry expansion, round 2: `structure_change` + `changed_jobs` (2026-08-11)

- [x] **Reachability fix (the actual point of this round)** — round 1's `App.jsx` routing for
  `wizardEntry === "lost_job" | "commission_job"` was real, correct plumbing for a state nothing
  ever set: `LifeEventMenu.jsx` has no tile for either value, and the only real entry point,
  `wizardEntry === "structure_change"` (the "Pay Structure Changed" tile), was still routed to
  `SetupWizard.jsx`. Fixed by routing `wizardEntry === "structure_change"` to `SetupWizardAdlib`
  too, and giving `SetupWizardAdlib` the internal life-event pivot picker
  (`IntakePage`'s `LifeEventPivot`) real `SetupWizard.jsx`'s own `Step0` picker was always meant
  to provide — `lost_job`/`changed_jobs`/`commission_job` are now reachable in practice, the same
  way real `Step0`'s picker was designed to make them reachable
- [x] **`LifeEventPivot`** — local `curLifeEvent` state (mirrors real `SetupWizard.jsx`'s own
  local `lifeEvent` state, seeded from the `lifeEvent` prop); shows the real `structure_change`
  Step0 intro copy ported verbatim (`"Update your pay structure."` + goals/expenses/logs-stay-put
  explanation + start-date guidance) plus a "Something else changed instead?" picker beneath it —
  the one deliberate deviation from a line-for-line Step0 port, since ad-lib has no separate first
  "step" to show the intro on before a picker could appear; only rendered when the wizard's
  original entry was `structure_change` (`onLifeEventChange` only threaded down in that case).
  Every downstream page/gate (`computeActivePages`, `isXValid`, `WrapUpPage`'s diff gate, the
  Commission Income clause) reacts to `curLifeEvent`, not the immutable `lifeEvent` prop
- [x] **`StructureChangeDiff` + `DIFF_FIELDS` + `LIFE_EVENTS` now exported from `SetupWizard.jsx`**
  and imported into `SetupWizardAdlib.jsx` — one source of truth on both wizards (drift-app-warden
  §7 F7's "must never diverge" rule), not a second copy
- [x] **`WrapUpPage` structure_change diff** — frozen `originalConfig` baseline captured once at
  `SetupWizardAdlib` mount (`useState(() => config)`, mirrors real `useMemo(() => config, [])`),
  threaded down and rendered via the shared `StructureChangeDiff` component, gated on
  `curLifeEvent === "structure_change"` exactly like real `StepWrapUp`; the jobless-started
  "no prior pay structure to diff" guard comes along for free since it's the same component
- [x] **`changed_jobs` verified** — no changes needed beyond the shared pivot/pre-fill plumbing;
  `computeActivePages` already returns the full 5-page set (default branch) for any lifeEvent
  besides the jobless mini-flow/`lost_job`/`commission_job`; confirmed via `git grep changed_jobs`
  across `SetupWizard.jsx` that nothing else is life-event-specific for this path
- [x] **`App.jsx`** — `isAdlibLifeEvent` now also includes `"structure_change"`; `SetupWizard.jsx`
  now only ever mounts for the jobless mini-flow's `initialStepId: 10` hand-off continuation.
  `handleWizardComplete` needed no changes — confirmed it already reads `wizardEntry` (not a
  pivot-aware param) for its `life_event:${wizardEntry}` tag, exactly matching real
  `SetupWizard.jsx`'s own behavior (its internal `Step0` pivot never notified `App.jsx` either) —
  see the session report's judgment-call note
- [x] Tests: 5 new cases in `SetupWizardAdlib.test.jsx` — `structure_change` intro + picker
  render, pivot to `commission_job` (page set shrinks, Commission field appears), pivot to
  `changed_jobs` (stays 5 pages, no diff), `structure_change` completion with a real diff render,
  `changed_jobs` direct-entry completion with no diff
- [x] Docs: `.claude/CLAUDE.md`, `docs/drift-app-warden.md` §7 F140 + §7.3 gate matrix "Which
  wizard?" column, `docs/TODO.md` §19.2 (all four life-event paths now closed)
- [x] Field housekeeping (F7) — `DIFF_FIELDS` diffed against `HISTORY_SENSITIVE_FIELDS`; every key
  already present, no new fields introduced by the diff mechanism itself, no gaps found

---

## §19.2 — Ad-Lib Wizard life-event re-entry expansion, round 1: `lost_job` + `commission_job` (2026-08-11)

- [x] **`SetupWizardAdlib.jsx` gains a `lifeEvent` prop** — mirrors `SetupWizard.jsx`'s own
  contract (`null | "structure_change" | "lost_job" | "changed_jobs" | "commission_job"`); default
  `null` preserves every existing first-run behavior unchanged
- [x] **Shared re-entry plumbing** — `formData` pre-fills from the real config instead of
  `BLANK_PAY_FIELDS` when `lifeEvent !== null`; employment-status question skipped entirely
  (`isIntakeValid`/`IntakePage` gate on `lifeEvent === null`, `isEmployed` forced `true`); new
  `computeActivePages()` helper drops Wrap Up from the page set for `lost_job`/`commission_job`
  specifically (both commit through `finalizeWizardConfig()` at the end of Tax Rates instead);
  jobless single-page shortcut and hand-off both explicitly re-gated on `lifeEvent === null`
- [x] **`commission_job` Commission Income field** — ported from real Step1
  (`SetupWizard.jsx:782–809`) into `IntakePage`, gated on `payStructureComplete`; writes the
  pre-existing `commissionMonthly` field (already fully covered in `DEFAULT_CONFIG`/
  `HISTORY_SENSITIVE_FIELDS`/`finance.js` — no housekeeping gap)
- [x] **`lost_job`** verified to need no fields beyond the shared plumbing — legacy wizard route,
  primary entry is now `NewJobSeasonEntry`
- [x] **`App.jsx` routing** — `wizardEntry === "lost_job" | "commission_job"` now mounts
  `SetupWizardAdlib` (cancelable, unlike first-run) instead of `SetupWizard.jsx`; `SetupWizard.jsx`'s
  own mount condition excludes both values, including from its `wizardExiting` close-animation
  fallback, to prevent a transient double-mount
- [x] Tests: 4 new cases in `SetupWizardAdlib.test.jsx` (`lost_job` completion — 4 pages, no Wrap
  Up, cancelable; `commission_job` completion incl. `commissionMonthly`; Commission Income clause
  absent on `lost_job`; first-run behavior unchanged)
- [x] Docs: `.claude/CLAUDE.md`, `docs/drift-app-warden.md` §7 F139 + §7.3 gate matrix "Which
  wizard?" column, `docs/TODO.md` §19.1.B/§19.2
- [ ] **Not done this round** — `structure_change` (needs frozen `originalConfigRef` baseline +
  `StructureChangeDiff` summary + jobless-Back-to-Work special case + real Step0 copy ported
  verbatim) and `changed_jobs` (full re-run, same page set as first-run) both still route to
  `SetupWizard.jsx` — tracked in `docs/TODO.md` §19.2

---

## DHL Warehouse Site (2026-08-09)

- [x] **`dhlSite` field ("WAREHOUSE" | "PLANT" | null)** — Plant is the fallback for anything but
  `"WAREHOUSE"`, so every existing DHL account (no `dhlSite` key at all) needs no migration and
  keeps behaving exactly as before
- [x] **`DHL_PRESET.warehouseTeams`** — Mon–Thu (`MT`) and Wed–Sat (`WS`) teams, fixed 4 days every
  single week, no long/short rotation (unlike Plant's alternating Team A/B)
- [x] **Step 1** — "Which DHL site do you work at?" right after the DHL gate; Warehouse branch asks
  team (Mon–Thu/Wed–Sat) and a real shift-length question (10 or 12 hours, user-selected, not
  hardcoded), reuses the existing night/morning-shift question unchanged; custom-rotation question
  hidden for Warehouse (v1 scope, Plant only)
- [x] **Step 2** — Short/Long Week pills hidden for Warehouse (nothing to ask beyond start date,
  `isValid` already correct for both sites unchanged)
- [x] **Step 4** — "Load DHL Preset" button hidden for Warehouse (its split rates are Plant-specific
  and would desync `fedRateHigh`/`fedRateLow` for Warehouse's single-rate schedule)
- [x] **`finance.js`** — `getDhlPlannedDayIndexes()`/`getDhlPlannedPattern()` carry a Warehouse
  branch and are the single shared source behind `buildYear()`, `projectedGross()`, and
  `calcEventImpact()` alike, so all three are correct with no per-caller duplication;
  `buildYear()` forces `isHighWeek: false` for Warehouse weeks (financially inert since
  `scheduleIsVariable: false` already guarantees `fedRateHigh === fedRateLow`)
- [x] **`ProfilePanel.jsx` T5 Employment card** — DHL Team editor and `scheduleLabel` made
  site-aware (same field, second editor, per `docs/drift-app-warden.md` §7); Schedule Override
  section hidden for Warehouse
- [x] **`configHistory.js`** — `dhlSite` added to `HISTORY_SENSITIVE_FIELDS`
- [x] Tests: `finance.test.js` (fixed-schedule fixtures for both teams, weekend-hour math,
  `isHighWeek`/`requiredOtShifts` always false/0, Plant regression guard), `SetupWizard.test.jsx`
  (site question placement, Warehouse/Plant branching, full Warehouse wizard run through
  `onComplete`), `ProfilePanel.test.jsx` (site-aware Employment card)
- [x] **Mirrored into `SetupWizardAdlib.jsx`'s ad-lib preview** — `IntakePage` asks the same
  "Which DHL site do you work at?" question before any team clause, branching to the unchanged
  Plant Team A/B clause or a new Warehouse Mon–Thu/Wed–Sat team + real shift-length (10/12h)
  clause; `SchedulePage` hides the Short/Long-Week clause for Warehouse the same way Step2 does;
  `isIntakeValid()`/`BLANK_PAY_FIELDS` extended with `dhlSite` so the mandatory-field gating and
  blank-by-default behavior cover it too

---

## Ad-Lib Wizard preview — page-by-page conversion (2026-08-09)

- [x] **Page 1 (`IntakePage`)** — merged real Welcome + Pay Structure (Step0/Step1) into one
  cascading mad-libs page; blank-by-default (`BLANK_PAY_FIELDS`), real mandatory-field gating
  (`isIntakeValid()` mirrors `STEP_DEFS id 0/1`), typed-reveal cascading clauses
- [x] **Page 2 (`SchedulePage`)** — real Schedule (Step2) as its own ad-lib page, same style;
  `isScheduleValid()` mirrors `STEP_DEFS id 2`
- [x] **Page 3 (`DeductionsPage`)** — real Deductions (Step3) as its own ad-lib page;
  `isDeductionsValid()` mirrors `STEP_DEFS id 3` exactly (base users require the attendance
  question, DHL users need nothing, any selected benefit needs its amount/rate+date filled in);
  new `InlineChip` toggle component for the one multi-select field (9 `BENEFIT_OPTIONS`, since a
  native `<select>` blank doesn't fit an independently-toggleable set inside the sentence-flow
  metaphor); k401 shows a %-based rate blank (stored as a decimal, displayed ×100) plus an
  enrollment-date blank reusing `InlineDate` with a new `label` prop; deselecting a chip zeroes its
  field(s) the same way real `Step3` does; `benefitsStartDate`, the dynamic `otherDeductions` list,
  and attendance sub-fields scoped out (v1, none of them gate real Step3's `isValid`)
- [x] **Page 4 (`TaxRatesPage`)** — real Tax Rates (Step4), scoped down by explicit instruction to
  one sentence — "I officially file `[filing status]`, living in the state of `[state]`." — plus a
  single "Recalculate Using Paystub" button that fades in last, once both selectors are answered.
  `isTaxRatesValid()` mirrors `STEP_DEFS id 4`'s `isValid` exactly (`fedRateLow > 0 && userState !=
  null`). The button reveals a small paystub calculator (`CalcField` — plain labeled number inputs,
  not sentence-blank styled like `InlineNumber`, since this is a utility box, not mad-libs prose):
  one box for a fixed schedule, two ("Shorter"/"Longer Week Paystub") for `scheduleIsVariable`,
  same shape as real `PaystubCalc`; `dr()` (withheld ÷ gross) is a straight copy of `PaystubCalc`'s
  own helper; "Apply These Rates" writes `fedRateLow/High`/`stateRateLow/High`/
  `taxRatesEstimated: false` and collapses the calculator. State Withheld hidden for a
  no-income-tax state (`STATE_TAX_TABLE[userState]?.model === "NONE"`). Real Step4's "Use Estimate
  for Now" fallback and DHL Missouri preset button are intentionally not ad-libbed — only the
  paystub path, per the request.
- [x] **Page 5 (`WrapUpPage`)** — real Wrap Up (Step7), the final step of the whole first-run flow.
  `isWrapUpValid()` mirrors `STEP_DEFS id 7`'s `isValid: () => true` — no required fields, just a
  live summary. Renders the same `estimateWeeklyNet(formData)` breakdown real `StepWrapUp` shows
  (never a parallel approximation), scaled to the pay schedule via `PAYCHECKS_PER_YEAR`. Paycheck
  Buffer ad-libbed as an inline sentence ("I `[want/don't want]` a paycheck buffer of $`[amount]`
  per check"), writing the same `bufferEnabled`/`paycheckBuffer` fields, same $200 cap. Tax-Exempt
  Week Projections opt-in and the `structure_change` diff section scoped out (v1 — neither gates
  `isValid` on either the real or ad-lib page, and this pilot has no life-event re-entry concept).
  Because Wrap Up is the real wizard's last step for an employed user too, absorbing it changes the
  hand-off shape: `onHandoff`'s `initialStepId` is now `null` for an employed finish — nothing left
  to hand off to — and `App.jsx`'s `onHandoff` callback just closes the preview (still MOCK ONLY,
  no `setConfig`/`savePersistedStateNow`) without ever mounting the real `SetupWizard`. The jobless
  mini-flow (id 10) is unaffected — still a real hand-off, since Unemployment Benefits/Job Loss
  Details/Jobless Wrap Up remain unconverted, separate real-wizard territory.
  Handoff `initialStepId` bumped from Deductions (3) → Tax Rates (4) → Wrap Up (7) → `null` (nothing
  left) as each page was absorbed.
- [x] Outer page-count/resume machinery (`activePages`, `pageIdx`, "N of M" header, resume-at-
  last-page via `resumeFormData`) confirmed generic against `PAGES.length` — required zero changes
  across all five page additions
- [x] Tests extended in lockstep with each page (`SetupWizardAdlib.test.jsx`) — currently 45 tests
  covering all five pages, DHL Plant/Warehouse branching, variable-schedule two-week paystub calc,
  resume-on-Back, and both handoff shapes (jobless real hand-off, employed null/mock-finish)
- Every step of the first-run, employed-signup flow (Welcome through Wrap Up) is now ad-libbed.
  The jobless mini-flow (Unemployment Benefits, Job Loss Details, Jobless Wrap Up) and any
  re-entry life events (changed jobs, lost job, structure change, commission job) remain
  real-wizard-only — out of scope unless requested.

---

## §19 — Ad-Lib Wizard production promotion (2026-08-10, partial — see docs/TODO.md §19.1)

`SetupWizardAdlib.jsx` promoted from admin-only mock preview to the real production first-run
onboarding wizard, per the §19.1 pre-production audit. Delivered this round:

- [x] **Save/completion wiring (§19.1.C)** — `SetupWizard.jsx`'s `handleComplete()` normalization
  extracted into a shared `finalizeWizardConfig()` helper (`src/lib/wizardComplete.js`); both
  `SetupWizard.jsx` and `SetupWizardAdlib.jsx` now call it. `SetupWizardAdlib`'s employed-finish
  path calls a new `onComplete(finalConfig)` prop, which `App.jsx` wires directly to
  `handleWizardComplete()` — no reimplementation. Jobless mini-flow hand-off (`onHandoff`)
  unchanged. Cancel has zero save side effects.
- [x] **Real-wizard field rename fix** — ad-lib's Wrap Up buffer fields renamed
  `bufferEnabled`/`paycheckBuffer` → `freedomAllowanceEnabled`/`freedomAllowance` to match the real
  wizard's post-rebrand field names (were previously silently dropped by the real save path).
- [x] **Entry-point & gating wiring (§19.1.D)** — `isAdmin`/`adlibPreviewOpen` gate removed;
  `App.jsx` now mounts `SetupWizardAdlib` whenever `wizardEntry === false` and no jobless hand-off
  is in progress; `SetupWizard.jsx` keeps every life-event re-entry and the jobless continuation.
  `onCancel` is `undefined` for a real first-run, non-investor signup (no escape hatch); Admin
  Tools "Ad-Lib Wizard" → Preview button removed (both copies). "Ad-Lib Preview · N of M"/"Exit
  Preview" copy renamed to "Setup · N of M"/"Cancel".
- [x] **`isInvestor` prop (decision 2)** — mirrors `SetupWizard.jsx` field-for-field: Welcome
  greeting, DHL question hidden, `formData` init override; wired from `App.jsx`.
- [x] **Deductions page Skip button** — added (`PAGES` entry `skippable: true`), fixing the
  functional regression flagged in §19.1.A vs. real `STEP_DEFS id 3`'s `skippable: true`.
- [x] **Full-page conversion, partial (§19.1.E)** — dropped the bounded centered-card modal
  styling; content now fills the viewport with a ~720px max-width text/content column, keeping the
  `fold-lift`/`data-fold`/safe-area-inset takeover mechanics.
- [x] **Drift ledger** — `docs/drift-app-warden.md` §7 F128 added, documenting the shared helper
  and `SetupWizardAdlib.jsx` as a second real surface.
- [ ] **Not done this round** (see `docs/TODO.md` §19.1 for the remaining checklist): most of
  §19.1.A's field/UI parity gaps (tips/commission opt-in, base-user OT threshold, Advanced Pay
  Rules, DHL weekend differential edit, DHL custom-rotation question, Benefits Start Date, Other
  Recurring Deductions, Attendance Policy Details, PTO section, Tax Rates "Use Estimate for Now" +
  DHL Missouri preset, Wrap Up's Tax-Exempt Week Projections opt-in); the rest of §19.1.E/F
  (TypedText `white-space:pre` wrap fix, `Inline*` max-width audit, `BLANK_FONT` `clamp()`,
  `StepSlide`/mobile-picker re-tuning, `prefers-reduced-motion`); §19.1.G (attempted-gated
  required-field feedback, screen-reader pass); §19.1.H's `DIFF_FIELDS`/`HISTORY_SENSITIVE_FIELDS`
  three-way audit and `docs/account-reference.json` spot-check.

---

## §19.1.E/F — Ad-Lib Wizard responsive polish (2026-08-10)

Follow-on to §19 above, closing out most of the remaining `docs/TODO.md` §19.1.E/F responsive
checklist:

- [x] **`TypedText` horizontal-overflow bug fixed** — the single most important item in this
  batch per the audit. Was one `display:inline-block; white-space:pre` span per clause, which
  cannot wrap internally; a long real clause (e.g. Deductions' attendance-tracking question)
  overflowed at narrow widths. Now chunks each clause into per-word spans joined by ordinary
  breakable spaces, so the browser wraps between words normally while each word still steps in
  via the same `adlibType` keyframe. See `docs/drift-app-warden.md` §7 F129.
- [x] `Inline*` controls (`InlineDate`/`InlineNumber`/`InlineSelect`) gained `max-width: 100%` +
  `box-sizing: border-box` so a fixed nominal width can still shrink on narrow screens.
- [x] `BLANK_FONT` moved from a fixed `26px` to `clamp(18px, 4.2vw, 26px)`.
- [x] `prefers-reduced-motion` handling added for the stepped-reveal/fade-in classes
  (`.adlib-typed-word`/`.adlib-fade-in`, `index.css`), matching the app's existing
  class-based reduced-motion override pattern.
- [x] `StepSlide` reviewed — no change needed (fixed-px transform distance, already shared with
  the real wizard at full width).
- [ ] Benefit-chip row / 50-option state select mobile usability, and native date/select picker
  clipping — reasoned through, not empirically verified (no browser in this sandbox).
- **Not done this round:** §19.1.A's field/UI parity gaps (unchanged from the §19 list above);
  §19.1.G (attempted-gated required-field feedback, screen-reader pass); §19.1.H's field-set
  housekeeping and account-reference spot-check; §19.1.I's remaining doc updates for those items.

---

## §19.1.A — Ad-Lib Wizard field-parity round 1 (2026-08-10)

Three of §19.1.A's `IntakePage` gaps closed, all gated behind a new `payStructureComplete`
boolean (fires once the core rate/hours questions are answered, matching where real Step1
reveals the same fields):

- [x] **Tips/Commission daily check-in opt-in** — "On top of that, I [don't earn tips or
  commission / earn tips / earn commission]," with the commission-only-position follow-up blank.
  Any employer, DHL or base. `tipsOrCommissionEnabledAt` stamping already handled by the shared
  `finalizeWizardConfig()` (F128) — no additional completion-time wiring needed.
- [x] **Base-user Overtime Threshold** — 40h/48h/Custom/Exempt picker, base users only (DHL
  keeps its fixed 40h/1.5× override).
- [x] **DHL Weekend Differential** — now an editable `$/hr` `InlineNumber`, pre-filled with the
  `DHL_PRESET` default (was previously hardcoded with no way to change it).

New tests: 4 tests covering all three additions (gating order, Custom OT numeric blank, DHL
differential pre-fill + edit, commission-only follow-up reveal). Full suite: 1538 passed
(up from 1534). See `docs/drift-app-warden.md` §7 F130.

**Not done this round:** the rest of §19.1.A (Advanced Pay Rules' OT multiplier + night
differential rate editing, DHL custom-rotation question, Benefits Start Date, Other Recurring
Deductions, Attendance Policy Details, PTO section, Tax Rates "Use Estimate for Now" + DHL
Missouri preset, Wrap Up's Tax-Exempt Week Projections opt-in); §19.1.G; §19.1.H.

---

## §19.1 — Ad-Lib Wizard field-parity rounds 3-4 + housekeeping + accessibility (2026-08-10)

Closes out **all** of §19.1.A (field/UI parity), all of §19.1.G (accessibility/validation
feedback), and the first two boxes of §19.1.H (field-set housekeeping). Six commits:

- [x] **F131 — resolved F130's tips/commission history gap.** `tipsOrCommissionEnabled`/
  `tipsOrCommissionLabel`/`tipsCommissionOnlyPosition` added to both `HISTORY_SENSITIVE_FIELDS`
  and `DIFF_FIELDS` (F7's three-way rule). Full sweep of every field `SetupWizardAdlib.jsx` wrote
  at that point found no other gaps.
- [x] **F132 — `attempted`-driven required-field feedback + accessible names.**
  `InlineSelect`/`InlineNumber`/`InlineDate` gained an `error` prop (red border + `aria-invalid` +
  a new `RequiredNote` "↑ Required" tail, mirroring real `errBorder()`/`Field`); every page wires
  `error={attempted && <the same condition that page's own isXValid checks>}` on every required
  control. `ariaLabel` added to every `InlineSelect`/`InlineNumber` call site; `InlineChip` gained
  `aria-pressed`/`aria-label`.
- [x] **F133 — Advanced Pay Rules + DHL custom rotation.** `AdvancedPayRulesCard` (base users, OT
  multiplier/night diff/weekend diff) and `DhlRotationCard` (DHL Plant, Standard-vs-Custom
  weekly-hours override) added as collapsible cards. Closed two pre-existing `isIntakeValid` gaps
  found in the process (`customWeeklyHours` checks, base-user custom-OT-threshold-positive
  check — both present in real STEP_DEFS id 1 but missing from `isIntakeValid` since before this
  round). `finalizeWizardConfig()` gained an `otMultiplier ?? 1.5` default.
- [x] **F134 — Tax Rates fallback paths.** "Use Estimate for Now" (`handleEstimate()`) and the
  DHL Missouri preset button (`loadDHLPreset()`), both straight copies of real Step4's functions.
- [x] **F135 — Wrap Up Tax-Exempt Week Projections opt-in.** Static disclosure copy +
  "coming soon" placeholder, straight copies of real `StepWrapUp`'s components.
- [x] **F136 — Deductions: Benefits Start Date, Other Recurring Deductions, Attendance Policy
  Details, PTO.** `OtherDeductionsList`/`AttendanceDetailsCard`/`PtoDetailsCard` added. Found and
  fixed two more pre-existing `HISTORY_SENSITIVE_FIELDS` gaps (`attendanceUnit`/
  `attendanceCurrentBalance`/`ptoCurrentBalance` — missing even on the real wizard).
- [x] **F137 — bug found + fixed: invalid `<div>`-in-`<p>` nesting.** F133's two cards were
  rendered inside `IntakePage`'s sentence `<p>` — invalid HTML, caught by a console warning while
  writing this round's full-completion test (no assertion failure; `npm run test:run` doesn't
  fail on console warnings). Fixed by making `IntakePage`'s return a Fragment with both cards as
  siblings after `</p>` closes.
- [x] New "full ad-lib-to-production completion" test in `SetupWizardAdlib.test.jsx` — builds a
  base-user run through every page, touching every field added across rounds 2–4, asserts against
  the real `onComplete(finalConfig)` payload (not the old mock `onHandoff` contract).
- [x] `docs/account-reference.json` spot-checked — its `computed_expectations` tier is entirely
  `null` placeholders already (pre-existing, unrelated to this round); no `finance.js` computation
  logic changed, so no update was needed.

**Not done this round:** the rest of §19.1.E/F's responsive polish (mobile-width verification —
needs a real browser, none available in this sandbox); §19.1.B's flow-coverage decisions
(life-event/jobless-mini-flow ad-libbing scope); widening `DIFF_FIELDS` toward full parity with
`HISTORY_SENSITIVE_FIELDS` (pre-existing gap predating this round, documented but not attempted —
see drift-app-warden §7 F136's own note).

Full suite: 1539 passed (up from 1538). See `docs/drift-app-warden.md` §7 F131–F137.

---

## §18 — Stripe Monetization (2026-07-28)

✅ **COMPLETE — all code shipped and verified in production.** Stripe subscriptions fully live with 14-day free trial (plus hidden 7-day grace). All routes verified in live mode: Checkout, portal, webhook signature verification, card declines, cancellation at period end, account deletion with Stripe subscription cancellation, and revival after non-payment deletion. Lifecycle emails (trial nudges, grace period, every-other-day deletion warnings) via Resend cron, all copy disclosure-guard tested. Trial phase gates Home/Budget to read-only on day 21+.

- [x] **Data model & migration** — `subscription_status`, `trial_started_at`, `trial_ends_at`, `access_ends_at`, `card_on_file`, `current_period_end`, `plan` added to `user_data`; migration 017 (webhook idempotency) and 018 + RLS via 019 confirmed live in Supabase (2026-07-07)
- [x] **Stripe product + two prices** — Premium $14.99/mo and $120/yr ($10/mo flat, ~4 months free); both test and live price IDs captured; webhook endpoint registered
- [x] **API routes** — `stripe-create-checkout.js` (verify user → find/create Stripe customer → session), `stripe-webhook.js` (signature verification, upsert subscription_status/plan), `stripe-portal.js` (manage card/plan), all service-role Bearer-token pattern; fixed stale-domain crash via `resolveAppOrigin(req)` deriving from request headers (2026-07-27)
- [x] **Trial logic (14-day public + 7-day hidden grace)** — `getEntitlement()` state machine: trial/grace/active/expired/none with trialDaysLeft and accessDaysLeft computed from timestamps (never Lock Date); boundary-tested day-14 and day-21 inclusive/exclusive; no double-trial reseeding; disclosure guard on UI text (21-day, grace, extra week forbidden)
- [x] **Frontend gating** — `isExpiredReadOnly` gate on App.jsx; Home/Budget render read-only (values visible, editing disabled); Income/Log fully replaced by UpgradePanel (read-only panel in content, not modal); shared `UpgradeCard` (checkout pitch + Monthly/Annual buttons) with UpgradeModal (overlay for Home/Budget notices) and UpgradePanel (full-page for Income/Log); post-checkout `?checkout=success|cancel` polling until webhook lands
- [x] **Trial + subscription UI** — `TrialExplainerScreen` (first-signup explainer, required checkbox gate), `TrialBanner` (phase-aware copy: trial/grace/expired), ProfilePanel Subscription card (status, plan, manage/upgrade buttons), admin Live State Inspector gains Sub Phase + Trial/Access/Period End + Card/Dunning visibility
- [x] **Lifecycle emails** — Resend provider, daily cron `api/cron-subscription-lifecycle.js` runs 15:00 UTC; trial day-7 + day-12 nudges, grace every-2-days, expired every-other-day deletion warnings, all copy disclosure-tested; skips admin/investor rows; throttle keyed to stored timestamps (retries survive outages, catches up at most once per send)
- [x] **Account revival (non-payment deletion recovery)** — `deleted_accounts` table (017), archive-before-delete in cron; LoginScreen `api/revival-lookup.js` on failed sign-in (email/password case) vs. App.jsx SIGNED_IN `checkRevival()` (OAuth case); ReviveScreen identity display + plan choice + revive checkout; webhook `restoreRevivedAccount()` rebuilds config/expenses/goals/logs, seeded trial in past (no second free window), stamps `revived_at`; two-way-door retry on decline (attempt tracking, cancel button reusable, no cap)
- [x] **Edge cases & security** — webhook signature verification (signed-fixture tests), card declines/`past_due` (keep access through `current_period_end`), cancellation (cancel-at-period-end), account deletion cancels Stripe sub immediately (both modes tried), clock-skew/tz (all phase math UTC-epoch-ms, wall-clock not Lock Date), disclosure tested (no raw `access_ends_at` rendered), 51 tests across `subscription.test.js`, `lifecycleEngine.test.js`, `lifecycleEmails.test.js`, `stripeWebhook.test.js`, `stripeCreateCheckout.test.js`, `deleteAccount.test.js`, `revivalLookup.test.js`, `stripeReviveCheckout.test.js`, `ReviveScreen.test.jsx`, LoginScreen revival routing
- [x] **Env vars (Vercel)** — `STRIPE_SECRET_KEY`/`_TEST`, `STRIPE_WEBHOOK_SECRET`/`_TEST`, `STRIPE_PRICE_MONTHLY`/`_ANNUAL`/`_TEST` variants, `APP_URL`, `EMAIL_API_KEY`/`RESEND_API_KEY`, `EMAIL_FROM` (optional), `CRON_SECRET` all set; distinct per-mode names; webhook handler tries live secret first then test (both modes on same endpoint)

---

## §17 — Tips / Commission Daily Check-In (2026-07-27)

- [x] **Setup Wizard opt-in** — Step 1 "Do you earn tips or commission?" (No/Tips/Commission), with a commission-only follow-up question captured for future use only (no income-math effect yet)
- [x] **Daily check-in card** — Small, dismissible, non-full-screen card (`TipsCommissionCheckIn.jsx`), weekday/date-aware ("yesterday" vs. "Wednesday, the 8th"), noon-eligibility gate mirroring the DHL Monday-6am pattern
- [x] **Backward-walking backlog queue** — Newest-unresolved-first, 10-day cutoff, same-sitting chaining after each answer or skip (session-only skip state, not persisted)
- [x] **`tips_commission` event type** — New `EVENT_TYPES` entry + `calcEventImpact` branch mirroring `bonus`; reuses all existing tax/401(k) math
- [x] **Log Panel dropdown** — New collapsible "Tips/Commission Log" section above the entry list, gated on at least one real logged day; tips-only "If you claim all tips" running extra-tax-owed total (`grossGained - netGained` per entry)
- [x] **`dateToWeekIdx` promoted** — Moved from a SetupWizard-local helper to a shared `lib/fiscalWeek.js` export so App.jsx can tag daily entries with the correct fiscal week

---

## §16 — Priority Sprint close-out (2026-07-06)

*Final four items — section closed and removed from TODO.md.*

- [x] **Mobile PWA install tutorial** — Hamburger-menu install tutorial shown only in the mobile browser (hidden in installed PWA), reusing the website's iOS flow
- [x] **Financial alert copy pass** — Net Worth Health "Financial Breakthrough" tips copy revisited; the AI/Coach-generated upgrade remains tracked in TODO §2.C (not part of this close-out)
- [x] **Purge grey text** — Final app-wide verification pass; remaining dark-grey text replaced with standard white/primary
- [x] **Verify change email + password (live round-trip)** — Live Supabase + real inbox test completed: email change dual-confirm link, password change with old-password rejection, wrong-current-password path

---

## §16 — Priority Sprint completions (2026-06)

- [x] **Budget — restructure expense save buttons** — Full-width primary "Month+ Onward" row; month/quarter/cancel in secondary row; applied to add form, edit sheet, and quarter-view branch
- [x] **Budget — collapsible category sections** — Chevron toggle per category header; sessionStorage state; defaults collapsed
- [x] **Budget — slim down loan cards** — Removed bottom-left detail block and `/mo` figure; per-paycheck amount only in overview; Loans tab unchanged
- [x] **Log panel — declutter event cards** — Title + notes elevated; lost-money events show single minus amount; other detail moved into per-event impact dropdown
- [x] **DHL short/long week naming** — Removed day-count parentheticals from all user-facing labels; internal rotation keys, `days` arrays, and day-selection logic untouched
- [x] **Goals — "Reset Timeline" button** — Global `goalTimelineEpochIdx` anchor; restarts all active goal timelines to next paycheck; confirmation modal portaled to `document.body`; persists to Supabase; honors weekly + biweekly/monthly cadence

---

## §16 — Portal Audit (iOS Safari fixed overlays)

- [x] **All un-portaled fixed overlays swept** — BudgetPanel `showCheckInfo`, HomePanel `showReorderModal`, ProfilePanel delete-account + sign-out dialogs all portaled via `createPortal(…, document.body)`; iOS Safari tap registration verified at all scroll positions; markup/styles unchanged

---

## §0 — Base User Foundation (2026-04-28)

- [x] **`maxWeeklyHours` engine redesign** — Single ceiling field replaces `standardWeeklyHours`/`longWeeklyHours`; WeekConfirmModal open 7-day selector; ceiling comparison adjusts projection when under hours
- [x] **Step 2 start-date clamp** — `firstActiveIdx` bounded to `[0, FISCAL_WEEKS_PER_YEAR − 1]`; error state shown for out-of-range dates
- [x] **PTO for base user** — PTO subsection in Step 3; `ptoRate` per-user config field (migrated from module constant); `ptoEnabled` gates BenefitsPanel PTO section
- [x] **Attendance tracker** — Threshold config (warn/terminate/balance/increment) in Step 3; status display vs. thresholds; user-supplied unit label; no payout math
- [x] **Night differential for base user** — Toggle in Step 1; engine keyed off `cfg.nightDiffEnabled`/`nightDiffRate` instead of `isEmployerDHL`
- [x] **PROGRESSIVE state tax accuracy** — `midpointRate` field per state in `stateTaxTable.js`; `handleEstimate()` uses it instead of hardcoded 5%
- [x] **Filing status / standard deduction** — Single/MFJ/HOH question in Step 4; `fedStdDeduction` derived from status ($15k/$30k/$22.5k); Tax Picture summary updated
- [x] **`otherDeductions[].weeklyAmount` → `perCheckAmount`** — Renamed across `DEFAULT_CONFIG`, `SetupWizard.jsx`, `finance.js`, `finance.test.js`; backward-compat shim in `db.js`
- [x] **"No OT" exempt path** — `otThreshold: null` toggle; engine skips OT math when null
- [x] **`shiftHours` label UX** — Helper text clarifies shift length is for event logging, not income math
- [x] **Welcome copy pass** — "Have these handy" line added to Step 0 for base users

---

## §1 — Goals Funding + Tax Exempt Projection Integrity (2026-04-03)

- [x] **Funded goal cash absorption** — Funded amounts treated as spent in all downstream totals (surplus, net worth, take-home); guardrails prevent re-entry; fixture coverage added
- [x] **Tax exempt payback withholding** — Extra withholding subtracted from taxed weeks as a real expense; propagated into forward charts and monthly rollups; consistent shared value across all views
- [x] **Goal timeline ETA sensitivity** — Timeline uses live post-expense surplus; dependency recompute triggers fixed; regression coverage for +$150/+$300/week deltas
- [x] **Goals card + timeline UI rework** — True progress-fill bar; month markers on timeline bar; liquid/glass fill prototype for premium mode

---

## §2 — Food Control Spotlight (non-priority brand feature)

- [x] **Food expense identity** — Dedicated Food card with icon; required in budget setup; default $400/mo; categorized under Needs in calculations
- [x] **Fast food buffer toggle** — On/off toggle post-first-Budget-open; excluded from paycheck surplus and goal projections when enabled

---

## §3 — Desktop Scroll Regression

- [x] **Global scrolling restored** — Smooth wheel/trackpad scrolling restored across all tabs after layout/container regression

---

## §4 — Base User Experience Sprint (superseded by §0)

- [x] **Week counter mismatch** — Superseded by §0 start-date clamp; same root cause
- [x] **Step 2 shift differential flow** — Night diff spec carried into §0; weekend diff deferred; Supabase persistence confirmed for non-standard rotations
- [x] **Step 4 paystub alignment / deductions layout / schedule expectations / pay frequency / PTO visibility** — All superseded or absorbed by §0 implementation work

---

## §5 — Auth Providers (2026-03-28)

- [x] **Google OAuth end-to-end** — `signInWithOAuth`; Supabase provider config; `user_data` row seeded on first sign-in; Google profile metadata (`display_name`, `avatar_url`) synced via migration `005`; redirect URLs whitelisted; Link Google Account in ProfilePanel
- [x] **LoginScreen OAuth layout** — Google button + divider ("or continue with")

---

## §6 — Benefits & Deductions Pipeline

- [x] **Benefit premiums wired into `buildYear()` taxable gross** — Health, dental, vision, STD, life, HSA, FSA via `weeklyBenefitDeductions()`; `benefitsStartDate` honored per-week
- [x] **`otherDeductions` wired into `computeNet()`** — After-tax subtraction in both taxed and untaxed weeks
- [x] **Wizard Step 7 preview updated** — Shows gated benefits and "start later" labels so preview matches take-home math

---

## §7 — Setup Wizard Tune

- [x] **Full walkthrough audit** — All steps audited; copy trimmed to one sentence per field; mobile layout clean at 390px; edge case inputs (0, large numbers, empty) tested; Life Event re-entry flow verified

---

## §8 — Profile & Account Management

- [x] **Profile screen** — Display name, email, account date, subscription placeholder live in ProfilePanel
- [x] **Change email** — `updateUser({ email })` + Supabase dual-confirm flow
- [x] **Change password** — `signInWithPassword` re-auth gate + `updateUser({ password })`; Google-only account guard (`hasEmailIdentity`); `ProfilePanel.test.jsx` with 4 identity-state coverage cases
- [x] **Delete account** — "Type DELETE" gate; `user_data` delete + `admin.deleteUser()` via `api/delete-account.js`
- [x] **Sign out all devices** — `signOut({ scope: 'global' })`

---

## §9 — Post-Auth Roadmap

- [x] **Fiscal week awareness** — Current week (X of 52) live app-wide; midnight tick; `FISCAL_YEAR_START` constant; per-week `computeNet()` output feeds `computeGoalTimeline()` directly
- [x] **Theoretical Tab** — What-if scenarios: job change, investment return, second job income layering
- [x] **Calendar Tab** — Visual calendar of expense due dates, loan payments, goal milestones
- [x] **Statements Tab** — Monthly/quarterly/yearly snapshots: income summary, expense breakdown, surplus/deficit, goals report, net worth delta; PDF/CSV export; Supabase persistence

---

## §10 — Authority OS Design System Migration

- [x] **Green token alignment** — `METRIC_STATUS` green fixed; `--color-teal-bright` flash token updated; `--color-accent-soft` purged from all foreground use
- [x] **Authority OS rename** — `index.html`, PWA label, `package.json`, LoginScreen "Life RPG" eyebrow updated; dead Google Fonts (DM Serif/Sans) removed
- [x] **Pulse signal layer** — Signal tokens added to `index.css`; `InsightRow` component built and exported from `ui.jsx`; `insight` prop feathered into MetricCard/Card across HomePanel, IncomePanel, BudgetPanel

---

## §11 — Optional Deductions Mapping

- [x] **Itemized deductions module** — Above-the-line deductions (401k, HSA, student loan interest, IRA) + itemized vs. standard toggle (mortgage, SALT, charitable, medical 7.5%-AGI threshold); revised AGI + federal liability fed into IncomePanel tax gap; "Standard"/"Itemized" badge on wizard; disclaimer copy matches tax-exempt gate tone

---

## §12 — Countup Animation Scope (2026-03-31)

- [x] **Countup rolled out to all dollar cards** — `rawVal` prop on every dollar-amount Card/MetricCard across all panels
- [x] **Gated to first tab visit per session** — `Set<panelName>` tracks visited panels; 0→target countup suppressed on revisit; flash-on-change still fires on data changes

---

## §13 — Income Weekly Sticky Header

- [x] **Mobile sticky header rebuilt** — Mini chart + column labels pin at `safe-area-inset-bottom`; Dynamic Island / notch clearance correct; Safari and Chrome portrait + landscape verified

---

## §14 — Mobile Navigation + Income IA + Budget / Goals Bridge (2026-04-03)

- [x] **Goals as first-class nav destination** — Goals standalone top-level tab in bottom nav and drawer; primary destinations trimmed to 5
- [x] **Income IA simplified** — Config sub-tab removed; Income config in Profile/Account settings; monthly/weekly collapsed to one view
- [x] **Budget breakdown realism** — Deductions line added as display-only; keyed to next-check cadence
- [x] **Goals timeline precision** — Weekly surplus snapshots bridge; per-week progression drives completion timing; near-term surplus deltas surfaced

---

## Earlier Summaries (pre-§1)

- [x] **Immediate Bug Fixes** — Cashflow and Goals math/layout audited after early regressions; follow-up checks documented
- [x] **Quarterly Phase Refactor** — Four named quarters across budgeting, finance, and DB layers; migrations; UI labels updated everywhere
- [x] **Attendance Bucket Model** — DHL attendance engine: monthly bonus math from event log; bucket tiers, payout projections, safety bands on dashboard
- [x] **Setup Wizard (initial)** — Six-step wizard with DHL presets, validation, migrations, and tax/benefit previews; first-run and Life Event re-entry paths
- [x] **WeekConfirmModal** — Swap logging, stricter validation, accurate pay-period labeling shipped
- [x] **Auth & Multi-User** — Supabase auth + RLS + login flows + session persistence; Anthony's data isolated; multi-account architecture ready
- [x] **Multi-User Readiness** — Employer label from `config.employerPreset`; `nightDiffRate` explicit; hardcoded FHA hint removed; `INITIAL_EXPENSES/GOALS/LOGS` cleared; `DHL_PRESET.defaults` self-contained; `PTO_RATE` removed from runtime; "MO Flat Rate" label renamed
- [x] **Event Log Rework** — `futureWeeks` prop live; inline edit; 7-day pill date picker; auto-derived `weekIdx`/`weekRotation`; Missed Work Unapproved event type; PTO accrual accuracy verified end-to-end
