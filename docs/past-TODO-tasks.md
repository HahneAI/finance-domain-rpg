# Past TODO — Authority Finance (Completed Work Log)

*Extracted from `docs/TODO.md`. Each entry is a sprint or feature group shipped and closed.
One-liner per item — see git history for full implementation detail.*

---

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
